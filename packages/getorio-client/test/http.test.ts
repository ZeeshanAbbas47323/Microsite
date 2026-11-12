import { describe, expect, it } from 'vitest';
import type { GetorioError } from '../src';
import {
  CircuitBreaker,
  createSampleCatalog,
  HttpGetorioClient,
  isGetorioError,
  signWebhookPayload,
  verifyWebhook,
  type HttpGetorioClientOptions,
} from '../src';
import { at, orderPayload } from './fixtures';

interface Captured {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | Error | ((signal: AbortSignal) => Promise<Response>);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(replies: Reply[], options: Partial<HttpGetorioClientOptions> = {}) {
  const requests: Captured[] = [];
  const sleeps: number[] = [];
  const queue = [...replies];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = queue.shift() ?? json(500, {});
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply(init?.signal as AbortSignal);
    return reply;
  }) as typeof fetch;
  const client = new HttpGetorioClient({
    baseUrl: 'https://getorio.test/api/',
    apiKey: 'secret-key',
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
    ...options,
  });
  return { client, requests, sleeps };
}

async function rejection(promise: Promise<unknown>): Promise<GetorioError> {
  try {
    await promise;
  } catch (error) {
    if (isGetorioError(error)) return error;
    throw error;
  }
  throw new Error('Expected a GetorioError');
}

const product = at(createSampleCatalog(), 0);

describe('HttpGetorioClient: requests', () => {
  it('lists products with auth, tenant and query params', async () => {
    const { client, requests } = setup([
      json(200, { items: [product], page: 1, pageSize: 20, total: 1 }),
    ]);
    const res = await client.listProducts('t1', {
      page: 1,
      pageSize: 20,
      search: 'bag',
      onlyMicrostore: true,
    });
    expect(res.items[0]?.id).toBe(product.id);
    const [req] = requests;
    expect(req?.url.pathname).toBe('/api/microstore/v1/products');
    expect(Object.fromEntries(at(requests, 0).url.searchParams)).toEqual({
      page: '1',
      pageSize: '20',
      search: 'bag',
      onlyMicrostore: 'true',
    });
    expect(req?.headers['X-Api-Key']).toBe('secret-key');
    expect(req?.headers['X-Getorio-Tenant']).toBe('t1');
  });

  it('validates the query before sending', async () => {
    const { client, requests } = setup([]);
    await expect(client.listProducts('t1', { page: 0, pageSize: 20 })).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });

  it('gets a product, escaping the id, and maps 404 to null', async () => {
    const { client, requests } = setup([json(200, product), json(404, {})]);
    expect((await client.getProduct('t1', 'a/b'))?.id).toBe(product.id);
    expect(requests[0]?.url.pathname).toBe('/api/microstore/v1/products/a%2Fb');
    expect(await client.getProduct('t1', 'missing')).toBeNull();
  });

  it('queries stock with de-duplicated ids and skips empty lookups', async () => {
    const { client, requests } = setup([json(200, { stock: { a: 1 } })]);
    expect(await client.getStock('t1', [])).toEqual({});
    expect(await client.getStock('t1', ['a', 'a', 'b'])).toEqual({ a: 1 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.body).toEqual({ ids: ['a', 'b'] });
  });

  it('creates orders with an idempotency key', async () => {
    const { client, requests } = setup([json(201, { getorioOrderId: 'GO-1' })]);
    expect(await client.createOrder('t1', orderPayload(), 'idem-1')).toEqual({
      getorioOrderId: 'GO-1',
    });
    expect(requests[0]?.headers['Idempotency-Key']).toBe('idem-1');
    expect(requests[0]?.headers['Content-Type']).toBe('application/json');
    expect(requests[0]?.body).toEqual(orderPayload());
  });

  it('reads order status and sets flags', async () => {
    const { client, requests } = setup([
      json(200, { getorioOrderId: 'GO-1', status: 'shipped', updatedAt: '2026-11-12T10:00:00Z' }),
      new Response(null, { status: 204 }),
    ]);
    expect((await client.getOrderStatus('t1', 'GO-1')).status).toBe('shipped');
    await client.setProductMicrostoreFlags('t1', 'p1', { visible: true, featured: false });
    expect(requests[1]?.method).toBe('PUT');
    expect(requests[1]?.url.pathname).toBe('/api/microstore/v1/products/p1/microstore-flags');
    expect(requests[1]?.body).toEqual({ visible: true, featured: false });
  });

  it('requires base url and api key', () => {
    expect(() => new HttpGetorioClient({ baseUrl: '', apiKey: 'k' })).toThrow();
    expect(() => new HttpGetorioClient({ baseUrl: 'https://x.test', apiKey: '' })).toThrow();
    expect(new HttpGetorioClient({ baseUrl: 'https://x.test', apiKey: 'k' })).toBeDefined();
  });
});

describe('HttpGetorioClient: errors', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'rejected'],
    [400, 'rejected'],
  ] as const)('maps %i to %s without retrying', async (status, kind) => {
    const { client, requests } = setup([json(status, {})]);
    const err = await rejection(client.getOrderStatus('t1', 'GO-1'));
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
    expect(err.retryable).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('rejects responses that break the contract', async () => {
    const { client } = setup([json(200, { items: 'nope' })]);
    expect((await rejection(client.listProducts('t1', { page: 1, pageSize: 1 }))).kind).toBe(
      'invalid_response',
    );
  });

  it('rejects non-JSON bodies', async () => {
    const { client } = setup([new Response('<html>', { status: 200 })]);
    expect((await rejection(client.getOrderStatus('t1', 'GO-1'))).kind).toBe('invalid_response');
  });

  it('does not leak the api key in error messages', async () => {
    const { client } = setup([json(500, {}), json(500, {}), json(500, {})]);
    const err = await rejection(client.getProduct('t1', 'p1'));
    expect(err.message).not.toContain('secret-key');
  });
});

describe('HttpGetorioClient: retries and timeouts', () => {
  it('retries 5xx, 429 and network errors with exponential backoff', async () => {
    const { client, requests, sleeps } = setup(
      [json(503, {}), new TypeError('fetch failed'), json(200, product)],
      {
        maxRetries: 2,
        retryBaseDelayMs: 100,
      },
    );
    expect((await client.getProduct('t1', 'p1'))?.id).toBe(product.id);
    expect(requests).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('gives up after maxRetries with a retryable error', async () => {
    const { client, requests } = setup([json(429, {}), json(502, {}), json(500, {})], {
      maxRetries: 2,
    });
    const err = await rejection(client.createOrder('t1', orderPayload(), 'k'));
    expect(err.kind).toBe('unavailable');
    expect(err.retryable).toBe(true);
    expect(requests).toHaveLength(3);
  });

  it('times out slow requests', async () => {
    const hang = (signal: AbortSignal) =>
      new Promise<Response>((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      );
    const { client } = setup([hang], { timeoutMs: 10, maxRetries: 0 });
    const err = await rejection(client.getProduct('t1', 'p1'));
    expect(err.kind).toBe('unavailable');
    expect(err.message).toMatch(/timed out/);
  });

  it('uses jitter for backoff delays', async () => {
    const { client, sleeps } = setup([json(500, {}), json(200, product)], {
      random: () => 0.5,
      retryBaseDelayMs: 100,
    });
    await client.getProduct('t1', 'p1');
    expect(sleeps).toEqual([50]);
  });
});

describe('HttpGetorioClient: circuit breaker', () => {
  it('opens after repeated failures and fails fast', async () => {
    const { client, requests } = setup(
      Array.from({ length: 3 }, () => json(503, {})),
      { maxRetries: 0, circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 60_000 } },
    );
    for (let i = 0; i < 3; i++) await rejection(client.getProduct('t1', 'p1'));
    expect(client.breaker.state).toBe('open');
    const err = await rejection(client.getProduct('t1', 'p1'));
    expect(err.message).toMatch(/circuit is open/);
    expect(requests).toHaveLength(3);
  });

  it('treats 4xx answers as the service being up', async () => {
    const { client } = setup([json(503, {}), json(404, {}), json(503, {})], {
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 2 },
    });
    await rejection(client.getOrderStatus('t1', 'a'));
    await rejection(client.getOrderStatus('t1', 'b'));
    await rejection(client.getOrderStatus('t1', 'c'));
    expect(client.breaker.state).toBe('closed');
  });
});

describe('CircuitBreaker', () => {
  it('goes closed -> open -> half-open -> closed', () => {
    let now = 0;
    const b = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000, now: () => now });
    expect(b.allowRequest()).toBe(true);
    b.recordFailure();
    expect(b.state).toBe('closed');
    b.recordFailure();
    expect(b.state).toBe('open');
    expect(b.allowRequest()).toBe(false);

    now = 1000;
    expect(b.state).toBe('half_open');
    expect(b.allowRequest()).toBe(true);
    expect(b.allowRequest()).toBe(false); // only one trial
    b.recordSuccess();
    expect(b.state).toBe('closed');
  });

  it('re-opens when the half-open trial fails', () => {
    let now = 0;
    const b = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000, now: () => now });
    b.recordFailure();
    now = 1500;
    expect(b.allowRequest()).toBe(true);
    b.recordFailure();
    expect(b.state).toBe('open');
    now = 2499;
    expect(b.allowRequest()).toBe(false);
  });

  it('uses sensible defaults', () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 4; i++) b.recordFailure();
    expect(b.state).toBe('closed');
    b.recordFailure();
    expect(b.state).toBe('open');
  });
});

describe('verifyWebhook', () => {
  const secret = 'whsec_test';
  const now = 1_800_000_000;
  const body = JSON.stringify({
    id: 'evt_1',
    type: 'stock.updated',
    tenantId: 't1',
    data: { productIds: ['p1'] },
  });

  it('accepts a valid signature', () => {
    const r = verifyWebhook(body, signWebhookPayload(body, secret, now), secret, {
      nowSeconds: now + 10,
    });
    expect(r).toEqual({ ok: true, event: JSON.parse(body) });
  });

  it('accepts every documented event type', () => {
    for (const evt of [
      { id: 'e', type: 'product.updated', tenantId: 't', data: { productIds: ['p'] } },
      { id: 'e', type: 'order.status_changed', tenantId: 't', data: { getorioOrderId: 'GO-1' } },
    ]) {
      const raw = JSON.stringify(evt);
      expect(
        verifyWebhook(raw, signWebhookPayload(raw, secret, now), secret, { nowSeconds: now }).ok,
      ).toBe(true);
    }
  });

  it.each([
    ['missing header', undefined, body, 'missing_signature'],
    ['garbage header', 'nonsense', body, 'malformed_signature'],
    ['short digest', `t=${now},v1=abcd`, body, 'malformed_signature'],
    ['wrong secret', signWebhookPayload(body, 'other', now), body, 'bad_signature'],
    [
      'tampered body',
      signWebhookPayload(body, secret, now),
      body.replace('p1', 'p2'),
      'bad_signature',
    ],
    ['replayed (old)', signWebhookPayload(body, secret, now - 301), body, 'stale'],
    ['from the future', signWebhookPayload(body, secret, now + 301), body, 'stale'],
    ['invalid json', signWebhookPayload('{', secret, now), '{', 'invalid_payload'],
    [
      'unknown event',
      signWebhookPayload('{"id":"e","type":"user.deleted","tenantId":"t","data":{}}', secret, now),
      '{"id":"e","type":"user.deleted","tenantId":"t","data":{}}',
      'invalid_payload',
    ],
  ])('rejects %s', (_name, header, raw, reason) => {
    expect(verifyWebhook(raw, header, secret, { nowSeconds: now })).toEqual({ ok: false, reason });
  });

  it('requires a secret', () => {
    expect(() => verifyWebhook(body, 'x', '')).toThrow();
  });

  it('defaults to the current time', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyWebhook(body, signWebhookPayload(body, secret, t), secret).ok).toBe(true);
  });
});
