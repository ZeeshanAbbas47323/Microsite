import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { karachiDay } from '../src/stores/analytics';
import { createTestApp, login, onboarding, publishedStore, resetDb, type Login } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Login;
let storeId: string;
let host: string;

const BROWSER =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  const s = await publishedStore(ctx);
  owner = s.auth;
  storeId = s.store.id;
  host = s.host;
});
afterAll(async () => ctx?.app.close());

const beacon = (newVisit: boolean, userAgent = BROWSER, storeHost = host) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/public/visits',
    headers: { 'x-store-host': storeHost, 'user-agent': userAgent },
    payload: { newVisit },
  });

const analytics = (query = '', headers = owner.headers) =>
  ctx.app.inject({ method: 'GET', url: `/api/v1/stores/${storeId}/analytics${query}`, headers });

describe('store analytics (Phase 3)', () => {
  it('counts visits, page views, orders and conversion for today', async () => {
    expect((await beacon(true)).statusCode).toBe(204);
    await beacon(false);
    await beacon(false);
    await beacon(true);
    // Bots are ignored
    await beacon(true, 'Mozilla/5.0 (compatible; Googlebot/2.1)');
    await beacon(true, 'facebookexternalhit/1.1');

    const order = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/public/checkout',
      headers: { 'x-store-host': host, 'idempotency-key': 'analytics-key-0123456789' },
      payload: {
        customer: { name: 'Ayesha Khan', phone: '03001234567' },
        shipping: { address: 'House 5', city: 'Karachi' },
        items: [{ productId: 'p-1001', qty: 1 }],
      },
    });
    expect(order.statusCode).toBe(201);

    const res = await analytics('?days=7');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days).toHaveLength(7);
    expect(body.to).toBe(karachiDay(new Date()));
    expect(body.days.at(-1)).toMatchObject({
      date: body.to,
      visits: 2,
      pageViews: 4,
      orders: 1,
      revenue: '4500.00',
    });
    expect(body.totals).toMatchObject({
      visits: 2,
      pageViews: 4,
      orders: 1,
      revenue: '4500.00',
      conversionRate: 0.5,
    });
  });

  it('defaults to 30 days, rejects other ranges and other tenants', async () => {
    const res = await analytics();
    expect(res.json().days).toHaveLength(30);
    expect(res.json().totals.conversionRate).toBeNull();
    expect((await analytics('?days=365')).statusCode).toBe(400);
    const other = await login(ctx.app, { getorioTenantId: 'tenant-other' });
    expect((await analytics('', other.headers)).statusCode).toBe(404);
  });

  it('does not count unpublished stores', async () => {
    const other = await login(ctx.app, { getorioTenantId: 'tenant-two' });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      headers: other.headers,
      payload: onboarding({ subdomain: 'draftshop' }),
    });
    expect(
      (await beacon(true, BROWSER, `draftshop.${host.split('.').slice(1).join('.')}`)).statusCode,
    ).toBe(404);
  });

  it('uses the Pakistan calendar day', () => {
    expect(karachiDay(new Date('2026-11-15T19:30:00Z'))).toBe('2026-11-16');
    expect(karachiDay(new Date('2026-11-15T18:59:59Z'))).toBe('2026-11-15');
  });
});
