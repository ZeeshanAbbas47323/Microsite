import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../src/proxy';
import { clearStoreStatus } from '../src/storefront/availability';

let storeState: { status: string; name?: string } = { status: 'published', name: 'Zara' };
const fetchMock = vi.fn(async () => Response.json(storeState));

beforeEach(() => {
  storeState = { status: 'published', name: 'Zara' };
  clearStoreStatus();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function run(url: string) {
  const req = new NextRequest(url, { headers: { host: new URL(url).host } });
  const res = await proxy(req);
  return { status: res.status, rewrite: res.headers.get('x-middleware-rewrite'), res };
}

describe('proxy (tenant routing)', () => {
  it('rewrites storefront hosts to /s/<host>', async () => {
    expect((await run('http://zara.microstore.localhost:3000/')).rewrite).toBe(
      'http://zara.microstore.localhost:3000/s/zara.microstore.localhost',
    );
    expect((await run('http://Zara.Microstore.localhost:3000/products/p-1?x=1')).rewrite).toBe(
      'http://zara.microstore.localhost:3000/s/zara.microstore.localhost/products/p-1?x=1',
    );
  });

  it('routes preview links to the uncached preview tree without a status check', async () => {
    storeState = { status: 'unpublished', name: 'Zara' };
    const r = await run('http://zara.microstore.localhost/about?preview=abc.123.sigsigsig');
    expect(r.rewrite).toBe(
      'http://zara.microstore.localhost/p/zara.microstore.localhost/abc.123.sigsigsig/about',
    );
    expect(r.res.headers.get('cache-control')).toBe('private, no-store');
    expect(r.res.headers.get('x-robots-tag')).toBe('noindex');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores malformed preview tokens', async () => {
    expect((await run('http://zara.microstore.localhost/?preview=<script>')).rewrite).toBe(
      'http://zara.microstore.localhost/s/zara.microstore.localhost?preview=%3Cscript%3E',
    );
  });

  it('leaves the dashboard, API routes and media alone', async () => {
    expect((await run('http://localhost:3000/')).rewrite).toBeNull();
    expect(
      (await run('http://zara.microstore.localhost/api/storefront/checkout')).rewrite,
    ).toBeNull();
    expect(
      (await run('http://zara.microstore.localhost/media/stores/a/b.webp')).rewrite,
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides internal storefront paths on the dashboard host', async () => {
    expect((await run('http://localhost:3000/s/zara.microstore.localhost')).rewrite).toBe(
      'http://localhost:3000/not-found-page',
    );
    expect((await run('http://localhost:3000/p/x/y')).rewrite).toBe(
      'http://localhost:3000/not-found-page',
    );
  });

  it('rejects invalid hosts', async () => {
    const req = new NextRequest('http://zara.microstore.localhost/', {
      headers: { host: 'bad_host!' },
    });
    expect((await proxy(req)).status).toBe(400);
  });
});

describe('unavailable stores (FR-4.6)', () => {
  it.each([
    ['unpublished', 404, 'not open yet'],
    ['suspended', 503, 'temporarily unavailable'],
    ['not_found', 404, 'could not find a store'],
  ])('answers %s stores with %i', async (status, code, text) => {
    storeState = { status, ...(status === 'not_found' ? {} : { name: 'Zara <Crafts>' }) };
    const { res } = await run('http://zara.microstore.localhost/products');
    expect(res.status).toBe(code);
    const html = await res.text();
    expect(html).toContain(text);
    if (status !== 'not_found') expect(html).toContain('Zara &lt;Crafts&gt;');
    expect(html).not.toContain('<Crafts>');
    if (status === 'suspended') expect(res.headers.get('retry-after')).toBe('3600');
  });

  it('never caches unpublished stores, so publishing takes effect at once', async () => {
    storeState = { status: 'unpublished', name: 'Zara' };
    expect((await run('http://zara.microstore.localhost/')).status).toBe(404);
    storeState = { status: 'published', name: 'Zara' };
    expect((await run('http://zara.microstore.localhost/')).rewrite).toContain(
      '/s/zara.microstore.localhost',
    );
  });

  it('caches the status and fails open when the API is down', async () => {
    await run('http://zara.microstore.localhost/');
    await run('http://zara.microstore.localhost/products');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearStoreStatus();
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('down');
    });
    expect((await run('http://zara.microstore.localhost/')).rewrite).toContain(
      '/s/zara.microstore.localhost',
    );
  });
});

describe('Content-Security-Policy', () => {
  it('lets only the dashboard frame the draft preview', async () => {
    const live =
      (await run('http://zara.microstore.localhost/')).res.headers.get('content-security-policy') ??
      '';
    expect(live).toContain("frame-ancestors 'self'");
    expect(live).not.toContain('http://localhost:*');
    expect(live).toContain("object-src 'none'");
    const preview =
      (await run('http://zara.microstore.localhost/?preview=abc.123.sigsigsig')).res.headers.get(
        'content-security-policy',
      ) ?? '';
    expect(preview).toContain('frame-ancestors');
    expect(preview).toContain('http://localhost:*');
    const dashboard =
      (await run('http://localhost:3000/dashboard')).res.headers.get('content-security-policy') ??
      '';
    expect(dashboard).toContain('frame-src');
    expect(dashboard).toContain('.microstore.localhost');
  });
});
