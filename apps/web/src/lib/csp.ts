import { dashboardHosts, serverEnv } from './env';

/**
 * Content-Security-Policy for every page (requirements §9.1). Merchant content is never rendered as
 * raw HTML, so 'unsafe-inline' is limited to Next.js' own inline bootstrapping; a nonce-based
 * policy would force dynamic rendering and lose the ISR cache. Dev adds what hot reload needs.
 */
export function contentSecurityPolicy({
  frameAncestors,
}: {
  frameAncestors: 'self' | 'dashboard';
}): string {
  const dev = process.env.NODE_ENV !== 'production';
  const root = serverEnv.rootDomain;
  const ancestors =
    frameAncestors === 'dashboard'
      ? ["'self'", ...dashboardHosts.flatMap((h) => [`https://${h}`, `http://${h}:*`])]
      : ["'self'"];
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    // The dashboard embeds the store preview; Turnstile renders in an iframe.
    `frame-src 'self' https://challenges.cloudflare.com https://*.${root} http://*.${root}:*`,
    `frame-ancestors ${ancestors.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
