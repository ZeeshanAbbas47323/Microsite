import { signWebhookPayload } from '@microstore/getorio-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, publishedStore, resetDb, WEBHOOK_SECRET } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
});
afterAll(async () => ctx?.app.close());

function send(
  event: object,
  { secret = WEBHOOK_SECRET, signature }: { secret?: string; signature?: string } = {},
) {
  const raw = JSON.stringify(event);
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/getorio',
    headers: {
      'content-type': 'application/json',
      'x-getorio-signature':
        signature ?? signWebhookPayload(raw, secret, Math.floor(Date.now() / 1000)),
    },
    payload: raw,
  });
}

describe('POST /webhooks/getorio', () => {
  it('invalidates the catalog and revalidates the storefront on stock changes', async () => {
    const { host, store } = await publishedStore(ctx);
    const products = () =>
      ctx.app.inject({
        method: 'GET',
        url: '/api/v1/public/products',
        headers: { 'x-store-host': host },
      });
    await products();
    ctx.getorio.updateProduct('tenant-demo', 'p-1005', { stockQty: 7 });

    const res = await send({
      id: 'evt_1',
      type: 'stock.updated',
      tenantId: 'tenant-demo',
      data: { productIds: ['p-1005'] },
    });
    expect(res.statusCode).toBe(204);
    expect(ctx.revalidated.at(-1)).toEqual({ storeId: store.id, hostnames: [host] });
    const candle = (await products()).json().items.find((p: { id: string }) => p.id === 'p-1005');
    expect(candle.inStock).toBe(true);
  });

  it('de-duplicates repeated deliveries', async () => {
    await publishedStore(ctx);
    const event = {
      id: 'evt_dup',
      type: 'product.updated',
      tenantId: 'tenant-demo',
      data: { productIds: ['p-1'] },
    };
    await send(event);
    const before = ctx.revalidated.length;
    expect((await send(event)).statusCode).toBe(204);
    expect(ctx.revalidated.length).toBe(before);
  });

  it('acknowledges events for unknown tenants and order status changes', async () => {
    expect(
      (
        await send({
          id: 'e2',
          type: 'stock.updated',
          tenantId: 'nobody',
          data: { productIds: ['p'] },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await send({
          id: 'e3',
          type: 'order.status_changed',
          tenantId: 'nobody',
          data: { getorioOrderId: 'GO-1' },
        })
      ).statusCode,
    ).toBe(204);
  });

  it('rejects bad signatures and payloads', async () => {
    const event = { id: 'e4', type: 'stock.updated', tenantId: 't', data: { productIds: ['p'] } };
    expect((await send(event, { secret: 'wrong-secret-0123456789' })).statusCode).toBe(401);
    expect((await send(event, { signature: 'garbage' })).statusCode).toBe(401);
    expect(
      (await send({ id: 'e5', type: 'user.deleted', tenantId: 't', data: {} })).statusCode,
    ).toBe(401);
    const unsigned = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/getorio',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(event),
    });
    expect(unsigned.statusCode).toBe(401);
  });
});
