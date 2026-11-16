import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, login, publishedStore, resetDb, testDb, type Login } from './helpers';

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

const del = (confirmName: string, as: Login = owner, id = storeId) =>
  ctx.app.inject({
    method: 'DELETE',
    url: `/api/v1/stores/${id}`,
    headers: as.headers,
    payload: { confirmName },
  });

async function addOrderAndImage() {
  await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/public/checkout',
    headers: { 'x-store-host': host, 'idempotency-key': 'delete-test-key-0123456' },
    payload: {
      customer: { name: 'Private Person', phone: '03001234567', email: 'private@example.com' },
      shipping: { address: 'Secret Street 1', city: 'Lahore' },
      items: [{ productId: 'p-1003', qty: 1 }],
    },
  });
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
    .png()
    .toBuffer();
  const boundary = '----b';
  await ctx.app.inject({
    method: 'POST',
    url: `/api/v1/stores/${storeId}/assets`,
    headers: { ...owner.headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
}

describe('store deletion (§9.1)', () => {
  it('removes the store, customer data, images and domains', async () => {
    await addOrderAndImage();
    expect(await testDb().order.count()).toBe(1);
    expect(ctx.storage.objects.size).toBe(1);

    const res = await del('Zara Crafts');
    expect(res.statusCode).toBe(204);

    const db = testDb();
    expect(await db.store.count({ where: { id: storeId } })).toBe(0);
    expect(await db.order.count()).toBe(0);
    expect(await db.orderItem.count()).toBe(0);
    expect(await db.siteVersion.count({ where: { storeId } })).toBe(0);
    expect(await db.domain.count({ where: { storeId } })).toBe(0);
    expect(await db.asset.count({ where: { storeId } })).toBe(0);
    expect(ctx.storage.objects.size).toBe(0);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'store.deleted' } });
    expect(JSON.stringify(audit)).not.toContain('Private Person');
    expect(JSON.stringify(audit)).not.toContain('03001234567');
    expect(ctx.revalidated.at(-1)?.hostnames).toEqual([host]);

    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/api/v1/public/store',
          headers: { 'x-store-host': host },
        })
      ).statusCode,
    ).toBe(404);
    // The merchant can start over
    expect(
      (
        await ctx.app.inject({ method: 'GET', url: '/api/v1/stores/me', headers: owner.headers })
      ).json(),
    ).toEqual({ store: null });
  });

  it('requires the exact store name', async () => {
    expect((await del('zara crafts')).statusCode).toBe(400);
    expect(
      (
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/v1/stores/${storeId}`,
          headers: owner.headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(await testDb().store.count({ where: { id: storeId } })).toBe(1);
  });

  it('is owner-only and tenant-scoped', async () => {
    const staff = await login(ctx.app, {
      getorioTenantId: 'tenant-demo',
      getorioUserId: 'staff-1',
      role: 'staff',
    });
    expect((await del('Zara Crafts', staff)).statusCode).toBe(403);
    const other = await login(ctx.app, { getorioTenantId: 'tenant-b', getorioUserId: 'b' });
    expect((await del('Zara Crafts', other)).statusCode).toBe(404);
    expect(await testDb().store.count({ where: { id: storeId } })).toBe(1);
  });
});
