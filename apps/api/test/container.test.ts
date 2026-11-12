import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createContainer } from '../src/container';
import { loadEnv } from '../src/env';
import { RedisCache } from '../src/lib/cache';
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('createContainer (production wiring)', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    ROOT_DOMAIN: 'shops.test',
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    REDIS_URL,
    SESSION_SECRET: 's'.repeat(40),
    SSO_SHARED_SECRET: 'x'.repeat(40),
  });
  const container = createContainer(env, () => {});
  afterAll(() => container.close());

  it('builds a ready app', async () => {
    const app = await buildApp(container.deps);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.json()).toEqual({ status: 'ready', checks: { database: 'ok', redis: 'ok' } });
    await app.close();
  });

  it('requires Redis', () => {
    expect(() => createContainer({ ...env, REDIS_URL: undefined }, () => {})).toThrow(/REDIS_URL/);
    expect(() =>
      createContainer({ ...env, NODE_ENV: 'production', REDIS_URL: undefined }, () => {}),
    ).toThrow(/production/);
  });
});

describe('RedisCache', () => {
  const redis = new Redis(REDIS_URL);
  afterAll(() => redis.disconnect());

  it('stores JSON with TTL and supports set-if-absent', async () => {
    const cache = new RedisCache(redis, `ms:test:${Date.now()}:`);
    expect(await cache.get('k')).toBeNull();
    await cache.set('k', { a: 1 }, 30);
    expect(await cache.get('k')).toEqual({ a: 1 });
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
    expect(await cache.setIfAbsent('once', 30)).toBe(true);
    expect(await cache.setIfAbsent('once', 30)).toBe(false);
  });
});
