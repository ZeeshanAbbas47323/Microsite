import { createGetorioClient, type GetorioClient } from '@microstore/getorio-client';
import { Redis } from 'ioredis';
import type { AppDeps } from './app';
import { RedisSessionStore, SessionManager } from './auth/sessions';
import { JwtSsoProvider } from './auth/sso';
import { CatalogService } from './catalog/catalog-service';
import { MerchantProductService } from './catalog/merchant-products';
import { createDb } from './db';
import type { Env } from './env';
import { RedisCache } from './lib/cache';
import { CheckoutService } from './orders/checkout-service';
import { MerchantOrderService } from './orders/merchant-orders';
import { BullOrderSyncQueue, OrderSyncService, type Alert } from './orders/order-sync';
import { HttpSiteRevalidator } from './stores/http-revalidator';
import { noopRevalidator, StoreService } from './stores/store-service';

/** Wires production dependencies from the environment. Shared by the API server and the worker. */
export function createContainer(
  env: Env,
  alert: Alert,
  onRevalidateError: (error: unknown) => void = () => {},
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
  const orderSync = new OrderSyncService(db, getorio, alert);

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
    checkout: new CheckoutService(db, catalog, queue),
    revalidator,
    previewSecret: env.SESSION_SECRET,
    webhookSecret: env.GETORIO_WEBHOOK_SECRET,
    corsOrigins: env.CORS_ORIGINS,
    secureCookies: env.NODE_ENV === 'production',
  };

  return {
    deps,
    queue,
    queueConnection,
    queuePrefix: env.QUEUE_PREFIX,
    orderSync,
    async close() {
      await queue.close();
      await db.$disconnect();
      redis.disconnect();
    },
  };
}
