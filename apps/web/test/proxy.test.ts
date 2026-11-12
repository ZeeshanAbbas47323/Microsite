import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../src/proxy';

function run(url: string) {
  const req = new NextRequest(url, { headers: { host: new URL(url).host } });
  const res = proxy(req);
  return { status: res.status, rewrite: res.headers.get('x-middleware-rewrite'), res };
}

describe('proxy (tenant routing)', () => {
  it('rewrites storefront hosts to /s/<host>', () => {
    expect(run('http://zara.microstore.localhost:3000/').rewrite).toBe(
      'http://zara.microstore.localhost:3000/s/zara.microstore.localhost',
    );
    expect(run('http://Zara.Microstore.localhost:3000/products/p-1?x=1').rewrite).toBe(
      'http://zara.microstore.localhost:3000/s/zara.microstore.localhost/products/p-1?x=1',
    );
  });

  it('routes preview links to the uncached preview tree', () => {
    const r = run('http://zara.microstore.localhost/about?preview=abc.123.sigsigsig');
    expect(r.rewrite).toBe(
      'http://zara.microstore.localhost/p/zara.microstore.localhost/abc.123.sigsigsig/about',
    );
    expect(r.res.headers.get('cache-control')).toBe('private, no-store');
    expect(r.res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('ignores malformed preview tokens', () => {
    expect(run('http://zara.microstore.localhost/?preview=<script>').rewrite).toBe(
      'http://zara.microstore.localhost/s/zara.microstore.localhost?preview=%3Cscript%3E',
    );
  });

  it('leaves the dashboard and API routes alone', () => {
    expect(run('http://localhost:3000/').rewrite).toBeNull();
    expect(run('http://zara.microstore.localhost/api/storefront/checkout').rewrite).toBeNull();
  });

  it('hides internal storefront paths on the dashboard host', () => {
    expect(run('http://localhost:3000/s/zara.microstore.localhost').rewrite).toBe(
      'http://localhost:3000/not-found-page',
    );
    expect(run('http://localhost:3000/p/x/y').rewrite).toBe('http://localhost:3000/not-found-page');
  });

  it('rejects invalid hosts', () => {
    const req = new NextRequest('http://zara.microstore.localhost/', {
      headers: { host: 'bad_host!' },
    });
    expect(proxy(req).status).toBe(400);
  });
});
