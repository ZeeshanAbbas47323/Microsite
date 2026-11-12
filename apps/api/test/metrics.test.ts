import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, METRICS_TOKEN, publishedStore, resetDb } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  await resetDb();
  ctx = await createTestApp();
});
afterAll(async () => ctx?.app.close());

describe('/metrics (§9.6)', () => {
  it('is hidden without the bearer token', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/metrics',
          headers: { authorization: 'Bearer wrong' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('reports request latency, orders and sync outcomes', async () => {
    const { host } = await publishedStore(ctx);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/public/checkout',
      headers: { 'x-store-host': host, 'idempotency-key': 'metrics-key-0123456789' },
      payload: {
        customer: { name: 'Metric Test', phone: '03001234567' },
        shipping: { address: 'House 1, Street 2', city: 'Lahore' },
        items: [{ productId: 'p-1003', qty: 1 }],
      },
    });
    expect(res.statusCode).toBe(201);
    await ctx.queue.runPending();

    const metrics = await ctx.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toMatch(
      /http_request_duration_seconds_count\{method="POST",route="\/api\/v1\/public\/checkout",status="201"\} 1/,
    );
    expect(metrics.body).toMatch(/orders_placed_total 1/);
    expect(metrics.body).toMatch(/order_sync_total\{outcome="synced"\} 1/);
    expect(metrics.body).toContain('microstore_process_cpu_user_seconds_total');
  });
});
