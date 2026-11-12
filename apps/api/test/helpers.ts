import {
  InMemoryGetorioClient,
  createSampleCatalog,
  SAMPLE_TENANT_ID,
} from '@microstore/getorio-client';
import { SignJWT } from 'jose';
import { config } from 'dotenv';
import { buildApp } from '../src/app';
import { CSRF_HEADER, SESSION_COOKIE } from '../src/auth/plugin';
import { MemorySessionStore, SessionManager } from '../src/auth/sessions';
import { JwtSsoProvider, type Role } from '../src/auth/sso';
import { createDb, type Db } from '../src/db';
import { AssetService } from '../src/assets/asset-service';
import { MemoryStorage } from '../src/assets/storage';
import { CatalogService } from '../src/catalog/catalog-service';
import { MerchantProductService } from '../src/catalog/merchant-products';
import { MemoryCache } from '../src/lib/cache';
import { Metrics } from '../src/lib/observability';
import { CheckoutService } from '../src/orders/checkout-service';
import { MerchantOrderService } from '../src/orders/merchant-orders';
import { InlineOrderSyncQueue, OrderSyncService } from '../src/orders/order-sync';
import { StoreService, type SiteRevalidator } from '../src/stores/store-service';

config({ path: '../../.env', quiet: true });

export const SSO_SECRET = 'test-sso-secret-0123456789abcdef0123456789';
export const ROOT_DOMAIN = 'shops.test';

let db: Db | undefined;
export function testDb(): Db {
  db ??= createDb(process.env.DATABASE_URL_TEST as string);
  return db;
}

const TABLES = [
  'order_items',
  'orders',
  'audit_logs',
  'command_logs',
  'store_products',
  'assets',
  'site_versions',
  'domains',
  'stores',
  'merchants',
];

export async function resetDb() {
  const d = testDb();
  for (const table of TABLES) await d.$executeRawUnsafe(`DELETE FROM \`${table}\``);
}

export const PREVIEW_SECRET = 'preview-secret-0123456789abcdef0123456789';
export const METRICS_TOKEN = 'metrics-token-0123456789abcdef';
export const WEBHOOK_SECRET = 'whsec_test_0123456789abcdef';

export async function createTestApp(
  options: { now?: () => number; tenantCatalog?: string[]; storageQuota?: number } = {},
) {
  const d = testDb();
  const revalidated: { storeId: string; hostnames: string[] }[] = [];
  const revalidator: SiteRevalidator = {
    revalidateStore: async (storeId, hostnames) => {
      revalidated.push({ storeId, hostnames });
    },
  };
  // Every tenant used in tests gets its own copy of the sample catalog.
  const tenants = options.tenantCatalog ?? [SAMPLE_TENANT_ID, 'tenant-a', 'tenant-b'];
  const getorio = new InMemoryGetorioClient({
    catalog: Object.fromEntries(tenants.map((t) => [t, createSampleCatalog()])),
  });
  const alerts: { message: string; meta: Record<string, unknown> }[] = [];
  const cache = new MemoryCache(options.now);
  const stores = new StoreService(d, {
    rootDomain: ROOT_DOMAIN,
    storefrontUrlTemplate: 'https://{host}',
    revalidator,
  });
  const catalog = new CatalogService(getorio, cache, options.now);
  const metrics = new Metrics();
  const orderSync = new OrderSyncService(
    d,
    getorio,
    (message, meta) => alerts.push({ message, meta }),
    undefined,
    (outcome) => metrics.orderSync.inc({ outcome }),
  );
  const queue = new InlineOrderSyncQueue(() => orderSync);
  const storage = new MemoryStorage();
  const assets = new AssetService(d, storage, stores, options.storageQuota);
  const app = await buildApp({
    db: d,
    sessions: new SessionManager(new MemorySessionStore(options.now), options.now),
    authProvider: new JwtSsoProvider({ sharedSecret: SSO_SECRET }),
    getorio,
    stores,
    cache,
    catalog,
    merchantProducts: new MerchantProductService(d, getorio, stores, catalog, revalidator),
    merchantOrders: new MerchantOrderService(
      d,
      stores,
      orderSync,
      queue,
      'https://app.getorio.test/orders/{id}',
    ),
    checkout: new CheckoutService(d, catalog, queue, {
      onOrderPlaced: () => metrics.ordersPlaced.inc(),
    }),
    revalidator,
    assets,
    previewSecret: PREVIEW_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    corsOrigins: ['http://localhost:3000'],
    secureCookies: false,
    metrics,
    metricsToken: METRICS_TOKEN,
  });
  return { app, getorio, revalidated, queue, orderSync, catalog, alerts, storage, metrics };
}

export interface TokenClaims {
  getorioUserId?: string;
  getorioTenantId?: string;
  role?: Role;
  jti?: string;
  expiresInSeconds?: number;
  secret?: string;
  alg?: string;
}

export async function ssoToken(claims: TokenClaims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({
    getorioUserId: claims.getorioUserId ?? 'user-1',
    getorioTenantId: claims.getorioTenantId ?? 'tenant-a',
    role: claims.role ?? 'owner',
    ...(claims.jti ? { jti: claims.jti } : {}),
  })
    .setProtectedHeader({ alg: claims.alg ?? 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.expiresInSeconds ?? 30));
  return jwt.sign(new TextEncoder().encode(claims.secret ?? SSO_SECRET));
}

export interface Login {
  cookie: string;
  csrf: string;
  headers: Record<string, string>;
}

type App = Awaited<ReturnType<typeof createTestApp>>['app'];

export async function login(app: App, claims: TokenClaims = {}): Promise<Login> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sso',
    payload: { token: await ssoToken(claims) },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('no session cookie');
  const csrf = (res.json() as { csrfToken: string }).csrfToken;
  return {
    cookie: cookie.value,
    csrf,
    headers: { cookie: `${SESSION_COOKIE}=${cookie.value}`, [CSRF_HEADER]: csrf },
  };
}

export function onboarding(overrides: Record<string, unknown> = {}) {
  return {
    business: {
      name: 'Zara Crafts',
      tagline: 'Handmade with love',
      description: '',
      category: 'handmade',
    },
    branding: {
      logoUrl: '',
      primaryColor: '#7c3aed',
      secondaryColor: '#f59e0b',
      fontFamily: 'Poppins',
    },
    contact: {
      phone: '03001234567',
      whatsapp: '',
      email: '',
      address: '',
      city: 'Lahore',
      social: { facebook: '', instagram: '', tiktok: '' },
    },
    pages: { about: true, contact: true, custom: null },
    layoutId: 'bold-01',
    subdomain: 'zara',
    ...overrides,
  };
}

export async function createStore(app: App, auth: Login, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/stores',
    headers: auth.headers,
    payload: onboarding(overrides),
  });
  if (res.statusCode !== 201) throw new Error(`create store failed: ${res.statusCode} ${res.body}`);
  return (res.json() as { store: { id: string } }).store;
}

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Signs in as `tenantId`, creates a store and publishes it. */
export async function publishedStore(ctx: TestApp, tenantId = 'tenant-demo', subdomain = 'zara') {
  const auth = await login(ctx.app, {
    getorioTenantId: tenantId,
    getorioUserId: `owner-${tenantId}`,
  });
  const store = await createStore(ctx.app, auth, { subdomain });
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/v1/stores/${store.id}/publish`,
    headers: auth.headers,
  });
  if (res.statusCode !== 200) throw new Error(`publish failed: ${res.body}`);
  return { auth, store, host: `${subdomain}.${ROOT_DOMAIN}` };
}
