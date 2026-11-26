import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { authOf, requireAuth } from '../auth/plugin';
import { CUSTOMER_SEGMENTS, CUSTOMER_SORTS } from '../customers/customer-service';

const storeParams = z.object({ id: z.uuid() });
const customerParams = z.object({ id: z.uuid(), cid: z.uuid() });
const discountParams = z.object({ id: z.uuid(), did: z.uuid() });

/** Dashboard: customers (list, profile, analytics) and discount codes. */
export async function customerRoutes(app: FastifyInstance, deps: AppDeps) {
  app.addHook('preHandler', requireAuth);

  app.get('/stores/:id/customers', async (request) => {
    const { id } = storeParams.parse(request.params);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().max(100).optional(),
        segment: z.enum(CUSTOMER_SEGMENTS).optional(),
        sort: z.enum(CUSTOMER_SORTS).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
      })
      .parse(request.query);
    return deps.customers.list(authOf(request).getorioTenantId, id, q);
  });

  app.get('/stores/:id/customers/analytics', async (request) => {
    const { id } = storeParams.parse(request.params);
    const { days } = z
      .object({
        days: z.coerce
          .number()
          .int()
          .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
          .default(30),
      })
      .parse(request.query);
    return deps.customers.analytics(authOf(request).getorioTenantId, id, days);
  });

  app.get('/stores/:id/customers/:cid', async (request) => {
    const { id, cid } = customerParams.parse(request.params);
    return { customer: await deps.customers.get(authOf(request).getorioTenantId, id, cid) };
  });

  app.patch('/stores/:id/customers/:cid', async (request) => {
    const { id, cid } = customerParams.parse(request.params);
    return { customer: await deps.customers.update(authOf(request), id, cid, request.body) };
  });

  app.get('/stores/:id/discounts', async (request) => {
    const { id } = storeParams.parse(request.params);
    return deps.discounts.list(authOf(request).getorioTenantId, id);
  });

  app.post('/stores/:id/discounts', async (request, reply) => {
    const { id } = storeParams.parse(request.params);
    return reply
      .status(201)
      .send({ discount: await deps.discounts.create(authOf(request), id, request.body) });
  });

  app.patch('/stores/:id/discounts/:did', async (request) => {
    const { id, did } = discountParams.parse(request.params);
    return { discount: await deps.discounts.update(authOf(request), id, did, request.body) };
  });

  app.delete('/stores/:id/discounts/:did', async (request, reply) => {
    const { id, did } = discountParams.parse(request.params);
    await deps.discounts.remove(authOf(request), id, did);
    return reply.status(204).send();
  });
}
