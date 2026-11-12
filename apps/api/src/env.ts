import { z } from 'zod';

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    ROOT_DOMAIN: z.string().min(1),
    /** Public storefront URL; `{host}` is the store hostname. Dev: `http://{host}:3000`. */
    STOREFRONT_URL_TEMPLATE: z.string().includes('{host}').default('https://{host}'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SSO_SHARED_SECRET: z.string().optional(),
    SSO_JWT_PUBLIC_KEY: z.string().optional(),
    SSO_ISSUER: z.string().optional(),
    SSO_AUDIENCE: z.string().optional(),
    /** Browser origins allowed to call the API with cookies (the dashboard). */
    CORS_ORIGINS: csv.default(['http://localhost:3000']),
    GETORIO_CLIENT: z.enum(['mock', 'http']).optional(),
    GETORIO_API_BASE_URL: z.string().optional(),
    GETORIO_API_KEY: z.string().optional(),
    GETORIO_WEBHOOK_SECRET: z.string().min(16).optional(),
    /** Link to an order inside Getorio, `{id}` = Getorio order id. */
    GETORIO_ORDER_URL_TEMPLATE: z.string().includes('{id}').optional(),
    /** Run the order-sync worker inside the API process (dev). In production run `worker.js` separately. */
    /** apps/web revalidation endpoint, e.g. http://localhost:3000/api/revalidate */
    WEB_REVALIDATE_URL: z.url().optional(),
    REVALIDATE_SECRET: z.string().min(16).optional(),
    /** Proxies whose X-Forwarded-For is trusted (comma-separated IPs/CIDRs, or "true"). */
    TRUST_PROXY: z.string().optional(),
    /** Redis key prefix for BullMQ queues (separate per environment when they share a Redis). */
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .default('microstore'),
    RUN_WORKER_IN_PROCESS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((e) => e.SSO_SHARED_SECRET || e.SSO_JWT_PUBLIC_KEY, {
    error: 'Set SSO_JWT_PUBLIC_KEY (RS256) or SSO_SHARED_SECRET (HS256)',
    path: ['SSO_SHARED_SECRET'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.SSO_JWT_PUBLIC_KEY, {
    error: 'Production requires SSO_JWT_PUBLIC_KEY (RS256)',
    path: ['SSO_JWT_PUBLIC_KEY'],
  })
  .refine((e) => !e.SSO_SHARED_SECRET || e.SSO_SHARED_SECRET.length >= 32, {
    error: 'SSO_SHARED_SECRET must be at least 32 characters',
    path: ['SSO_SHARED_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // `FOO=` in an env file means "not set", not "set to an empty string".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return parsed.data;
}
