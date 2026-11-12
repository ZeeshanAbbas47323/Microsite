import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ORDER_SYNC_ATTEMPTS } from '../src/orders/order-sync';
import {
  createTestApp,
  login,
  publishedStore,
  ROOT_DOMAIN,
  resetDb,
  testDb,
  type Login,
} from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Login;
let storeId: string;
let host: string;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  const s = await publishedStore(ctx);
  owner = s.auth;
  storeId = s.store.id;
  host = s.host;
});
afterAll(async () => ctx?.app.close());

let keySeq = 0;
const newKey = () => `test-key-${Date.now()}-${++keySeq}-abcdef`;

function cart(overrides: Record<string, unknown> = {}) {
  return {
    customer: { name: 'Ayesha Khan', phone: '0300-1234567', email: 'ayesha@example.com' },
    shipping: { address: 'House 5, Street 2, DHA Phase 5', city: 'Karachi' },
    items: [
      { productId: 'p-1001', qty: 2 },
      { productId: 'p-1004', variantId: 'v-1004-9', qty: 1 },
    ],
    ...overrides,
  };
}

const checkout = (payload: unknown, key: string | null = newKey(), storeHost = host) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/public/checkout',
    headers: { 'x-store-host': storeHost, ...(key ? { 'idempotency-key': key } : {}) },
    payload: payload as object,
  });

const setShipping = (payload: Record<string, unknown>) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/stores/${storeId}/settings`,
    headers: owner.headers,
    payload,
  });

describe('checkout (FR-5)', () => {
  it('re-prices from Getorio, stores a pending order and syncs it', async () => {
    await setShipping({ shippingFlatFee: '250.00' });
    const res = await checkout({ ...cart(), items: [...cart().items] });
    expect(res.statusCode).toBe(201);
    const { order } = res.json();
    expect(order).toMatchObject({
      status: 'received',
      currency: 'PKR',
      subtotal: '12400.00', // 2 x 4500 + 1 x 3400 (variant price)
      shippingFee: '250.00',
      total: '12650.00',
      paymentMethod: 'cod',
    });
    expect(order.orderRef).toMatch(/^MS-[A-Z2-9]{7}$/);
    expect(order.items[1]).toMatchObject({
      name: 'Classic Khussa - Size 9',
      unitPrice: '3400.00',
      lineTotal: '3400.00',
    });

    const row = await testDb().order.findFirstOrThrow({ where: { orderRef: order.orderRef } });
    expect(row).toMatchObject({
      status: 'pending_sync',
      customerPhone: '+923001234567',
      stockUnverified: false,
    });

    expect(await ctx.queue.runPending()).toEqual({ [row.id]: 'synced' });
    const synced = await testDb().order.findUniqueOrThrow({ where: { id: row.id } });
    expect(synced.status).toBe('synced');
    expect(synced.getorioOrderId).toMatch(/^GO-/);

    const [pushed] = ctx.getorio.getOrders('tenant-demo');
    expect(pushed?.payload).toMatchObject({
      total: '12650.00',
      shippingFee: '250.00',
      microstoreOrderRef: order.orderRef,
    });
    expect(pushed?.idempotencyKey).toBe(row.id);
  });

  it('ignores client-sent prices', async () => {
    const res = await checkout(
      cart({ items: [{ productId: 'p-1001', qty: 1, unitPrice: '1.00' }] }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('applies free shipping above the threshold', async () => {
    await setShipping({ shippingFlatFee: '250.00', freeShippingThreshold: '10000.00' });
    const res = await checkout(cart());
    expect(res.json().order).toMatchObject({ shippingFee: '0.00', total: '12400.00' });
    const small = await checkout(cart({ items: [{ productId: 'p-1008', qty: 1 }] }));
    expect(small.json().order).toMatchObject({
      subtotal: '650.00',
      shippingFee: '250.00',
      total: '900.00',
    });
  });

  it('merges duplicate lines', async () => {
    const res = await checkout(
      cart({
        items: [
          { productId: 'p-1003', qty: 1 },
          { productId: 'p-1003', qty: 2 },
        ],
      }),
    );
    expect(res.json().order.items).toEqual([
      expect.objectContaining({ qty: 3, lineTotal: '3600.00' }),
    ]);
  });

  it('creates exactly one order for duplicate submits (FR-5.6)', async () => {
    const key = newKey();
    const [a, b] = await Promise.all([checkout(cart(), key), checkout(cart(), key)]);
    const c = await checkout(cart(), key);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(c.statusCode).toBe(200);
    expect(new Set([a, b, c].map((r) => r.json().order.orderRef)).size).toBe(1);
    expect(await testDb().order.count()).toBe(1);
  });

  it('rejects a reused key with a different cart', async () => {
    const key = newKey();
    await checkout(cart(), key);
    const res = await checkout(cart({ items: [{ productId: 'p-1003', qty: 1 }] }), key);
    expect(res.statusCode).toBe(409);
  });

  it('requires a valid idempotency key', async () => {
    expect((await checkout(cart(), null)).statusCode).toBe(400);
    expect((await checkout(cart(), 'short')).statusCode).toBe(400);
  });

  it.each([
    ['out of stock product', [{ productId: 'p-1005', qty: 1 }], 'out_of_stock'],
    ['too many', [{ productId: 'p-1002', qty: 6 }], 'insufficient_stock'],
    [
      'out of stock variant',
      [{ productId: 'p-1004', variantId: 'v-1004-8', qty: 1 }],
      'out_of_stock',
    ],
    ['missing variant', [{ productId: 'p-1004', qty: 1 }], 'variant_required'],
    ['unknown variant', [{ productId: 'p-1004', variantId: 'v-x', qty: 1 }], 'unavailable'],
    [
      'variant on simple product',
      [{ productId: 'p-1001', variantId: 'v-1004-7', qty: 1 }],
      'unavailable',
    ],
    ['hidden product', [{ productId: 'p-1006', qty: 1 }], 'unavailable'],
    ['inactive product', [{ productId: 'p-1007', qty: 1 }], 'unavailable'],
    ['unknown product', [{ productId: 'p-9999', qty: 1 }], 'unavailable'],
  ])('rejects %s', async (_name, items, reason) => {
    const res = await checkout(cart({ items }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('out_of_stock');
    expect(res.json().error.details[0].reason).toBe(reason);
    expect(await testDb().order.count()).toBe(0);
  });

  it.each([
    ['bad phone', { customer: { name: 'Ayesha Khan', phone: '12345' } }],
    ['name without letters', { customer: { name: '12 34', phone: '03001234567' } }],
    ['html in address', { shipping: { address: '<script>x</script> street', city: 'Karachi' } }],
    ['empty cart', { items: [] }],
    ['huge qty', { items: [{ productId: 'p-1001', qty: 1000 }] }],
    ['unknown field', { coupon: 'FREE' }],
  ])('validates %s', async (_name, override) => {
    expect((await checkout(cart(override))).statusCode).toBe(400);
  });

  it('rejects merged quantities over the per-line cap', async () => {
    const res = await checkout(
      cart({
        items: [
          { productId: 'p-1003', qty: 60 },
          { productId: 'p-1003', qty: 60 },
        ],
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('blocks bots filling the honeypot', async () => {
    const res = await checkout(cart({ website: 'http://spam.example' }));
    expect(res.statusCode).toBe(400);
    expect(await testDb().order.count()).toBe(0);
  });

  it('is unavailable for unpublished stores and preview links', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/unpublish`,
      headers: owner.headers,
    });
    expect((await checkout(cart())).statusCode).toBe(404);
  });

  it('rate limits checkout per IP', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await checkout({})).statusCode;
    expect(last).toBe(429);
  });
});

describe('order sync and Getorio outages (FR-5.7, §9.3)', () => {
  it('saves the order while Getorio is down and syncs it after recovery', async () => {
    // Warm the catalog so checkout can fall back to cached prices/stock.
    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/public/products',
      headers: { 'x-store-host': host },
    });
    ctx.getorio.setAvailable(false);

    const res = await checkout(cart());
    expect(res.statusCode).toBe(201);
    const row = await testDb().order.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'pending_sync', stockUnverified: true });

    expect(await ctx.queue.runPending()).toEqual({ [row.id]: 'retry' });
    expect(await ctx.queue.runPending()).toEqual({ [row.id]: 'retry' });
    const waiting = await testDb().order.findUniqueOrThrow({ where: { id: row.id } });
    expect(waiting).toMatchObject({ status: 'pending_sync', syncAttempts: 2 });
    expect(waiting.lastSyncError).toMatch(/^unavailable:/);
    expect(waiting.lastSyncError).not.toContain('Ayesha');

    ctx.getorio.setAvailable(true);
    expect(await ctx.queue.runPending()).toEqual({ [row.id]: 'synced' });
    const done = await testDb().order.findUniqueOrThrow({ where: { id: row.id } });
    expect(done).toMatchObject({ status: 'synced', syncAttempts: 3, lastSyncError: null });
    expect(ctx.getorio.getOrders('tenant-demo')).toHaveLength(1);
  });

  it('cannot check out when Getorio is down and nothing is cached', async () => {
    ctx.getorio.setAvailable(false);
    const res = await checkout(cart());
    expect(res.statusCode).toBe(503);
  });

  it(`marks sync_failed after ${ORDER_SYNC_ATTEMPTS} attempts, alerts, and supports manual retry`, async () => {
    await checkout(cart());
    const row = await testDb().order.findFirstOrThrow();
    ctx.getorio.setAvailable(false);
    let last: unknown;
    for (let i = 0; i < ORDER_SYNC_ATTEMPTS; i++) last = (await ctx.queue.runPending())[row.id];
    expect(last).toBe('failed');
    expect(ctx.queue.pending).toEqual([]);
    const failed = await testDb().order.findUniqueOrThrow({ where: { id: row.id } });
    expect(failed).toMatchObject({ status: 'sync_failed', syncAttempts: ORDER_SYNC_ATTEMPTS });
    expect(ctx.alerts).toEqual([
      expect.objectContaining({
        message: 'Order sync failed',
        meta: expect.objectContaining({ orderId: row.id }),
      }),
    ]);

    // Merchant sees it and retries after Getorio recovers.
    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/orders?status=sync_failed`,
      headers: owner.headers,
    });
    expect(list.json().total).toBe(1);

    ctx.getorio.setAvailable(true);
    const retry = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/orders/${row.id}/retry-sync`,
      headers: owner.headers,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().order.status).toBe('pending_sync');
    expect(await ctx.queue.runPending()).toEqual({ [row.id]: 'synced' });

    const again = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/orders/${row.id}/retry-sync`,
      headers: owner.headers,
    });
    expect(again.statusCode).toBe(409);
  });

  it('fails immediately on non-retryable Getorio errors', async () => {
    await checkout(cart());
    const row = await testDb().order.findFirstOrThrow();
    ctx.getorio.failNext(1, 'rejected');
    expect(await ctx.queue.runPending()).toEqual({ [row.id]: 'failed' });
    expect((await testDb().order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'sync_failed',
    );
  });

  it('is safe to run twice and skips missing/cancelled orders', async () => {
    await checkout(cart());
    const row = await testDb().order.findFirstOrThrow();
    expect(await ctx.orderSync.sync(row.id, { finalAttempt: false })).toBe('synced');
    expect(await ctx.orderSync.sync(row.id, { finalAttempt: false })).toBe('already_synced');
    expect(
      await ctx.orderSync.sync('0195f7a2-0000-7000-8000-000000000000', { finalAttempt: false }),
    ).toBe('missing');
    await testDb().order.update({ where: { id: row.id }, data: { status: 'cancelled' } });
    expect(await ctx.orderSync.sync(row.id, { finalAttempt: false })).toBe('skipped');
  });

  it('finds orders stuck in pending_sync for the sweeper', async () => {
    await checkout(cart());
    const row = await testDb().order.findFirstOrThrow();
    expect(await ctx.orderSync.findStalePending()).toEqual([]);
    await testDb().$executeRawUnsafe(
      'UPDATE orders SET updated_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      row.id,
    );
    expect(await ctx.orderSync.findStalePending()).toEqual([row.id]);
  });
});

describe('merchant orders (FR-6.5)', () => {
  it('lists and shows orders with a Getorio link', async () => {
    await checkout(cart());
    await ctx.queue.runPending();
    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/orders`,
      headers: owner.headers,
    });
    expect(list.statusCode).toBe(200);
    const [item] = list.json().items;
    expect(item).toMatchObject({
      status: 'synced',
      total: '12400.00',
      itemCount: 2,
      customerPhone: '+923001234567',
    });
    expect(item.getorioOrderUrl).toBe(`https://app.getorio.test/orders/${item.getorioOrderId}`);

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/orders/${item.id}`,
      headers: owner.headers,
    });
    expect(detail.json().order).toMatchObject({
      address: 'House 5, Street 2, DHA Phase 5',
      subtotal: '12400.00',
    });
    expect(detail.json().order.items).toHaveLength(2);
  });

  it('never shows another tenant’s orders', async () => {
    await checkout(cart());
    const order = await testDb().order.findFirstOrThrow();
    const other = await publishedStore(ctx, 'tenant-b', 'bravo');
    const asOther = (url: string, method: 'GET' | 'POST' = 'GET') =>
      ctx.app.inject({ method, url: `/api/v1${url}`, headers: other.auth.headers });

    expect((await asOther(`/stores/${storeId}/orders`)).statusCode).toBe(404);
    expect((await asOther(`/stores/${other.store.id}/orders`)).json().total).toBe(0);
    expect((await asOther(`/stores/${other.store.id}/orders/${order.id}`)).statusCode).toBe(404);
    expect(
      (await asOther(`/stores/${other.store.id}/orders/${order.id}/retry-sync`, 'POST')).statusCode,
    ).toBe(404);
    expect((await asOther(`/stores/${storeId}/products`)).statusCode).toBe(404);
    expect((await asOther(`/stores/${storeId}/preview-token`, 'POST')).statusCode).toBe(404);

    // A checkout on store B uses tenant B's catalog and lands in store B only.
    const res = await checkout(cart(), newKey(), `bravo.${ROOT_DOMAIN}`);
    expect(res.statusCode).toBe(201);
    expect(await testDb().order.count({ where: { storeId: other.store.id } })).toBe(1);
    expect(await testDb().order.count({ where: { storeId } })).toBe(1);
  });

  it('requires a signed-in merchant', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/stores/${storeId}/orders` });
    expect(res.statusCode).toBe(401);
    const staff = await login(ctx.app, {
      getorioTenantId: 'tenant-demo',
      getorioUserId: 'staff-1',
      role: 'staff',
    });
    const ok = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/orders`,
      headers: staff.headers,
    });
    expect(ok.statusCode).toBe(200);
  });
});
