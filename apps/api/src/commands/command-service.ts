import {
  DEFAULT_COMMAND_SCOPE,
  describeAllowedPaths,
  migrateSiteConfig,
  sanitizePlainText,
  validateCommandPatch,
  type CommandScope,
  type JsonPatchOperation,
  type PatchWarning,
  type SiteConfig,
} from '@microstore/site-schema';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { StoreService } from '../stores/store-service';
import {
  commandOutputSchema,
  LlmError,
  type CommandLlm,
  type CommandOutput,
  type LlmResult,
} from './llm';

export const MAX_COMMAND_LENGTH = 300;
/** A proposal must be applied within this time; after that the draft may have moved on. */
export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export type CommandResponse =
  | {
      status: 'ok';
      commandId: string;
      summary: string;
      patch: JsonPatchOperation[];
      previewConfig: SiteConfig;
      warnings: PatchWarning[];
    }
  | { status: 'clarify'; commandId: string; question: string }
  | { status: 'unsupported'; commandId: string; message: string; supported: string[] }
  | { status: 'rejected'; commandId: string; message: string; supported: string[] };

/** Plain-language list of what the command box can do, shown with "I can't do that yet". */
export function supportedActions(scope: CommandScope = DEFAULT_COMMAND_SCOPE): string[] {
  return [
    'Change colors (brand, background, text, navigation bar)',
    'Change the font, button style and corner rounding',
    'Change the navigation bar and footer style, footer text, sticky menu, cart icon',
    'Show, hide or reorder sections',
    ...(scope.sectionText ? ['Change section titles, subtitles and button labels'] : []),
  ];
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

export interface CommandServiceOptions {
  /** FR-7.7: commands per store per rolling 24 h. */
  dailyLimit: number;
  scope?: CommandScope;
  now?: () => Date;
}

/**
 * The command box (FR-7): natural language → model → JSON Patch → allowlist + schema validation →
 * proposal the merchant applies or discards. Nothing reaches the draft without passing
 * `validateCommandPatch`, and every attempt is logged (FR-7.8).
 */
export class CommandService {
  private readonly scope: CommandScope;
  private readonly now: () => Date;

  constructor(
    private readonly db: Db,
    private readonly stores: StoreService,
    private readonly llm: CommandLlm | null,
    private readonly options: CommandServiceOptions,
  ) {
    this.scope = options.scope ?? DEFAULT_COMMAND_SCOPE;
    this.now = options.now ?? (() => new Date());
  }

  async propose(
    session: Session,
    storeId: string,
    rawCommand: string,
    language: 'en' | 'ur',
  ): Promise<CommandResponse> {
    const tenantId = session.getorioTenantId;
    const command = sanitizePlainText(rawCommand, { maxLength: MAX_COMMAND_LENGTH });
    if (!command) throw new AppError(400, 'validation_error', 'Type what you would like to change');
    if (rawCommand.trim().length > MAX_COMMAND_LENGTH) {
      throw new AppError(400, 'validation_error', `Keep it under ${MAX_COMMAND_LENGTH} characters`);
    }
    const { config } = await this.stores.getDraft(tenantId, storeId);
    await this.enforceDailyLimit(storeId, tenantId);
    if (!this.llm) {
      throw new AppError(
        503,
        'service_unavailable',
        'The assistant is not available right now. You can still use the manual settings.',
      );
    }

    const started = Date.now();
    const base = {
      id: newId(),
      storeId,
      getorioTenantId: tenantId,
      userId: session.merchantId,
      commandText: command,
      language,
    };
    let result: LlmResult | null = null;
    let output: CommandOutput | null = null;
    let tokens = { model: this.llm.model, promptTokens: 0, completionTokens: 0 };

    // One retry on malformed model output (FR-7.7).
    for (let attempt = 0; attempt < 2 && !output; attempt++) {
      try {
        result = await this.llm.propose({ config, command, language, scope: this.scope });
        tokens = {
          model: result.model,
          promptTokens: tokens.promptTokens + result.promptTokens,
          completionTokens: tokens.completionTokens + result.completionTokens,
        };
        const parsed = commandOutputSchema.safeParse(result.raw);
        if (parsed.success) output = parsed.data;
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        if (error.usage) {
          tokens = {
            model: error.usage.model,
            promptTokens: tokens.promptTokens + error.usage.promptTokens,
            completionTokens: tokens.completionTokens + error.usage.completionTokens,
          };
        }
        if (error.kind === 'malformed') continue;
        await this.log({
          ...base,
          ...tokens,
          status: error.kind === 'refused' ? 'rejected' : 'error',
          rejectionReason: error.kind,
          latencyMs: Date.now() - started,
        });
        if (error.kind === 'refused') {
          return {
            status: 'unsupported',
            commandId: base.id,
            message: "I can't help with that request.",
            supported: supportedActions(this.scope),
          };
        }
        throw new AppError(
          503,
          'service_unavailable',
          'The assistant is not available right now. You can still use the manual settings.',
        );
      }
    }
    const latencyMs = Date.now() - started;

    if (!output) {
      await this.log({
        ...base,
        ...tokens,
        status: 'error',
        rejectionReason: 'malformed_output',
        latencyMs,
      });
      throw new AppError(
        503,
        'service_unavailable',
        'The assistant gave an unusable answer. Please try again or use the manual settings.',
      );
    }

    const summary = sanitizePlainText(output.summary, { maxLength: 500 });
    if (output.status === 'clarify') {
      const question =
        sanitizePlainText(output.clarification ?? output.summary, { maxLength: 500 }) ||
        'Could you say a bit more about what you want to change?';
      await this.log({
        ...base,
        ...tokens,
        status: 'rejected',
        rejectionReason: 'needs_clarification',
        summary: question,
        latencyMs,
      });
      return { status: 'clarify', commandId: base.id, question };
    }
    if (output.status === 'unsupported' || output.patch.length === 0) {
      await this.log({
        ...base,
        ...tokens,
        status: 'rejected',
        rejectionReason: 'out_of_scope',
        summary,
        latencyMs,
      });
      return {
        status: 'unsupported',
        commandId: base.id,
        message: summary || "I can't do that yet.",
        supported: supportedActions(this.scope),
      };
    }

    // The real enforcement: allowlist per operation, then the whole resulting config (FR-7.2 step 4).
    const ops = output.patch.map((op) =>
      op.op === 'move'
        ? { op: 'move', from: op.from ?? '', path: op.path }
        : { op: op.op, path: op.path, value: op.value },
    );
    const checked = validateCommandPatch(config, ops, this.scope);
    if (!checked.ok) {
      await this.log({
        ...base,
        ...tokens,
        status: 'rejected',
        rejectionReason: checked.errors
          .map((e) => `${e.code}${e.path ? ` ${e.path}` : ''}`)
          .join('; ')
          .slice(0, 500),
        patch: json(ops),
        summary,
        latencyMs,
      });
      return {
        status: 'rejected',
        commandId: base.id,
        message: "I can't make that change safely. Try rephrasing, or use the manual settings.",
        supported: supportedActions(this.scope),
      };
    }

    await this.log({
      ...base,
      ...tokens,
      status: 'proposed',
      patch: json(checked.patch),
      summary,
      latencyMs,
    });
    return {
      status: 'ok',
      commandId: base.id,
      summary,
      patch: checked.patch,
      previewConfig: checked.config,
      warnings: checked.warnings,
    };
  }

  /** Applies a proposal to the draft (FR-7.2 step 6). Re-validated against the current draft. */
  async apply(session: Session, storeId: string, commandId: string) {
    const tenantId = session.getorioTenantId;
    const log = await this.loadProposal(tenantId, storeId, commandId);
    const { config } = await this.stores.getDraft(tenantId, storeId);
    const checked = validateCommandPatch(config, log.patch, this.scope);
    if (!checked.ok) {
      await this.db.commandLog.update({
        where: { id: log.id },
        data: { status: 'rejected', rejectionReason: 'stale_draft' },
      });
      throw new AppError(
        409,
        'conflict',
        'Your design changed since this suggestion. Please ask again.',
      );
    }
    // The latest revision before applying is what "Undo" restores (every command is undoable).
    const previous = await this.db.siteVersion.findFirst({
      where: { storeId, getorioTenantId: tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const draft = await this.stores.saveDraft(session, storeId, checked.config, 'command');
    await this.db.commandLog.update({ where: { id: log.id }, data: { status: 'applied' } });
    return { ...draft, undoVersionId: previous?.id ?? null };
  }

  async discard(session: Session, storeId: string, commandId: string) {
    const log = await this.loadProposal(session.getorioTenantId, storeId, commandId);
    await this.db.commandLog.update({ where: { id: log.id }, data: { status: 'discarded' } });
  }

  /** Draft with a pending proposal applied, for the preview iframe. Null when not applicable. */
  async previewConfig(
    tenantId: string,
    storeId: string,
    commandId: string,
  ): Promise<SiteConfig | null> {
    const log = await this.db.commandLog.findFirst({
      where: { id: commandId, storeId, getorioTenantId: tenantId, status: 'proposed' },
    });
    if (!log?.patch) return null;
    const store = await this.db.store.findFirst({
      where: { id: storeId, getorioTenantId: tenantId },
    });
    if (!store) return null;
    const checked = validateCommandPatch(
      migrateSiteConfig(store.draftConfig),
      log.patch,
      this.scope,
    );
    return checked.ok ? checked.config : null;
  }

  async usage(tenantId: string, storeId: string) {
    await this.stores.get(tenantId, storeId);
    const since = new Date(this.now().getTime() - 24 * 60 * 60 * 1000);
    const used = await this.countTowardsLimit(storeId, tenantId, since);
    return {
      used,
      limit: this.options.dailyLimit,
      enabled: this.llm !== null,
      supported: supportedActions(this.scope),
      allowed: describeAllowedPaths(this.scope),
    };
  }

  private async loadProposal(tenantId: string, storeId: string, commandId: string) {
    const log = await this.db.commandLog.findFirst({
      where: { id: commandId, storeId, getorioTenantId: tenantId },
    });
    if (!log) throw notFound('Suggestion');
    if (log.status !== 'proposed' || !log.patch)
      throw new AppError(409, 'conflict', `This suggestion was already ${log.status}`);
    if (this.now().getTime() - log.createdAt.getTime() > PROPOSAL_TTL_MS) {
      throw new AppError(409, 'conflict', 'This suggestion has expired. Please ask again.');
    }
    return log;
  }

  private countTowardsLimit(storeId: string, tenantId: string, since: Date) {
    // Service errors (AI down) don't use up the merchant's quota.
    return this.db.commandLog.count({
      where: {
        storeId,
        getorioTenantId: tenantId,
        createdAt: { gte: since },
        status: { not: 'error' },
      },
    });
  }

  private async enforceDailyLimit(storeId: string, tenantId: string) {
    const since = new Date(this.now().getTime() - 24 * 60 * 60 * 1000);
    if ((await this.countTowardsLimit(storeId, tenantId, since)) >= this.options.dailyLimit) {
      throw new AppError(
        429,
        'rate_limited',
        `You have used today's ${this.options.dailyLimit} assistant requests. Try again tomorrow or use the manual settings.`,
      );
    }
  }

  private async log(data: {
    id: string;
    storeId: string;
    getorioTenantId: string;
    userId: string;
    commandText: string;
    language: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    status: 'proposed' | 'applied' | 'discarded' | 'rejected' | 'error';
    rejectionReason?: string;
    patch?: Prisma.InputJsonValue;
    summary?: string;
    latencyMs: number;
  }) {
    await this.db.commandLog.create({ data });
  }
}
