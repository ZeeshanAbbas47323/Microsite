import { LAYOUTS } from '@microstore/layouts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOf, requireAuth } from '../auth/plugin';
import { storeSettingsPatchSchema } from '../stores/settings';
import type { AppDeps } from '../app';

const storeParams = z.object({ id: z.uuid() });
const versionParams = z.object({ id: z.uuid(), vid: z.uuid() });

export async function storeRoutes(app: FastifyInstance, { stores }: AppDeps) {
  app.get('/layouts', async () => ({
    layouts: LAYOUTS.map(({ id, name, description, thumbnail }) => ({
      id,
      name,
      description,
      thumbnail,
    })),
  }));

  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth);

    authed.get('/subdomains/check', async (request) => {
      const { name } = z.object({ name: z.string().max(100) }).parse(request.query);
      return stores.checkSubdomain(name);
    });

    authed.get('/stores/me', async (request) => ({
      store: await stores.findForTenant(authOf(request).getorioTenantId),
    }));

    authed.post('/stores', async (request, reply) => {
      const store = await stores.create(authOf(request), request.body);
      return reply.status(201).send({ store });
    });

    authed.get('/stores/:id', async (request) => {
      const { id } = storeParams.parse(request.params);
      return { store: await stores.get(authOf(request).getorioTenantId, id) };
    });

    authed.patch('/stores/:id/settings', async (request) => {
      const { id } = storeParams.parse(request.params);
      const patch = storeSettingsPatchSchema.parse(request.body);
      return { store: await stores.updateSettings(authOf(request), id, patch) };
    });

    authed.get('/stores/:id/config/draft', async (request) => {
      const { id } = storeParams.parse(request.params);
      return stores.getDraft(authOf(request).getorioTenantId, id);
    });

    authed.put('/stores/:id/config/draft', async (request) => {
      const { id } = storeParams.parse(request.params);
      const { config } = z.object({ config: z.unknown() }).parse(request.body);
      return stores.saveDraft(authOf(request), id, config);
    });

    authed.patch('/stores/:id/config/draft', async (request) => {
      const { id } = storeParams.parse(request.params);
      const { patch } = z.object({ patch: z.array(z.unknown()) }).parse(request.body);
      return stores.patchDraft(authOf(request), id, patch);
    });

    authed.post('/stores/:id/publish', async (request) => {
      const { id } = storeParams.parse(request.params);
      return { store: await stores.publish(authOf(request), id) };
    });

    authed.post('/stores/:id/unpublish', async (request) => {
      const { id } = storeParams.parse(request.params);
      return { store: await stores.unpublish(authOf(request), id) };
    });

    authed.get('/stores/:id/versions', async (request) => {
      const { id } = storeParams.parse(request.params);
      return { versions: await stores.listVersions(authOf(request).getorioTenantId, id) };
    });

    authed.post('/stores/:id/versions/:vid/restore', async (request) => {
      const { id, vid } = versionParams.parse(request.params);
      return stores.restoreVersion(authOf(request), id, vid);
    });
  });
}
