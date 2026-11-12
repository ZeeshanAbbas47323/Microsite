import { verifyWebhook, WEBHOOK_SIGNATURE_HEADER } from '@microstore/getorio-client';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { AppError } from '../lib/errors';

/** Getorio → Microstore change notifications (spec §6). Events are hints: data is re-fetched. */
export async function webhookRoutes(app: FastifyInstance, deps: AppDeps) {
  // Signatures are computed over the raw body, so keep it as a string in this scope.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 256 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.post(
    '/webhooks/getorio',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!deps.webhookSecret)
        throw new AppError(503, 'service_unavailable', 'Webhooks are not configured');
      const raw = typeof request.body === 'string' ? request.body : '';
      const result = verifyWebhook(
        raw,
        request.headers[WEBHOOK_SIGNATURE_HEADER] as string | undefined,
        deps.webhookSecret,
      );
      if (!result.ok) throw new AppError(401, 'unauthorized', `Invalid webhook (${result.reason})`);

      const { event } = result;
      // Getorio may deliver the same event more than once.
      if (!(await deps.cache.setIfAbsent(`webhook:${event.id}`, 24 * 3600)))
        return reply.status(204).send();

      if (event.type === 'product.updated' || event.type === 'stock.updated') {
        await deps.catalog.invalidate(event.tenantId);
        const store = await deps.db.store.findUnique({
          where: { getorioTenantId: event.tenantId },
          include: { domains: true },
        });
        if (store)
          await deps.revalidator.revalidateStore(
            store.id,
            store.domains.map((d) => d.hostname),
          );
      }
      // order.status_changed: statuses are read live from Getorio (order tracking, P1).
      return reply.status(204).send();
    },
  );
}
