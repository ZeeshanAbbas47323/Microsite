import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { RedisSessionStore, SessionManager } from '../src/auth/sessions';
import { JwtSsoProvider } from '../src/auth/sso';
import { loadEnv } from '../src/env';

const base = {
  ROOT_DOMAIN: 'getorio.com',
  DATABASE_URL: 'mysql://u:p@localhost:3306/db',
  SESSION_SECRET: 's'.repeat(32),
  SSO_SHARED_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      PORT: 4000,
      NODE_ENV: 'development',
      STOREFRONT_URL_TEMPLATE: 'https://{host}',
    });
    expect(loadEnv({ ...base, CORS_ORIGINS: 'https://a.com, https://b.com' }).CORS_ORIGINS).toEqual(
      ['https://a.com', 'https://b.com'],
    );
  });

  it('treats empty values as unset', () => {
    expect(loadEnv({ ...base, GETORIO_ORDER_URL_TEMPLATE: '', PORT: ' ' }).PORT).toBe(4000);
  });

  it.each([
    ['short session secret', { SESSION_SECRET: 'short' }],
    ['no SSO key', { SSO_SHARED_SECRET: undefined }],
    ['short SSO secret', { SSO_SHARED_SECRET: 'short' }],
    ['production without RS256', { NODE_ENV: 'production' }],
    ['bad storefront template', { STOREFRONT_URL_TEMPLATE: 'https://shop' }],
  ])('rejects %s', (_name, override) => {
    expect(() => loadEnv({ ...base, ...override })).toThrow(/Invalid environment/);
  });
});

describe('JwtSsoProvider (RS256)', () => {
  it('verifies tokens signed with the Getorio private key', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const provider = new JwtSsoProvider({
      publicKeyPem: await exportSPKI(publicKey),
      issuer: 'getorio',
      audience: 'microstore',
    });
    const now = Math.floor(Date.now() / 1000);
    const sign = (iss: string) =>
      new SignJWT({ getorioUserId: 'u', getorioTenantId: 't', role: 'owner' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(iss)
        .setAudience('microstore')
        .setExpirationTime(now + 30)
        .sign(privateKey);
    await expect(provider.verify(await sign('getorio'))).resolves.toMatchObject({
      getorioTenantId: 't',
    });
    await expect(provider.verify(await sign('someone-else'))).rejects.toThrow();
  });

  it('refuses HS256 tokens when configured for RS256 (algorithm confusion)', async () => {
    const { publicKey } = await generateKeyPair('RS256');
    const pem = await exportSPKI(publicKey);
    const provider = new JwtSsoProvider({ publicKeyPem: pem });
    const forged = await new SignJWT({
      getorioUserId: 'u',
      getorioTenantId: 't',
      role: 'platform_admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 30)
      .sign(new TextEncoder().encode(pem));
    await expect(provider.verify(forged)).rejects.toThrow();
  });

  it('needs a key', () => {
    expect(() => new JwtSsoProvider({})).toThrow();
  });
});

describe('RedisSessionStore', () => {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });
  afterAll(() => redis.disconnect());

  it('stores sessions under hashed keys and consumes one-time keys', async () => {
    try {
      await redis.connect();
    } catch {
      console.warn('Redis not reachable; skipping RedisSessionStore test');
      return;
    }
    const store = new RedisSessionStore(redis, 'k'.repeat(32));
    const sessions = new SessionManager(store);
    const s = await sessions.create({
      merchantId: 'm',
      getorioUserId: 'u',
      getorioTenantId: 't',
      role: 'owner',
    });
    expect(await redis.exists(`ms:sess:${s.id}`)).toBe(0);
    expect((await sessions.load(s.id))?.session.merchantId).toBe('m');
    await sessions.destroy(s.id);
    expect(await sessions.load(s.id)).toBeNull();

    const key = `test-${Date.now()}`;
    expect(await store.consumeOnce(key, 5)).toBe(true);
    expect(await store.consumeOnce(key, 5)).toBe(false);
  });
});
