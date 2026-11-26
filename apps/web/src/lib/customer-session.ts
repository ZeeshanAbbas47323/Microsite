import 'server-only';

/** httpOnly cookie on the store's own domain holding the customer session token. */
export const CUSTOMER_COOKIE = 'ms_customer';
export const CUSTOMER_COOKIE_MAX_AGE = 30 * 86_400;

export function storeHostOf(request: Request) {
  return (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
}

export function customerTokenOf(request: Request): string | undefined {
  const cookie = request.headers.get('cookie') ?? '';
  const match = new RegExp(`(?:^|;\\s*)${CUSTOMER_COOKIE}=([^;]+)`).exec(cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function customerCookie(token: string | null) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return token
    ? `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CUSTOMER_COOKIE_MAX_AGE}${secure}`
    : `${CUSTOMER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/**
 * Cross-site requests never carry the Lax cookie on POST, but we also refuse mutating requests
 * whose Origin is another site (defence in depth against CSRF).
 */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase().replace(/:\d+$/, '') === storeHostOf(request);
  } catch {
    return false;
  }
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}
