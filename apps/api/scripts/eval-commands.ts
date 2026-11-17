/**
 * Opt-in eval of the command box against the real model (requirements §12 "LLM testing").
 * Spends API credits: ~20 short requests. Uses the provider from COMMAND_LLM (`anthropic` needs
 * ANTHROPIC_API_KEY, `openrouter` needs OPENROUTER_API_KEY). An optional argument overrides the model.
 *
 *   pnpm --filter @microstore/api eval:commands [model]
 */
import {
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
  validateCommandPatch,
} from '@microstore/site-schema';
import {
  AnthropicCommandLlm,
  commandOutputSchema,
  OpenRouterCommandLlm,
  type CommandLlm,
} from '../src/commands/llm';
import { COMMAND_SCOPE, toPatchOperation } from '../src/commands/command-service';
import { COMMAND_FIXTURES } from './command-fixtures';

const provider = process.env.COMMAND_LLM === 'openrouter' ? 'openrouter' : 'anthropic';
const keyName = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY';
const apiKey = process.env[keyName];
if (!apiKey) {
  console.error(`Set ${keyName} to run the eval (it calls the real model).`);
  process.exit(1);
}
const modelArg = process.argv[2];

const config = generateSiteConfig(
  onboardingInputSchema.parse({
    business: {
      name: 'Zara Crafts',
      tagline: 'Handmade with love',
      description: '',
      category: 'handmade',
    },
    branding: {
      logoUrl: '',
      primaryColor: '#7c3aed',
      secondaryColor: '#f59e0b',
      fontFamily: 'Poppins',
    },
    contact: {
      phone: '03001234567',
      whatsapp: '',
      email: '',
      address: '',
      city: 'Lahore',
      social: { facebook: '', instagram: '', tiktok: '' },
    },
    pages: { about: true, contact: true, custom: null },
    layoutId: 'bold-01',
    subdomain: 'zara',
  }),
  { layoutId: 'bold-01', ...FALLBACK_LAYOUT_DEFAULTS },
);

const llm: CommandLlm =
  provider === 'openrouter'
    ? new OpenRouterCommandLlm({
        model: modelArg ?? process.env.OPENROUTER_MODEL ?? 'z-ai/glm-5.3-flash',
        apiKey,
      })
    : new AnthropicCommandLlm({
        model: modelArg ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
        apiKey,
      });
let passed = 0;
let tokensIn = 0;
let tokensOut = 0;

// EVAL_ONLY=<text> runs only fixtures whose command contains that text (debugging one case).
const only = process.env.EVAL_ONLY?.toLowerCase();
const fixtures = only
  ? COMMAND_FIXTURES.filter((f) => f.command.toLowerCase().includes(only))
  : COMMAND_FIXTURES;

for (const fixture of fixtures) {
  const started = Date.now();
  let verdict = 'FAIL';
  let detail = '';
  try {
    // Mirrors CommandService: one corrective retry when the validator rejects the first patch.
    let feedback: string | undefined;
    for (let round = 0; round < 2; round++) {
      const result = await llm.propose({
        config,
        command: fixture.command,
        language: 'en',
        scope: COMMAND_SCOPE,
        ...(feedback ? { feedback } : {}),
      });
      tokensIn += result.promptTokens;
      tokensOut += result.completionTokens;
      const parsed = commandOutputSchema.safeParse(result.raw);
      if (!parsed.success) {
        detail = 'output did not match the schema';
      } else if (parsed.data.status !== fixture.status) {
        detail = `expected ${fixture.status}, got ${parsed.data.status}: ${parsed.data.summary || parsed.data.clarification}${feedback ? `\n      after: ${feedback.slice(0, 400)}` : ''}`;
      } else if (fixture.status === 'ok') {
        const ops = parsed.data.patch.map((op) => toPatchOperation(op, config));
        const checked = validateCommandPatch(config, ops, COMMAND_SCOPE);
        if (!checked.ok) {
          const reasons = checked.errors
            .map((e) => `${e.code}${e.path ? ` ${e.path}` : ''}: ${e.message}`)
            .join('; ');
          detail = `rejected by validator: ${reasons} · ${JSON.stringify(ops)}`;
          if (round === 0) {
            feedback = `${reasons}\nYour operations were: ${JSON.stringify(ops)}`;
            continue;
          }
        } else if (fixture.check && !fixture.check(checked.config)) {
          detail = `change not as expected: ${JSON.stringify(ops)}`;
        } else {
          verdict = 'PASS';
          detail = round ? '(passed after one corrective retry)' : '';
        }
      } else {
        verdict = 'PASS';
      }
      break;
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  if (verdict === 'PASS') passed += 1;
  console.log(
    `${verdict}  ${String(Date.now() - started).padStart(5)} ms  ${fixture.command}${detail ? `\n      ${detail}` : ''}`,
  );
}

console.log(
  `\n${passed}/${fixtures.length} passed · tokens in ${tokensIn}, out ${tokensOut} · model ${llm.model}`,
);
process.exit(passed === fixtures.length ? 0 : 1);
