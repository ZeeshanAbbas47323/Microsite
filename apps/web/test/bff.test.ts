import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/app/api/dashboard/[...path]/route';

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => vi.unstubAllGlobals());

describe('dashboard BFF proxy', () => {
  it('forwards allowed paths with cookie and CSRF, and relays Set-Cookie', async () => {
    const fetchMock = vi.fn(async () => {
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('set-cookie', 'ms_session=abc; Path=/; HttpOnly; SameSite=Lax');
      return new Response('{"ok":true}', { status: 200, headers });
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost:3000/api/dashboard/stores/me?x=1', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        cookie: 'ms_session=old',
        'x-csrf-token': 't',
        'content-type': 'application/json',
        authorization: 'nope',
      },
      body: '{"a":1}',
    });
    const res = await POST(req, ctx(['stores', 'me']));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('ms_session=abc');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/v1/stores/me?x=1');
    const sent = init.headers as Headers;
    expect(sent.get('cookie')).toBe('ms_session=old');
    expect(sent.get('x-csrf-token')).toBe('t');
    expect(sent.get('authorization')).toBeNull();
    expect(init.body).toBe('{"a":1}');
  });

  it('refuses unknown paths and storefront hosts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const host = (h: string) =>
      new Request('http://x/api/dashboard/public/checkout', { headers: { host: h } });
    expect((await GET(host('localhost:3000'), ctx(['public', 'checkout']))).status).toBe(404);
    expect((await GET(host('localhost:3000'), ctx(['webhooks', 'getorio']))).status).toBe(404);
    expect((await GET(host('zara.microstore.localhost'), ctx(['stores', 'me']))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    const res = await GET(
      new Request('http://localhost/api/dashboard/layouts', { headers: { host: 'localhost' } }),
      ctx(['layouts']),
    );
    expect(res.status).toBe(503);
  });
});
