import { createGetorioClient, type GetorioClient } from '@microstore/getorio-client';
import { Redis } from 'ioredis';
import type { AppDeps } from './app';
import { RedisSessionStore, SessionManager } from './auth/sessions';
import { JwtSsoProvider } from './auth/sso';
import { CatalogService } from './catalog/catalog-service';
import { MerchantProductService } from './catalog/merchant-products';
import { AssetService } from './assets/asset-service';
import { S3Storage } from './assets/storage';
import { createDb } from './db';
import { captureError, Metrics } from './lib/observability';
import type { Env } from './env';
import { RedisCache } from './lib/cache';
import { OrderNotifier } from './notifications/order-notifier';
import { ConsoleEmailSender, SmtpEmailSender, WebhookMessageSender } from './notifications/senders';
import { TurnstileVerifier } from './orders/captcha';
import { CheckoutService } from './orders/checkout-service';
import { MerchantOrderService } from './orders/merchant-orders';
import { BullOrderSyncQueue, OrderSyncService, type Alert } from './orders/order-sync';
import { HttpSiteRevalidator } from './stores/http-revalidator';
import { noopRevalidator, StoreService } from './stores/store-service';

/** Wires production dependencies from the environment. Shared by the API server and the worker. */
export type Logger = (msg: string, meta?: Record<string, unknown>) => void;

export function createContainer(
  env: Env,
  alert: Alert,
  onRevalidateError: (error: unknown) => void = () => {},
  info: Logger = () => {},
) {
  if (!env.REDIS_URL) {
    if (env.NODE_ENV === 'production') throw new Error('REDIS_URL is required in production');
    throw new Error(
      'REDIS_URL is required (sessions, cache and the order-sync queue). Start it with docker compose.',
    );
  }
  const db = createDb(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  const queueConnection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
  const getorio: GetorioClient = createGetorioClient(env);
  const cache = new RedisCache(redis);
  const revalidator =
    env.WEB_REVALIDATE_URL && env.REVALIDATE_SECRET
      ? new HttpSiteRevalidator(env.WEB_REVALIDATE_URL, env.REVALIDATE_SECRET, onRevalidateError)
      : noopRevalidator;
  const stores = new StoreService(db, {
    rootDomain: env.ROOT_DOMAIN,
    storefrontUrlTemplate: env.STOREFRONT_URL_TEMPLATE,
    revalidator,
  });
  const catalog = new CatalogService(getorio, cache);
  const queue = new BullOrderSyncQueue(queueConnection, { prefix: env.QUEUE_PREFIX });
  const metrics = new Metrics(() =>
    queue.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
  );
  const alertAndReport: Alert = (message, meta) => {
    alert(message, meta);
    captureError(new Error(message), meta);
  };
  const orderSync = new OrderSyncService(db, getorio, alertAndReport, undefined, (outcome) =>
    metrics.orderSync.inc({ outcome }),
  );
  const notifier = new OrderNotifier(
    db,
    env.SMTP_URL ? new SmtpEmailSender(env.SMTP_URL, env.MAIL_FROM) : new ConsoleEmailSender(info),
    env.MESSAGE_WEBHOOK_URL
      ? new WebhookMessageSender(env.MESSAGE_WEBHOOK_URL, env.MESSAGE_WEBHOOK_TOKEN ?? '')
      : null,
    info,
  );
  const assets =
    env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY
      ? new AssetService(
          db,
          new S3Storage({
            endpoint: env.S3_ENDPOINT,
            bucket: env.S3_BUCKET,
            accessKeyId: env.S3_ACCESS_KEY,
            secretAccessKey: env.S3_SECRET_KEY,
            region: env.S3_REGION,
          }),
          stores,
        )
      : undefined;

  const deps: AppDeps = {
    db,
    redis,
    sessions: new SessionManager(new RedisSessionStore(redis, env.SESSION_SECRET)),
    authProvider: new JwtSsoProvider({
      publicKeyPem: env.SSO_JWT_PUBLIC_KEY,
      sharedSecret: env.SSO_SHARED_SECRET,
      issuer: env.SSO_ISSUER,
      audience: env.SSO_AUDIENCE,
    }),
    getorio,
    stores,
    cache,
    catalog,
    merchantProducts: new MerchantProductService(db, getorio, stores, catalog, revalidator),
    merchantOrders: new MerchantOrderService(
      db,
      stores,
      orderSync,
      queue,
      env.GETORIO_ORDER_URL_TEMPLATE,
    ),
    checkout: new CheckoutService(db, catalog, queue, {
      notifier,
      onOrderPlaced: () => metrics.ordersPlaced.inc(),
      ...(env.TURNSTILE_SECRET ? { captcha: new TurnstileVerifier(env.TURNSTILE_SECRET) } : {}),
    }),
    revalidator,
    assets,
    previewSecret: env.SESSION_SECRET,
    webhookSecret: env.GETORIO_WEBHOOK_SECRET,
    metrics,
    metricsToken: env.METRICS_TOKEN,
    corsOrigins: env.CORS_ORIGINS,
    secureCookies: env.NODE_ENV === 'production',
  };

  return {
    deps,
    queue,
    queueConnection,
    queuePrefix: env.QUEUE_PREFIX,
    orderSync,
    metrics,
    async close() {
      await queue.close();
      await db.$disconnect();
      redis.disconnect();
    },
  };
}
