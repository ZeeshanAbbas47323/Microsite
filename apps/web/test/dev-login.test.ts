import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { devLoginEnabled, isLocalHost, signDemoSsoToken } from '../src/lib/dev-login';

describe('dev demo login', () => {
  it('is off unless explicitly enabled with a shared secret', () => {
    expect(devLoginEnabled({})).toBe(false);
    expect(devLoginEnabled({ DEV_DEMO_LOGIN: 'true' })).toBe(false);
    expect(devLoginEnabled({ DEV_DEMO_LOGIN: '1', SSO_SHARED_SECRET: 's' })).toBe(false);
    expect(devLoginEnabled({ DEV_DEMO_LOGIN: 'true', SSO_SHARED_SECRET: 's' })).toBe(true);
  });

  it('only answers on local hosts', () => {
    for (const h of ['localhost', 'localhost:3001', '127.0.0.1:3000', 'app.microstore.localhost'])
      expect(isLocalHost(h), h).toBe(true);
    for (const h of ['app.getorio.com', 'localhost.evil.com', 'evil.com:3001', null])
      expect(isLocalHost(h), String(h)).toBe(false);
  });

  it('signs a short-lived HS256 token with the demo claims', () => {
    const now = Date.UTC(2026, 10, 17, 10, 0, 0);
    const token = signDemoSsoToken('admin', 'secret-0123456789', now);
    const [h, p, sig] = token.split('.') as [string, string, string];
    expect(createHmac('sha256', 'secret-0123456789').update(`${h}.${p}`).digest('base64url')).toBe(
      sig,
    );
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(payload).toMatchObject({
      getorioTenantId: 'getorio-ops',
      getorioUserId: 'ops-1',
      role: 'platform_admin',
      iat: now / 1000,
      exp: now / 1000 + 60,
    });
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });
});
