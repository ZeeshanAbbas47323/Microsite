import { beforeEach, describe, expect, it } from 'vitest';
import type { GetorioError } from '../src';
import {
  createGetorioClient,
  createSampleCatalog,
  fromMinorUnits,
  InMemoryGetorioClient,
  isGetorioError,
  productSchema,
  SAMPLE_TENANT_ID,
  toMinorUnits,
} from '../src';
import { at, orderPayload } from './fixtures';

const T = SAMPLE_TENANT_ID;
const OTHER = 'tenant-other';

let client: InMemoryGetorioClient;

beforeEach(() => {
  client = new InMemoryGetorioClient({
    catalog: { [T]: createSampleCatalog() },
    now: () => new Date('2026-11-12T10:00:00Z'),
  });
});

async function rejection(promise: Promise<unknown>): Promise<GetorioError> {
  try {
    await promise;
  } catch (error) {
    if (isGetorioError(error)) return error;
    throw error;
  }
  throw new Error('Expected a GetorioError');
}

describe('money', () => {
  it.each([
    ['0', 0],
    ['1499', 149900],
    ['1499.5', 149950],
    ['1499.05', 149905],
    ['9999999999.99', 999999999999],
  ])('converts %s', (amount, minor) => {
    expect(toMinorUnits(amount)).toBe(minor);
  });
  it('formats minor units', () => {
    expect(fromMinorUnits(149905)).toBe('1499.05');
    expect(fromMinorUnits(0)).toBe('0.00');
  });
  it.each(['-1', '1.234', '01', 'abc', '1e3', ''])('rejects %s', (amount) => {
    expect(() => toMinorUnits(amount)).toThrow();
  });
  it('rejects bad minor amounts', () => {
    expect(() => fromMinorUnits(-1)).toThrow();
    expect(() => fromMinorUnits(1.5)).toThrow();
  });
});

describe('sample catalog', () => {
  it('matches the product contract', () => {
    for (const p of createSampleCatalog())
      expect(productSchema.safeParse(p).success, p.id).toBe(true);
  });
  it('sums variant stock', () => {
    expect(createSampleCatalog().find((p) => p.id === 'p-1004')?.stockQty).toBe(6);
  });
});

describe('InMemoryGetorioClient: catalog', () => {
  it('lists with pagination', async () => {
    const page1 = await client.listProducts(T, { page: 1, pageSize: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page1.total).toBe(12);
    const page3 = await client.listProducts(T, { page: 3, pageSize: 5 });
    expect(page3.items).toHaveLength(2);
  });

  it('only returns active, visible products for the microstore', async () => {
    const res = await client.listProducts(T, { page: 1, pageSize: 100, onlyMicrostore: true });
    const ids = res.items.map((p) => p.id);
    expect(ids).not.toContain('p-1006'); // hidden
    expect(ids).not.toContain('p-1007'); // inactive
    expect(ids).toContain('p-1005'); // out of stock is still listed
    expect(res.total).toBe(10);
  });

  it('filters by search and category', async () => {
    const bySearch = await client.listProducts(T, { page: 1, pageSize: 10, search: 'LEATHER' });
    expect(bySearch.items.map((p) => p.id).sort()).toEqual(['p-1001', 'p-1009']);
    const bySku = await client.listProducts(T, { page: 1, pageSize: 10, search: 'khussa' });
    expect(bySku.items.map((p) => p.id)).toEqual(['p-1004']);
    const byCat = await client.listProducts(T, {
      page: 1,
      pageSize: 10,
      categoryId: 'cat-footwear',
    });
    expect(byCat.total).toBe(1);
  });

  it('rejects invalid queries', async () => {
    expect((await rejection(client.listProducts(T, { page: 0, pageSize: 10 }))).kind).toBe(
      'rejected',
    );
    expect((await rejection(client.listProducts(T, { page: 1, pageSize: 1000 }))).kind).toBe(
      'rejected',
    );
  });

  it('gets a product and returns copies', async () => {
    const p = await client.getProduct(T, 'p-1001');
    expect(p?.name).toBe('Leather Tote Bag');
    if (p) p.price = '1.00';
    expect((await client.getProduct(T, 'p-1001'))?.price).toBe('4500.00');
    expect(await client.getProduct(T, 'nope')).toBeNull();
  });

  it('returns stock for products and variants, skipping unknown ids', async () => {
    expect(await client.getStock(T, ['p-1001', 'p-1005', 'v-1004-9', 'missing', 'p-1001'])).toEqual(
      {
        'p-1001': 12,
        'p-1005': 0,
        'v-1004-9': 2,
      },
    );
  });

  it('sets microstore flags', async () => {
    await client.setProductMicrostoreFlags(T, 'p-1006', { visible: true, featured: true });
    expect((await client.getProduct(T, 'p-1006'))?.microstore).toEqual({
      visible: true,
      featured: true,
    });
    expect(
      (
        await rejection(
          client.setProductMicrostoreFlags(T, 'nope', { visible: true, featured: false }),
        )
      ).kind,
    ).toBe('not_found');
  });

  it('updates products through the dev helper', async () => {
    client.updateProduct(T, 'p-1001', { price: '4999.00' });
    expect((await client.getProduct(T, 'p-1001'))?.price).toBe('4999.00');
    expect(() => client.updateProduct(T, 'nope', {})).toThrow();
  });
});

describe('InMemoryGetorioClient: tenant isolation', () => {
  it('never returns another tenant’s products or orders', async () => {
    expect((await client.listProducts(OTHER, { page: 1, pageSize: 100 })).total).toBe(0);
    expect(await client.getProduct(OTHER, 'p-1001')).toBeNull();
    expect(await client.getStock(OTHER, ['p-1001'])).toEqual({});
    const { getorioOrderId } = await client.createOrder(T, orderPayload(), 'key-1');
    expect((await rejection(client.getOrderStatus(OTHER, getorioOrderId))).kind).toBe('not_found');
    expect(client.getOrders(OTHER)).toEqual([]);
    expect(
      (
        await rejection(
          client.setProductMicrostoreFlags(OTHER, 'p-1001', { visible: false, featured: false }),
        )
      ).kind,
    ).toBe('not_found');
  });

  it('rejects calls without a tenant', async () => {
    expect((await rejection(client.getProduct('', 'p-1001'))).kind).toBe('unauthorized');
  });
});

describe('InMemoryGetorioClient: orders', () => {
  it('creates an order and decrements stock', async () => {
    const { getorioOrderId } = await client.createOrder(T, orderPayload(), 'key-1');
    expect(getorioOrderId).toMatch(/^GO-\d+$/);
    expect(await client.getStock(T, ['p-1001', 'v-1004-7', 'p-1004'])).toEqual({
      'p-1001': 10,
      'v-1004-7': 3,
      'p-1004': 5,
    });
    const [order] = client.getOrders(T);
    expect(order?.payload.total).toBe('12450.00');
    expect(order?.status).toBe('pending');
  });

  it('is idempotent per key', async () => {
    const a = await client.createOrder(T, orderPayload(), 'key-1');
    const b = await client.createOrder(T, structuredClone(orderPayload()), 'key-1');
    expect(b).toEqual(a);
    expect(client.getOrders(T)).toHaveLength(1);
    expect((await client.getStock(T, ['p-1001']))['p-1001']).toBe(10);
  });

  it('rejects reusing a key with a different payload', async () => {
    await client.createOrder(T, orderPayload(), 'key-1');
    const err = await rejection(client.createOrder(T, orderPayload({ total: '1.00' }), 'key-1'));
    expect(err.kind).toBe('conflict');
    expect(err.retryable).toBe(false);
  });

  it('scopes idempotency keys per tenant', async () => {
    client.seedProducts(OTHER, createSampleCatalog());
    const a = await client.createOrder(T, orderPayload(), 'same-key');
    const b = await client.createOrder(OTHER, orderPayload(), 'same-key');
    expect(a.getorioOrderId).not.toBe(b.getorioOrderId);
  });

  it('never lets stock go negative', async () => {
    const big = orderPayload({
      items: [{ ...at(orderPayload().items, 0), qty: 50, lineTotal: '225000.00' }],
    });
    await client.createOrder(T, big, 'key-big');
    expect((await client.getStock(T, ['p-1001']))['p-1001']).toBe(0);
  });

  it('validates payload, products and key', async () => {
    expect((await rejection(client.createOrder(T, orderPayload(), ''))).kind).toBe('rejected');
    expect((await rejection(client.createOrder(T, orderPayload(), 'k'.repeat(129)))).kind).toBe(
      'rejected',
    );
    const badPhone = orderPayload({ customer: { name: 'A', phone: '0300', email: null } });
    expect((await rejection(client.createOrder(T, badPhone, 'k1'))).kind).toBe('rejected');
    const unknown = orderPayload({
      items: [{ ...at(orderPayload().items, 0), productId: 'p-9999' }],
    });
    expect((await rejection(client.createOrder(T, unknown, 'k2'))).kind).toBe('rejected');
    const badVariant = orderPayload({
      items: [{ ...at(orderPayload().items, 1), variantId: 'v-x' }],
    });
    expect((await rejection(client.createOrder(T, badVariant, 'k3'))).kind).toBe('rejected');
    expect(client.getOrders(T)).toHaveLength(0);
  });

  it('reports and updates order status', async () => {
    const { getorioOrderId } = await client.createOrder(T, orderPayload(), 'key-1');
    expect((await client.getOrderStatus(T, getorioOrderId)).status).toBe('pending');
    client.setOrderStatus(T, getorioOrderId, 'shipped');
    expect(await client.getOrderStatus(T, getorioOrderId)).toEqual({
      getorioOrderId,
      status: 'shipped',
      updatedAt: '2026-11-12T10:00:00.000Z',
    });
    expect(() => client.setOrderStatus(T, 'GO-0', 'shipped')).toThrow();
  });
});

describe('InMemoryGetorioClient: fault injection', () => {
  it('simulates an outage and recovery', async () => {
    client.setAvailable(false);
    const err = await rejection(client.createOrder(T, orderPayload(), 'key-1'));
    expect(err.kind).toBe('unavailable');
    expect(err.retryable).toBe(true);
    expect(client.getOrders(T)).toHaveLength(0);

    client.setAvailable(true);
    await client.createOrder(T, orderPayload(), 'key-1');
    expect(client.getOrders(T)).toHaveLength(1);
  });

  it('fails the next N calls', async () => {
    client.failNext(2);
    await rejection(client.getProduct(T, 'p-1001'));
    await rejection(client.getProduct(T, 'p-1001'));
    expect(await client.getProduct(T, 'p-1001')).not.toBeNull();
    client.failNext(1, 'unauthorized');
    expect((await rejection(client.getProduct(T, 'p-1001'))).retryable).toBe(false);
  });

  it('records calls and supports latency', async () => {
    const slow = new InMemoryGetorioClient({ latencyMs: 5 });
    const started = Date.now();
    await slow.getStock(T, []);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4);
    expect(slow.calls).toEqual([{ method: 'getStock', tenantId: T }]);
  });
});

describe('catalogForNewTenants', () => {
  it('seeds tenants on first use only', async () => {
    const c = new InMemoryGetorioClient({
      catalogForNewTenants: () => createSampleCatalog().slice(0, 2),
    });
    expect((await c.listProducts('fresh', { page: 1, pageSize: 10 })).total).toBe(2);
    await c.setProductMicrostoreFlags('fresh', 'p-1001', { visible: false, featured: false });
    expect((await c.getProduct('fresh', 'p-1001'))?.microstore.visible).toBe(false);
  });
});

describe('createGetorioClient', () => {
  it('defaults to a seeded mock outside production', async () => {
    const c = createGetorioClient({});
    expect(c).toBeInstanceOf(InMemoryGetorioClient);
    expect((await c.listProducts(T, { page: 1, pageSize: 1 })).total).toBe(12);
  });
  it('refuses the mock in production', () => {
    expect(() => createGetorioClient({ NODE_ENV: 'production', GETORIO_CLIENT: 'mock' })).toThrow();
  });
  it('requires config for http', () => {
    expect(() => createGetorioClient({ NODE_ENV: 'production' })).toThrow(/GETORIO_API_BASE_URL/);
    expect(() =>
      createGetorioClient({ GETORIO_CLIENT: 'http', GETORIO_API_BASE_URL: 'https://g.test' }),
    ).toThrow(/GETORIO_API_KEY/);
    expect(
      createGetorioClient({
        GETORIO_CLIENT: 'http',
        GETORIO_API_BASE_URL: 'https://g.test',
        GETORIO_API_KEY: 'k',
      }),
    ).toBeDefined();
  });
  it('rejects unknown kinds', () => {
    expect(() => createGetorioClient({ GETORIO_CLIENT: 'soap' })).toThrow(/Unknown/);
  });
});
