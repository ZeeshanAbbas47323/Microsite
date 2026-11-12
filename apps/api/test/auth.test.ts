import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, SESSION_COOKIE } from '../src/auth/plugin';
import { SESSION_ROTATE_MS, SESSION_TTL_MS } from '../src/auth/sessions';
import { createTestApp, login, resetDb, ssoToken, testDb } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx?.app.close();
});

const sso = async (token: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/auth/sso', payload: { token } });

describe('POST /auth/sso', () => {
  it('verifies the token, maps the merchant and starts a session', async () => {
    const res = await sso(await ssoToken({ getorioUserId: 'u-9', getorioTenantId: 't-9' }));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.merchant).toMatchObject({ tenantId: 't-9', role: 'owner' });
    expect(body.csrfToken).toEqual(expect.any(String));

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.maxAge).toBeGreaterThan(SESSION_TTL_MS / 1000 - 5);

    const merchant = await testDb().merchant.findFirst({ where: { getorioUserId: 'u-9' } });
    expect(merchant?.getorioTenantId).toBe('t-9');
  });

  it('updates the existing merchant on later sign-ins', async () => {
    await sso(await ssoToken({ role: 'owner' }));
    await sso(await ssoToken({ role: 'staff' }));
    const merchants = await testDb().merchant.findMany();
    expect(merchants).toHaveLength(1);
    expect(merchants[0]?.role).toBe('staff');
  });

  it.each([
    ['wrong secret', { secret: 'another-secret-0123456789abcdef0123456789' }],
    ['expired', { expiresInSeconds: -60 }],
    ['lifetime over 60 s', { expiresInSeconds: 600 }],
  ])('rejects a token with %s', async (_name, claims) => {
    const res = await sso(await ssoToken(claims));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
    expect(res.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
  });

  it('rejects malformed tokens and bodies', async () => {
    expect((await sso('not-a-jwt-at-all')).statusCode).toBe(401);
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/sso', payload: {} });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation_error');
  });

  it('rejects tokens with invalid claims', async () => {
    const res = await sso(await ssoToken({ role: 'superuser' as never }));
    expect(res.statusCode).toBe(401);
  });

  it('accepts a token with a jti only once', async () => {
    const token = await ssoToken({ jti: 'once-123' });
    expect((await sso(token)).statusCode).toBe(200);
    const replay = await sso(token);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.message).toMatch(/already used/);
  });
});

describe('sessions', () => {
  it('returns the session and requires a cookie', async () => {
    const auth = await login(ctx.app);
    const ok = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: auth.headers,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().csrfToken).toBe(auth.csrf);

    const anon = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/session' });
    expect(anon.statusCode).toBe(401);
  });

  it('clears unknown session cookies', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: `${SESSION_COOKIE}=forged` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
  });

  it('logs out', async () => {
    const auth = await login(ctx.app);
    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: auth.headers,
    });
    expect(out.statusCode).toBe(204);
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: auth.headers,
    });
    expect(after.statusCode).toBe(401);
  });

  it('requires a matching CSRF token on mutating requests', async () => {
    const auth = await login(ctx.app);
    const cookieOnly = { cookie: auth.headers.cookie as string };
    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: cookieOnly,
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe('csrf_failed');
    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...cookieOnly, [CSRF_HEADER]: 'nope' },
    });
    expect(wrong.statusCode).toBe(403);
    // GET is safe and needs no token
    const get = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: cookieOnly,
    });
    expect(get.statusCode).toBe(200);
  });

  it('rotates the session id and expires after 8 hours', async () => {
    let now = Date.now();
    const timed = await createTestApp({ now: () => now });
    const auth = await login(timed.app);

    now += SESSION_ROTATE_MS + 1000;
    const rotated = await timed.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: auth.headers,
    });
    expect(rotated.statusCode).toBe(200);
    const newCookie = rotated.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(auth.cookie);

    // The old id no longer works
    const old = await timed.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: auth.headers,
    });
    expect(old.statusCode).toBe(401);

    now += SESSION_TTL_MS;
    const expired = await timed.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: `${SESSION_COOKIE}=${newCookie}` },
    });
    expect(expired.statusCode).toBe(401);
    await timed.app.close();
  });

  it('replaces an existing session on a new sign-in', async () => {
    const first = await login(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/sso',
      headers: { cookie: first.headers.cookie as string },
      payload: { token: await ssoToken() },
    });
    expect(res.statusCode).toBe(200);
    const old = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: first.headers,
    });
    expect(old.statusCode).toBe(401);
  });
});

describe('platform', () => {
  it('serves health and readiness', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).json()).toEqual({
      status: 'ok',
    });
    const ready = await ctx.app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().checks.database).toBe('ok');
  });

  it('accepts an empty JSON body and rejects prototype poisoning', async () => {
    const auth = await login(ctx.app);
    const empty = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { ...auth.headers, 'content-type': 'application/json' },
    });
    expect(empty.statusCode).toBe(204);
    const poisoned = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/sso',
      headers: { 'content-type': 'application/json' },
      payload: '{"token":"x","__proto__":{"admin":true}}',
    });
    expect(poisoned.statusCode).toBe(400);
  });

  it('returns JSON 404s and security headers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('only allows configured CORS origins', async () => {
    const allowed = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/session',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/session',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits SSO attempts', async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await sso('x'.repeat(20))).statusCode;
    expect(last).toBe(429);
  });
});
