import {
  isGetorioError,
  type GetorioClient,
  type GetorioProduct,
} from '@microstore/getorio-client';
import { AppError } from '../lib/errors';
import type { KeyValueCache } from '../lib/cache';

/** Spec §6: product data cached 60 s; a stale copy is kept so the storefront survives Getorio outages (§9.3). */
export const CATALOG_FRESH_MS = 60_000;
export const CATALOG_STALE_TTL_SECONDS = 24 * 60 * 60;
export const MAX_CATALOG_PRODUCTS = 1000;
const PAGE_SIZE = 100;

interface CatalogEntry {
  fetchedAt: number;
  products: GetorioProduct[];
}

export interface Catalog {
  products: GetorioProduct[];
  /** True when Getorio was unreachable and an older copy is served. */
  stale: boolean;
}

export const PRODUCT_SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'name'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductQuery {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  featured?: boolean;
  sort: ProductSort;
}

const key = (tenantId: string) => `catalog:${tenantId}`;
const priceOf = (p: GetorioProduct) => Number(p.price);

/**
 * The storefront catalog of one tenant: every active product flagged "Show on Microstore".
 * Microstores are small, so the whole visible catalog is cached and searched/sorted in memory.
 */
export class CatalogService {
  private readonly inflight = new Map<string, Promise<Catalog>>();

  constructor(
    private readonly getorio: GetorioClient,
    private readonly cache: KeyValueCache,
    private readonly now: () => number = Date.now,
  ) {}

  async getCatalog(tenantId: string): Promise<Catalog> {
    const entry = await this.cache.get<CatalogEntry>(key(tenantId));
    if (entry && this.now() - entry.fetchedAt < CATALOG_FRESH_MS)
      return { products: entry.products, stale: false };

    // Single flight per tenant so a cache miss under load triggers one Getorio fetch.
    let pending = this.inflight.get(tenantId);
    if (!pending) {
      pending = this.refresh(tenantId, entry).finally(() => this.inflight.delete(tenantId));
      this.inflight.set(tenantId, pending);
    }
    return pending;
  }

  async invalidate(tenantId: string) {
    await this.cache.del(key(tenantId));
  }

  async list(tenantId: string, q: ProductQuery) {
    const { products, stale } = await this.getCatalog(tenantId);
    const needle = q.search?.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        (!q.categoryId || p.category?.id === q.categoryId) &&
        (!q.featured || p.microstore.featured) &&
        (!needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle)),
    );
    const sorted = [...filtered].sort(comparator(q.sort));
    const start = (q.page - 1) * q.pageSize;
    const categories = new Map<string, string>();
    for (const p of products) if (p.category) categories.set(p.category.id, p.category.name);
    return {
      items: sorted.slice(start, start + q.pageSize),
      total: sorted.length,
      page: q.page,
      pageSize: q.pageSize,
      categories: [...categories]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      stale,
    };
  }

  async find(tenantId: string, productId: string): Promise<GetorioProduct | null> {
    const { products } = await this.getCatalog(tenantId);
    return products.find((p) => p.id === productId) ?? null;
  }

  /**
   * Live product for checkout pricing. Falls back to the cached copy when Getorio is unreachable,
   * flagged `unverified` so the order is marked for manual stock confirmation.
   */
  async getForCheckout(
    tenantId: string,
    productId: string,
  ): Promise<{ product: GetorioProduct | null; unverified: boolean }> {
    try {
      return { product: await this.getorio.getProduct(tenantId, productId), unverified: false };
    } catch (error) {
      if (!isGetorioError(error) || !error.retryable) throw error;
      const cached = await this.cache.get<CatalogEntry>(key(tenantId));
      const product = cached?.products.find((p) => p.id === productId);
      if (!product)
        throw new AppError(503, 'service_unavailable', 'Checkout is temporarily unavailable');
      return { product, unverified: true };
    }
  }

  private async refresh(tenantId: string, previous: CatalogEntry | null): Promise<Catalog> {
    try {
      const products: GetorioProduct[] = [];
      for (let page = 1; products.length < MAX_CATALOG_PRODUCTS; page++) {
        const res = await this.getorio.listProducts(tenantId, {
          page,
          pageSize: PAGE_SIZE,
          onlyMicrostore: true,
        });
        products.push(...res.items);
        if (res.items.length < PAGE_SIZE || products.length >= res.total) break;
      }
      // Defence in depth: never trust the filter alone.
      const visible = products
        .filter((p) => p.active && p.microstore.visible)
        .slice(0, MAX_CATALOG_PRODUCTS);
      await this.cache.set(
        key(tenantId),
        { fetchedAt: this.now(), products: visible } satisfies CatalogEntry,
        CATALOG_STALE_TTL_SECONDS,
      );
      return { products: visible, stale: false };
    } catch (error) {
      if (previous && isGetorioError(error)) return { products: previous.products, stale: true };
      if (isGetorioError(error))
        throw new AppError(503, 'service_unavailable', 'Products are temporarily unavailable');
      throw error;
    }
  }
}

function comparator(sort: ProductSort): (a: GetorioProduct, b: GetorioProduct) => number {
  switch (sort) {
    case 'price-asc':
      return (a, b) => priceOf(a) - priceOf(b) || a.name.localeCompare(b.name);
    case 'price-desc':
      return (a, b) => priceOf(b) - priceOf(a) || a.name.localeCompare(b.name);
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'newest':
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
    case 'featured':
      return (a, b) =>
        Number(b.microstore.featured) - Number(a.microstore.featured) ||
        a.name.localeCompare(b.name);
  }
}

/** What the browser may see: no tenant ids, no exact stock counts. */
export function toPublicProduct(p: GetorioProduct) {
  const variants = p.variants.filter((v) => v.active);
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    currency: p.currency,
    images: p.images,
    category: p.category,
    featured: p.microstore.featured,
    inStock: variants.length ? variants.some((v) => v.stockQty > 0) : p.stockQty > 0,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      options: v.options,
      price: v.price,
      inStock: v.stockQty > 0,
    })),
  };
}
