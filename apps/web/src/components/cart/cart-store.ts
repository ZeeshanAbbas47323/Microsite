'use client';

import { useSyncExternalStore } from 'react';

/**
 * Cart kept in localStorage (FR-5.1). Prices here are only for display: the server re-prices
 * every line at checkout.
 */
export interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  price: string;
  currency: string;
  image: string | null;
  qty: number;
}

const KEY = 'ms_cart_v1';
export const MAX_QTY = 99;
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };

function read(): CartItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.items;
  }
  if (raw === cache.raw) return cache.items;
  let items: CartItem[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      items = parsed.filter(
        (i): i is CartItem =>
          typeof i === 'object' &&
          i !== null &&
          typeof i.productId === 'string' &&
          Number.isInteger(i.qty) &&
          i.qty > 0,
      );
    }
  } catch {
    items = EMPTY;
  }
  cache = { raw, items };
  return items;
}

function write(items: CartItem[]) {
  const raw = JSON.stringify(items);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Storage full or blocked: keep the cart in memory for this page.
  }
  cache = { raw, items };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const sameLine = (
  a: Pick<CartItem, 'productId' | 'variantId'>,
  b: Pick<CartItem, 'productId' | 'variantId'>,
) => a.productId === b.productId && a.variantId === b.variantId;

export const cart = {
  add(item: Omit<CartItem, 'qty'>, qty: number) {
    const items = read();
    const existing = items.find((i) => sameLine(i, item));
    write(
      existing
        ? items.map((i) =>
            sameLine(i, item) ? { ...i, ...item, qty: Math.min(MAX_QTY, i.qty + qty) } : i,
          )
        : [...items, { ...item, qty: Math.min(MAX_QTY, qty) }],
    );
  },
  setQty(line: Pick<CartItem, 'productId' | 'variantId'>, qty: number) {
    write(
      read()
        .map((i) => (sameLine(i, line) ? { ...i, qty: Math.max(0, Math.min(MAX_QTY, qty)) } : i))
        .filter((i) => i.qty > 0),
    );
  },
  remove(line: Pick<CartItem, 'productId' | 'variantId'>) {
    write(read().filter((i) => !sameLine(i, line)));
  },
  clear() {
    write([]);
  },
};

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useCartCount(): number {
  return useCart().reduce((n, i) => n + i.qty, 0);
}
