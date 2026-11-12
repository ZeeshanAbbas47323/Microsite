import * as Sentry from '@sentry/node';
import type { FastifyInstance } from 'fastify';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Metrics (requirements §9.6): request latency, order sync outcomes, queue depth.
 * AI token usage is added with the command box (Phase 2).
 */
export class Metrics {
  readonly registry = new Registry();
  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.8, 1, 2, 5],
    registers: [this.registry],
  });
  readonly orderSync = new Counter({
    name: 'order_sync_total',
    help: 'Order sync attempts by outcome',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });
  readonly ordersPlaced = new Counter({
    name: 'orders_placed_total',
    help: 'Orders created at checkout',
    registers: [this.registry],
  });

  constructor(queueDepth?: () => Promise<Record<string, number>>) {
    collectDefaultMetrics({ register: this.registry, prefix: 'microstore_' });
    if (queueDepth) {
      new Gauge({
        name: 'order_sync_queue_jobs',
        help: 'Order sync jobs by state',
        labelNames: ['state'] as const,
        registers: [this.registry],
        async collect() {
          const counts = await queueDepth().catch(() => ({}) as Record<string, number>);
          for (const [state, n] of Object.entries(counts)) this.set({ state }, n);
        },
      });
    }
  }
}

/** Records request latency and serves `/metrics` (bearer token required). */
export function registerMetrics(app: FastifyInstance, metrics: Metrics, token: string | undefined) {
  app.addHook('onResponse', async (request, reply) => {
    metrics.httpDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unknown',
        status: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });
  app.get('/metrics', async (request, reply) => {
    if (!token || request.headers.authorization !== `Bearer ${token}`) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } });
    }
    return reply
      .header('content-type', metrics.registry.contentType)
      .send(await metrics.registry.metrics());
  });
}

/** Error tracking; a no-op unless SENTRY_DSN is set. */
export function initSentry(dsn: string | undefined, environment: string, service: string) {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment,
    serverName: service,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  return true;
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (Sentry.getClient()) Sentry.captureException(error, context ? { extra: context } : undefined);
}
