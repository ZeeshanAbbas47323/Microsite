import { serverEnv } from '@/lib/env';

/** Storefront analytics beacon (Phase 3); see ../checkout/route.ts. Always answers 204. */
export async function POST(request: Request) {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  const body = await request.text();
  if (body.length > 256) return new Response(null, { status: 204 });
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  try {
    await fetch(`${serverEnv.apiUrl}/api/v1/public/visits`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-store-host': host,
        'user-agent': request.headers.get('user-agent') ?? '',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // analytics must never break the storefront
  }
  return new Response(null, { status: 204 });
}
