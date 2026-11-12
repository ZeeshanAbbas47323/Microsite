import { NextResponse, type NextRequest } from 'next/server';
import { dashboardHosts } from './lib/env';

/**
 * Tenant routing (requirements §2.2). The dashboard host serves the app as-is; every other host is
 * a storefront and is rewritten to `/s/<host>/...` (or `/p/<host>/<token>/...` for draft previews).
 * Which store a host belongs to is decided by the API from the `domains` table.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');

  if (!/^[a-z0-9.-]{1,253}$/.test(host)) return new NextResponse('Bad host', { status: 400 });
  // Route handlers work out the store from the Host header themselves.
  if (path.startsWith('/api/')) return NextResponse.next();

  if (dashboardHosts.includes(host)) {
    // Internal storefront paths are never reachable directly.
    if (path === '/s' || path.startsWith('/s/') || path === '/p' || path.startsWith('/p/')) {
      return NextResponse.rewrite(new URL('/not-found-page', request.url));
    }
    return NextResponse.next();
  }

  const target = url.clone();
  const rest = path === '/' ? '' : path;
  const preview = url.searchParams.get('preview');
  if (preview && /^[A-Za-z0-9._-]{10,300}$/.test(preview)) {
    target.pathname = `/p/${host}/${encodeURIComponent(preview)}${rest}`;
    target.searchParams.delete('preview');
    const res = NextResponse.rewrite(target);
    // Drafts are shown inside the dashboard's iframe and must never be cached or indexed.
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }
  target.pathname = `/s/${host}${rest}`;
  const res = NextResponse.rewrite(target);
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
}

export const config = {
  // Everything except Next internals and static files (sitemap.xml and robots.txt are handled).
  matcher: [
    '/((?!_next/|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?)$).*)',
  ],
};
