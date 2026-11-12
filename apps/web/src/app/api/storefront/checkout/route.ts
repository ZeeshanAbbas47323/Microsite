import { serverEnv } from '@/lib/env';

/**
 * Same-origin checkout endpoint for storefronts. Forwards to the API with the store host and the
 * customer's IP (for rate limiting); the API key-less public API is never called from the browser.
 */
export async function POST(request: Request) {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const body = await request.text();
  if (body.length > 64 * 1024) {
    return Response.json(
      { error: { code: 'bad_request', message: 'Request too large' } },
      { status: 413 },
    );
  }
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/public/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-store-host': host,
        'idempotency-key': request.headers.get('idempotency-key') ?? '',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'service_unavailable',
          message: 'Checkout is temporarily unavailable. Please try again.',
        },
      },
      { status: 503 },
    );
  }
}
