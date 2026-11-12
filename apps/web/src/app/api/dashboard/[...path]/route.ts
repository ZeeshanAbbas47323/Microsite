import { dashboardHosts, serverEnv } from '@/lib/env';

/**
 * Backend-for-frontend for the merchant dashboard: the browser talks only to this origin and the
 * session cookie lives here (HTTP-only). Requests are forwarded to the API with the cookie and CSRF
 * header; Set-Cookie (sign-in, rotation, logout) is passed back.
 */
const ALLOWED = /^(auth\/(sso|session|logout)|layouts|subdomains\/check|stores(\/.*)?)$/;
const FORWARD_HEADERS = ['cookie', 'content-type', 'x-csrf-token', 'accept'];

async function forward(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  if (!dashboardHosts.includes(host))
    return Response.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });

  const path = (await params).path.map(encodeURIComponent).join('/');
  if (!ALLOWED.test(path))
    return Response.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });

  const url = new URL(request.url);
  const target = `${serverEnv.apiUrl}/api/v1/${path}${url.search}`;
  const headers = new Headers();
  for (const h of FORWARD_HEADERS) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);

  let res: Response;
  try {
    res = await fetch(target, {
      method: request.method,
      headers,
      // Raw bytes, so multipart image uploads pass through untouched.
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json(
      {
        error: { code: 'service_unavailable', message: 'The server is not reachable. Try again.' },
      },
      { status: 503 },
    );
  }

  const out = new Headers({ 'cache-control': 'no-store' });
  const type = res.headers.get('content-type');
  if (type) out.set('content-type', type);
  for (const cookie of res.headers.getSetCookie()) out.append('set-cookie', cookie);
  return new Response(res.status === 204 ? null : await res.arrayBuffer(), {
    status: res.status,
    headers: out,
  });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
