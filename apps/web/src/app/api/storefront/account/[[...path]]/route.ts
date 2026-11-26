import { serverEnv } from '@/lib/env';
import {
  customerCookie,
  customerTokenOf,
  jsonError,
  sameOrigin,
  storeHostOf,
} from '@/lib/customer-session';

const ALLOWED = /^(|register|login|logout|password|orders|addresses|addresses\/[0-9a-f-]{36})$/;

/**
 * Same-origin customer account endpoint for storefronts. Forwards to the public account API with
 * the session token from the httpOnly cookie; the token itself never reaches page scripts.
 */
async function forward(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = ((await params).path ?? []).join('/');
  if (!ALLOWED.test(path)) return jsonError(404, 'not_found', 'Not found');
  if (request.method !== 'GET' && !sameOrigin(request))
    return jsonError(403, 'forbidden', 'Cross-site request blocked');
  const body =
    request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.text();
  if (body && body.length > 16 * 1024) return jsonError(413, 'bad_request', 'Request too large');

  const token = customerTokenOf(request);
  const url = new URL(`${serverEnv.apiUrl}/api/v1/public/account${path ? `/${path}` : ''}`);
  const page = new URL(request.url).searchParams.get('page');
  if (page) url.searchParams.set('page', page);
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  let res: Response;
  try {
    res = await fetch(url, {
      method: request.method,
      headers: {
        'x-store-host': storeHostOf(request),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'x-customer-token': token } : {}),
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return jsonError(
      503,
      'service_unavailable',
      'Your account is temporarily unavailable. Please try again.',
    );
  }

  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  if (path === 'logout') {
    headers.append('set-cookie', customerCookie(null));
    return new Response(null, { status: 204, headers });
  }
  if (res.status === 401 && token) headers.append('set-cookie', customerCookie(null));
  if (res.status === 204) return new Response(null, { status: 204, headers });
  const text = await res.text();
  if ((path === 'login' || path === 'register') && res.ok) {
    const data = JSON.parse(text) as { token: string; customer: unknown };
    headers.append('set-cookie', customerCookie(data.token));
    return new Response(JSON.stringify({ customer: data.customer }), {
      status: res.status,
      headers,
    });
  }
  return new Response(text, { status: res.status, headers });
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
