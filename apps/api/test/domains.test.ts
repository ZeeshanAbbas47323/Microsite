import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isApex, parseCustomHostname } from '../src/stores/domains';
import {
  createTestApp,
  login,
  publishedStore,
  ROOT_DOMAIN,
  resetDb,
  TARGET_IP,
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

const call = (
  method: 'GET' | 'POST' | 'DELETE',
  path = '',
  payload?: object,
  headers = owner.headers,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1/stores/${storeId}/domains${path}`,
    headers,
    ...(payload ? { payload } : {}),
  });

const storefront = (hostname: string) =>
  ctx.app.inject({
    method: 'GET',
    url: '/api/v1/public/store',
    headers: { 'x-store-host': hostname },
  });

describe('custom domains (Phase 4, FR-9.3)', () => {
  it('parses what merchants type and tells apex from subdomain', () => {
    expect(parseCustomHostname(' https://WWW.Brand.pk/shop ', ROOT_DOMAIN)).toEqual({
      ok: true,
      hostname: 'www.brand.pk',
    });
    expect(parseCustomHostname('brand', ROOT_DOMAIN).ok).toBe(false);
    expect(parseCustomHostname('-bad-.com', ROOT_DOMAIN).ok).toBe(false);
    expect(parseCustomHostname(`x.${ROOT_DOMAIN}`, ROOT_DOMAIN).ok).toBe(false);
    expect(isApex('brand.pk')).toBe(true);
    expect(isApex('brand.com.pk')).toBe(true);
    expect(isApex('www.brand.com.pk')).toBe(false);
    expect(isApex('shop.brand.com')).toBe(false);
  });

  it('adds, verifies by DNS, makes primary and removes a domain', async () => {
    const list = (await call('GET')).json();
    expect(list.subdomain).toMatchObject({ hostname: host, isPrimary: true });
    expect(list.domains).toEqual([]);
    expect(list.target).toEqual({ ips: [TARGET_IP], cname: `stores.${ROOT_DOMAIN}` });

    const added = await call('POST', '', { hostname: 'Brand.pk' });
    expect(added.statusCode).toBe(201);
    const domain = added.json().domain;
    expect(domain).toMatchObject({ hostname: 'brand.pk', apex: true, status: 'pending' });
    expect(domain.verification.name).toBe('_getorio-verify.brand.pk');

    // Not live until verified.
    expect((await storefront('brand.pk')).statusCode).toBe(404);
    // Primary needs a verified domain.
    expect((await call('POST', `/${domain.id}/primary`)).statusCode).toBe(409);

    // Only the ownership record so far.
    ctx.dns.records['_getorio-verify.brand.pk'] = { txt: [domain.verification.value] };
    let check = (await call('POST', `/${domain.id}/verify`)).json();
    expect(check.checks).toEqual([
      expect.objectContaining({ key: 'ownership', ok: true }),
      expect.objectContaining({ key: 'routing', ok: false }),
    ]);
    expect(check.domain).toMatchObject({
      verified: false,
      lastCheckError: 'Missing or wrong routing record',
    });

    // Pointing somewhere else is not enough.
    ctx.dns.records['brand.pk'] = { a: ['198.51.100.7'] };
    check = (await call('POST', `/${domain.id}/verify`)).json();
    expect(check.checks[1]).toMatchObject({ ok: false, found: ['A 198.51.100.7'] });

    ctx.dns.records['brand.pk'] = { a: [TARGET_IP] };
    check = (await call('POST', `/${domain.id}/verify`)).json();
    expect(check.domain).toMatchObject({ verified: true, status: 'active', lastCheckError: null });
    expect((await storefront('brand.pk')).statusCode).toBe(200);

    // On-demand TLS answers yes only for verified domains and our own subdomains.
    const ask = (d: string) =>
      ctx.app.inject({ method: 'GET', url: `/api/v1/public/tls/ask?domain=${d}` });
    expect((await ask('brand.pk')).statusCode).toBe(200);
    expect((await ask(host)).statusCode).toBe(200);
    expect((await ask('evil.example')).statusCode).toBe(404);

    // Primary: the store's URL moves to the custom domain; the subdomain stays connected.
    const primary = (await call('POST', `/${domain.id}/primary`)).json();
    expect(primary.domains[0].isPrimary).toBe(true);
    expect(primary.subdomain.isPrimary).toBe(false);
    const store = (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/stores/${storeId}`,
        headers: owner.headers,
      })
    ).json().store;
    expect(store).toMatchObject({ hostname: 'brand.pk', url: 'https://brand.pk' });
    expect(store.subdomain).toBe(host.split('.')[0]);

    // Changing the subdomain keeps the custom domain primary.
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stores/${storeId}/settings`,
      headers: owner.headers,
      payload: { subdomain: 'renamedshop' },
    });
    const after = (await call('GET')).json();
    expect(after.subdomain).toMatchObject({
      hostname: `renamedshop.${ROOT_DOMAIN}`,
      isPrimary: false,
    });
    expect(after.domains[0].isPrimary).toBe(true);

    // Removing the primary domain falls back to the subdomain.
    const removed = (await call('DELETE', `/${domain.id}`)).json();
    expect(removed.domains).toEqual([]);
    expect(removed.subdomain.isPrimary).toBe(true);
    expect((await storefront('brand.pk')).statusCode).toBe(404);
  });

  it('accepts a CNAME for subdomains like www', async () => {
    const domain = (await call('POST', '', { hostname: 'www.brand.pk' })).json().domain;
    expect(domain.apex).toBe(false);
    ctx.dns.records['_getorio-verify.www.brand.pk'] = { txt: [domain.verification.value] };
    ctx.dns.records['www.brand.pk'] = { cname: [`stores.${ROOT_DOMAIN}.`] };
    const check = (await call('POST', `/${domain.id}/verify`)).json();
    expect(check.domain.verified).toBe(true);
  });

  it('rejects duplicates, other tenants and more than three domains', async () => {
    await call('POST', '', { hostname: 'one.pk' });
    expect((await call('POST', '', { hostname: 'one.pk' })).statusCode).toBe(409);
    await call('POST', '', { hostname: 'two.pk' });
    await call('POST', '', { hostname: 'three.pk' });
    expect((await call('POST', '', { hostname: 'four.pk' })).statusCode).toBe(409);
    expect((await call('POST', '', { hostname: 'not a domain' })).statusCode).toBe(400);

    const other = await login(ctx.app, { getorioTenantId: 'tenant-other' });
    expect((await call('GET', '', undefined, other.headers)).statusCode).toBe(404);
    const id = (await call('GET')).json().domains[0].id;
    expect((await call('DELETE', `/${id}`, undefined, other.headers)).statusCode).toBe(404);
  });
});
