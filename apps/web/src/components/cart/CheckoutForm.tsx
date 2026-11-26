'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { localPhone, useCustomer } from '../account/customer-store';
import { CartLines, Summary, type AppliedDiscount, type ShippingRules } from './CartView';
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
  accountHref,
  turnstileSiteKey = '',
}: {
  rules: ShippingRules;
  currency: string;
  /** e.g. "/order/{ref}" (with preview params if any) */
  orderHref: string;
  cartHref: string;
  /** e.g. "/account" (sign-in link for faster checkout). */
  accountHref: string;
  /** When set, a Cloudflare Turnstile check is shown and required (FR-5.9). */
  turnstileSiteKey?: string;
}) {
  const items = useCart();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [city, setCity] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [addressId, setAddressId] = useState<string>('');
  const { status, customer } = useCustomer();
  const prefilled = useRef(false);

  // Signed-in customers: fill in their details and default address once.
  useEffect(() => {
    if (!customer || prefilled.current) return;
    prefilled.current = true;
    const a = customer.addresses.find((x) => x.isDefault) ?? customer.addresses[0];
    setName((v) => v || a?.name || customer.name);
    setPhone((v) => v || localPhone(a?.phone ?? customer.phone));
    setEmail((v) => v || customer.email || '');
    if (a) {
      setAddressId(a.id);
      setAddress((v) => v || a.address);
      setCity((v) => v || a.city);
    }
  }, [customer]);

  function pickAddress(id: string) {
    setAddressId(id);
    const a = customer?.addresses.find((x) => x.id === id);
    if (!a) {
      setAddress('');
      return;
    }
    setName(a.name);
    setPhone(localPhone(a.phone));
    setAddress(a.address);
    setCity(a.city);
  }

  // Discount code: priced on the server; re-checked when the cart, city or phone changes.
  const [codeInput, setCodeInput] = useState('');
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const cartKey = items.map((i) => `${i.productId}:${i.variantId ?? ''}:${i.qty}`).join('|');

  async function applyCode(code: string, quiet = false) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setApplying(true);
    if (!quiet) setCodeError(null);
    try {
      const res = await fetch('/api/storefront/discount', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
          city,
          ...(/^(\+92|0)?3\d{9}$/.test(phone.replace(/[\s-]/g, '')) ? { phone } : {}),
          discountCode: trimmed,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        discount?: AppliedDiscount;
        error?: { message: string };
      } | null;
      if (res.ok && data?.discount) {
        setDiscount(data.discount);
        setCodeError(null);
        setCodeInput('');
      } else {
        setDiscount(null);
        setCodeError(
          res.status === 429
            ? 'Too many tries. Please wait a minute.'
            : (data?.error?.message ?? 'This code could not be applied'),
        );
      }
    } catch {
      setCodeError('Network problem. Please try again.');
    } finally {
      setApplying(false);
    }
  }

  const discountCode = discount?.code;
  useEffect(() => {
    if (!discountCode) return;
    const id = setTimeout(() => void applyCode(discountCode, true), 500);
    return () => clearTimeout(id);
  }, [cartKey, city, discountCode]);

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
      ...(discount ? { discountCode: discount.code } : {}),
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
      paymentMethod: 'cod',
      website: text('website'),
      ...(turnstileSiteKey ? { captchaToken: text('cf-turnstile-response') } : {}),
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
      } else if (
        err?.details &&
        typeof err.details === 'object' &&
        'reason' in (err.details as Record<string, unknown>)
      ) {
        // The discount code stopped working (used up, expired…) between "Apply" and "Place order".
        setDiscount(null);
        setCodeError(err.message);
        setError(
          `${err.message}. Your order was not placed; please review the total and try again.`,
        );
      } else if (err?.code === 'captcha_failed') {
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
        setError(err.message);
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
        {status === 'signed-out' ? (
          <p className="rounded-[var(--ms-radius)] bg-black/[0.03] p-3 text-sm">
            Have an account?{' '}
            <Link
              href={`${accountHref}${accountHref.includes('?') ? '&' : '?'}next=${encodeURIComponent('/checkout')}`}
              className="font-semibold text-[var(--ms-primary)] underline"
            >
              Sign in
            </Link>{' '}
            for faster checkout, or continue as a guest.
          </p>
        ) : customer ? (
          <p className="rounded-[var(--ms-radius)] bg-black/[0.03] p-3 text-sm">
            Signed in as <strong>{customer.name}</strong>. This order will appear in your account.
          </p>
        ) : null}
        <h2 className="text-lg font-bold">Delivery details</h2>
        {customer && customer.addresses.length ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Saved addresses</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {customer.addresses.map((a) => (
                <label
                  key={a.id}
                  className={`cursor-pointer rounded-[var(--ms-radius)] border p-3 text-sm ${addressId === a.id ? 'border-[var(--ms-primary)] ring-1 ring-[var(--ms-primary)]' : 'border-[var(--ms-border)]'}`}
                >
                  <input
                    type="radio"
                    name="savedAddress"
                    value={a.id}
                    checked={addressId === a.id}
                    onChange={() => pickAddress(a.id)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{a.label}</span>
                  <span className="block text-[var(--ms-muted)]">
                    {a.address}, {a.city}
                  </span>
                </label>
              ))}
              <label
                className={`cursor-pointer rounded-[var(--ms-radius)] border p-3 text-sm ${addressId === '' ? 'border-[var(--ms-primary)] ring-1 ring-[var(--ms-primary)]' : 'border-[var(--ms-border)]'}`}
              >
                <input
                  type="radio"
                  name="savedAddress"
                  value=""
                  checked={addressId === ''}
                  onChange={() => pickAddress('')}
                  className="sr-only"
                />
                <span className="block font-semibold">New address</span>
                <span className="block text-[var(--ms-muted)]">Deliver somewhere else</span>
              </label>
            </div>
          </fieldset>
        ) : null}
        <div>
          <label htmlFor="name" className={label}>
            Full name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            value={city}
            onChange={(e) => setCity(e.target.value)}
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
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setAddressId('');
            }}
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
        {turnstileSiteKey ? (
          <>
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="afterInteractive"
            />
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
          </>
        ) : null}
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
        <div>
          {discount ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--ms-radius)] border border-dashed border-green-600 bg-green-50 p-3 text-sm text-green-900">
              <span>
                <span className="font-mono font-bold">{discount.code}</span>
                <span className="block text-xs">{discount.summary}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setDiscount(null);
                  setCodeError(null);
                }}
                className="font-semibold underline"
                aria-label={`Remove discount code ${discount.code}`}
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <label htmlFor="discount" className="mb-1 block text-sm font-semibold">
                Discount code
              </label>
              <div className="flex gap-2">
                <input
                  id="discount"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void applyCode(codeInput);
                    }
                  }}
                  maxLength={32}
                  autoComplete="off"
                  placeholder="Enter code"
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? 'discount-error' : undefined}
                  className="h-11 min-w-0 flex-1 rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3 font-mono uppercase aria-[invalid=true]:border-red-600"
                />
                <button
                  type="button"
                  onClick={() => void applyCode(codeInput)}
                  disabled={applying || !codeInput.trim()}
                  className="h-11 shrink-0 rounded-[var(--ms-btn-radius)] border border-[var(--ms-border)] px-4 text-sm font-semibold hover:bg-black/5 disabled:opacity-50"
                >
                  {applying ? 'Checking…' : 'Apply'}
                </button>
              </div>
            </div>
          )}
          {codeError ? (
            <p id="discount-error" className="mt-1 text-sm text-red-700">
              {codeError}
            </p>
          ) : null}
        </div>
        <Summary items={items} rules={rules} currency={currency} city={city} discount={discount} />
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
