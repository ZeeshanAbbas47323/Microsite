import { serverEnv } from '@/lib/env';

/**
 * Uploaded images (`/media/stores/<store>/<id>.webp`), served on every host so stores can use
 * relative URLs. Bytes come from the API's public media endpoint; responses are immutable.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.map(encodeURIComponent).join('/');
  try {
    const res = await fetch(`${serverEnv.apiUrl}/api/v1/public/media/${key}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      return new Response('Not found', {
        status: 404,
        headers: { 'cache-control': 'public, max-age=60' },
      });
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
}
