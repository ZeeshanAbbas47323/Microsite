import { migrateSiteConfig } from '@microstore/site-schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { PRODUCT_SORTS, toPublicProduct } from '../catalog/catalog-service';
import { AppError, notFound } from '../lib/errors';
import { idempotencyKeySchema } from '../orders/checkout-service';
import { verifyPreviewToken } from '../public/preview';
import { loadLivePreview } from '../stores/live-preview';
import { normalizeHost, resolveStoreByHost, type ResolvedStore } from '../public/tenant';
import { storeSettingsSchema } from '../stores/settings';

export const STORE_HOST_HEADER = 'x-store-host';

const previewQuery = z.object({
  preview: z.string().max(300).optional(),
  command: z.uuid().optional(),
  draft: z.uuid().optional(),
});

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

  /**
   * Cheap availability check used by the web proxy to answer unavailable stores with the right
   * status (FR-4.6: 404 unpublished / unknown, 503 suspended) and the store's name.
   */
  app.get(
    '/public/store-status',
    { config: { rateLimit: { max: 3000, timeWindow: '1 minute' } } },
    async (request) => {
      const host =
        (request.headers[STORE_HOST_HEADER] as string | undefined) ?? request.headers.host;
      const resolved = await resolveStoreByHost(deps.db, host);
      if (!resolved) return { status: 'not_found' as const };
      const { store } = resolved;
      const status =
        store.status === 'suspended'
          ? ('suspended' as const)
          : store.status === 'published' && store.publishedConfig !== null
            ? ('published' as const)
            : ('unpublished' as const);
      return { status, name: store.name };
    },
  );

  app.get(
    '/public/store',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { store, primaryHostname, isPreview } = await viewable(request, { allowPreview: true });
      const settings = storeSettingsSchema.parse(store.settings);
      // In preview, a pending command-box suggestion can be shown before it is applied (FR-7.1).
      // Unsaved editor changes (live preview) win over a suggestion; both need a preview token.
      const { command, draft } = previewQuery.parse(request.query);
      const unsaved =
        isPreview && draft ? await loadLivePreview(deps.cache, store.id, draft) : null;
      const proposed =
        unsaved ??
        (isPreview && command
          ? await deps.commands.previewConfig(store.getorioTenantId, store.id, command)
          : null);
      const config =
        proposed ?? migrateSiteConfig(isPreview ? store.draftConfig : store.publishedConfig);
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
            cityShippingRates: settings.cityShippingRates,
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
      const { order, created } = await deps.checkout.placeOrder(
        store,
        request.body,
        key,
        request.ip,
      );
      return reply.status(created ? 201 : 200).send({ order });
    },
  );

  // Phase 3 analytics beacon: counts a page view (and a visit for a new session). Nothing about
  // the visitor is stored; bots are ignored.
  app.post(
    '/public/visits',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { store } = await viewable(request, { allowPreview: false });
      const { newVisit } = z
        .object({ newVisit: z.boolean().default(false) })
        .parse(request.body ?? {});
      await deps.analytics.recordPageView(store, {
        newVisit,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(204).send();
    },
  );

  // On-demand TLS (Caddy `ask`): a certificate is only issued for our subdomains and verified
  // custom domains, so nobody can make us request certificates for arbitrary hosts.
  app.get('/public/tls/ask', async (request, reply) => {
    const { domain } = z.object({ domain: z.string().max(253) }).parse(request.query);
    const host = normalizeHost(domain);
    const ok = host ? await deps.domains.allowsCertificate(host) : false;
    return reply.status(ok ? 200 : 404).send();
  });

  // FR-5.10: POST so the phone number never ends up in URLs or access logs.
  app.post(
    '/public/orders/track',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { store } = await viewable(request, { allowPreview: false });
      reply.header('cache-control', 'no-store');
      return deps.tracking.track(store, request.body);
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
