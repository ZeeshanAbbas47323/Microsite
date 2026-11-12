import { buildApp } from './app';
import { createContainer } from './container';
import { loadEnv } from './env';
import { startOrderSyncWorker } from './orders/order-sync';

const env = loadEnv();
let log: { error: (obj: object, msg: string) => void } = console;
const container = createContainer(env, (message, meta) =>
  log.error({ alert: true, ...meta }, message),
);

const app = await buildApp(container.deps, {
  logger: {
    level: env.LOG_LEVEL,
    redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'],
  },
  trustProxy: env.NODE_ENV === 'production',
});
log = app.log;

const worker = env.RUN_WORKER_IN_PROCESS
  ? startOrderSyncWorker(container.queueConnection, container.orderSync, { queue: container.queue })
  : null;

const shutdown = async () => {
  await app.close();
  await worker?.close();
  await container.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: env.HOST, port: env.PORT });
