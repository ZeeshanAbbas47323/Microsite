import { serverEnv } from '@/lib/env';

export type StoreStatus = 'published' | 'unpublished' | 'suspended' | 'not_found';
interface Entry {
  status: StoreStatus;
  name?: string;
  until: number;
}

// Live stores are re-checked every 30 s and unknown hosts every 5 s. Unpublished and suspended
// stores are not cached at all, so a store that was just published opens immediately (the API
// revalidation hook may run in another process than this proxy).
const LIVE_TTL_MS = 30_000;
const NOT_FOUND_TTL_MS = 5_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, Entry>();

/** Store availability for the proxy. Fails open (returns null) if the API cannot be reached. */
export async function storeStatus(host: string, now = Date.now()): Promise<Entry | null> {
  const hit = cache.get(host);
  if (hit && hit.until > now) return hit;
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/public/store-status`, {
      headers: { 'x-store-host': host, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(1_500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status: StoreStatus; name?: string };
    const ttl =
      body.status === 'published'
        ? LIVE_TTL_MS
        : body.status === 'not_found'
          ? NOT_FOUND_TTL_MS
          : 0;
    const entry: Entry = { ...body, until: now + ttl };
    if (ttl > 0) {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(host, entry);
    }
    return entry;
  } catch {
    return null;
  }
}

export function clearStoreStatus(host?: string) {
  if (host) cache.delete(host);
  else cache.clear();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Small self-contained page for stores customers cannot see (FR-4.6). */
export function unavailablePage(status: Exclude<StoreStatus, 'published'>, name?: string) {
  const title = name ? escapeHtml(name) : 'Store not found';
  const message =
    status === 'suspended'
      ? 'This store is temporarily unavailable. Please check back later.'
      : status === 'unpublished'
        ? 'This store is not open yet. Please check back soon.'
        : 'We could not find a store at this address. Please check the link.';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fafaf9;color:#1c1917;text-align:center;padding:24px}main{max-width:420px}h1{font-size:28px;margin:0 0 12px}p{color:#57534e;line-height:1.5;margin:0}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new Response(html, {
    status: status === 'suspended' ? 503 : 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...(status === 'suspended' ? { 'retry-after': '3600' } : {}),
    },
  });
}
