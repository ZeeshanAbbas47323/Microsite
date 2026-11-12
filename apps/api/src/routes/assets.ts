import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { MAX_IMAGE_BYTES } from '../assets/asset-service';
import { authOf, requireAuth } from '../auth/plugin';
import { AppError } from '../lib/errors';

function service(deps: AppDeps) {
  if (!deps.assets)
    throw new AppError(503, 'service_unavailable', 'Image uploads are not configured');
  return deps.assets;
}

/** Merchant image uploads (FR-6.8) and the public media endpoint the web app serves `/media/*` from. */
export async function assetRoutes(app: FastifyInstance, deps: AppDeps) {
  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth);

    authed.post(
      '/stores/:id/assets',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const { id } = z.object({ id: z.uuid() }).parse(request.params);
        const { purpose } = z
          .object({ purpose: z.enum(['logo', 'image']).default('image') })
          .parse(request.query);
        if (!request.isMultipart())
          throw new AppError(
            400,
            'bad_request',
            'Send the image as multipart/form-data (field "file")',
          );
        const file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 } });
        if (!file) throw new AppError(400, 'bad_request', 'No file was sent');
        const buffer = await file.toBuffer().catch(() => {
          throw new AppError(400, 'validation_error', 'The file is too large (max 5 MB)');
        });
        const asset = await service(deps).upload(authOf(request), id, buffer, purpose);
        return reply.status(201).send({ asset });
      },
    );

    authed.get('/stores/:id/assets', async (request) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      return service(deps).list(authOf(request).getorioTenantId, id);
    });

    authed.delete('/stores/:id/assets/:aid', async (request, reply) => {
      const { id, aid } = z.object({ id: z.uuid(), aid: z.uuid() }).parse(request.params);
      await service(deps).remove(authOf(request).getorioTenantId, id, aid);
      return reply.status(204).send();
    });
  });

  app.get(
    '/public/media/*',
    { config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const key = (request.params as { '*': string })['*'];
      const object = await service(deps).read(key);
      if (!object) throw new AppError(404, 'not_found', 'Not found');
      return reply
        .header('content-type', object.contentType)
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(object.body));
    },
  );
}
