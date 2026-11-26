import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, login, publishedStore, resetDb, type Login } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let owner: Login;
let storeId: string;
let host: string;

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  const s = await publishedStore(ctx);
  owner = s.auth;
  storeId = s.store.id;
  host = s.host;
});
afterAll(async () => ctx?.app.close());

let keySeq = 0;
const newKey = () => `cust-key-${Date.now()}-${++keySeq}-abcdef`;

const pub = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
  token?: string,
  storeHost = host,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1/public${path}`,
    headers: {
      'x-store-host': storeHost,
      ...(token ? { 'x-customer-token': token } : {}),
      ...(path === '/checkout' ? { 'idempotency-key': newKey() } : {}),
    },
    ...(payload ? { payload } : {}),
  });

const dash = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
  auth = owner,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1/stores/${storeId}${path}`,
    headers: auth.headers,
    ...(payload ? { payload } : {}),
  });

const order = (overrides: Record<string, unknown> = {}) => ({
  customer: { name: 'Ayesha Khan', phone: '0300-1234567', email: 'ayesha@example.com' },
  shipping: { address: 'House 5, Street 2, DHA', city: 'Karachi' },
  items: [{ productId: 'p-1001', qty: 1 }],
  ...overrides,
});

describe('customer accounts', () => {
  it('signs up with email or phone, signs in with either and keeps sessions per store', async () => {
    const reg = await pub('POST', '/account/register', {
      name: 'Ayesha Khan',
      email: 'Ayesha@Example.com',
      phone: '0300 1234567',
      password: 'secret-pass-1',
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.json().customer).toMatchObject({
      email: 'ayesha@example.com',
      phone: '+923001234567',
    });

    // Same phone again: already has an account.
    const dup = await pub('POST', '/account/register', {
      name: 'Someone',
      phone: '03001234567',
      password: 'another-pass',
    });
    expect(dup.statusCode).toBe(409);

    const byPhone = await pub('POST', '/account/login', {
      identifier: '+92 300 1234567',
      password: 'secret-pass-1',
    });
    expect(byPhone.statusCode).toBe(200);
    const byEmail = await pub('POST', '/account/login', {
      identifier: 'AYESHA@example.com',
      password: 'secret-pass-1',
    });
    expect(byEmail.statusCode).toBe(200);
    const wrong = await pub('POST', '/account/login', {
      identifier: 'ayesha@example.com',
      password: 'nope-nope',
    });
    expect(wrong.statusCode).toBe(401);
    expect(
      (await pub('POST', '/account/login', { identifier: 'nobody@x.pk', password: 'x' }))
        .statusCode,
    ).toBe(401);

    const token = byEmail.json().token as string;
    expect((await pub('GET', '/account', undefined, token)).json().customer.name).toBe(
      'Ayesha Khan',
    );
    expect((await pub('GET', '/account')).statusCode).toBe(401);

    // A token from one store does not work on another.
    const other = await publishedStore(ctx, 'tenant-b', 'otherstore');
    expect((await pub('GET', '/account', undefined, token, other.host)).statusCode).toBe(401);

    await pub('POST', '/account/logout', undefined, token);
    expect((await pub('GET', '/account', undefined, token)).statusCode).toBe(401);
  });

  it('needs an email or phone, and a strong enough password', async () => {
    expect(
      (await pub('POST', '/account/register', { name: 'Ali Raza', password: 'secret-pass-1' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await pub('POST', '/account/register', {
          name: 'Ali Raza',
          email: 'ali@x.pk',
          password: 'short',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('manages profile, password and addresses, and shows only orders placed while signed in', async () => {
    // A guest order first: the customer record exists before sign-up.
    await pub('POST', '/checkout', order());
    const reg = await pub('POST', '/account/register', {
      name: 'Ayesha K.',
      phone: '03001234567',
      password: 'secret-pass-1',
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.json().token as string;
    expect(reg.json().customer.orders).toBe(0);

    const placed = await pub('POST', '/checkout', order(), token);
    expect(placed.statusCode).toBe(201);
    const orders = (await pub('GET', '/account/orders', undefined, token)).json();
    expect(orders.total).toBe(1);
    expect(orders.items[0].orderRef).toBe(placed.json().order.orderRef);

    const added = await pub(
      'POST',
      '/account/addresses',
      {
        label: 'Office',
        name: 'Ayesha',
        phone: '03001234567',
        address: 'Office 4, Clifton',
        city: 'Karachi',
      },
      token,
    );
    expect(added.statusCode).toBe(201);
    const [address] = added.json().customer.addresses;
    expect(address).toMatchObject({ label: 'Office', isDefault: true, phone: '+923001234567' });
    const removed = await pub('DELETE', `/account/addresses/${address.id}`, undefined, token);
    expect(removed.json().customer.addresses).toEqual([]);

    const updated = await pub(
      'PATCH',
      '/account',
      { name: 'Ayesha Khan', email: 'ayesha@example.com' },
      token,
    );
    expect(updated.json().customer).toMatchObject({
      name: 'Ayesha Khan',
      email: 'ayesha@example.com',
    });

    expect(
      (
        await pub(
          'POST',
          '/account/password',
          { currentPassword: 'wrong', newPassword: 'new-secret-2' },
          token,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await pub(
          'POST',
          '/account/password',
          { currentPassword: 'secret-pass-1', newPassword: 'new-secret-2' },
          token,
        )
      ).statusCode,
    ).toBe(204);
    expect(
      (await pub('POST', '/account/login', { identifier: '03001234567', password: 'new-secret-2' }))
        .statusCode,
    ).toBe(200);
  });
});

describe('dashboard customers', () => {
  it('builds profiles from orders, with segments, search, notes and analytics', async () => {
    await pub('POST', '/checkout', order());
    await pub('POST', '/checkout', order({ items: [{ productId: 'p-1001', qty: 2 }] }));
    await pub(
      'POST',
      '/checkout',
      order({
        customer: { name: 'Bilal Ahmed', phone: '0321-7654321' },
        shipping: { address: 'Flat 2, Gulberg', city: 'Lahore' },
      }),
    );

    const list = (await dash('GET', '/customers?sort=totalSpent&dir=desc')).json();
    expect(list.total).toBe(2);
    expect(list.items[0]).toMatchObject({
      name: 'Ayesha Khan',
      ordersCount: 2,
      totalSpent: '13500.00',
      city: 'Karachi',
    });
    expect(list.segmentCounts).toMatchObject({ all: 2, repeat: 1, guest: 2, registered: 0 });
    expect((await dash('GET', '/customers?search=lahore')).json().items[0].name).toBe(
      'Bilal Ahmed',
    );
    expect((await dash('GET', '/customers?search=0321-765')).json().total).toBe(1);
    expect((await dash('GET', '/customers?segment=repeat')).json().total).toBe(1);

    const id = list.items[0].id;
    const profile = (await dash('GET', `/customers/${id}`)).json().customer;
    expect(profile.orders).toHaveLength(2);
    expect(profile.stats.averageOrder).toBe('6750.00');
    expect(profile.topProducts[0]).toMatchObject({ name: 'Leather Tote Bag', qty: 3 });

    const noted = await dash('PATCH', `/customers/${id}`, {
      notes: 'Prefers evening delivery',
      tags: ['VIP', 'VIP'],
    });
    expect(noted.json().customer).toMatchObject({
      notes: 'Prefers evening delivery',
      tags: ['VIP'],
    });

    const stats = (await dash('GET', '/customers/analytics?days=30')).json();
    expect(stats.totals).toMatchObject({
      customers: 2,
      buyers: 2,
      repeatCustomers: 1,
      repeatRate: 50,
    });
    expect(stats.period.newCustomers).toBe(2);
    expect(stats.series).toHaveLength(30);
    expect(stats.cities.map((c: { city: string }) => c.city).sort()).toEqual(['Karachi', 'Lahore']);

    // Other tenants see nothing.
    const stranger = await login(ctx.app, { getorioTenantId: 'tenant-x' });
    expect((await dash('GET', `/customers/${id}`, undefined, stranger)).statusCode).toBe(404);
  });
});

describe('discount codes', () => {
  const quote = (code: string, extra: Record<string, unknown> = {}) =>
    pub('POST', '/discounts/quote', {
      items: [{ productId: 'p-1001', qty: 1 }],
      city: 'Karachi',
      discountCode: code,
      ...extra,
    });

  it('creates codes in the dashboard and applies them at checkout on the server', async () => {
    const created = await dash('POST', '/discounts', {
      code: 'eid20',
      type: 'percentage',
      value: 20,
      maxDiscount: 500,
      minSubtotal: 1000,
      usageLimit: 2,
      perCustomerLimit: 1,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().discount).toMatchObject({
      code: 'EID20',
      status: 'active',
      summary: expect.stringContaining('20% off'),
    });
    expect(
      (await dash('POST', '/discounts', { code: 'EID20', type: 'fixed', value: 100 })).statusCode,
    ).toBe(409);
    expect(
      (await dash('POST', '/discounts', { code: 'BAD', type: 'percentage', value: 150 }))
        .statusCode,
    ).toBe(400);

    // 20% of 4500 is 900, capped at 500.
    const q = await quote('eid20');
    expect(q.statusCode).toBe(200);
    expect(q.json()).toMatchObject({
      subtotal: '4500.00',
      total: '4000.00',
      discount: { code: 'EID20', amount: '500.00' },
    });
    expect((await quote('NOPE')).json().error.details.reason).toBe('not_found');

    const placed = await pub('POST', '/checkout', order({ discountCode: 'Eid20' }));
    expect(placed.statusCode).toBe(201);
    expect(placed.json().order).toMatchObject({
      discountCode: 'EID20',
      discountTotal: '500.00',
      total: '4000.00',
    });
    // Getorio gets the discount and the reduced total.
    await ctx.queue.runPending();
    const sent = ctx.getorio.getOrders('tenant-demo').at(-1)?.payload;
    expect(sent).toMatchObject({ total: '4000.00', discount: { code: 'EID20', amount: '500.00' } });

    // One use per customer.
    const again = await pub('POST', '/checkout', order({ discountCode: 'EID20' }));
    expect(again.json().error.details.reason).toBe('customer_limit');

    // Second (last) use by someone else, then it is used up.
    await pub(
      'POST',
      '/checkout',
      order({ customer: { name: 'Bilal Ahmed', phone: '03217654321' }, discountCode: 'EID20' }),
    );
    const third = await pub(
      'POST',
      '/checkout',
      order({ customer: { name: 'Sana Mir', phone: '03331112222' }, discountCode: 'EID20' }),
    );
    expect(third.json().error.details.reason).toBe('used_up');

    const report = (await dash('GET', '/discounts')).json();
    expect(report.items[0]).toMatchObject({
      usedCount: 2,
      orders: 2,
      discounted: '1000.00',
      status: 'used_up',
    });
  });

  it('handles fixed amounts, free delivery, minimums, dates and disabling', async () => {
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/stores/${storeId}/settings`,
      headers: owner.headers,
      payload: { shippingFlatFee: '250.00' },
    });
    await dash('POST', '/discounts', { code: 'FLAT300', type: 'fixed', value: '300' });
    const ship = (
      await dash('POST', '/discounts', { code: 'FREESHIP', type: 'free_shipping' })
    ).json().discount;
    await dash('POST', '/discounts', {
      code: 'BIGSPEND',
      type: 'fixed',
      value: 1000,
      minSubtotal: 10000,
    });
    await dash('POST', '/discounts', {
      code: 'LATER',
      type: 'fixed',
      value: 100,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await dash('POST', '/discounts', {
      code: 'OLD',
      type: 'fixed',
      value: 100,
      startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() - 86_400_000).toISOString(),
    });

    expect((await quote('FLAT300')).json()).toMatchObject({
      shippingFee: '250.00',
      total: '4450.00',
    });
    expect((await quote('FREESHIP')).json()).toMatchObject({
      shippingFee: '0.00',
      total: '4500.00',
    });
    expect((await quote('BIGSPEND')).json().error.details.reason).toBe('min_subtotal');
    expect((await quote('LATER')).json().error.details.reason).toBe('not_started');
    expect((await quote('OLD')).json().error.details.reason).toBe('expired');

    await dash('PATCH', `/discounts/${ship.id}`, { active: false });
    expect((await quote('FREESHIP')).json().error.details.reason).toBe('inactive');
    expect((await dash('DELETE', `/discounts/${ship.id}`)).statusCode).toBe(204);
    expect((await quote('FREESHIP')).json().error.details.reason).toBe('not_found');
  });
});
