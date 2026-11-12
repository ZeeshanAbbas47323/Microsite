import 'server-only';
import type { PublicProduct, StoreInfo } from '@microstore/layouts/react';
import type { SiteConfig } from '@microstore/site-schema';
import { serverEnv } from '@/lib/env';

export class StorefrontApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Mode {
  host: string;
  /** Draft preview token; when set nothing is cached. */
  preview?: string;
}

export const storeTag = (host: string) => `store:${host}`;
export const REVALIDATE_SECONDS = 60;

async function get<T>(
  path: string,
  mode: Mode,
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${serverEnv.apiUrl}/api/v1${path}`);
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  if (mode.preview) url.searchParams.set('preview', mode.preview);
  const res = await fetch(url, {
    headers: { 'x-store-host': mode.host, accept: 'application/json' },
    ...(mode.preview
      ? { cache: 'no-store' as const }
      : {
          cache: 'force-cache' as const,
          next: { revalidate: REVALIDATE_SECONDS, tags: [storeTag(mode.host)] },
        }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new StorefrontApiError(
      res.status,
      body?.error?.code ?? 'error',
      body?.error?.message ?? res.statusText,
    );
  }
  return (await res.json()) as T;
}

export interface StoreResponse {
  store: StoreInfo & { timezone: string };
  config: SiteConfig;
  preview: boolean;
}

export const getStore = (mode: Mode) => get<StoreResponse>('/public/store', mode);

export interface ProductsResponse {
  items: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
  categories: { id: string; name: string }[];
  stale: boolean;
}

export interface ProductsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  featured?: boolean;
  sort?: string;
}

export const getProducts = (mode: Mode, q: ProductsQuery = {}) =>
  get<ProductsResponse>('/public/products', mode, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    category: q.category,
    featured: q.featured ? 'true' : undefined,
    sort: q.sort,
  });

export async function getProduct(mode: Mode, id: string): Promise<PublicProduct | null> {
  try {
    return (
      await get<{ product: PublicProduct }>(`/public/products/${encodeURIComponent(id)}`, mode)
    ).product;
  } catch (error) {
    if (error instanceof StorefrontApiError && error.status === 404 && error.code === 'not_found')
      return null;
    throw error;
  }
}
