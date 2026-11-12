import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { storeTag } from '@/storefront/api';

const body = z.object({
  hostnames: z
    .array(z.string().regex(/^[a-z0-9.-]{1,253}$/))
    .min(1)
    .max(20),
});

function authorized(header: string | null) {
  const secret = serverEnv.revalidateSecret;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called by the API on publish, settings and product changes to refresh cached storefront pages. */
export async function POST(request: Request) {
  if (!authorized(request.headers.get('x-revalidate-secret'))) {
    return Response.json(
      { error: { code: 'unauthorized', message: 'Invalid secret' } },
      { status: 401 },
    );
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: { code: 'bad_request', message: 'Invalid body' } },
      { status: 400 },
    );
  for (const host of parsed.data.hostnames) revalidateTag(storeTag(host), { expire: 0 });
  return Response.json({ revalidated: parsed.data.hostnames });
}
