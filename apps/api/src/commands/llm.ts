import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { CommandScope, SiteConfig } from '@microstore/site-schema';
import { buildSystemPrompt, buildUserMessage } from './prompt';

/** What the model must return (FR-7.2). */
export const commandOutputSchema = z.object({
  status: z.enum(['ok', 'clarify', 'unsupported', 'advice']),
  summary: z.string().max(1000),
  clarification: z.string().max(1000).nullable(),
  /** Status "advice": up to three ready-to-run commands the owner can pick. */
  // Lenient: extra or long suggestions are trimmed rather than failing the whole answer.
  suggestions: z
    .array(z.string())
    .default([])
    .transform((list) => list.slice(0, 3).map((s) => s.slice(0, 300))),
  patch: z
    .array(
      z.object({
        op: z.enum(['replace', 'move', 'test', 'add', 'remove']),
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
  required: ['status', 'summary', 'clarification', 'suggestions', 'patch'],
  properties: {
    status: { type: 'string', enum: ['ok', 'clarify', 'unsupported', 'advice'] },
    summary: { type: 'string' },
    clarification: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    suggestions: { type: 'array', items: { type: 'string' } },
    patch: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'path', 'from', 'value'],
        properties: {
          op: { type: 'string', enum: ['replace', 'move', 'test', 'add', 'remove'] },
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
  /** Why the previous answer was rejected, for the one corrective retry. */
  feedback?: string;
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

/** One structured-output call: a system prompt, a user message and the JSON schema to follow. */
export interface GenerateRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /** Short name of the schema (some providers require one). */
  name: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Less thinking = much faster and cheaper; enough for well-specified writing tasks. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/** The model behind the command box. Tests use a deterministic stub (requirements §12). */
export interface CommandLlm {
  readonly model: string;
  propose(request: LlmRequest): Promise<LlmResult>;
  /** Any other structured task (e.g. the magic store brief). */
  generate?(request: GenerateRequest): Promise<LlmResult>;
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

  async propose({ config, command, language, scope, feedback }: LlmRequest): Promise<LlmResult> {
    const key = JSON.stringify(scope);
    let system = this.systemPrompts.get(key);
    if (!system) {
      system = buildSystemPrompt(scope);
      this.systemPrompts.set(key, system);
    }
    return this.generate({
      system,
      user: buildUserMessage(config, command, language, feedback),
      schema: COMMAND_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
      name: 'command_patch',
    });
  }

  async generate({
    system,
    user,
    schema,
    maxTokens,
    timeoutMs,
  }: GenerateRequest): Promise<LlmResult> {
    const withFallback = FALLBACK_MODELS.has(this.model);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: maxTokens ?? 8000,
          ...(withFallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: user }],
        },
        timeoutMs ? { timeout: timeoutMs } : undefined,
      );
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

export interface OpenRouterCommandLlmOptions {
  model: string;
  apiKey: string;
  /** FR-7.7: 20 s per call. */
  timeoutMs?: number;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface OpenRouterResponse {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number };
}

/**
 * Any OpenRouter model with structured outputs (chat completions API). `require_parameters` makes
 * OpenRouter route only to providers that enforce the JSON schema; the caller still validates.
 */
export class OpenRouterCommandLlm implements CommandLlm {
  readonly model: string;
  private readonly systemPrompts = new Map<string, string>();
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: OpenRouterCommandLlmOptions) {
    this.model = options.model;
    this.fetchFn = options.fetch ?? fetch;
  }

  async propose({ config, command, language, scope, feedback }: LlmRequest): Promise<LlmResult> {
    const key = JSON.stringify(scope);
    let system = this.systemPrompts.get(key);
    if (!system) {
      system = buildSystemPrompt(scope);
      this.systemPrompts.set(key, system);
    }
    return this.generate({
      system,
      user: buildUserMessage(config, command, language, feedback),
      schema: COMMAND_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
      name: 'command_patch',
    });
  }

  async generate({
    system,
    user,
    schema,
    name,
    maxTokens,
    timeoutMs,
    reasoningEffort,
  }: GenerateRequest): Promise<LlmResult> {
    let res: Response;
    try {
      res = await this.fetchFn(
        `${this.options.baseUrl ?? 'https://openrouter.ai/api/v1'}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/json',
            'x-title': 'Getorio Microstore',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: maxTokens ?? 4000,
            temperature: 0,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name, strict: true, schema },
            },
            provider: { require_parameters: true },
            ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs ?? this.options.timeoutMs ?? 20_000),
        },
      );
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
        throw new LlmError('timeout', 'The AI took too long to answer');
      throw new LlmError('unavailable', 'AI service unreachable');
    }

    const body = (await res.json().catch(() => null)) as OpenRouterResponse | null;
    if (!res.ok || !body || body.error)
      throw new LlmError('unavailable', `AI service error ${body?.error?.code ?? res.status}`);

    const usage = {
      model: body.model ?? this.model,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    };
    const choice = body.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter')
      throw new LlmError('refused', 'The AI declined this request', usage);
    if (choice?.finish_reason === 'length')
      throw new LlmError('malformed', 'The AI answer was cut off', usage);
    let raw: unknown;
    try {
      // Some models wrap JSON in a code fence despite the schema.
      raw = JSON.parse(
        (choice?.message?.content ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''),
      );
    } catch {
      throw new LlmError('malformed', 'The AI answer was not valid JSON', usage);
    }
    return { raw, ...usage };
  }
}
