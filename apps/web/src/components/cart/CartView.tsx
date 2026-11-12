'use client';

import Image from 'next/image';
import Link from 'next/link';
import { formatMoney, fromMinor, toMinor } from '@/lib/money';
import { cart, MAX_QTY, useCart, type CartItem } from './cart-store';

export interface ShippingRules {
  shippingFlatFee: string;
  freeShippingThreshold: string | null;
}

export function shippingFor(subtotalMinor: number, rules: ShippingRules): number {
  const threshold =
    rules.freeShippingThreshold === null ? null : toMinor(rules.freeShippingThreshold);
  return threshold !== null && subtotalMinor >= threshold ? 0 : toMinor(rules.shippingFlatFee);
}

export function totals(items: CartItem[], rules: ShippingRules) {
  const subtotal = items.reduce((sum, i) => sum + toMinor(i.price) * i.qty, 0);
  const shipping = items.length ? shippingFor(subtotal, rules) : 0;
  return {
    subtotal: fromMinor(subtotal),
    shipping: fromMinor(shipping),
    total: fromMinor(subtotal + shipping),
  };
}

export function CartLines({ items, editable }: { items: CartItem[]; editable: boolean }) {
  return (
    <ul className="divide-y divide-[var(--ms-border)]">
      {items.map((item) => (
        <li key={`${item.productId}:${item.variantId ?? ''}`} className="flex gap-4 py-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--ms-radius)] bg-[var(--ms-border)]">
            {item.image ? (
              <Image
                src={item.image}
                alt=""
                width={160}
                height={160}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <p className="font-semibold">{item.name}</p>
            {item.variantName ? (
              <p className="text-sm text-[var(--ms-muted)]">{item.variantName}</p>
            ) : null}
            <p className="text-sm">{formatMoney(item.price, item.currency)}</p>
            {editable ? (
              <div className="mt-1 flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <span className="sr-only">Quantity for {item.name}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_QTY}
                    value={item.qty}
                    onChange={(e) => cart.setQty(item, Number(e.target.value) || 1)}
                    className="h-10 w-20 rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => cart.remove(item)}
                  className="underline underline-offset-4 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--ms-muted)]">Qty {item.qty}</p>
            )}
          </div>
          <p className="font-semibold">
            {formatMoney(fromMinor(toMinor(item.price) * item.qty), item.currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Summary({
  items,
  rules,
  currency,
}: {
  items: CartItem[];
  rules: ShippingRules;
  currency: string;
}) {
  const t = totals(items, rules);
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatMoney(t.subtotal, currency)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Shipping</dt>
        <dd>{Number(t.shipping) === 0 ? 'Free' : formatMoney(t.shipping, currency)}</dd>
      </div>
      <div className="flex justify-between border-t border-[var(--ms-border)] pt-2 text-base font-bold">
        <dt>Total</dt>
        <dd>{formatMoney(t.total, currency)}</dd>
      </div>
      <p className="pt-1 text-xs text-[var(--ms-muted)]">
        Prices are confirmed when you place the order. Pay cash on delivery.
      </p>
    </dl>
  );
}

export function CartView({
  rules,
  currency,
  checkoutHref,
  productsHref,
}: {
  rules: ShippingRules;
  currency: string;
  checkoutHref: string;
  productsHref: string;
}) {
  const items = useCart();
  if (!items.length) {
    return (
      <div className="py-16 text-center">
        <p className="mb-6 text-lg text-[var(--ms-muted)]">Your cart is empty.</p>
        <Link
          href={productsHref}
          className="inline-flex rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] px-6 py-3 font-semibold text-[var(--ms-on-primary)]"
        >
          Browse products
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-10 py-8 md:grid-cols-[1fr_320px]">
      <CartLines items={items} editable />
      <aside className="h-fit space-y-5 rounded-[var(--ms-radius)] border border-[var(--ms-border)] p-5">
        <Summary items={items} rules={rules} currency={currency} />
        <Link
          href={checkoutHref}
          className="flex h-12 items-center justify-center rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] font-semibold text-[var(--ms-on-primary)] hover:brightness-110"
        >
          Checkout
        </Link>
      </aside>
    </div>
  );
}
