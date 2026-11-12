import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { upsertMerchant } from '../auth/merchants';
import { authOf, clearSessionCookie, requireAuth, setSessionCookie } from '../auth/plugin';
import { MAX_SSO_TOKEN_LIFETIME_SECONDS } from '../auth/sso';
import { AppError } from '../lib/errors';
import type { AppDeps } from '../app';

const ssoBody = z.object({ token: z.string().min(10).max(4096) });

function sessionView(session: {
  merchantId: string;
  getorioTenantId: string;
  role: string;
  csrfToken: string;
  expiresAt: number;
}) {
  return {
    merchant: { id: session.merchantId, tenantId: session.getorioTenantId, role: session.role },
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}

export async function authRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post(
    '/auth/sso',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { token } = ssoBody.parse(request.body);
      const claims = await deps.authProvider.verify(token);
      if (
        claims.jti &&
        !(await deps.sessions.consumeOnce(`sso:${claims.jti}`, MAX_SSO_TOKEN_LIFETIME_SECONDS * 2))
      ) {
        throw new AppError(401, 'unauthorized', 'This sign-in link was already used');
      }
      const merchant = await upsertMerchant(deps.db, claims);
      if (request.auth) await deps.sessions.destroy(request.auth.id);
      const session = await deps.sessions.create({
        merchantId: merchant.id,
        getorioUserId: claims.getorioUserId,
        getorioTenantId: claims.getorioTenantId,
        role: claims.role,
      });
      setSessionCookie(reply, session, deps.secureCookies);
      return sessionView(session);
    },
  );

  app.get('/auth/session', { preHandler: requireAuth }, async (request) =>
    sessionView(authOf(request)),
  );

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await deps.sessions.destroy(authOf(request).id);
    clearSessionCookie(reply, deps.secureCookies);
    return reply.status(204).send();
  });
}
