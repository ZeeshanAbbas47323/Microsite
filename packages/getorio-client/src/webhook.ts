import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Header carrying `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-getorio-signature';
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export const webhookEventSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal('product.updated'),
    tenantId: z.string().min(1).max(64),
    data: z.object({ productIds: z.array(z.string().min(1).max(64)).min(1).max(500) }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal('stock.updated'),
    tenantId: z.string().min(1).max(64),
    data: z.object({ productIds: z.array(z.string().min(1).max(64)).min(1).max(500) }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal('order.status_changed'),
    tenantId: z.string().min(1).max(64),
    data: z.object({ getorioOrderId: z.string().min(1).max(64) }),
  }),
]);
export type GetorioWebhookEvent = z.infer<typeof webhookEventSchema>;

export function signWebhookPayload(rawBody: string, secret: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export type WebhookVerification =
  | { ok: true; event: GetorioWebhookEvent }
  | {
      ok: false;
      reason:
        'missing_signature' | 'malformed_signature' | 'stale' | 'bad_signature' | 'invalid_payload';
    };

/**
 * Verifies the HMAC signature over the **raw** request body (before JSON parsing), rejects
 * timestamps outside the tolerance window (replay protection), then validates the event shape.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  { nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS } = {},
): WebhookVerification {
  if (!secret) throw new Error('GETORIO_WEBHOOK_SECRET is required');
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!Number.isInteger(timestamp) || !provided || !/^[0-9a-f]{64}$/.test(provided)) {
    return { ok: false, reason: 'malformed_signature' };
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return { ok: false, reason: 'stale' };

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(provided, 'hex')))
    return { ok: false, reason: 'bad_signature' };

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
  const parsed = webhookEventSchema.safeParse(json);
  return parsed.success
    ? { ok: true, event: parsed.data }
    : { ok: false, reason: 'invalid_payload' };
}
