import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';
import { randomToken } from '../lib/ids';
import type { Role } from './sso';

export interface Session {
  id: string;
  merchantId: string;
  getorioUserId: string;
  getorioTenantId: string;
  role: Role;
  csrfToken: string;
  createdAt: number;
  rotatedAt: number;
  expiresAt: number;
}

/** Session persistence. Ids are stored hashed so a store dump does not leak live sessions. */
export interface SessionStore {
  get(id: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  /** Returns true the first time a key is seen within `ttlSeconds` (one-time SSO tokens). */
  consumeOnce(key: string, ttlSeconds: number): Promise<boolean>;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly seen = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}

  async get(id: string) {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }
  async set(session: Session) {
    this.sessions.set(session.id, { ...session });
  }
  async delete(id: string) {
    this.sessions.delete(id);
  }
  async consumeOnce(key: string, ttlSeconds: number) {
    const until = this.seen.get(key);
    if (until !== undefined && until > this.now()) return false;
    this.seen.set(key, this.now() + ttlSeconds * 1000);
    return true;
  }
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly secret: string,
  ) {}

  private key(id: string) {
    return `ms:sess:${createHmac('sha256', this.secret).update(id).digest('hex')}`;
  }

  async get(id: string) {
    const raw = await this.redis.get(this.key(id));
    return raw ? ({ ...(JSON.parse(raw) as Session), id } satisfies Session) : null;
  }
  async set(session: Session) {
    const ttl = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));
    const { id, ...rest } = session;
    await this.redis.set(this.key(id), JSON.stringify(rest), 'EX', ttl);
  }
  async delete(id: string) {
    await this.redis.del(this.key(id));
  }
  async consumeOnce(key: string, ttlSeconds: number) {
    const res = await this.redis.set(`ms:once:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_ROTATE_MS = 15 * 60 * 1000;

export interface SessionInput {
  merchantId: string;
  getorioUserId: string;
  getorioTenantId: string;
  role: Role;
}

/** 8 h absolute lifetime; the session id rotates every 15 minutes of use (requirements §5). */
export class SessionManager {
  constructor(
    private readonly store: SessionStore,
    private readonly now: () => number = Date.now,
  ) {}

  async create(input: SessionInput): Promise<Session> {
    const at = this.now();
    const session: Session = {
      ...input,
      id: randomToken(),
      csrfToken: randomToken(),
      createdAt: at,
      rotatedAt: at,
      expiresAt: at + SESSION_TTL_MS,
    };
    await this.store.set(session);
    return session;
  }

  /** Loads a session; returns a new id when it was rotated so the caller can reset the cookie. */
  async load(id: string): Promise<{ session: Session; rotated: boolean } | null> {
    const session = await this.store.get(id);
    if (!session) return null;
    const at = this.now();
    if (session.expiresAt <= at) {
      await this.store.delete(id);
      return null;
    }
    if (at - session.rotatedAt < SESSION_ROTATE_MS) return { session, rotated: false };

    const next: Session = { ...session, id: randomToken(), rotatedAt: at };
    await this.store.set(next);
    await this.store.delete(id);
    return { session: next, rotated: true };
  }

  destroy(id: string) {
    return this.store.delete(id);
  }

  consumeOnce(key: string, ttlSeconds: number) {
    return this.store.consumeOnce(key, ttlSeconds);
  }
}
