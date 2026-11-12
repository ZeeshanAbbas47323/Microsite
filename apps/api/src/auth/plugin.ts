import type {} from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../lib/errors';
import type { Session, SessionManager } from './sessions';
import { SESSION_TTL_MS } from './sessions';
import type { Role } from './sso';

export const SESSION_COOKIE = 'ms_session';
export const CSRF_HEADER = 'x-csrf-token';

declare module 'fastify' {
  interface FastifyRequest {
    auth: Session | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function setSessionCookie(reply: FastifyReply, session: Session, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor((session.expiresAt - Date.now()) / 1000) || SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
}

/** Resolves the session cookie on every request into `request.auth`. */
export const authPlugin = fp(
  async (app: FastifyInstance, opts: { sessions: SessionManager; secureCookies: boolean }) => {
    app.decorateRequest('auth', null);
    app.addHook('onRequest', async (request, reply) => {
      const id = request.cookies[SESSION_COOKIE];
      if (!id) return;
      const loaded = await opts.sessions.load(id);
      if (!loaded) {
        clearSessionCookie(reply, opts.secureCookies);
        return;
      }
      request.auth = loaded.session;
      if (loaded.rotated) setSessionCookie(reply, loaded.session, opts.secureCookies);
    });
  },
  { name: 'auth' },
);

/** preHandler: requires a merchant session, plus a matching CSRF header on mutating requests. */
export async function requireAuth(request: FastifyRequest) {
  if (!request.auth) throw new AppError(401, 'unauthorized', 'Sign in required');
  if (
    !SAFE_METHODS.has(request.method) &&
    request.headers[CSRF_HEADER] !== request.auth.csrfToken
  ) {
    throw new AppError(403, 'csrf_failed', 'Missing or invalid CSRF token');
  }
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest) => {
    await requireAuth(request);
    if (!roles.includes((request.auth as Session).role))
      throw new AppError(403, 'forbidden', 'Not allowed');
  };
}

/** The authenticated session; only call after `requireAuth`. */
export function authOf(request: FastifyRequest): Session {
  if (!request.auth) throw new AppError(401, 'unauthorized', 'Sign in required');
  return request.auth;
}
