import { migrateSiteConfig } from '@microstore/site-schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { PRODUCT_SORTS, toPublicProduct } from '../catalog/catalog-service';
import { AppError, notFound } from '../lib/errors';
import { idempotencyKeySchema } from '../orders/checkout-service';
import { verifyPreviewToken } from '../public/preview';
import { resolveStoreByHost, type ResolvedStore } from '../public/tenant';
import { storeSettingsSchema } from '../stores/settings';

export const STORE_HOST_HEADER = 'x-store-host';

const previewQuery = z.object({ preview: z.string().max(300).optional() });

/**
 * Public storefront API (unauthenticated, rate limited). The store comes from `X-Store-Host`
 * (set by the Next.js server) or the Host header, resolved through the `domains` table.
 */
export async function publicRoutes(app: FastifyInstance, deps: AppDeps) {
  async function viewable(request: FastifyRequest, { allowPreview }: { allowPreview: boolean }) {
    const host = (request.headers[STORE_HOST_HEADER] as string | undefined) ?? request.headers.host;
    const resolved = await resolveStoreByHost(deps.db, host);
    if (!resolved) throw new AppError(404, 'store_not_found', 'Store not found');
    const { preview } = previewQuery.parse(request.query);
    const isPreview =
      allowPreview &&
      preview !== undefined &&
      verifyPreviewToken(deps.previewSecret, resolved.store.id, preview);
    if (!isPreview) assertPublic(resolved);
    return { ...resolved, isPreview };
  }

  app.get(
    '/public/store',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { store, primaryHostname, isPreview } = await viewable(request, { allowPreview: true });
      const settings = storeSettingsSchema.parse(store.settings);
      const config = migrateSiteConfig(isPreview ? store.draftConfig : store.publishedConfig);
      reply.header('cache-control', isPreview ? 'no-store' : 'public, max-age=30');
      return {
        store: {
          name: store.name,
          hostname: primaryHostname,
          currency: store.currency,
          timezone: store.timezone,
          settings: {
            shippingFlatFee: settings.shippingFlatFee,
            freeShippingThreshold: settings.freeShippingThreshold,
            whatsappButton: settings.whatsappButton,
            rtl: settings.rtl,
          },
        },
        config,
        preview: isPreview,
      };
    },
  );

  const productsQuery = z.object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(24),
    search: z.string().trim().max(100).optional(),
    category: z.string().max(64).optional(),
    featured: z.enum(['true', 'false']).optional(),
    sort: z.enum(PRODUCT_SORTS).default('featured'),
    preview: z.string().optional(),
  });

  app.get(
    '/public/products',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { store } = await viewable(request, { allowPreview: true });
      const q = productsQuery.parse(request.query);
      const res = await deps.catalog.list(store.getorioTenantId, {
        page: q.page,
        pageSize: q.pageSize,
        search: q.search,
        categoryId: q.category,
        featured: q.featured === 'true',
        sort: q.sort,
      });
      reply.header('cache-control', 'public, max-age=30');
      return { ...res, items: res.items.map(toPublicProduct) };
    },
  );

  app.get(
    '/public/products/:id',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request) => {
      const { store } = await viewable(request, { allowPreview: true });
      const { id } = z.object({ id: z.string().min(1).max(64) }).parse(request.params);
      const product = await deps.catalog.find(store.getorioTenantId, id);
      if (!product) throw notFound('Product');
      return { product: toPublicProduct(product) };
    },
  );

  app.post(
    '/public/checkout',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { store } = await viewable(request, { allowPreview: false });
      const key = idempotencyKeySchema.parse(request.headers['idempotency-key']);
      const { order, created } = await deps.checkout.placeOrder(store, request.body, key);
      return reply.status(created ? 201 : 200).send({ order });
    },
  );
}

function assertPublic({ store }: ResolvedStore) {
  if (store.status === 'suspended') {
    throw new AppError(503, 'store_suspended', 'This store is temporarily unavailable', {
      name: store.name,
    });
  }
  if (store.status !== 'published' || store.publishedConfig === null) {
    throw new AppError(404, 'store_unavailable', 'This store is not available', {
      name: store.name,
    });
  }
}
