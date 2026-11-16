import { Queue, Worker } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, login, publishedStore, resetDb, testDb } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
});
afterAll(async () => ctx?.app.close());

describe('platform admin (§9.6)', () => {
  it('is only for platform_admin sessions', async () => {
    const owner = await login(ctx.app, { role: 'owner' });
    for (const url of ['/api/v1/admin/queues', '/api/v1/admin/failed-syncs']) {
      expect((await ctx.app.inject({ method: 'GET', url })).statusCode).toBe(401);
      expect(
        (await ctx.app.inject({ method: 'GET', url, headers: owner.headers })).statusCode,
      ).toBe(403);
    }
  });

  it('lists failed syncs across stores and retries them', async () => {
    const { host } = await publishedStore(ctx);
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/public/checkout',
      headers: { 'x-store-host': host, 'idempotency-key': 'admin-test-key-012345' },
      payload: {
        customer: { name: 'Ali Raza', phone: '03001234567' },
        shipping: { address: 'House 1, Street 2', city: 'Lahore' },
        items: [{ productId: 'p-1003', qty: 1 }],
      },
    });
    ctx.getorio.failNext(1, 'rejected');
    await ctx.queue.runPending();

    const admin = await login(ctx.app, {
      role: 'platform_admin',
      getorioTenantId: 'getorio-ops',
      getorioUserId: 'ops-1',
    });
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/failed-syncs',
      headers: admin.headers,
    });
    expect(list.statusCode).toBe(200);
    const [order] = list.json().orders;
    expect(order).toMatchObject({ storeName: 'Zara Crafts', syncAttempts: 1 });
    expect(order.lastSyncError).toMatch(/^rejected/);

    const retry = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${order.id}/retry-sync`,
      headers: admin.headers,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().order.status).toBe('pending_sync');
    await ctx.queue.runPending();
    expect((await testDb().order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'synced',
    );
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/v1/admin/orders/0195f7a2-0000-7000-8000-000000000000/retry-sync',
          headers: admin.headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('shows BullMQ queue counts and failed jobs, and retries a job', async () => {
    const connection = {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      maxRetriesPerRequest: null,
    };
    const prefix = `ms-test-admin-${process.pid}`;
    const queue = new Queue('order-sync', { connection, prefix });
    await queue.obliterate({ force: true });
    const worker = new Worker(
      'order-sync',
      async () => {
        throw new Error('getorio unavailable');
      },
      { connection, prefix },
    );
    try {
      await queue.add('sync', { orderId: 'o-1' }, { jobId: 'order-o-1', attempts: 1 });
      await expect
        .poll(async () => (await queue.getJobCounts('failed')).failed, { timeout: 10_000 })
        .toBe(1);
      await worker.close();

      const admin = createTestApp({ adminQueues: [queue] });
      const { app } = await admin;
      const ops = await login(app, {
        role: 'platform_admin',
        getorioTenantId: 'getorio-ops',
        getorioUserId: 'ops-2',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/queues',
        headers: ops.headers,
      });
      expect(res.statusCode).toBe(200);
      const [q] = res.json().queues;
      expect(q).toMatchObject({ name: 'order-sync', counts: { failed: 1 } });
      expect(q.failed[0]).toMatchObject({
        id: 'order-o-1',
        data: { orderId: 'o-1' },
        failedReason: 'getorio unavailable',
      });

      const retry = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/queues/order-sync/jobs/order-o-1/retry',
        headers: ops.headers,
      });
      expect(retry.statusCode).toBe(200);
      expect((await queue.getJobCounts('failed')).failed).toBe(0);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/admin/queues/order-sync/jobs/order-o-1/retry',
            headers: ops.headers,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/admin/queues/order-sync/jobs/nope/retry',
            headers: ops.headers,
          })
        ).statusCode,
      ).toBe(404);
      await app.close();
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
