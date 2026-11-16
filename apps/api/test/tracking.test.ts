import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, publishedStore, ROOT_DOMAIN, resetDb, testDb } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let host: string;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  host = (await publishedStore(ctx)).host;
});
afterAll(async () => ctx?.app.close());

const placeOrder = async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/public/checkout',
    headers: { 'x-store-host': host, 'idempotency-key': `track-${Date.now()}-abcdefgh` },
    payload: {
      customer: { name: 'Ayesha Khan', phone: '0300-1234567' },
      shipping: { address: 'House 5, Street 2', city: 'Karachi' },
      items: [{ productId: 'p-1001', qty: 1 }],
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().order.orderRef as string;
};

const track = (payload: unknown, storeHost = host) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/public/orders/track',
    headers: { 'x-store-host': storeHost },
    payload: payload as object,
  });

describe('order tracking (FR-5.10)', () => {
  it('shows "received" until Getorio has the order, then the live Getorio status', async () => {
    const orderRef = await placeOrder();
    const before = await track({ orderRef, phone: '+923001234567' });
    expect(before.statusCode).toBe(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(before.json()).toMatchObject({
      order: { orderRef, total: '4500.00' },
      tracking: { status: 'received' },
    });
    expect(JSON.stringify(before.json())).not.toContain('Ayesha');

    await ctx.queue.runPending();
    const row = await testDb().order.findFirstOrThrow({ where: { orderRef } });
    ctx.getorio.setOrderStatus('tenant-demo', row.getorioOrderId as string, 'shipped');
    // Lower-case reference and local phone format are accepted
    const after = await track({ orderRef: orderRef.toLowerCase(), phone: '0300 1234567' });
    expect(after.json().tracking.status).toBe('shipped');
  });

  it('caches the Getorio status briefly', async () => {
    const orderRef = await placeOrder();
    await ctx.queue.runPending();
    const row = await testDb().order.findFirstOrThrow({ where: { orderRef } });
    const id = row.getorioOrderId as string;
    ctx.getorio.setOrderStatus('tenant-demo', id, 'confirmed');
    expect((await track({ orderRef, phone: '03001234567' })).json().tracking.status).toBe(
      'confirmed',
    );
    ctx.getorio.setOrderStatus('tenant-demo', id, 'delivered');
    expect((await track({ orderRef, phone: '03001234567' })).json().tracking.status).toBe(
      'confirmed',
    );
  });

  it('answers the same "not found" for a wrong phone, unknown order or another store', async () => {
    const orderRef = await placeOrder();
    const other = await publishedStore(ctx, 'tenant-other', 'other');
    for (const res of [
      await track({ orderRef, phone: '03119999999' }),
      await track({ orderRef: 'MS-ZZZZZZZ', phone: '03001234567' }),
      await track({ orderRef, phone: '03001234567' }, other.host),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.message).toBe(
        'We could not find an order with that number and phone',
      );
    }
    expect((await track({ orderRef: '<script>', phone: 'x' })).statusCode).toBe(400);
    expect(
      (await track({ orderRef, phone: '03001234567' }, `nobody.${ROOT_DOMAIN}`)).statusCode,
    ).toBe(404);
  });
});
