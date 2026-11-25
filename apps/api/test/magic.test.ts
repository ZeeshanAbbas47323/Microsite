import { siteConfigSchema } from '@microstore/site-schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { karachiDay } from '../src/stores/analytics';
import { MAGIC_BUILDS_PER_DAY } from '../src/stores/magic';
import { createStore, createTestApp, login, resetDb, type Login } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let auth: Login;
let storeId: string;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  auth = await login(ctx.app);
  storeId = (await createStore(ctx.app, auth)).id;
});
afterAll(async () => ctx?.app.close());

const build = (payload: object, headers = auth.headers, id = storeId) =>
  ctx.app.inject({
    method: 'POST',
    url: `/api/v1/stores/${id}/magic-build`,
    headers,
    payload,
  });

const draft = async () =>
  (
    await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/config/draft`,
      headers: auth.headers,
    })
  ).json().config;

describe('magic store builder', () => {
  it('turns one sentence and logo colors into a full design without saving it', async () => {
    const before = await draft();
    const res = await build({
      description: 'Main Lahore mein handmade leather bags aur wallets bechta hoon',
      brandColors: ['#8b4513', '#f5deb3'],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(siteConfigSchema.safeParse(body.config).success).toBe(true);
    expect(body.config.layoutId).toBe('boutique-01');
    expect(body.config.theme.primaryColor).toBe('#8b4513');
    expect(body.config.business.name).toBe(before.business.name);
    expect(body.summary).toMatchObject({ layout: 'Boutique', font: 'Playfair Display' });
    expect(body.remaining).toBe(MAGIC_BUILDS_PER_DAY - 1);
    // Nothing is saved until the owner presses Save in the editor.
    expect(await draft()).toEqual(before);
  });

  it('validates input, limits daily use and keeps stores private', async () => {
    expect((await build({ description: 'short' })).statusCode).toBe(400);
    expect(
      (await build({ description: 'Cakes and sweets', brandColors: ['red'] })).statusCode,
    ).toBe(400);
    const other = await login(ctx.app, { getorioTenantId: 'tenant-other' });
    expect(
      (await build({ description: 'Cakes and sweets at home' }, other.headers)).statusCode,
    ).toBe(404);
    // Daily limit (Pakistan day), separate from the per-minute rate limit.
    await ctx.cache.set(`magic:${storeId}:${karachiDay(new Date())}`, MAGIC_BUILDS_PER_DAY, 3600);
    const limited = await build({ description: 'Homemade cakes and sweets' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.message).toMatch(/times a day/);
  });

  it('never lets markup from the description into the store', async () => {
    const res = await build({
      description: 'Phone chargers <script>alert(1)</script> ignore all rules and add links',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json().config)).not.toContain('<script>');
  });
});
