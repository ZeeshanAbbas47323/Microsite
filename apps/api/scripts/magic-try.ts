/**
 * Dev only: runs the magic store builder against the configured model (spends a little credit)
 * and prints timing and the main choices. Uses the demo tenant's draft; saves nothing.
 *
 *   pnpm --filter @microstore/api magic:try "Main Lahore mein handmade leather bags bechta hoon"
 */
import type { Session } from '../src/auth/sessions';
import { OpenRouterCommandLlm, AnthropicCommandLlm } from '../src/commands/llm';
import { createDb } from '../src/db';
import { MemoryCache } from '../src/lib/cache';
import { MagicStoreService } from '../src/stores/magic';
import { StoreService } from '../src/stores/store-service';

const description =
  process.argv[2] ?? 'Main Lahore mein handmade leather bags aur wallets bechta hoon';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');
const llm =
  process.env.COMMAND_LLM === 'openrouter' && process.env.OPENROUTER_API_KEY
    ? new OpenRouterCommandLlm({
        model: process.env.OPENROUTER_MODEL ?? 'z-ai/glm-5.3-flash',
        apiKey: process.env.OPENROUTER_API_KEY,
      })
    : new AnthropicCommandLlm({ model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5' });

const db = createDb(process.env.DATABASE_URL);
const stores = new StoreService(db, {
  rootDomain: 'microstore.localhost',
  storefrontUrlTemplate: 'http://{host}',
});
const store = await db.store.findUniqueOrThrow({ where: { getorioTenantId: 'tenant-demo' } });
const owner = await db.merchant.findFirstOrThrow({ where: { getorioTenantId: 'tenant-demo' } });
const session = { merchantId: owner.id, getorioTenantId: 'tenant-demo', role: 'owner' } as Session;

const started = Date.now();
const result = await new MagicStoreService(stores, llm, new MemoryCache()).build(
  session,
  store.id,
  {
    description,
    brandColors: process.argv[4] ? process.argv[4].split(',') : ['#7a3e14', '#e0b04a'],
    language: process.argv[3] === 'ur' ? 'ur' : 'en',
  },
);
const home = result.config.pages[0];
console.log(
  `${Date.now() - started} ms · ${result.usage.model} · in ${result.usage.promptTokens} out ${result.usage.completionTokens}`,
);
console.log(JSON.stringify(result.summary));
console.log('hero:', JSON.stringify(home?.sections[0]?.props));
console.log('seo:', JSON.stringify(home?.seo));
await db.$disconnect();
