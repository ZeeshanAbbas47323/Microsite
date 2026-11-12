import type { Db } from '../db';

/** Lowercases and strips the port / trailing dot. Returns null for anything that is not a hostname. */
export function normalizeHost(raw: string | undefined): string | null {
  if (!raw) return null;
  const host = raw.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return /^[a-z0-9.-]{1,253}$/.test(host) && !host.includes('..') ? host : null;
}

/**
 * Tenant resolution (FR-9.2): only the `domains` table decides which store a host belongs to.
 * Expired redirect domains and unverified custom domains resolve to nothing.
 */
export async function resolveStoreByHost(db: Db, rawHost: string | undefined, now = new Date()) {
  const hostname = normalizeHost(rawHost);
  if (!hostname) return null;
  const domain = await db.domain.findUnique({
    where: { hostname },
    include: { store: { include: { domains: true } } },
  });
  if (!domain) return null;
  if (domain.redirectExpiresAt && domain.redirectExpiresAt <= now) return null;
  if (domain.type === 'custom' && !domain.verified) return null;
  const primary = domain.store.domains.find((d) => d.isPrimary) ?? domain;
  return { store: domain.store, requestedHostname: hostname, primaryHostname: primary.hostname };
}

export type ResolvedStore = NonNullable<Awaited<ReturnType<typeof resolveStoreByHost>>>;
