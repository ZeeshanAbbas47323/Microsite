import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export async function healthRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};
    try {
      await deps.db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }
    if (deps.redis) {
      try {
        await deps.redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'error';
      }
    }
    const ready = Object.values(checks).every((v) => v === 'ok');
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });
}
