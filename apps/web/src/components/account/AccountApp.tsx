'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { formatMoney } from '@/lib/money';
import {
  AccountError,
  accountApi,
  customerSession,
  localPhone,
  useCustomer,
  type Customer,
  type CustomerAddress,
} from './customer-store';

interface AccountOrder {
  orderRef: string;
  status: string;
  currency: string;
  subtotal: string;
  shippingFee: string;
  discountCode: string | null;
  discountTotal: string;
  total: string;
  city: string;
  address: string;
  items: { name: string; qty: number; lineTotal: string }[];
  createdAt: string;
}

const field =
  'h-12 w-full rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3 aria-[invalid=true]:border-red-600';
const label = 'mb-1 block text-sm font-semibold';
const primaryBtn =
  'inline-flex h-12 items-center justify-center rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] px-6 font-semibold text-[var(--ms-on-primary)] hover:brightness-110 disabled:opacity-60';
const secondaryBtn =
  'inline-flex h-10 items-center justify-center rounded-[var(--ms-btn-radius)] border border-[var(--ms-border)] px-4 text-sm font-semibold hover:bg-black/5 disabled:opacity-60';

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

function Alert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-[var(--ms-radius)] p-3 text-sm ${tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
    >
      {children}
    </p>
  );
}

function PasswordInput({
  id,
  name,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        minLength={autoComplete === 'new-password' ? 8 : undefined}
        maxLength={128}
        className={`${field} pe-16`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 end-2 my-auto h-8 rounded px-2 text-sm font-medium text-[var(--ms-muted)] hover:text-[var(--ms-text)]"
        aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/** Storefront "My account": sign in / sign up, then orders, addresses, profile and password. */
export function AccountApp({
  storeName,
  currency,
  homeHref,
  trackHref,
}: {
  storeName: string;
  currency: string;
  homeHref: string;
  trackHref: string;
}) {
  const { status, customer } = useCustomer();
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-4xl py-10" aria-busy="true">
        <div className="h-64 animate-pulse rounded-[var(--ms-radius)] bg-[var(--ms-border)] opacity-40" />
      </div>
    );
  }
  if (!customer) return <AuthPanel storeName={storeName} />;
  return (
    <Dashboard customer={customer} currency={currency} homeHref={homeHref} trackHref={trackHref} />
  );
}

// -- Sign in / create account ----------------------------------------------------------------

function AuthPanel({ storeName }: { storeName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(
    params.get('mode') === 'register' ? 'register' : 'login',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body =
        mode === 'login'
          ? { identifier: text('identifier'), password: String(form.get('password') ?? '') }
          : {
              name: text('name'),
              phone: text('phone'),
              email: text('email'),
              password: String(form.get('password') ?? ''),
              acceptsMarketing: form.get('marketing') === 'on',
            };
      const { customer } = await accountApi<{ customer: Customer }>(`/${mode}`, {
        method: 'POST',
        body,
      });
      customerSession.set(customer);
      if (safeNext) router.push(safeNext);
    } catch (err) {
      if (err instanceof AccountError) {
        setFields(err.fields);
        setError(
          Object.keys(err.fields).length ? 'Please check the highlighted fields.' : err.message,
        );
      } else setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const fe = (k: string) =>
    fields[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {};

  return (
    <div className="mx-auto grid max-w-4xl gap-8 py-8 md:grid-cols-[1fr_320px]">
      <section className="min-w-0 rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-6 sm:p-8">
        <div
          role="tablist"
          aria-label="Account"
          className="mb-6 grid grid-cols-2 rounded-[var(--ms-radius)] bg-black/5 p-1 text-sm font-semibold"
        >
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
                setFields({});
              }}
              className={`h-10 rounded-[calc(var(--ms-radius)-2px)] ${mode === m ? 'bg-[var(--ms-bg)] shadow-sm' : 'text-[var(--ms-muted)]'}`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate key={mode}>
          <h2 className="text-xl font-bold">
            {mode === 'login' ? 'Welcome back' : `Join ${storeName}`}
          </h2>
          {mode === 'login' ? (
            <>
              <div>
                <label htmlFor="identifier" className={label}>
                  Email or mobile number
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  autoComplete="username"
                  required
                  placeholder="you@example.com or 03XX XXXXXXX"
                  className={field}
                  {...fe('identifier')}
                />
                <FieldError id="identifier-error" message={fields.identifier} />
              </div>
              <div>
                <label htmlFor="password" className={label}>
                  Password
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  invalid={Boolean(fields.password)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="name" className={label}>
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                  className={field}
                  {...fe('name')}
                />
                <FieldError id="name-error" message={fields.name} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                    className={field}
                    {...fe('phone')}
                  />
                  <FieldError id="phone-error" message={fields.phone} />
                </div>
                <div>
                  <label htmlFor="email" className={label}>
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className={field}
                    {...fe('email')}
                  />
                  <FieldError id="email-error" message={fields.email} />
                </div>
              </div>
              <p className="-mt-2 text-xs text-[var(--ms-muted)]">
                Enter a mobile number, an email, or both. You can sign in with either.
              </p>
              <div>
                <label htmlFor="new-password" className={label}>
                  Password
                </label>
                <PasswordInput
                  id="new-password"
                  name="password"
                  autoComplete="new-password"
                  invalid={Boolean(fields.password)}
                  describedBy="password-hint"
                />
                <p id="password-hint" className="mt-1 text-xs text-[var(--ms-muted)]">
                  At least 8 characters.
                </p>
                <FieldError id="password-error" message={fields.password} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="marketing" className="mt-0.5 h-4 w-4" />
                <span>Send me offers and new arrivals</span>
              </label>
            </>
          )}
          {error ? <Alert>{error}</Alert> : null}
          <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <p className="text-center text-sm text-[var(--ms-muted)]">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="font-semibold text-[var(--ms-primary)] underline"
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </section>

      <aside className="space-y-4 self-start rounded-[var(--ms-radius)] bg-black/[0.03] p-6">
        <h2 className="font-bold">Why create an account?</h2>
        <ul className="space-y-3 text-sm">
          {[
            ['🚚', 'Track every order', 'See the status of all your orders in one place.'],
            ['⚡', 'Faster checkout', 'Your details and addresses are filled in for you.'],
            ['🏷️', 'Offers for members', 'Be the first to hear about sales and new arrivals.'],
          ].map(([icon, title, text]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden="true" className="text-lg">
                {icon}
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-[var(--ms-muted)]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ms-muted)]">
          You can still check out as a guest. Orders are cash on delivery.
        </p>
      </aside>
    </div>
  );
}

// -- Signed in --------------------------------------------------------------------------------

type Tab = 'orders' | 'addresses' | 'profile' | 'password';
const TABS: [Tab, string][] = [
  ['orders', 'My orders'],
  ['addresses', 'Addresses'],
  ['profile', 'Profile'],
  ['password', 'Password'],
];

function Dashboard({
  customer,
  currency,
  homeHref,
  trackHref,
}: {
  customer: Customer;
  currency: string;
  homeHref: string;
  trackHref: string;
}) {
  const [tab, setTab] = useState<Tab>('orders');
  const since = new Intl.DateTimeFormat('en-PK', { month: 'long', year: 'numeric' }).format(
    new Date(customer.memberSince),
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ms-primary)] text-lg font-bold text-[var(--ms-on-primary)]"
          >
            {customer.name.trim()[0]?.toUpperCase()}
          </span>
          <div>
            <h2 className="text-xl font-bold">Hi, {customer.name.split(/\s+/)[0]}</h2>
            <p className="text-sm text-[var(--ms-muted)]">Member since {since}</p>
          </div>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-[var(--ms-muted)]">Orders</dt>
            <dd className="text-lg font-bold tabular-nums">{customer.orders}</dd>
          </div>
          <div>
            <dt className="text-[var(--ms-muted)]">Total spent</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatMoney(customer.totalSpent, currency)}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => void customerSession.signOut()}
          className={secondaryBtn}
        >
          Sign out
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav aria-label="Account sections" className="min-w-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {TABS.map(([key, text]) => (
              <li key={key}>
                <button
                  type="button"
                  aria-current={tab === key ? 'page' : undefined}
                  onClick={() => setTab(key)}
                  className={`w-full shrink-0 rounded-[var(--ms-radius)] px-4 py-2.5 text-start text-sm font-semibold whitespace-nowrap ${tab === key ? 'bg-[var(--ms-primary)] text-[var(--ms-on-primary)]' : 'hover:bg-black/5'}`}
                >
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          {tab === 'orders' ? (
            <Orders currency={currency} homeHref={homeHref} trackHref={trackHref} />
          ) : null}
          {tab === 'addresses' ? <Addresses customer={customer} /> : null}
          {tab === 'profile' ? <Profile customer={customer} /> : null}
          {tab === 'password' ? <Password /> : null}
        </div>
      </div>
    </div>
  );
}

function Orders({
  currency,
  homeHref,
  trackHref,
}: {
  currency: string;
  homeHref: string;
  trackHref: string;
}) {
  const [data, setData] = useState<{
    items: AccountOrder[];
    total: number;
    pageSize: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    accountApi<{ items: AccountOrder[]; total: number; pageSize: number }>(`/orders?page=${page}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [page]);
  if (error) return <Alert>{error}</Alert>;
  if (!data)
    return (
      <div className="h-40 animate-pulse rounded-[var(--ms-radius)] bg-[var(--ms-border)] opacity-40" />
    );
  if (!data.items.length)
    return (
      <div className="rounded-[var(--ms-radius)] border border-dashed border-[var(--ms-border)] p-10 text-center">
        <p className="font-semibold">No orders yet</p>
        <p className="mt-1 text-sm text-[var(--ms-muted)]">
          Orders you place while signed in show up here.
        </p>
        <Link href={homeHref} className={`${primaryBtn} mt-4`}>
          Start shopping
        </Link>
      </div>
    );
  const pages = Math.ceil(data.total / data.pageSize);
  return (
    <div className="space-y-4">
      {data.items.map((o) => (
        <article
          key={o.orderRef}
          className="rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-mono font-bold">{o.orderRef}</h3>
              <p className="text-sm text-[var(--ms-muted)]">
                {new Intl.DateTimeFormat('en-PK', {
                  dateStyle: 'medium',
                  timeZone: 'Asia/Karachi',
                }).format(new Date(o.createdAt))}{' '}
                · {o.city}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${o.status === 'cancelled' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
            >
              {o.status === 'cancelled' ? 'Cancelled' : 'Received'}
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {o.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-3">
                <span>
                  {i.name} × {i.qty}
                </span>
                <span className="tabular-nums">{formatMoney(i.lineTotal, currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ms-border)] pt-3 text-sm">
            <span className="text-[var(--ms-muted)]">
              {Number(o.discountTotal) > 0
                ? `Saved ${formatMoney(o.discountTotal, currency)} with ${o.discountCode} · `
                : ''}
              Delivery {Number(o.shippingFee) === 0 ? 'free' : formatMoney(o.shippingFee, currency)}
            </span>
            <span className="flex items-center gap-3">
              <strong className="tabular-nums">{formatMoney(o.total, currency)}</strong>
              <Link
                href={`${trackHref}?ref=${encodeURIComponent(o.orderRef)}`}
                className="font-semibold text-[var(--ms-primary)] underline"
              >
                Track
              </Link>
            </span>
          </div>
        </article>
      ))}
      {pages > 1 ? (
        <nav aria-label="Order pages" className="flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={secondaryBtn}
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className={secondaryBtn}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setFields({});
    setDone(null);
    try {
      await fn();
      setDone(success);
    } catch (err) {
      if (err instanceof AccountError) {
        setFields(err.fields);
        setError(
          Object.keys(err.fields).length ? 'Please check the highlighted fields.' : err.message,
        );
      } else setError('Network problem. Please try again.');
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, fields, done, run };
}

function Addresses({ customer }: { customer: Customer }) {
  const [adding, setAdding] = useState(customer.addresses.length === 0);
  const { busy, error, fields, done, run } = useSubmit();
  const fe = (k: string) =>
    fields[k] ? { 'aria-invalid': true as const, 'aria-describedby': `a-${k}-error` } : {};

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    void run(async () => {
      const { customer: c } = await accountApi<{ customer: Customer }>('/addresses', {
        method: 'POST',
        body: {
          label: text('label') || 'Home',
          name: text('name'),
          phone: text('phone'),
          address: text('address'),
          city: text('city'),
          isDefault: form.get('isDefault') === 'on',
        },
      });
      customerSession.set(c);
      setAdding(false);
    }, 'Address saved');
  }

  const act = (a: CustomerAddress, method: 'PATCH' | 'DELETE') =>
    run(
      async () => {
        const { customer: c } = await accountApi<{ customer: Customer }>(`/addresses/${a.id}`, {
          method,
          ...(method === 'PATCH' ? { body: { isDefault: true } } : {}),
        });
        customerSession.set(c);
      },
      method === 'DELETE' ? 'Address removed' : 'Default address updated',
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Saved addresses</h2>
        {!adding && customer.addresses.length < 10 ? (
          <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
            + Add address
          </button>
        ) : null}
      </div>
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error && !adding ? <Alert>{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {customer.addresses.map((a) => (
          <div
            key={a.id}
            className={`rounded-[var(--ms-radius)] border p-4 text-sm ${a.isDefault ? 'border-[var(--ms-primary)]' : 'border-[var(--ms-border)]'}`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {a.label}
              {a.isDefault ? (
                <span className="rounded-full bg-[var(--ms-primary)] px-2 py-0.5 text-xs text-[var(--ms-on-primary)]">
                  Default
                </span>
              ) : null}
            </p>
            <p className="mt-1">{a.name}</p>
            <p className="text-[var(--ms-muted)]">{localPhone(a.phone)}</p>
            <p className="text-[var(--ms-muted)]">
              {a.address}, {a.city}
            </p>
            <div className="mt-3 flex gap-3">
              {!a.isDefault ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(a, 'PATCH')}
                  className="font-semibold text-[var(--ms-primary)] underline"
                >
                  Make default
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(a, 'DELETE')}
                className="font-semibold text-red-700 underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {adding ? (
        <form
          onSubmit={add}
          noValidate
          className="space-y-4 rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5"
        >
          <h3 className="font-bold">New address</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="a-label" className={label}>
                Label
              </label>
              <input
                id="a-label"
                name="label"
                placeholder="Home, Office…"
                maxLength={40}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="a-name" className={label}>
                Receiver name
              </label>
              <input
                id="a-name"
                name="name"
                defaultValue={customer.name}
                autoComplete="name"
                className={field}
                {...fe('name')}
              />
              <FieldError id="a-name-error" message={fields.name} />
            </div>
            <div>
              <label htmlFor="a-phone" className={label}>
                Mobile number
              </label>
              <input
                id="a-phone"
                name="phone"
                type="tel"
                defaultValue={localPhone(customer.phone)}
                autoComplete="tel"
                className={field}
                {...fe('phone')}
              />
              <FieldError id="a-phone-error" message={fields.phone} />
            </div>
            <div>
              <label htmlFor="a-city" className={label}>
                City
              </label>
              <input
                id="a-city"
                name="city"
                autoComplete="address-level2"
                className={field}
                {...fe('city')}
              />
              <FieldError id="a-city-error" message={fields.city} />
            </div>
          </div>
          <div>
            <label htmlFor="a-address" className={label}>
              Full address
            </label>
            <textarea
              id="a-address"
              name="address"
              rows={2}
              autoComplete="street-address"
              className={`${field} h-auto py-2`}
              {...fe('address')}
            />
            <FieldError id="a-address-error" message={fields.address} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" className="h-4 w-4" /> Use as my default address
          </label>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? 'Saving…' : 'Save address'}
            </button>
            {customer.addresses.length ? (
              <button
                type="button"
                onClick={() => setAdding(false)}
                className={`${secondaryBtn} h-12`}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Profile({ customer }: { customer: Customer }) {
  const { busy, error, fields, done, run } = useSubmit();
  const fe = (k: string) =>
    fields[k] ? { 'aria-invalid': true as const, 'aria-describedby': `p-${k}-error` } : {};
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    void run(async () => {
      const { customer: c } = await accountApi<{ customer: Customer }>('', {
        method: 'PATCH',
        body: {
          name: text('name'),
          email: text('email'),
          phone: text('phone'),
          acceptsMarketing: form.get('marketing') === 'on',
        },
      });
      customerSession.set(c);
    }, 'Profile saved');
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
      <h2 className="text-lg font-bold">Profile</h2>
      <div>
        <label htmlFor="p-name" className={label}>
          Full name
        </label>
        <input
          id="p-name"
          name="name"
          defaultValue={customer.name}
          autoComplete="name"
          className={field}
          {...fe('name')}
        />
        <FieldError id="p-name-error" message={fields.name} />
      </div>
      <div>
        <label htmlFor="p-phone" className={label}>
          Mobile number
        </label>
        <input
          id="p-phone"
          name="phone"
          type="tel"
          defaultValue={localPhone(customer.phone)}
          autoComplete="tel"
          className={field}
          {...fe('phone')}
        />
        <FieldError id="p-phone-error" message={fields.phone} />
      </div>
      <div>
        <label htmlFor="p-email" className={label}>
          Email
        </label>
        <input
          id="p-email"
          name="email"
          type="email"
          defaultValue={customer.email ?? ''}
          autoComplete="email"
          className={field}
          {...fe('email')}
        />
        <FieldError id="p-email-error" message={fields.email} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="marketing"
          defaultChecked={customer.acceptsMarketing}
          className="h-4 w-4"
        />{' '}
        Send me offers and new arrivals
      </label>
      {error ? <Alert>{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

function Password() {
  const { busy, error, fields, done, run } = useSubmit();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    void run(async () => {
      await accountApi('/password', {
        method: 'POST',
        body: {
          currentPassword: String(form.get('current') ?? ''),
          newPassword: String(form.get('password') ?? ''),
        },
      });
      formEl.reset();
    }, 'Password changed');
  }
  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
      <h2 className="text-lg font-bold">Change password</h2>
      <div>
        <label htmlFor="pw-current" className={label}>
          Current password
        </label>
        <PasswordInput
          id="pw-current"
          name="current"
          autoComplete="current-password"
          invalid={Boolean(fields.currentPassword)}
          describedBy="pw-current-error"
        />
        <FieldError id="pw-current-error" message={fields.currentPassword} />
      </div>
      <div>
        <label htmlFor="pw-new" className={label}>
          New password
        </label>
        <PasswordInput
          id="pw-new"
          name="password"
          autoComplete="new-password"
          invalid={Boolean(fields.newPassword)}
          describedBy="pw-new-error"
        />
        <FieldError id="pw-new-error" message={fields.newPassword ?? undefined} />
        {!fields.newPassword ? (
          <p className="mt-1 text-xs text-[var(--ms-muted)]">At least 8 characters.</p>
        ) : null}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
