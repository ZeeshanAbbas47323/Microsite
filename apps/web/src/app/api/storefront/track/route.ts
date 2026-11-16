import { serverEnv } from '@/lib/env';

/** Same-origin order tracking endpoint for storefronts (FR-5.10); see ../checkout/route.ts. */
export async function POST(request: Request) {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const body = await request.text();
  if (body.length > 4 * 1024) {
    return Response.json(
      { error: { code: 'bad_request', message: 'Request too large' } },
      { status: 413 },
    );
  }
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/public/orders/track`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-store-host': host,
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
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
          message: 'Tracking is temporarily unavailable. Please try again.',
        },
      },
      { status: 503 },
    );
  }
}
