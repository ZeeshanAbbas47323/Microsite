import 'server-only';
import { storefrontUrl } from '@/lib/env';
import { getProducts, getStore, StorefrontApiError } from './api';

type Ctx = { params: Promise<{ host: string }> };

async function storeOr404(host: string) {
  try {
    return await getStore({ host });
  } catch (error) {
    if (error instanceof StorefrontApiError && [404, 503].includes(error.status)) return null;
    throw error;
  }
}

/** `sitemap.xml` for one published store (FR-4.3). */
export async function sitemap(_req: Request, { params }: Ctx) {
  const host = decodeURIComponent((await params).host).toLowerCase();
  const data = await storeOr404(host);
  if (!data) return new Response('Not found', { status: 404 });
  const url = (path: string) => storefrontUrl(data.store.hostname, path);
  const urls = data.config.pages.map((p) => url(p.slug === 'home' ? '/' : `/${p.slug}`));
  for (let page = 1; page <= 20; page++) {
    const res = await getProducts({ host }, { page, pageSize: 48 });
    urls.push(...res.items.map((p) => url(`/products/${encodeURIComponent(p.id)}`)));
    if (page * 48 >= res.total) break;
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

export async function robots(_req: Request, { params }: Ctx) {
  const host = decodeURIComponent((await params).host).toLowerCase();
  const data = await storeOr404(host);
  const body = data
    ? `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\n\nSitemap: ${storefrontUrl(data.store.hostname, '/sitemap.xml')}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
