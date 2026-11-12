import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { BullOrderSyncQueue, startOrderSyncWorker } from '../src/orders/order-sync';
import { createTestApp, publishedStore, resetDb, testDb } from './helpers';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function redisAvailable() {
  const r = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0 });
  try {
    await r.connect();
    await r.ping();
    return true;
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

const available = await redisAvailable();

describe.skipIf(!available)('BullMQ order sync (real Redis)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const connection = { url: REDIS_URL, maxRetriesPerRequest: null };
  let queue: BullOrderSyncQueue;

  beforeAll(async () => {
    await resetDb();
    ctx = await createTestApp();
    queue = new BullOrderSyncQueue(connection);
    await queue.queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.queue.obliterate({ force: true });
    await queue.close();
    await ctx.app.close();
  });

  it('syncs an enqueued order through a worker', async () => {
    const { host } = await publishedStore(ctx);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/public/checkout',
      headers: { 'x-store-host': host, 'idempotency-key': `bullmq-${Date.now()}-abcdefgh` },
      payload: {
        customer: { name: 'Bilal Ahmed', phone: '03211234567' },
        shipping: { address: 'Flat 3, Block B, Gulshan', city: 'Karachi' },
        items: [{ productId: 'p-1003', qty: 1 }],
      },
    });
    expect(res.statusCode).toBe(201);
    const order = await testDb().order.findFirstOrThrow();

    const worker = startOrderSyncWorker(connection, ctx.orderSync, { queue, sweepEveryMs: 60_000 });
    await queue.enqueue(order.id);
    await queue.enqueue(order.id); // de-duplicated by job id

    const deadline = Date.now() + 10_000;
    let status = order.status;
    while (status !== 'synced' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await testDb().order.findUniqueOrThrow({ where: { id: order.id } })).status;
    }
    await worker.close();
    expect(status).toBe('synced');
    expect(ctx.getorio.getOrders('tenant-demo')).toHaveLength(1);

    // A manual retry of a finished job re-adds it without error.
    await queue.requeue(order.id);
    expect(await queue.queue.getJob(`order-${order.id}`)).toBeTruthy();
  });
});
