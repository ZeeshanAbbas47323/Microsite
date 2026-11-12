/**
 * Dev only: prints a dashboard sign-in link the way Getorio would create it (HS256 SSO JWT).
 *
 *   pnpm --filter @microstore/api dev:sso-link [tenantId] [userId] [role]
 */
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

const [tenantId = 'tenant-demo', userId = 'demo-owner', role = 'owner'] = process.argv.slice(2);
const secret = process.env.SSO_SHARED_SECRET;
const dashboard = (process.env.DASHBOARD_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

if (process.env.NODE_ENV === 'production')
  throw new Error('dev-sso-link must not run in production');
if (!secret) throw new Error('Set SSO_SHARED_SECRET in .env');
if (!['owner', 'staff', 'platform_admin'].includes(role)) throw new Error(`Unknown role "${role}"`);

const now = Math.floor(Date.now() / 1000);
const token = await new SignJWT({ getorioUserId: userId, getorioTenantId: tenantId, role })
  .setProtectedHeader({ alg: 'HS256' })
  .setJti(randomUUID())
  .setIssuedAt(now)
  .setExpirationTime(now + 60)
  .sign(new TextEncoder().encode(secret));

console.log(`${dashboard}/sso?token=${token}`);
console.log('(valid for 60 seconds, single use)');
