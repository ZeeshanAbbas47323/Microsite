import { buildApp } from './app';
import { createContainer } from './container';
import { loadEnv } from './env';
import { initSentry } from './lib/observability';
import { startOrderSyncWorker } from './orders/order-sync';

const env = loadEnv();
initSentry(env.SENTRY_DSN, env.NODE_ENV, 'microstore-api');
let log: { error: (obj: object, msg: string) => void; info: (obj: object, msg: string) => void } =
  console;
const container = createContainer(
  env,
  (message, meta) => log.error({ alert: true, ...meta }, message),
  (error) => log.error({ err: error }, 'storefront revalidation failed'),
  (msg, meta) => log.info(meta ?? {}, msg),
);

function trustProxy(value: string | undefined): boolean | string[] {
  if (!value) return false;
  if (value === 'true') return true;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const app = await buildApp(container.deps, {
  logger: {
    level: env.LOG_LEVEL,
    redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'],
  },
  trustProxy: trustProxy(env.TRUST_PROXY),
});
log = app.log;

const worker = env.RUN_WORKER_IN_PROCESS
  ? startOrderSyncWorker(container.queueConnection, container.orderSync, {
      queue: container.queue,
      prefix: container.queuePrefix,
    })
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
