import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { CommandScope, SiteConfig } from '@microstore/site-schema';
import { buildSystemPrompt, buildUserMessage } from './prompt';

/** What the model must return (FR-7.2). */
export const commandOutputSchema = z.object({
  status: z.enum(['ok', 'clarify', 'unsupported']),
  summary: z.string().max(1000),
  clarification: z.string().max(1000).nullable(),
  patch: z
    .array(
      z.object({
        op: z.enum(['replace', 'move', 'test']),
        path: z.string(),
        from: z.string().nullable(),
        value: z.union([z.string(), z.boolean(), z.number(), z.null()]),
      }),
    )
    .max(50),
});
export type CommandOutput = z.infer<typeof commandOutputSchema>;

/** JSON Schema for structured outputs; mirrors `commandOutputSchema`. */
export const COMMAND_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'clarification', 'patch'],
  properties: {
    status: { type: 'string', enum: ['ok', 'clarify', 'unsupported'] },
    summary: { type: 'string' },
    clarification: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    patch: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'path', 'from', 'value'],
        properties: {
          op: { type: 'string', enum: ['replace', 'move', 'test'] },
          path: { type: 'string' },
          from: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          value: {
            anyOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'number' }, { type: 'null' }],
          },
        },
      },
    },
  },
} as const;

export interface LlmRequest {
  config: SiteConfig;
  command: string;
  language: 'en' | 'ur';
  scope: CommandScope;
}

export interface LlmResult {
  /** Raw model output; validated by the caller. */
  raw: unknown;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export type LlmErrorKind = 'unavailable' | 'timeout' | 'refused' | 'malformed';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly usage: { model: string; promptTokens: number; completionTokens: number } | null = null,
  ) {
    super(message);
  }
}

/** The model behind the command box. Tests use a deterministic stub (requirements §12). */
export interface CommandLlm {
  readonly model: string;
  propose(request: LlmRequest): Promise<LlmResult>;
}

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

export interface AnthropicCommandLlmOptions {
  model: string;
  apiKey?: string;
  /** FR-7.7: 20 s per call. */
  timeoutMs?: number;
  client?: Anthropic;
}

/**
 * Claude via the official SDK: structured JSON output, low effort (short, well-specified task),
 * cached system prompt, and the server-side refusal fallback where the model supports it.
 */
export class AnthropicCommandLlm implements CommandLlm {
  readonly model: string;
  private readonly client: Anthropic;
  private readonly systemPrompts = new Map<string, string>();

  constructor(options: AnthropicCommandLlmOptions) {
    this.model = options.model;
    this.client =
      options.client ??
      new Anthropic({
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        timeout: options.timeoutMs ?? 20_000,
        maxRetries: 0, // one retry on malformed output is handled by the caller (FR-7.7)
      });
  }

  async propose({ config, command, language, scope }: LlmRequest): Promise<LlmResult> {
    const key = JSON.stringify(scope);
    let system = this.systemPrompts.get(key);
    if (!system) {
      system = buildSystemPrompt(scope);
      this.systemPrompts.set(key, system);
    }
    const withFallback = FALLBACK_MODELS.has(this.model);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 8000,
        ...(withFallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: COMMAND_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserMessage(config, command, language) }],
      });
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError)
        throw new LlmError('timeout', 'The AI took too long to answer');
      if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) {
        throw new LlmError(
          'unavailable',
          `AI service error${error instanceof Anthropic.APIError ? ` ${error.status}` : ''}`,
        );
      }
      throw error;
    }

    const usage = {
      model: response.model,
      promptTokens:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      completionTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === 'refusal')
      throw new LlmError('refused', 'The AI declined this request', usage);
    if (response.stop_reason === 'max_tokens')
      throw new LlmError('malformed', 'The AI answer was cut off', usage);

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new LlmError('malformed', 'The AI answer was not valid JSON', usage);
    }
    return { raw, ...usage };
  }
}
