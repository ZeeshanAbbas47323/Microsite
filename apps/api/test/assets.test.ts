import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createStore, createTestApp, login, resetDb, testDb, type Login } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let auth: Login;
let storeId: string;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  auth = await login(ctx.app);
  storeId = (await createStore(ctx.app, auth)).id;
});
afterAll(async () => ctx?.app.close());

function multipart(file: Buffer, filename = 'photo.jpg', contentType = 'image/jpeg') {
  const boundary = '----msTestBoundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(file: Buffer, purpose = 'image', as: Login = auth, id = storeId) {
  const { body, contentType } = multipart(file);
  return ctx.app.inject({
    method: 'POST',
    url: `/api/v1/stores/${id}/assets?purpose=${purpose}`,
    headers: { ...as.headers, 'content-type': contentType },
    payload: body,
  });
}

const jpegWithGps = () =>
  sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#cc3366' } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: 'secret-owner' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '31/1 33/1 0/1' },
    })
    .toBuffer();

describe('image uploads (FR-6.8)', () => {
  it('re-encodes to WebP, strips EXIF, downsizes and tracks storage', async () => {
    const original = await jpegWithGps();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const res = await upload(original);
    expect(res.statusCode).toBe(201);
    const { asset } = res.json();
    expect(asset).toMatchObject({ mime: 'image/webp', width: 1600, height: 800 });
    expect(asset.url).toMatch(/^\/media\/stores\/.+\.webp$/);

    const stored = [...ctx.storage.objects.values()][0];
    const meta = await sharp(Buffer.from(stored?.body ?? [])).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    const row = await testDb().store.findUniqueOrThrow({ where: { id: storeId } });
    expect(Number(row.storageUsedBytes)).toBe(asset.sizeBytes);

    // Served publicly through the media endpoint
    const media = await ctx.app.inject({ method: 'GET', url: `/api/v1/public${asset.url}` });
    expect(media.statusCode).toBe(200);
    expect(media.headers['content-type']).toBe('image/webp');
    expect(media.headers['cache-control']).toContain('immutable');
  });

  it('lists and deletes images, freeing storage', async () => {
    const { asset } = (await upload(await jpegWithGps())).json();
    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/assets`,
      headers: auth.headers,
    });
    expect(list.json()).toMatchObject({ items: [{ id: asset.id }], quotaBytes: 200 * 1024 * 1024 });
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/stores/${storeId}/assets/${asset.id}`,
      headers: auth.headers,
    });
    expect(del.statusCode).toBe(204);
    expect(ctx.storage.objects.size).toBe(0);
    expect(
      Number((await testDb().store.findUniqueOrThrow({ where: { id: storeId } })).storageUsedBytes),
    ).toBe(0);
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/v1/public${asset.url}` })).statusCode,
    ).toBe(404);
  });

  it('rejects files that are not images, whatever their name says', async () => {
    const res = await upload(Buffer.from('<?php echo "hi"; ?>'));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Only JPG, PNG/);
    expect(ctx.storage.objects.size).toBe(0);
  });

  it('rasterizes SVG logos and refuses SVG elsewhere', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><script>alert(1)</script><rect width="200" height="80" fill="#4f46e5"/></svg>',
    );
    expect((await upload(svg, 'image')).statusCode).toBe(400);
    const res = await upload(svg, 'logo');
    expect(res.statusCode).toBe(201);
    const stored = [...ctx.storage.objects.values()][0];
    expect((await sharp(Buffer.from(stored?.body ?? [])).metadata()).format).toBe('webp');
  });

  it('enforces size limits', async () => {
    const big = await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    expect((await upload(big)).statusCode).toBe(400);
    const logo = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(logo.length).toBeGreaterThan(2 * 1024 * 1024);
    expect((await upload(logo, 'logo')).statusCode).toBe(400);
  });

  it('enforces the per-store quota', async () => {
    ctx = await createTestApp({ storageQuota: 100 });
    auth = await login(ctx.app, { getorioTenantId: 'tenant-q', getorioUserId: 'q' });
    const id = (await createStore(ctx.app, auth, { subdomain: 'quota' })).id;
    const res = await upload(await jpegWithGps(), 'image', auth, id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/Storage limit/);
  });

  it('isolates tenants and needs auth + CSRF', async () => {
    const other = await login(ctx.app, { getorioTenantId: 'tenant-b', getorioUserId: 'b' });
    expect((await upload(await jpegWithGps(), 'image', other)).statusCode).toBe(404);
    const { body, contentType } = multipart(await jpegWithGps());
    const noCsrf = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/assets`,
      headers: { cookie: auth.headers.cookie as string, 'content-type': contentType },
      payload: body,
    });
    expect(noCsrf.statusCode).toBe(403);
    const json = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/assets`,
      headers: auth.headers,
      payload: {},
    });
    expect(json.statusCode).toBe(400);
  });

  it('serves only known media keys', async () => {
    for (const url of [
      '/api/v1/public/media/stores/../../etc/passwd',
      '/api/v1/public/media/stores/x/y.webp',
      '/api/v1/public/media/random',
    ]) {
      expect((await ctx.app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });
});
