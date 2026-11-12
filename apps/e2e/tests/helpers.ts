import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

/** Signs a dashboard sign-in token the way Getorio would (dev HS256 secret from .env). */
export async function ssoUrl(tenantId: string, userId = 'e2e-owner') {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) throw new Error('SSO_SHARED_SECRET must be set (see .env.example)');
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    getorioUserId: userId,
    getorioTenantId: tenantId,
    role: 'owner',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(secret));
  return `/sso?token=${token}`;
}

/** Storefront origin for a subdomain, on the same port as the dashboard. */
export function storeOrigin(baseURL: string, subdomain: string) {
  const url = new URL(baseURL);
  return `${url.protocol}//${subdomain}.${process.env.ROOT_DOMAIN ?? 'microstore.localhost'}${url.port ? `:${url.port}` : ''}`;
}
