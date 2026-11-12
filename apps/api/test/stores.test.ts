import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_DRAFT_REVISIONS } from '../src/stores/store-service';
import {
  createStore,
  createTestApp,
  login,
  onboarding,
  resetDb,
  ROOT_DOMAIN,
  testDb,
  type Login,
} from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let auth: Login;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  auth = await login(ctx.app);
});

afterAll(async () => {
  await ctx?.app.close();
});

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: unknown,
  as: Login = auth,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: as.headers,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });

describe('layouts and subdomains', () => {
  it('lists layouts without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/layouts' });
    expect(res.json().layouts.map((l: { id: string }) => l.id)).toEqual(['bold-01', 'classic-01']);
  });

  it('checks subdomain availability', async () => {
    expect((await req('GET', '/subdomains/check?name=Zara')).json()).toEqual({
      available: true,
      subdomain: 'zara',
    });
    expect((await req('GET', '/subdomains/check?name=admin')).json()).toMatchObject({
      available: false,
      reason: 'reserved',
    });
    await createStore(ctx.app, auth);
    expect((await req('GET', '/subdomains/check?name=zara')).json()).toMatchObject({
      available: false,
      reason: 'taken',
    });
  });

  it('requires auth for subdomain checks', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/subdomains/check?name=zara' });
    expect(res.statusCode).toBe(401);
  });
});

describe('store creation (FR-1)', () => {
  it('returns null before a store exists', async () => {
    expect((await req('GET', '/stores/me')).json()).toEqual({ store: null });
  });

  it('creates a draft store with its subdomain and first revision', async () => {
    const res = await req('POST', '/stores', onboarding());
    expect(res.statusCode).toBe(201);
    const { store } = res.json();
    expect(store).toMatchObject({
      name: 'Zara Crafts',
      status: 'draft',
      subdomain: 'zara',
      hostname: `zara.${ROOT_DOMAIN}`,
      url: `https://zara.${ROOT_DOMAIN}`,
      layoutId: 'bold-01',
      hasUnpublishedChanges: true,
      publishedAt: null,
      settings: { shippingFlatFee: '0.00', freeShippingThreshold: null },
    });
    expect((await req('GET', '/stores/me')).json().store.id).toBe(store.id);

    const draft = (await req('GET', `/stores/${store.id}/config/draft`)).json();
    expect(draft.config.business.contact.phone).toBe('+923001234567');
    expect(draft.config.theme.primaryColor).toBe('#7c3aed');
    expect(draft.config.navbar.style).toBe('split'); // from the Bold layout

    const versions = (await req('GET', `/stores/${store.id}/versions`)).json().versions;
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ kind: 'draft_revision', source: 'generate' });
    expect(await testDb().auditLog.count({ where: { action: 'store.created' } })).toBe(1);
  });

  it('validates the onboarding form', async () => {
    const res = await req(
      'POST',
      '/stores',
      onboarding({ subdomain: '-bad-', layoutId: 'bold-01' }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    expect(res.json().error.details.some((d: { path: string }) => d.path === 'subdomain')).toBe(
      true,
    );
  });

  it('rejects unknown layouts', async () => {
    const res = await req('POST', '/stores', onboarding({ layoutId: 'nope-01' }));
    expect(res.statusCode).toBe(400);
  });

  it('allows one store per tenant', async () => {
    await createStore(ctx.app, auth);
    const res = await req('POST', '/stores', onboarding({ subdomain: 'zara-two' }));
    expect(res.statusCode).toBe(409);
  });

  it('rejects a subdomain taken by another tenant', async () => {
    await createStore(ctx.app, auth);
    const other = await login(ctx.app, { getorioTenantId: 'tenant-b', getorioUserId: 'user-b' });
    const res = await req('POST', '/stores', onboarding(), other);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details).toEqual({ field: 'subdomain' });
  });

  it('requires CSRF to create', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      headers: { cookie: auth.headers.cookie as string },
      payload: onboarding(),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('draft config', () => {
  it('replaces the draft with a validated config', async () => {
    const { id } = await createStore(ctx.app, auth);
    const { config } = (await req('GET', `/stores/${id}/config/draft`)).json();
    config.theme.primaryColor = '#000000';
    const res = await req('PUT', `/stores/${id}/config/draft`, { config });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.theme.primaryColor).toBe('#000000');
  });

  it('rejects invalid configs and unknown layouts', async () => {
    const { id } = await createStore(ctx.app, auth);
    const { config } = (await req('GET', `/stores/${id}/config/draft`)).json();

    const html = structuredClone(config);
    html.business.name = '<script>alert(1)</script>';
    expect((await req('PUT', `/stores/${id}/config/draft`, { config: html })).statusCode).toBe(400);

    const extra = { ...config, customCss: 'body{}' };
    expect((await req('PUT', `/stores/${id}/config/draft`, { config: extra })).statusCode).toBe(
      400,
    );

    const layout = { ...config, layoutId: 'ghost-01' };
    const res = await req('PUT', `/stores/${id}/config/draft`, { config: layout });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Unknown layout/);

    expect((await req('PUT', `/stores/${id}/config/draft`, {})).statusCode).toBe(400);
  });

  it('applies a JSON Patch', async () => {
    const { id } = await createStore(ctx.app, auth);
    const res = await req('PATCH', `/stores/${id}/config/draft`, {
      patch: [
        { op: 'replace', path: '/navbar/backgroundColor', value: '#0b1f4d' },
        { op: 'replace', path: '/layoutId', value: 'classic-01' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.navbar.backgroundColor).toBe('#0b1f4d');
    expect(res.json().config.layoutId).toBe('classic-01');
  });

  it('rejects patches that break the schema', async () => {
    const { id } = await createStore(ctx.app, auth);
    const bad = await req('PATCH', `/stores/${id}/config/draft`, {
      patch: [{ op: 'remove', path: '/pages/1' }],
    });
    expect(bad.statusCode).toBe(400);
    const missing = await req('PATCH', `/stores/${id}/config/draft`, {
      patch: [{ op: 'remove', path: '/nope' }],
    });
    expect(missing.statusCode).toBe(400);
  });

  it('keeps only the last 50 draft revisions', async () => {
    const { id } = await createStore(ctx.app, auth);
    for (let i = 0; i < MAX_DRAFT_REVISIONS + 3; i++) {
      await req('PATCH', `/stores/${id}/config/draft`, {
        patch: [{ op: 'replace', path: '/footer/text', value: `Footer ${i}` }],
      });
    }
    const count = await testDb().siteVersion.count({
      where: { storeId: id, kind: 'draft_revision' },
    });
    expect(count).toBe(MAX_DRAFT_REVISIONS);
  });

  it('returns 404 for malformed or unknown ids', async () => {
    expect((await req('GET', '/stores/not-a-uuid/config/draft')).statusCode).toBe(400);
    expect(
      (await req('GET', '/stores/0195f7a2-0000-7000-8000-000000000000/config/draft')).statusCode,
    ).toBe(404);
  });
});

describe('publish flow (FR-6.7)', () => {
  it('publishes, creates a version and revalidates', async () => {
    const { id } = await createStore(ctx.app, auth);
    const res = await req('POST', `/stores/${id}/publish`);
    expect(res.statusCode).toBe(200);
    expect(res.json().store).toMatchObject({ status: 'published', hasUnpublishedChanges: false });
    expect(res.json().store.publishedAt).not.toBeNull();

    const row = await testDb().store.findUniqueOrThrow({ where: { id } });
    expect(row.publishedConfig).toEqual(row.draftConfig);
    const published = await testDb().siteVersion.findFirst({
      where: { storeId: id, kind: 'published' },
    });
    expect(published?.id).toBe(row.publishedVersionId);
    expect(ctx.revalidated).toEqual([{ storeId: id, hostnames: [`zara.${ROOT_DOMAIN}`] }]);
  });

  it('tracks unpublished changes after publishing', async () => {
    const { id } = await createStore(ctx.app, auth);
    await req('POST', `/stores/${id}/publish`);
    await req('PATCH', `/stores/${id}/config/draft`, {
      patch: [{ op: 'replace', path: '/footer/text', value: 'Changed' }],
    });
    expect((await req('GET', `/stores/${id}`)).json().store.hasUnpublishedChanges).toBe(true);
    // The published config is untouched by draft edits
    const row = await testDb().store.findUniqueOrThrow({ where: { id } });
    expect((row.publishedConfig as { footer: { text: string } }).footer.text).not.toBe('Changed');
  });

  it('unpublishes but keeps the published config', async () => {
    const { id } = await createStore(ctx.app, auth);
    await req('POST', `/stores/${id}/publish`);
    const res = await req('POST', `/stores/${id}/unpublish`);
    expect(res.json().store.status).toBe('draft');
    const row = await testDb().store.findUniqueOrThrow({ where: { id } });
    expect(row.publishedConfig).not.toBeNull();
    expect(ctx.revalidated).toHaveLength(2);
  });

  it('blocks publishing a suspended store', async () => {
    const { id } = await createStore(ctx.app, auth);
    await testDb().store.update({ where: { id }, data: { status: 'suspended' } });
    const res = await req('POST', `/stores/${id}/publish`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('store_suspended');
    expect((await req('POST', `/stores/${id}/unpublish`)).statusCode).toBe(403);
  });
});

describe('versions (FR-8)', () => {
  it('restores an earlier version into the draft', async () => {
    const { id } = await createStore(ctx.app, auth);
    const [first] = (await req('GET', `/stores/${id}/versions`)).json().versions;
    await req('PATCH', `/stores/${id}/config/draft`, {
      patch: [{ op: 'replace', path: '/footer/text', value: 'Changed' }],
    });
    const res = await req('POST', `/stores/${id}/versions/${first.id}/restore`);
    expect(res.statusCode).toBe(200);
    expect(res.json().config.footer.text).toMatch(/Zara Crafts/);
    const versions = (await req('GET', `/stores/${id}/versions`)).json().versions;
    expect(versions[0].source).toBe('restore');
  });

  it('404s for unknown versions', async () => {
    const { id } = await createStore(ctx.app, auth);
    const res = await req(
      'POST',
      `/stores/${id}/versions/0195f7a2-0000-7000-8000-000000000000/restore`,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('settings (FR-6.6)', () => {
  it('updates shipping and toggles', async () => {
    const { id } = await createStore(ctx.app, auth);
    const res = await req('PATCH', `/stores/${id}/settings`, {
      shippingFlatFee: '250.00',
      freeShippingThreshold: '5000',
      notifications: { customerMessage: true },
      whatsappButton: false,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().store.settings).toEqual({
      shippingFlatFee: '250.00',
      freeShippingThreshold: '5000',
      notifications: { customerEmail: true, customerMessage: true },
      whatsappButton: false,
      rtl: false,
    });
  });

  it('validates settings', async () => {
    const { id } = await createStore(ctx.app, auth);
    expect(
      (await req('PATCH', `/stores/${id}/settings`, { shippingFlatFee: '-5' })).statusCode,
    ).toBe(400);
    expect((await req('PATCH', `/stores/${id}/settings`, { unknown: true })).statusCode).toBe(400);
    expect((await req('PATCH', `/stores/${id}/settings`, { subdomain: 'www' })).statusCode).toBe(
      400,
    );
  });

  it('changes the subdomain and keeps the old one redirecting for 30 days', async () => {
    const { id } = await createStore(ctx.app, auth);
    const res = await req('PATCH', `/stores/${id}/settings`, { subdomain: 'zara-shop' });
    expect(res.statusCode).toBe(200);
    expect(res.json().store.hostname).toBe(`zara-shop.${ROOT_DOMAIN}`);

    const domains = await testDb().domain.findMany({
      where: { storeId: id },
      orderBy: { createdAt: 'asc' },
    });
    const [old, current] = domains;
    expect(current).toMatchObject({ hostname: `zara-shop.${ROOT_DOMAIN}`, isPrimary: true });
    expect(old).toMatchObject({
      hostname: `zara.${ROOT_DOMAIN}`,
      isPrimary: false,
      redirectToDomainId: current?.id,
    });
    const days = ((old?.redirectExpiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(ctx.revalidated.at(-1)?.hostnames).toEqual([`zara.${ROOT_DOMAIN}`]);

    // Switching back re-uses the old domain row
    await req('PATCH', `/stores/${id}/settings`, { subdomain: 'zara' });
    const after = await testDb().domain.findMany({ where: { storeId: id } });
    expect(after).toHaveLength(2);
    expect(after.find((d) => d.isPrimary)?.hostname).toBe(`zara.${ROOT_DOMAIN}`);
    // Same subdomain again is a no-op
    expect((await req('PATCH', `/stores/${id}/settings`, { subdomain: 'zara' })).statusCode).toBe(
      200,
    );
  });

  it('rejects a subdomain owned by another store', async () => {
    await createStore(ctx.app, auth);
    const other = await login(ctx.app, { getorioTenantId: 'tenant-b', getorioUserId: 'user-b' });
    const theirs = await createStore(ctx.app, other, { subdomain: 'bazaar' });
    const res = await req('PATCH', `/stores/${theirs.id}/settings`, { subdomain: 'zara' }, other);
    expect(res.statusCode).toBe(409);
  });
});
