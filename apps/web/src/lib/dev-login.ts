import { createHmac, randomUUID } from 'node:crypto';

/**
 * Local development only: one-click sign-in as a demo account, so nobody has to run
 * `dev:sso-link` by hand. Needs `DEV_DEMO_LOGIN=true` and the HS256 `SSO_SHARED_SECRET`
 * (production uses RS256 and the API refuses HS256 there), and only answers on localhost hosts.
 */
export const DEMO_ACCOUNTS = {
  merchant: { getorioTenantId: 'tenant-demo', getorioUserId: 'demo-owner', role: 'owner' },
  admin: { getorioTenantId: 'getorio-ops', getorioUserId: 'ops-1', role: 'platform_admin' },
} as const;
export type DemoAccount = keyof typeof DEMO_ACCOUNTS;

export function devLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEV_DEMO_LOGIN === 'true' && Boolean(env.SSO_SHARED_SECRET);
}

/** `localhost`, `127.0.0.1` or any `*.localhost` name, with or without a port. */
export function isLocalHost(host: string | null): boolean {
  const name = (host ?? '').toLowerCase().replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1' || name.endsWith('.localhost');
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** HS256 SSO token in the same shape Getorio issues (60 s, single use). */
export function signDemoSsoToken(account: DemoAccount, secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      ...DEMO_ACCOUNTS[account],
      jti: randomUUID(),
      iat,
      exp: iat + 60,
      ...(process.env.SSO_ISSUER ? { iss: process.env.SSO_ISSUER } : {}),
      ...(process.env.SSO_AUDIENCE ? { aud: process.env.SSO_AUDIENCE } : {}),
    }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
