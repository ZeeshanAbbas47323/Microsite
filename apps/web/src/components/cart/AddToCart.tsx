'use client';

import type { PublicProduct } from '@microstore/layouts/react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { formatMoney } from '@/lib/money';
import { cart, MAX_QTY } from './cart-store';

export function AddToCart({ product, cartHref }: { product: PublicProduct; cartHref: string }) {
  const variants = product.variants;
  const firstInStock = variants.find((v) => v.inStock) ?? null;
  const [variantId, setVariantId] = useState<string | null>(firstInStock?.id ?? null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const groupId = useId();

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const available = variants.length ? Boolean(variant?.inStock) : product.inStock;

  function add() {
    if (!available) return;
    cart.add(
      {
        productId: product.id,
        variantId: variant?.id ?? null,
        name: product.name,
        variantName: variant?.name ?? null,
        price: variant?.price ?? product.price,
        currency: product.currency,
        image: product.images[0]?.url ?? null,
      },
      qty,
    );
    setAdded(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {variants.length ? (
        <fieldset>
          <legend id={groupId} className="mb-2 text-sm font-semibold">
            Choose an option
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <label
                key={v.id}
                className={`cursor-pointer rounded-[var(--ms-radius)] border px-4 py-2 text-sm has-[:checked]:border-[var(--ms-primary)] has-[:checked]:ring-2 has-[:checked]:ring-[var(--ms-primary)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 border-[var(--ms-border)]`}
              >
                <input
                  type="radio"
                  name={groupId}
                  value={v.id}
                  checked={variantId === v.id}
                  disabled={!v.inStock}
                  onChange={() => {
                    setVariantId(v.id);
                    setAdded(false);
                  }}
                  className="sr-only"
                />
                {v.name}
                {v.price !== product.price ? ` · ${formatMoney(v.price, product.currency)}` : ''}
                {!v.inStock ? ' (sold out)' : ''}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Qty</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_QTY}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(MAX_QTY, Number(e.target.value) || 1)))}
            className="h-12 w-20 rounded-[var(--ms-radius)] border border-[var(--ms-border)] bg-transparent px-3"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!available}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-[var(--ms-btn-radius)] bg-[var(--ms-primary)] px-6 font-semibold text-[var(--ms-on-primary)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {available ? 'Add to cart' : 'Out of stock'}
        </button>
      </div>
      <p aria-live="polite" className="min-h-6 text-sm">
        {added ? (
          <>
            Added to cart.{' '}
            <Link href={cartHref} className="font-semibold text-[var(--ms-primary)] underline">
              View cart
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
