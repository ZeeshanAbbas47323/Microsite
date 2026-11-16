import {
  DEFAULT_COMMAND_SCOPE,
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
} from '@microstore/site-schema';
import { describe, expect, it } from 'vitest';
import { LlmError, OpenRouterCommandLlm } from '../src/commands/llm';
import { onboarding } from './helpers';

const config = generateSiteConfig(onboardingInputSchema.parse(onboarding()), {
  layoutId: 'bold-01',
  ...FALLBACK_LAYOUT_DEFAULTS,
});
const request = {
  config,
  command: 'navbar kala kardo',
  language: 'ur' as const,
  scope: DEFAULT_COMMAND_SCOPE,
};
const output = { status: 'ok', summary: 'Navbar black', clarification: null, patch: [] };

function fakeFetch(status: number, body: unknown, seen: { init?: RequestInit } = {}) {
  return (async (_url: string, init?: RequestInit) => {
    seen.init = init;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const llm = (f: typeof fetch) =>
  new OpenRouterCommandLlm({ model: 'z-ai/glm-5.3-flash', apiKey: 'test-key', fetch: f });

describe('OpenRouter command model', () => {
  it('sends the strict JSON schema and returns the parsed answer with usage', async () => {
    const seen: { init?: RequestInit } = {};
    const res = await llm(
      fakeFetch(
        200,
        {
          model: 'z-ai/glm-5.3-flash',
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }],
          usage: { prompt_tokens: 1200, completion_tokens: 90 },
        },
        seen,
      ),
    ).propose(request);
    expect(res).toEqual({
      raw: output,
      model: 'z-ai/glm-5.3-flash',
      promptTokens: 1200,
      completionTokens: 90,
    });
    const body = JSON.parse(String(seen.init?.body));
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { strict: true },
    });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.messages[0].role).toBe('system');
    expect((seen.init?.headers as Record<string, string>).authorization).toBe('Bearer test-key');
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const res = await llm(
      fakeFetch(200, {
        choices: [{ message: { content: '```json\n' + JSON.stringify(output) + '\n```' } }],
      }),
    ).propose(request);
    expect(res.raw).toEqual(output);
  });

  it('maps failures to LLM errors', async () => {
    const kind = async (f: typeof fetch) =>
      llm(f)
        .propose(request)
        .then(
          () => 'none',
          (e: unknown) => (e instanceof LlmError ? e.kind : 'other'),
        );
    expect(await kind(fakeFetch(402, { error: { code: 402, message: 'No credits' } }))).toBe(
      'unavailable',
    );
    expect(await kind(fakeFetch(200, { choices: [{ message: { content: 'not json' } }] }))).toBe(
      'malformed',
    );
    expect(
      await kind(
        fakeFetch(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] }),
      ),
    ).toBe('malformed');
    expect(
      await kind(fakeFetch(200, { choices: [{ message: { content: null, refusal: 'no' } }] })),
    ).toBe('refused');
    const slow = (async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    expect(await kind(slow)).toBe('timeout');
  });
});
