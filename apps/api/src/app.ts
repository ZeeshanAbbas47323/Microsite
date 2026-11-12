import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { GetorioClient } from '@microstore/getorio-client';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Redis } from 'ioredis';
import { authPlugin } from './auth/plugin';
import type { SessionManager } from './auth/sessions';
import type { AuthProvider } from './auth/sso';
import type { CatalogService } from './catalog/catalog-service';
import type { MerchantProductService } from './catalog/merchant-products';
import type { Db } from './db';
import type { KeyValueCache } from './lib/cache';
import { errorHandler } from './lib/errors';
import { randomToken } from './lib/ids';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { merchantCommerceRoutes } from './routes/merchant-commerce';
import { publicRoutes } from './routes/public';
import { storeRoutes } from './routes/stores';
import { webhookRoutes } from './routes/webhooks';
import type { CheckoutService } from './orders/checkout-service';
import type { MerchantOrderService } from './orders/merchant-orders';
import type { SiteRevalidator, StoreService } from './stores/store-service';

export interface AppDeps {
  db: Db;
  redis?: Redis;
  sessions: SessionManager;
  authProvider: AuthProvider;
  getorio: GetorioClient;
  stores: StoreService;
  cache: KeyValueCache;
  catalog: CatalogService;
  merchantProducts: MerchantProductService;
  merchantOrders: MerchantOrderService;
  checkout: CheckoutService;
  revalidator: SiteRevalidator;
  /** Signs draft preview links. */
  previewSecret: string;
  /** GETORIO_WEBHOOK_SECRET; the webhook route answers 503 without it. */
  webhookSecret?: string;
  corsOrigins: string[];
  secureCookies: boolean;
}

export const API_PREFIX = '/api/v1';

export async function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify({
    genReqId: () => randomToken(12),
    requestIdHeader: false,
    bodyLimit: 1024 * 1024,
    ...options,
    logger: options.logger ?? false,
  });

  app.setErrorHandler(errorHandler);

  // Same strict JSON parsing as Fastify's default (rejects __proto__/constructor poisoning), but an
  // empty body is accepted as "no body": many clients send the JSON content type on bodiless POSTs.
  const strictJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) =>
    body === '' ? done(null, undefined) : strictJson(request, body as string, done),
  );
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } }),
  );

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } } });
  await app.register(cors, {
    origin: deps.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key'],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    ...(deps.redis ? { redis: deps.redis, nameSpace: 'ms:rl:' } : {}),
  });
  await app.register(authPlugin, { sessions: deps.sessions, secureCookies: deps.secureCookies });

  await app.register(async (api) => healthRoutes(api, deps));
  await app.register(
    async (api) => {
      await authRoutes(api, deps);
      await storeRoutes(api, deps);
      await api.register(async (scope) => merchantCommerceRoutes(scope, deps));
      await api.register(async (scope) => publicRoutes(scope, deps));
      await api.register(async (scope) => webhookRoutes(scope, deps));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
