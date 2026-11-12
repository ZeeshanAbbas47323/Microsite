'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CartLines, Summary, type ShippingRules } from './CartView';
import { cart, useCart } from './cart-store';

const KEY_STORAGE = 'ms_checkout_key';
export const LAST_ORDER_STORAGE = 'ms_last_order';

/** One idempotency key per checkout attempt; reused on retries/double clicks (FR-5.6). */
function idempotencyKey(): string {
  try {
    const existing = sessionStorage.getItem(KEY_STORAGE);
    if (existing) return existing;
    const key = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
    sessionStorage.setItem(KEY_STORAGE, key);
    return key;
  } catch {
    return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
  }
}

interface ApiProblem {
  productId: string;
  variantId: string | null;
  reason: string;
}

const REASONS: Record<string, string> = {
  out_of_stock: 'is out of stock',
  insufficient_stock: 'does not have enough stock',
  unavailable: 'is no longer available',
  variant_required: 'needs an option to be chosen',
};

export function CheckoutForm({
  rules,
  currency,
  orderHref,
  cartHref,
}: {
  rules: ShippingRules;
  currency: string;
  /** e.g. "/order/{ref}" (with preview params if any) */
  orderHref: string;
  cartHref: string;
}) {
  const items = useCart();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!items.length) {
    return (
      <p className="py-16 text-center text-[var(--ms-muted)]">
        Your cart is empty.{' '}
        <Link href={cartHref} className="font-semibold text-[var(--ms-primary)] underline">
          Back to cart
        </Link>
      </p>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    const body = {
      customer: { name: text('name'), phone: text('phone'), email: text('email') },
      shipping: { address: text('address'), city: text('city') },
      ...(text('notes') ? { notes: text('notes') } : {}),
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
      paymentMethod: 'cod',
      website: text('website'),
    };
    try {
      const res = await fetch('/api/storefront/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        order?: { orderRef: string };
        error?: { code: string; message: string; details?: unknown };
      } | null;
      if (res.ok && data?.order) {
        try {
          sessionStorage.setItem(LAST_ORDER_STORAGE, JSON.stringify(data.order));
          sessionStorage.removeItem(KEY_STORAGE);
        } catch {
          // ignore
        }
        cart.clear();
        router.push(orderHref.replace('{ref}', encodeURIComponent(data.order.orderRef)));
        return;
      }
      const err = data?.error;
      if (err?.code === 'out_of_stock' && Array.isArray(err.details)) {
        const lines = (err.details as ApiProblem[]).map((p) => {
          const item = items.find(
            (i) => i.productId === p.productId && i.variantId === p.variantId,
          );
          return `${item?.name ?? 'An item'} ${REASONS[p.reason] ?? 'is unavailable'}`;
        });
        setError(`${lines.join('. ')}. Please update your cart.`);
      } else if (err?.code === 'validation_error' && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as { path: string; message: string }[])
          map[d.path.split('.').pop() ?? d.path] = d.message;
        setFieldErrors(map);
        setError('Please check the highlighted fields.');
      } else if (res.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else if (res.status === 409) {
        // Same key, different cart: start a fresh attempt.
        try {
          sessionStorage.removeItem(KEY_STORAGE);
        } catch {
          // ignore
        }
        setError('Your cart changed. Please press "Place order" again.');
      } else {
        setError(err?.message ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network problem. Your order was not placed yet; please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    'h-12 w-full rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3 aria-[invalid=true]:border-red-600';
  const label = 'mb-1 block text-sm font-semibold';
  const fe = (k: string) =>
    fieldErrors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-error` } : {};
  const msg = (k: string) =>
    fieldErrors[k] ? (
      <p id={`${k}-error`} className="mt-1 text-sm text-red-700">
        {fieldErrors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} className="grid gap-10 py-8 md:grid-cols-[1fr_360px]" noValidate>
      <div className="space-y-5">
        <h2 className="text-lg font-bold">Delivery details</h2>
        <div>
          <label htmlFor="name" className={label}>
            Full name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            className={field}
            {...fe('name')}
          />
          {msg('name')}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={label}>
              Mobile number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="03XX XXXXXXX"
              required
              className={field}
              {...fe('phone')}
            />
            {msg('phone')}
          </div>
          <div>
            <label htmlFor="email" className={label}>
              Email <span className="font-normal text-[var(--ms-muted)]">(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className={field}
              {...fe('email')}
            />
            {msg('email')}
          </div>
        </div>
        <div>
          <label htmlFor="city" className={label}>
            City
          </label>
          <input
            id="city"
            name="city"
            autoComplete="address-level2"
            required
            className={field}
            {...fe('city')}
          />
          {msg('city')}
        </div>
        <div>
          <label htmlFor="address" className={label}>
            Full address
          </label>
          <textarea
            id="address"
            name="address"
            autoComplete="street-address"
            required
            rows={3}
            className={`${field} h-auto py-2`}
            {...fe('address')}
          />
          {msg('address')}
        </div>
        <div>
          <label htmlFor="notes" className={label}>
            Order notes <span className="font-normal text-[var(--ms-muted)]">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={500}
            className={`${field} h-auto py-2`}
            {...fe('notes')}
          />
        </div>
        {/* Honeypot for bots (FR-5.9): hidden from people and assistive tech. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-4">
          <p className="font-semibold">Payment</p>
          <p className="text-sm text-[var(--ms-muted)]">
            Cash on delivery. Pay when your order arrives.
          </p>
        </div>
      </div>
      <aside className="h-fit space-y-5 rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5">
        <h2 className="text-lg font-bold">Your order</h2>
        <CartLines items={items} editable={false} />
        <Summary items={items} rules={rules} currency={currency} />
        {error ? (
          <p role="alert" className="rounded-[var(--ms-radius)] bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] font-semibold text-[var(--ms-on-primary)] hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Placing order…' : 'Place order'}
        </button>
      </aside>
    </form>
  );
}
