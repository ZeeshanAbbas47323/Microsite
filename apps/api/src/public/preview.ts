import { createHmac, timingSafeEqual } from 'node:crypto';

/** FR-4.5: signed, expiring token that lets the merchant view the draft on the real storefront. */
export const PREVIEW_TTL_MS = 60 * 60 * 1000;

function sign(secret: string, storeId: string, exp: number) {
  return createHmac('sha256', secret).update(`preview.${storeId}.${exp}`).digest('base64url');
}

export function createPreviewToken(secret: string, storeId: string, now = Date.now()) {
  const exp = now + PREVIEW_TTL_MS;
  return {
    token: `${storeId}.${exp}.${sign(secret, storeId, exp)}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/** True when `token` is a valid, unexpired preview token for `storeId`. */
export function verifyPreviewToken(
  secret: string,
  storeId: string,
  token: string,
  now = Date.now(),
): boolean {
  const [id, expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (id !== storeId || !Number.isSafeInteger(exp) || exp <= now || !sig) return false;
  const expected = Buffer.from(sign(secret, storeId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
