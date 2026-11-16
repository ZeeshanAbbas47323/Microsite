/**
 * Opt-in eval of the command box against the real model (requirements §12 "LLM testing").
 * Spends API credits: ~20 short requests. Needs ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL).
 *
 *   pnpm --filter @microstore/api eval:commands
 */
import {
  DEFAULT_COMMAND_SCOPE,
  FALLBACK_LAYOUT_DEFAULTS,
  generateSiteConfig,
  onboardingInputSchema,
  validateCommandPatch,
} from '@microstore/site-schema';
import { AnthropicCommandLlm, commandOutputSchema } from '../src/commands/llm';
import { COMMAND_FIXTURES } from './command-fixtures';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY to run the eval (it calls the real model).');
  process.exit(1);
}

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

const llm = new AnthropicCommandLlm({ model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5' });
let passed = 0;
let tokensIn = 0;
let tokensOut = 0;

for (const fixture of COMMAND_FIXTURES) {
  const started = Date.now();
  let verdict = 'FAIL';
  let detail = '';
  try {
    const result = await llm.propose({
      config,
      command: fixture.command,
      language: 'en',
      scope: DEFAULT_COMMAND_SCOPE,
    });
    tokensIn += result.promptTokens;
    tokensOut += result.completionTokens;
    const parsed = commandOutputSchema.safeParse(result.raw);
    if (!parsed.success) {
      detail = 'output did not match the schema';
    } else if (parsed.data.status !== fixture.status) {
      detail = `expected ${fixture.status}, got ${parsed.data.status}: ${parsed.data.summary || parsed.data.clarification}`;
    } else if (fixture.status === 'ok') {
      const ops = parsed.data.patch.map((op) =>
        op.op === 'move'
          ? { op: 'move', from: op.from ?? '', path: op.path }
          : { op: op.op, path: op.path, value: op.value },
      );
      const checked = validateCommandPatch(config, ops, DEFAULT_COMMAND_SCOPE);
      if (!checked.ok)
        detail = `rejected by validator: ${checked.errors.map((e) => e.code).join(', ')}`;
      else if (fixture.check && !fixture.check(checked.config))
        detail = `change not as expected: ${JSON.stringify(ops)}`;
      else verdict = 'PASS';
    } else {
      verdict = 'PASS';
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
  `\n${passed}/${COMMAND_FIXTURES.length} passed · tokens in ${tokensIn}, out ${tokensOut} · model ${llm.model}`,
);
process.exit(passed === COMMAND_FIXTURES.length ? 0 : 1);
