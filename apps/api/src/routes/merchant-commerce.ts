import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { authOf, requireAuth } from '../auth/plugin';
import { createPreviewToken } from '../public/preview';

const storeParams = z.object({ id: z.uuid() });

/** Merchant products (FR-6.4), orders (FR-6.5) and draft preview links (FR-4.5). */
export async function merchantCommerceRoutes(app: FastifyInstance, deps: AppDeps) {
  app.addHook('preHandler', requireAuth);

  app.get('/stores/:id/products', async (request) => {
    const { id } = storeParams.parse(request.params);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().trim().max(100).optional(),
      })
      .parse(request.query);
    return deps.merchantProducts.list(authOf(request).getorioTenantId, id, q);
  });

  app.patch('/stores/:id/products/:pid', async (request) => {
    const { id, pid } = z
      .object({ id: z.uuid(), pid: z.string().min(1).max(64) })
      .parse(request.params);
    const flags = z
      .strictObject({ visible: z.boolean().optional(), featured: z.boolean().optional() })
      .refine((f) => f.visible !== undefined || f.featured !== undefined, {
        error: 'Nothing to update',
      })
      .parse(request.body);
    return { product: await deps.merchantProducts.setFlags(authOf(request), id, pid, flags) };
  });

  app.get('/stores/:id/orders', async (request) => {
    const { id } = storeParams.parse(request.params);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        status: z.enum(['pending_sync', 'synced', 'sync_failed', 'cancelled']).optional(),
      })
      .parse(request.query);
    return deps.merchantOrders.list(authOf(request).getorioTenantId, id, q);
  });

  app.get('/stores/:id/orders/:oid', async (request) => {
    const { id, oid } = z.object({ id: z.uuid(), oid: z.uuid() }).parse(request.params);
    return { order: await deps.merchantOrders.get(authOf(request).getorioTenantId, id, oid) };
  });

  app.post('/stores/:id/orders/:oid/retry-sync', async (request) => {
    const { id, oid } = z.object({ id: z.uuid(), oid: z.uuid() }).parse(request.params);
    return { order: await deps.merchantOrders.retrySync(authOf(request).getorioTenantId, id, oid) };
  });

  app.post('/stores/:id/preview-token', async (request) => {
    const { id } = storeParams.parse(request.params);
    const store = await deps.stores.get(authOf(request).getorioTenantId, id);
    const preview = createPreviewToken(deps.previewSecret, store.id);
    return {
      ...preview,
      url: store.url ? `${store.url}/?preview=${encodeURIComponent(preview.token)}` : null,
    };
  });
}
