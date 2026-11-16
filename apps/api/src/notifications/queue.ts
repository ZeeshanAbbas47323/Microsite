import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { OrderNotifier } from './order-notifier';

export const NOTIFICATION_QUEUE = 'notifications';

/** Customer notifications run in the background so checkout never waits on email/SMS. */
export interface NotificationQueue {
  orderPlaced(orderId: string): Promise<void>;
}

export class BullNotificationQueue implements NotificationQueue {
  readonly queue: Queue;
  constructor(connection: ConnectionOptions, { prefix = 'microstore' }: { prefix?: string } = {}) {
    this.queue = new Queue(NOTIFICATION_QUEUE, {
      connection,
      prefix,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  async orderPlaced(orderId: string) {
    await this.queue.add('order-placed', { orderId }, { jobId: `order-placed-${orderId}` });
  }
  close() {
    return this.queue.close();
  }
}

export function startNotificationWorker(
  connection: ConnectionOptions,
  notifier: OrderNotifier,
  { prefix = 'microstore', concurrency = 5 }: { prefix?: string; concurrency?: number } = {},
) {
  return new Worker<{ orderId: string }>(
    NOTIFICATION_QUEUE,
    async (job) => notifier.orderPlaced(job.data.orderId),
    {
      connection,
      prefix,
      concurrency,
    },
  );
}

/** Runs notifications in-process right away (tests and setups without a worker). */
export class InlineNotificationQueue implements NotificationQueue {
  constructor(private readonly notifier: OrderNotifier) {}
  async orderPlaced(orderId: string) {
    await this.notifier.orderPlaced(orderId);
  }
}
