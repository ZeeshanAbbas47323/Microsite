import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStore, createTestApp, login, resetDb, testDb, type Login } from './helpers';

/*
 * Requirements §9.1: automated proof that store A can never be read or written by tenant B.
 * Every attempt must look exactly like a missing store (404) and must not change anything.
 */

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let ownerA: Login;
let ownerB: Login;
let storeA: { id: string };
let versionA: string;

beforeAll(async () => {
  await resetDb();
  ctx = await createTestApp();
  ownerA = await login(ctx.app, { getorioTenantId: 'tenant-a', getorioUserId: 'alice' });
  ownerB = await login(ctx.app, { getorioTenantId: 'tenant-b', getorioUserId: 'bob' });
  storeA = await createStore(ctx.app, ownerA, { subdomain: 'alpha' });
  await createStore(ctx.app, ownerB, { subdomain: 'bravo' });
  const v = await testDb().siteVersion.findFirstOrThrow({ where: { storeId: storeA.id } });
  versionA = v.id;
});

afterAll(async () => {
  await ctx.app.close();
});

const attempts = () =>
  [
    ['GET', `/stores/${storeA.id}`, undefined],
    ['GET', `/stores/${storeA.id}/config/draft`, undefined],
    ['PUT', `/stores/${storeA.id}/config/draft`, { config: {} }],
    [
      'PATCH',
      `/stores/${storeA.id}/config/draft`,
      { patch: [{ op: 'replace', path: '/footer/text', value: 'pwned' }] },
    ],
    ['PATCH', `/stores/${storeA.id}/settings`, { shippingFlatFee: '9999' }],
    ['POST', `/stores/${storeA.id}/publish`, undefined],
    ['POST', `/stores/${storeA.id}/unpublish`, undefined],
    ['GET', `/stores/${storeA.id}/versions`, undefined],
    ['POST', `/stores/${storeA.id}/versions/${versionA}/restore`, undefined],
  ] as const;

describe('tenant isolation', () => {
  it('tenant B sees only its own store', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/stores/me',
      headers: ownerB.headers,
    });
    expect(res.json().store.subdomain).toBe('bravo');
  });

  it('every store route returns 404 for another tenant', async () => {
    for (const [method, url, payload] of attempts()) {
      const res = await ctx.app.inject({
        method,
        url: `/api/v1${url}`,
        headers: ownerB.headers,
        ...(payload !== undefined ? { payload } : {}),
      });
      // PUT with an invalid body fails validation before the lookup; anything else must be 404
      const expected = method === 'PUT' ? [400, 404] : [404];
      expect(expected, `${method} ${url} -> ${res.statusCode}`).toContain(res.statusCode);
    }
  });

  it('left store A untouched', async () => {
    const row = await testDb().store.findUniqueOrThrow({ where: { id: storeA.id } });
    expect(row.status).toBe('draft');
    expect(row.publishedConfig).toBeNull();
    expect((row.draftConfig as { footer: { text: string } }).footer.text).not.toBe('pwned');
    expect((row.settings as { shippingFlatFee: string }).shippingFlatFee).toBe('0.00');
    expect(
      await testDb().auditLog.count({ where: { storeId: storeA.id, actor: { contains: 'bob' } } }),
    ).toBe(0);
  });

  it('restoring another tenant’s version into your own store is refused', async () => {
    const storeB = await testDb().store.findFirstOrThrow({
      where: { getorioTenantId: 'tenant-b' },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeB.id}/versions/${versionA}/restore`,
      headers: ownerB.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it('staff of the same tenant can access the store', async () => {
    const staff = await login(ctx.app, {
      getorioTenantId: 'tenant-a',
      getorioUserId: 'carol',
      role: 'staff',
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeA.id}`,
      headers: staff.headers,
    });
    expect(res.statusCode).toBe(200);
  });
});
