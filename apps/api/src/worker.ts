import pino from 'pino';
import { createContainer } from './container';
import { loadEnv } from './env';
import { startOrderSyncWorker } from './orders/order-sync';

/** Standalone background worker: Getorio order sync (FR-5.7). */
const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL, base: { service: 'microstore-worker' } });
const container = createContainer(env, (message, meta) =>
  log.error({ alert: true, ...meta }, message),
);
const worker = startOrderSyncWorker(container.queueConnection, container.orderSync, {
  queue: container.queue,
});

worker.worker.on('failed', (job, err) =>
  log.warn(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message },
    'order sync attempt failed',
  ),
);
log.info('order-sync worker started');

const shutdown = async () => {
  await worker.close();
  await container.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
