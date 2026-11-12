import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPreviewToken } from '../src/public/preview';
import { normalizeHost } from '../src/public/tenant';
import {
  createStore,
  createTestApp,
  login,
  PREVIEW_SECRET,
  publishedStore,
  resetDb,
  ROOT_DOMAIN,
  testDb,
} from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
});
afterAll(async () => ctx?.app.close());

const get = (url: string, host: string) =>
  ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { 'x-store-host': host } });

describe('tenant resolution', () => {
  it('normalizes hosts', () => {
    expect(normalizeHost('Zara.Shops.Test:3000')).toBe('zara.shops.test');
    expect(normalizeHost('zara.shops.test.')).toBe('zara.shops.test');
    expect(normalizeHost('bad host')).toBeNull();
    expect(normalizeHost('a..b')).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });

  it('serves the published config by host', async () => {
    const { host } = await publishedStore(ctx);
    const res = await get('/public/store', host);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=30');
    const body = res.json();
    expect(body.store).toMatchObject({ name: 'Zara Crafts', hostname: host, currency: 'PKR' });
    expect(body.store).not.toHaveProperty('id');
    expect(JSON.stringify(body)).not.toContain('tenant-demo');
    expect(body.config.layoutId).toBe('bold-01');
    expect(body.preview).toBe(false);
  });

  it('falls back to the Host header', async () => {
    const { host } = await publishedStore(ctx);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/public/store',
      headers: { host: `${host}:3000` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('404s for unknown hosts', async () => {
    const res = await get('/public/store', `nobody.${ROOT_DOMAIN}`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('store_not_found');
  });

  it('hides unpublished stores and shows suspended ones as unavailable (FR-4.6)', async () => {
    const auth = await login(ctx.app, { getorioTenantId: 'tenant-demo' });
    const store = await createStore(ctx.app, auth);
    const draft = await get('/public/store', `zara.${ROOT_DOMAIN}`);
    expect(draft.statusCode).toBe(404);
    expect(draft.json().error).toMatchObject({
      code: 'store_unavailable',
      details: { name: 'Zara Crafts' },
    });

    await testDb().store.update({ where: { id: store.id }, data: { status: 'suspended' } });
    const suspended = await get('/public/store', `zara.${ROOT_DOMAIN}`);
    expect(suspended.statusCode).toBe(503);
    expect(suspended.json().error.code).toBe('store_suspended');
  });

  it('keeps serving through an old subdomain and reports the primary host', async () => {
    const { auth, store } = await publishedStore(ctx);
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stores/${store.id}/settings`,
      headers: auth.headers,
      payload: { subdomain: 'zara-new' },
    });
    const viaOld = await get('/public/store', `zara.${ROOT_DOMAIN}`);
    expect(viaOld.json().store.hostname).toBe(`zara-new.${ROOT_DOMAIN}`);

    await testDb().domain.updateMany({
      where: { hostname: `zara.${ROOT_DOMAIN}` },
      data: { redirectExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await get('/public/store', `zara.${ROOT_DOMAIN}`)).statusCode).toBe(404);
  });
});

describe('draft preview (FR-4.5)', () => {
  it('shows the draft with a valid token, even when unpublished', async () => {
    const auth = await login(ctx.app, { getorioTenantId: 'tenant-demo' });
    const store = await createStore(ctx.app, auth);
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stores/${store.id}/config/draft`,
      headers: auth.headers,
      payload: { patch: [{ op: 'replace', path: '/footer/text', value: 'Draft footer' }] },
    });
    const issued = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${store.id}/preview-token`,
      headers: auth.headers,
    });
    expect(issued.statusCode).toBe(200);
    const { token, url } = issued.json();
    expect(url).toContain(`https://zara.${ROOT_DOMAIN}/?preview=`);

    const res = await get(
      `/public/store?preview=${encodeURIComponent(token)}`,
      `zara.${ROOT_DOMAIN}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      preview: true,
      config: { footer: { text: 'Draft footer' } },
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects forged, expired and foreign tokens', async () => {
    const auth = await login(ctx.app, { getorioTenantId: 'tenant-demo' });
    const store = await createStore(ctx.app, auth);
    const host = `zara.${ROOT_DOMAIN}`;
    const expired = createPreviewToken(PREVIEW_SECRET, store.id, Date.now() - 2 * 3600_000).token;
    const forged = createPreviewToken('wrong-secret-0123456789abcdef0123', store.id).token;
    const foreign = createPreviewToken(
      PREVIEW_SECRET,
      '0195f7a2-0000-7000-8000-000000000000',
    ).token;
    for (const token of [expired, forged, foreign, 'garbage']) {
      expect(
        (await get(`/public/store?preview=${encodeURIComponent(token)}`, host)).statusCode,
      ).toBe(404);
    }
  });
});

describe('public products (FR-4.1, FR-4.2)', () => {
  it('lists only active, visible products with filters, sort and pagination', async () => {
    const { host } = await publishedStore(ctx);
    const all = (await get('/public/products?pageSize=48', host)).json();
    const ids = all.items.map((p: { id: string }) => p.id);
    expect(all.total).toBe(10);
    expect(ids).not.toContain('p-1006'); // hidden
    expect(ids).not.toContain('p-1007'); // inactive
    expect(all.items.slice(0, 4).every((p: { featured: boolean }) => p.featured)).toBe(true);
    expect(all.categories.map((c: { name: string }) => c.name)).toEqual([
      'Accessories',
      'Bags',
      'Footwear',
      'Home',
    ]);
    expect(all.stale).toBe(false);

    const cheap = (await get('/public/products?sort=price-asc&pageSize=2', host)).json();
    expect(cheap.items.map((p: { price: string }) => p.price)).toEqual(['650.00', '850.00']);
    expect(cheap.total).toBe(10);
    const page2 = (await get('/public/products?sort=price-asc&pageSize=2&page=2', host)).json();
    expect(page2.items[0].price).toBe('900.00');

    const expensive = (await get('/public/products?sort=price-desc&pageSize=1', host)).json();
    expect(expensive.items[0].price).toBe('5200.00');
    expect((await get('/public/products?sort=name&pageSize=1', host)).json().items[0].name).toBe(
      'Ajrak Pouch',
    );
    expect((await get('/public/products?sort=newest', host)).statusCode).toBe(200);

    expect((await get('/public/products?search=leather', host)).json().total).toBe(2);
    expect((await get('/public/products?category=cat-footwear', host)).json().total).toBe(1);
    expect((await get('/public/products?featured=true', host)).json().total).toBe(4);
    expect((await get('/public/products?sort=random', host)).statusCode).toBe(400);
  });

  it('exposes stock as in/out only', async () => {
    const { host } = await publishedStore(ctx);
    const candle = (await get('/public/products/p-1005', host)).json().product;
    expect(candle.inStock).toBe(false);
    expect(candle).not.toHaveProperty('stockQty');
    const khussa = (await get('/public/products/p-1004', host)).json().product;
    expect(khussa.variants.map((v: { inStock: boolean }) => v.inStock)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('404s for hidden products and unpublished stores', async () => {
    const { host } = await publishedStore(ctx);
    expect((await get('/public/products/p-1006', host)).statusCode).toBe(404);
    expect((await get('/public/products/nope', host)).statusCode).toBe(404);
    const auth = await login(ctx.app, { getorioTenantId: 'tenant-b', getorioUserId: 'b' });
    await createStore(ctx.app, auth, { subdomain: 'bravo' });
    expect((await get('/public/products', `bravo.${ROOT_DOMAIN}`)).statusCode).toBe(404);
  });

  it('caches the catalog for 60 s and serves a stale copy when Getorio is down', async () => {
    let now = Date.now();
    ctx = await createTestApp({ now: () => now });
    const { host } = await publishedStore(ctx);
    await get('/public/products', host);
    await get('/public/products', host);
    expect(ctx.getorio.calls.filter((c) => c.method === 'listProducts')).toHaveLength(1);

    now += 61_000;
    ctx.getorio.setAvailable(false);
    const stale = (await get('/public/products', host)).json();
    expect(stale.stale).toBe(true);
    expect(stale.total).toBe(10);

    await ctx.catalog.invalidate('tenant-demo');
    const res = await get('/public/products', host);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('service_unavailable');
  });
});

describe('merchant products (FR-6.4)', () => {
  it('lists Getorio products with microstore flags', async () => {
    const { auth, store } = await publishedStore(ctx);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${store.id}/products?pageSize=100`,
      headers: auth.headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(12);
    expect(res.json().items.find((p: { id: string }) => p.id === 'p-1006')).toMatchObject({
      visible: false,
    });
  });

  it('toggles visibility, updates Getorio and the storefront', async () => {
    const { auth, store, host } = await publishedStore(ctx);
    await get('/public/products', host); // warm the cache
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stores/${store.id}/products/p-1006`,
      headers: auth.headers,
      payload: { visible: true, featured: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().product).toMatchObject({ visible: true, featured: true });
    expect((await ctx.getorio.getProduct('tenant-demo', 'p-1006'))?.microstore).toEqual({
      visible: true,
      featured: true,
    });
    expect(
      await testDb().storeProduct.count({ where: { storeId: store.id, featured: true } }),
    ).toBe(1);
    expect((await get('/public/products', host)).json().total).toBe(11);
    expect(ctx.revalidated.at(-1)?.storeId).toBe(store.id);
  });

  it('validates updates and reports Getorio outages', async () => {
    const { auth, store } = await publishedStore(ctx);
    const patch = (pid: string, payload: unknown) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/stores/${store.id}/products/${pid}`,
        headers: auth.headers,
        payload: payload as object,
      });
    expect((await patch('p-1001', {})).statusCode).toBe(400);
    expect((await patch('nope', { visible: true })).statusCode).toBe(404);
    ctx.getorio.setAvailable(false);
    const down = await patch('p-1001', { visible: false });
    expect(down.statusCode).toBe(503);
    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${store.id}/products`,
      headers: auth.headers,
    });
    expect(list.statusCode).toBe(503);
  });
});
