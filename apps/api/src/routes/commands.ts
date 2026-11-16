import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { authOf, requireAuth } from '../auth/plugin';

const storeParams = z.object({ id: z.uuid() });
const commandParams = z.object({ id: z.uuid(), cid: z.uuid() });

/** Command box (FR-7): propose → apply / discard. */
export async function commandRoutes(app: FastifyInstance, { commands }: AppDeps) {
  app.addHook('preHandler', requireAuth);

  app.get('/stores/:id/commands/usage', async (request) => {
    const { id } = storeParams.parse(request.params);
    return commands.usage(authOf(request).getorioTenantId, id);
  });

  app.post(
    '/stores/:id/commands',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { id } = storeParams.parse(request.params);
      const body = z
        .object({
          command: z.string().min(1).max(1000),
          language: z.enum(['en', 'ur']).default('en'),
        })
        .parse(request.body);
      return commands.propose(authOf(request), id, body.command, body.language);
    },
  );

  app.post('/stores/:id/commands/:cid/apply', async (request) => {
    const { id, cid } = commandParams.parse(request.params);
    return commands.apply(authOf(request), id, cid);
  });

  app.post('/stores/:id/commands/:cid/discard', async (request, reply) => {
    const { id, cid } = commandParams.parse(request.params);
    await commands.discard(authOf(request), id, cid);
    return reply.status(204).send();
  });
}
