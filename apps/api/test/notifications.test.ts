import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderNotifier } from '../src/notifications/order-notifier';
import {
  ConsoleEmailSender,
  maskContact,
  WebhookMessageSender,
  type MessageSender,
} from '../src/notifications/senders';
import { TurnstileVerifier } from '../src/orders/captcha';
import { CheckoutService } from '../src/orders/checkout-service';
import { createTestApp, publishedStore, resetDb, testDb } from './helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let storeId: string;

const body = (email = 'ayesha@example.com') => ({
  customer: { name: 'Ayesha & "Khan"', phone: '03001234567', email },
  shipping: { address: 'House 5, Street 2, DHA', city: 'Karachi' },
  items: [{ productId: 'p-1001', qty: 1 }],
});

beforeEach(async () => {
  await resetDb();
  ctx = await createTestApp();
  storeId = (await publishedStore(ctx)).store.id;
});
afterAll(async () => ctx?.app.close());

async function placeOrder(email?: string) {
  const store = await testDb().store.findUniqueOrThrow({ where: { id: storeId } });
  const checkout = new CheckoutService(testDb(), ctx.catalog, ctx.queue);
  return (
    await checkout.placeOrder(
      store,
      body(email),
      `notify-${Date.now()}-${Math.random()}`.replace('.', ''),
    )
  ).order;
}

describe('OrderNotifier (FR-5.8)', () => {
  it('emails the customer with an escaped summary', async () => {
    const order = await placeOrder();
    const id = (await testDb().order.findFirstOrThrow({ where: { orderRef: order.orderRef } })).id;
    const email = new ConsoleEmailSender();
    const result = await new OrderNotifier(testDb(), email, null).orderPlaced(id);
    expect(result).toEqual({ email: true, message: false });
    expect(email.sent[0]).toMatchObject({
      to: 'ayesha@example.com',
      subject: `Order ${order.orderRef} received – Zara Crafts`,
    });
    expect(email.sent[0]?.text).toContain('Total (cash on delivery): Rs');
    expect(email.sent[0]?.html).toContain('Ayesha &amp; &quot;Khan&quot;');
  });

  it('respects store settings and missing emails', async () => {
    const noEmail = await placeOrder('');
    const id = (await testDb().order.findFirstOrThrow({ where: { orderRef: noEmail.orderRef } }))
      .id;
    const email = new ConsoleEmailSender();
    expect((await new OrderNotifier(testDb(), email, null).orderPlaced(id)).email).toBe(false);

    const order = await placeOrder();
    const id2 = (await testDb().order.findFirstOrThrow({ where: { orderRef: order.orderRef } })).id;
    const store = await testDb().store.findUniqueOrThrow({ where: { id: storeId } });
    await testDb().store.update({
      where: { id: storeId },
      data: {
        settings: {
          ...(store.settings as object),
          notifications: { customerEmail: false, customerMessage: true },
        },
      },
    });
    const messages: { toPhone: string; text: string }[] = [];
    const sender: MessageSender = { send: async (m) => void messages.push(m) };
    expect(await new OrderNotifier(testDb(), email, sender).orderPlaced(id2)).toEqual({
      email: false,
      message: true,
    });
    expect(messages[0]).toMatchObject({ toPhone: '+923001234567' });
    expect(messages[0]?.text).toContain(order.orderRef);
  });

  it('never throws and logs masked contacts', async () => {
    const order = await placeOrder();
    const id = (await testDb().order.findFirstOrThrow({ where: { orderRef: order.orderRef } })).id;
    const logs: Record<string, unknown>[] = [];
    const failing = { send: async () => Promise.reject(new Error('smtp down')) };
    const notifier = new OrderNotifier(testDb(), failing, null, (_m, meta) =>
      logs.push(meta ?? {}),
    );
    expect(await notifier.orderPlaced(id)).toEqual({ email: false, message: false });
    expect(logs[0]?.to).toBe('a***@example.com');
    expect(await notifier.orderPlaced('0195f7a2-0000-7000-8000-000000000000')).toEqual({
      email: false,
      message: false,
    });
  });

  it('is triggered by checkout', async () => {
    const store = await testDb().store.findUniqueOrThrow({ where: { id: storeId } });
    const orderPlaced = vi.fn(async () => ({ email: true, message: false }));
    const checkout = new CheckoutService(testDb(), ctx.catalog, ctx.queue, {
      notifier: { orderPlaced } as unknown as OrderNotifier,
    });
    await checkout.placeOrder(store, body(), 'trigger-key-0123456789');
    expect(orderPlaced).toHaveBeenCalledTimes(1);
  });

  it('masks contacts', () => {
    expect(maskContact('someone@shop.pk')).toBe('s***@shop.pk');
    expect(maskContact('+923001234567')).toBe('+923*****67');
  });

  it('posts SMS/WhatsApp messages to the hook', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await new WebhookMessageSender(
      'https://hook.test/send',
      'tok',
      fetchImpl as unknown as typeof fetch,
    ).send({ toPhone: '+92300', text: 'hi' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://hook.test/send');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    const failing = new WebhookMessageSender(
      'https://hook.test',
      't',
      (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
    );
    await expect(failing.send({ toPhone: '1', text: 'x' })).rejects.toThrow();
  });
});

describe('Turnstile on checkout (FR-5.9)', () => {
  it('verifies tokens with Cloudflare', async () => {
    const ok = new TurnstileVerifier('secret', (async () =>
      Response.json({ success: true })) as unknown as typeof fetch);
    expect(await ok.verify('token', '1.2.3.4')).toBe(true);
    expect(await ok.verify(undefined, '1.2.3.4')).toBe(false);
    const bad = new TurnstileVerifier('secret', (async () =>
      Response.json({ success: false })) as unknown as typeof fetch);
    expect(await bad.verify('token', '')).toBe(false);
    const down = new TurnstileVerifier('secret', (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    expect(await down.verify('token', '')).toBe(false);
  });

  it('blocks new orders without a valid token but allows idempotent replays', async () => {
    const store = await testDb().store.findUniqueOrThrow({ where: { id: storeId } });
    let valid = true;
    const captcha = { verify: async (t: string | undefined) => valid && t === 'good' };
    const checkout = new CheckoutService(testDb(), ctx.catalog, ctx.queue, { captcha });
    await expect(
      checkout.placeOrder(store, body(), 'captcha-key-0000000001'),
    ).rejects.toMatchObject({ code: 'captcha_failed' });
    const first = await checkout.placeOrder(
      store,
      { ...body(), captchaToken: 'good' },
      'captcha-key-0000000002',
    );
    expect(first.created).toBe(true);
    valid = false; // token already spent
    const replay = await checkout.placeOrder(
      store,
      { ...body(), captchaToken: 'good' },
      'captcha-key-0000000002',
    );
    expect(replay).toMatchObject({ created: false, order: { orderRef: first.order.orderRef } });
  });
});
