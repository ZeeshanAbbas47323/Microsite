import type { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { authOf, requireRole } from '../auth/plugin';
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

  /** FR-7.8: command box / AI usage per store over the last 30 days. */
  app.get('/admin/command-usage', async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await deps.db.commandLog.groupBy({
      by: ['storeId', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    });
    const stores = await deps.db.store.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.storeId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(stores.map((s) => [s.id, s.name]));
    const byStore = new Map<
      string,
      {
        storeId: string;
        storeName: string;
        total: number;
        byStatus: Record<string, number>;
        promptTokens: number;
        completionTokens: number;
      }
    >();
    for (const r of rows) {
      const entry = byStore.get(r.storeId) ?? {
        storeId: r.storeId,
        storeName: names.get(r.storeId) ?? '(deleted)',
        total: 0,
        byStatus: {},
        promptTokens: 0,
        completionTokens: 0,
      };
      entry.total += r._count._all;
      entry.byStatus[r.status] = r._count._all;
      entry.promptTokens += r._sum.promptTokens ?? 0;
      entry.completionTokens += r._sum.completionTokens ?? 0;
      byStore.set(r.storeId, entry);
    }
    return {
      since: since.toISOString(),
      stores: [...byStore.values()].sort((a, b) => b.total - a.total),
    };
  });

  app.get('/admin/stores', async (request) => {
    const q = z
      .object({
        search: z.string().trim().max(100).optional(),
        status: z.enum(['draft', 'published', 'suspended']).optional(),
        page: z.coerce.number().int().min(1).max(1000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(request.query);
    return deps.stores.adminList({ ...q, search: q.search || undefined });
  });

  app.post('/admin/stores/:id/:action', async (request) => {
    const { id, action } = z
      .object({ id: z.uuid(), action: z.enum(['suspend', 'unsuspend']) })
      .parse(request.params);
    const { reason } = z
      .object({ reason: z.string().trim().min(3, 'Give a short reason').max(500) })
      .parse(request.body ?? {});
    return {
      store: await deps.stores.setSuspended(authOf(request), id, action === 'suspend', reason),
    };
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
