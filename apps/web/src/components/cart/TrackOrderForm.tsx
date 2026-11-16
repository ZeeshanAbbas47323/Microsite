'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatMoney } from '@/lib/money';

type Status =
  | 'received'
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

interface Tracked {
  order: {
    orderRef: string;
    currency: string;
    total: string;
    items: { name: string; qty: number }[];
    createdAt: string;
  };
  tracking: { status: Status; updatedAt: string };
}

const STEPS = ['received', 'confirmed', 'shipped', 'delivered'] as const;
const LABELS: Record<Status, string> = {
  received: 'Order received',
  pending: 'Order received',
  confirmed: 'Confirmed',
  processing: 'Being prepared',
  shipped: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

/** Position on the progress line; cancelled/returned orders show no progress. */
function stepOf(status: Status) {
  if (status === 'pending') return 0;
  if (status === 'processing') return 1;
  return STEPS.indexOf(status as (typeof STEPS)[number]);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}

/** FR-5.10: customer looks up an order with its number and the phone used at checkout. */
export function TrackOrderForm() {
  const refInput = useRef<HTMLInputElement>(null);
  // The confirmation page links here with `?ref=`; read on the client so the page stays static.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && refInput.current && !refInput.current.value)
      refInput.current.value = ref.slice(0, 20);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Tracked | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/storefront/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderRef: String(form.get('orderRef') ?? '').trim(),
          phone: String(form.get('phone') ?? '').trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (Tracked & { error?: undefined })
        | { error: { code: string; message: string; details?: { message: string }[] } }
        | null;
      if (res.ok && data && !data.error) setResult(data);
      else if (res.status === 429)
        setError('Too many attempts. Please wait a minute and try again.');
      else if (data?.error?.code === 'validation_error')
        setError(data.error.details?.[0]?.message ?? 'Please check the order number and phone.');
      else setError(data?.error?.message ?? 'Something went wrong. Please try again.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'h-12 w-full rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3';
  const label = 'mb-1 block text-sm font-semibold';
  const status = result?.tracking.status;
  const step = status ? stepOf(status) : -1;

  return (
    <div className="mx-auto max-w-xl space-y-8 py-8">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <p className="text-[var(--ms-muted)]">
          Enter the order number from your confirmation and the phone number you ordered with.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="orderRef" className={label}>
              Order number
            </label>
            <input
              id="orderRef"
              name="orderRef"
              ref={refInput}
              placeholder="MS-AB12CD3"
              autoCapitalize="characters"
              maxLength={20}
              required
              className={field}
            />
          </div>
          <div>
            <label htmlFor="phone" className={label}>
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="03XX XXXXXXX"
              maxLength={20}
              required
              className={field}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] font-semibold text-[var(--ms-on-primary)] hover:brightness-110 disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Track order'}
        </button>
      </form>

      <div aria-live="polite">
        {error ? (
          <p role="alert" className="rounded-[var(--ms-radius)] bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {result && status ? (
          <section
            aria-label="Order status"
            className="space-y-5 rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5"
          >
            <div>
              <p className="text-sm text-[var(--ms-muted)]">Order {result.order.orderRef}</p>
              <p className="text-2xl font-bold">{LABELS[status]}</p>
              <p className="text-sm text-[var(--ms-muted)]">
                Updated {formatDate(result.tracking.updatedAt)}
              </p>
            </div>
            {step >= 0 ? (
              <ol className="grid grid-cols-4 gap-2 text-center text-xs">
                {STEPS.map((s, i) => (
                  <li key={s} {...(i === step ? { 'aria-current': 'step' as const } : {})}>
                    <span
                      className={`mb-1 block h-1.5 rounded-full ${i <= step ? 'bg-[var(--ms-primary)]' : 'bg-[var(--ms-border)]'}`}
                    />
                    <span className={i <= step ? 'font-semibold' : 'text-[var(--ms-muted)]'}>
                      {LABELS[s]}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            <ul className="space-y-1 border-t border-[var(--ms-border)] pt-3 text-sm">
              {result.order.items.map((i, idx) => (
                <li key={idx}>
                  {i.name} × {i.qty}
                </li>
              ))}
              <li className="pt-2 font-semibold">
                Total {formatMoney(result.order.total, result.order.currency)}
              </li>
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
