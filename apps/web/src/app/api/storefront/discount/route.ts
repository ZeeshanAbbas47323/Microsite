import { serverEnv } from '@/lib/env';
import { jsonError, sameOrigin, storeHostOf } from '@/lib/customer-session';

/** Same-origin "Apply discount code" for the checkout page; see ../checkout/route.ts. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, 'forbidden', 'Cross-site request blocked');
  const body = await request.text();
  if (body.length > 16 * 1024) return jsonError(413, 'bad_request', 'Request too large');
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/public/discounts/quote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-store-host': storeHostOf(request),
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
    return jsonError(503, 'service_unavailable', 'Could not check the code. Please try again.');
  }
}
