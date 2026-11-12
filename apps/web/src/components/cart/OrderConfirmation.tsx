'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { formatMoney } from '@/lib/money';
import { LAST_ORDER_STORAGE } from './CheckoutForm';

interface Summary {
  orderRef: string;
  currency: string;
  subtotal: string;
  shippingFee: string;
  total: string;
  items: { name: string; qty: number; lineTotal: string }[];
}

function readOrder(): string | null {
  try {
    return sessionStorage.getItem(LAST_ORDER_STORAGE);
  } catch {
    return null;
  }
}

export function OrderConfirmation({ orderRef, homeHref }: { orderRef: string; homeHref: string }) {
  const raw = useSyncExternalStore(
    () => () => {},
    readOrder,
    () => null,
  );
  let order: Summary | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as Summary) : null;
    order = parsed?.orderRef === orderRef ? parsed : null;
  } catch {
    order = null;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700"
        aria-hidden="true"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m5 12 5 5L20 7" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold">Thank you! Your order is placed.</h1>
      <p className="text-[var(--ms-muted)]">
        Order number <strong className="text-[var(--ms-text)]">{orderRef}</strong>. We will call you
        to confirm delivery. Please keep cash ready when it arrives.
      </p>
      {order ? (
        <div className="rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5 text-start">
          <ul className="space-y-2 text-sm">
            {order.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-4">
                <span>
                  {i.name} × {i.qty}
                </span>
                <span>{formatMoney(i.lineTotal, order.currency)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-[var(--ms-border)] pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd>
                {Number(order.shippingFee) === 0
                  ? 'Free'
                  : formatMoney(order.shippingFee, order.currency)}
              </dd>
            </div>
            <div className="flex justify-between text-base font-bold">
              <dt>Total (cash on delivery)</dt>
              <dd>{formatMoney(order.total, order.currency)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      <Link
        href={homeHref}
        className="inline-flex rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] px-6 py-3 font-semibold text-[var(--ms-on-primary)]"
      >
        Continue shopping
      </Link>
    </div>
  );
}
