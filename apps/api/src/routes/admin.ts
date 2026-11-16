import type { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { requireRole } from '../auth/plugin';
import { AppError, notFound } from '../lib/errors';

/**
 * Platform-admin tools (requirements §9.6 queue dashboard, §8 `/admin/failed-syncs`).
 * Only sessions with the Getorio role `platform_admin` get in.
 */
export async function adminRoutes(app: FastifyInstance, deps: AppDeps) {
  app.addHook('preHandler', requireRole('platform_admin'));

  app.get('/admin/queues', async () => {
    const queues: Queue[] = deps.adminQueues ?? [];
    return {
      queues: await Promise.all(
        queues.map(async (q) => {
          const failed = await q.getFailed(0, 19);
          return {
            name: q.name,
            counts: await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
            failed: failed.map((j) => ({
              id: j.id,
              name: j.name,
              data: { orderId: (j.data as { orderId?: string }).orderId ?? null },
              failedReason: j.failedReason?.slice(0, 300) ?? null,
              attemptsMade: j.attemptsMade,
              finishedOn: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
            })),
          };
        }),
      ),
    };
  });

  app.post('/admin/queues/:queue/jobs/:jobId/retry', async (request) => {
    const { queue, jobId } = z
      .object({ queue: z.string().max(60), jobId: z.string().max(120) })
      .parse(request.params);
    const q = (deps.adminQueues ?? []).find((x) => x.name === queue);
    const job = await q?.getJob(jobId);
    if (!job) throw notFound('Job');
    if (!(await job.isFailed()))
      throw new AppError(409, 'conflict', 'Only failed jobs can be retried');
    await job.retry();
    return { retried: true };
  });

  app.get('/admin/failed-syncs', async () => {
    const orders = await deps.db.order.findMany({
      where: { status: 'sync_failed' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        orderRef: true,
        storeId: true,
        syncAttempts: true,
        lastSyncError: true,
        total: true,
        currency: true,
        createdAt: true,
        store: { select: { name: true } },
      },
    });
    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderRef: o.orderRef,
        storeId: o.storeId,
        storeName: o.store.name,
        syncAttempts: o.syncAttempts,
        lastSyncError: o.lastSyncError,
        total: o.total.toFixed(2),
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  });

  app.post('/admin/orders/:oid/retry-sync', async (request) => {
    const { oid } = z.object({ oid: z.uuid() }).parse(request.params);
    const order = await deps.db.order.findUnique({
      where: { id: oid },
      select: { id: true, status: true, storeId: true, getorioTenantId: true },
    });
    if (!order) throw notFound('Order');
    return {
      order: await deps.merchantOrders.retrySync(order.getorioTenantId, order.storeId, order.id),
    };
  });
}
