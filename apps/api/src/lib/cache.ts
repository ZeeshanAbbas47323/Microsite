import type { Redis } from 'ioredis';

/** Small JSON cache used for the catalog and webhook de-duplication. */
export interface KeyValueCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Sets the key only if absent. Returns true when this call set it. */
  setIfAbsent(key: string, ttlSeconds: number): Promise<boolean>;
}

export class MemoryCache implements KeyValueCache {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async get<T>(key: string) {
    const entry = this.live(key);
    return entry ? (JSON.parse(entry.value) as T) : null;
  }
  async set(key: string, value: unknown, ttlSeconds: number) {
    this.entries.set(key, {
      value: JSON.stringify(value),
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }
  async del(key: string) {
    this.entries.delete(key);
  }
  async setIfAbsent(key: string, ttlSeconds: number) {
    if (this.live(key)) return false;
    await this.set(key, 1, ttlSeconds);
    return true;
  }
}

export class RedisCache implements KeyValueCache {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'ms:cache:',
  ) {}

  async get<T>(key: string) {
    const raw = await this.redis.get(this.prefix + key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  async set(key: string, value: unknown, ttlSeconds: number) {
    await this.redis.set(
      this.prefix + key,
      JSON.stringify(value),
      'EX',
      Math.max(1, Math.ceil(ttlSeconds)),
    );
  }
  async del(key: string) {
    await this.redis.del(this.prefix + key);
  }
  async setIfAbsent(key: string, ttlSeconds: number) {
    return (await this.redis.set(this.prefix + key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  }
}
