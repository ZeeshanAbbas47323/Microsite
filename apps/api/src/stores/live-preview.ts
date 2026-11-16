import { randomUUID } from 'node:crypto';
import type { SiteConfig } from '@microstore/site-schema';
import type { KeyValueCache } from '../lib/cache';

/**
 * FR-6.2 live preview: unsaved editor changes are validated and kept briefly in the cache so the
 * preview iframe can show them before the merchant saves. They never touch the draft.
 */
export const LIVE_PREVIEW_TTL_SECONDS = 30 * 60;

const key = (storeId: string, id: string) => `live-preview:${storeId}:${id}`;

export async function saveLivePreview(cache: KeyValueCache, storeId: string, config: SiteConfig) {
  const id = randomUUID();
  await cache.set(key(storeId, id), config, LIVE_PREVIEW_TTL_SECONDS);
  return id;
}

export function loadLivePreview(cache: KeyValueCache, storeId: string, id: string) {
  return cache.get<SiteConfig>(key(storeId, id));
}
