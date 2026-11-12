import {
  isGetorioError,
  type GetorioClient,
  type MicrostoreOrderPayload,
} from '@microstore/getorio-client';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Db } from '../db';
import type { Prisma } from '../generated/prisma/client';

/** FR-5.7: 8 attempts with exponential backoff (30 s, 1 m, 2 m, ... ≈ 2 h in total), then `sync_failed`. */
export const ORDER_SYNC_ATTEMPTS = 8;
export const ORDER_SYNC_BACKOFF_MS = 30_000;
export const ORDER_SYNC_QUEUE = 'order-sync';
/** Orders still `pending_sync` after this long are re-enqueued by the sweeper. */
export const STALE_PENDING_MS = 10 * 60 * 1000;

export interface OrderSyncQueue {
  enqueue(orderId: string): Promise<void>;
}

export type SyncOutcome = 'synced' | 'already_synced' | 'failed' | 'skipped' | 'missing';

export type Alert = (message: string, meta: Record<string, unknown>) => void;

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

export function toGetorioPayload(order: OrderWithItems): MicrostoreOrderPayload {
  return {
    microstoreOrderRef: order.orderRef,
    source: 'microstore',
    customer: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail },
    shipping: { address: order.address, city: order.city },
    items: order.items.map((i) => ({
      productId: i.getorioProductId,
      variantId: i.variantId,
      sku: i.sku,
      name: i.nameSnapshot,
      qty: i.qty,
      unitPrice: i.unitPrice.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    currency: order.currency,
    paymentMethod: 'cod',
    notes: order.notes,
    placedAt: order.createdAt.toISOString(),
  };
}

/** Pushes one local order to Getorio. Safe to run any number of times (Getorio is idempotent on the order id). */
export class OrderSyncService {
  constructor(
    private readonly db: Db,
    private readonly getorio: GetorioClient,
    private readonly alert: Alert = () => {},
    private readonly now: () => Date = () => new Date(),
    /** Called with each attempt's outcome ('synced', 'failed', 'retry', ...) for metrics. */
    private readonly onOutcome: (outcome: string) => void = () => {},
  ) {}

  /**
   * Returns normally when the job is finished (synced, or failed for good). Throws when the
   * failure is temporary and the queue should retry.
   */
  async sync(orderId: string, opts: { finalAttempt: boolean }): Promise<SyncOutcome> {
    try {
      const outcome = await this.attempt(orderId, opts);
      this.onOutcome(outcome);
      return outcome;
    } catch (error) {
      this.onOutcome('retry');
      throw error;
    }
  }

  private async attempt(
    orderId: string,
    { finalAttempt }: { finalAttempt: boolean },
  ): Promise<SyncOutcome> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return 'missing';
    if (order.status === 'synced') return 'already_synced';
    if (order.status === 'cancelled') return 'skipped';

    try {
      const { getorioOrderId } = await this.getorio.createOrder(
        order.getorioTenantId,
        toGetorioPayload(order),
        order.id,
      );
      await this.db.order.update({
        where: { id: order.id },
        data: {
          status: 'synced',
          getorioOrderId,
          syncedAt: this.now(),
          syncAttempts: { increment: 1 },
          lastSyncError: null,
        },
      });
      return 'synced';
    } catch (error) {
      const retryable = !isGetorioError(error) || error.retryable;
      // Error text from Getorio/network only: never customer data.
      const reason = isGetorioError(error) ? `${error.kind}: ${error.message}` : 'unexpected error';
      const giveUp = !retryable || finalAttempt;
      await this.db.order.update({
        where: { id: order.id },
        data: {
          syncAttempts: { increment: 1 },
          lastSyncError: reason.slice(0, 500),
          ...(giveUp ? { status: 'sync_failed' } : {}),
        },
      });
      if (giveUp) {
        this.alert('Order sync failed', {
          orderId: order.id,
          storeId: order.storeId,
          orderRef: order.orderRef,
          reason,
        });
        return 'failed';
      }
      throw error;
    }
  }

  /** Moves a failed order back to `pending_sync` for a manual retry (FR-5.7). */
  async markForRetry(orderId: string) {
    await this.db.order.update({
      where: { id: orderId },
      data: { status: 'pending_sync', lastSyncError: null },
    });
  }

  /** Orders stuck in `pending_sync` (e.g. enqueue failed or Redis was lost). */
  async findStalePending(limit = 100): Promise<string[]> {
    const rows = await this.db.order.findMany({
      where: {
        status: 'pending_sync',
        updatedAt: { lt: new Date(this.now().getTime() - STALE_PENDING_MS) },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Queue implementations

/** BullMQ queue backed by Redis (production and local dev with docker-compose). */
export class BullOrderSyncQueue implements OrderSyncQueue {
  readonly queue: Queue;
  /** `prefix` namespaces the Redis keys, so environments sharing a Redis never steal each other's jobs. */
  constructor(connection: ConnectionOptions, { prefix = 'microstore' }: { prefix?: string } = {}) {
    this.queue = new Queue(ORDER_SYNC_QUEUE, {
      connection,
      prefix,
      defaultJobOptions: {
        attempts: ORDER_SYNC_ATTEMPTS,
        backoff: { type: 'exponential', delay: ORDER_SYNC_BACKOFF_MS },
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
  }

  async enqueue(orderId: string) {
    // jobId de-duplicates: an order already waiting is not queued twice.
    await this.queue.add('sync', { orderId }, { jobId: `order-${orderId}` });
  }

  /** Re-adds an order whose previous job finished (manual retry). */
  async requeue(orderId: string) {
    const existing = await this.queue.getJob(`order-${orderId}`);
    if (existing && ((await existing.isFailed()) || (await existing.isCompleted())))
      await existing.remove();
    await this.enqueue(orderId);
  }

  close() {
    return this.queue.close();
  }
}

export function startOrderSyncWorker(
  connection: ConnectionOptions,
  service: OrderSyncService,
  {
    concurrency = 5,
    sweepEveryMs = 5 * 60 * 1000,
    queue,
    prefix = 'microstore',
  }: { concurrency?: number; sweepEveryMs?: number; queue: OrderSyncQueue; prefix?: string },
) {
  const worker = new Worker<{ orderId: string }>(
    ORDER_SYNC_QUEUE,
    async (job) =>
      service.sync(job.data.orderId, {
        finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? ORDER_SYNC_ATTEMPTS),
      }),
    { connection, concurrency, prefix },
  );
  const sweep = async () => {
    for (const id of await service.findStalePending())
      await queue.enqueue(id).catch(() => undefined);
  };
  const timer = setInterval(() => void sweep().catch(() => undefined), sweepEveryMs);
  timer.unref();
  void sweep().catch(() => undefined);
  return {
    worker,
    async close() {
      clearInterval(timer);
      await worker.close();
    },
  };
}

/**
 * In-process queue for tests (and a dev fallback without Redis). Jobs run only when `runPending`
 * is called, one attempt per call, which makes retry/backoff behaviour deterministic to test.
 */
export class InlineOrderSyncQueue implements OrderSyncQueue {
  private readonly attempts = new Map<string, number>();
  constructor(
    private readonly service: () => OrderSyncService,
    private readonly maxAttempts = ORDER_SYNC_ATTEMPTS,
  ) {}

  async enqueue(orderId: string) {
    if (!this.attempts.has(orderId)) this.attempts.set(orderId, 0);
  }

  get pending(): string[] {
    return [...this.attempts.keys()];
  }

  attemptsMade(orderId: string) {
    return this.attempts.get(orderId) ?? 0;
  }

  /** Runs one attempt for every pending job. Returns the outcome per order. */
  async runPending(): Promise<Record<string, SyncOutcome | 'retry'>> {
    const results: Record<string, SyncOutcome | 'retry'> = {};
    for (const [orderId, made] of [...this.attempts]) {
      const attempt = made + 1;
      try {
        results[orderId] = await this.service().sync(orderId, {
          finalAttempt: attempt >= this.maxAttempts,
        });
        this.attempts.delete(orderId);
      } catch {
        this.attempts.set(orderId, attempt);
        results[orderId] = 'retry';
      }
    }
    return results;
  }
}
