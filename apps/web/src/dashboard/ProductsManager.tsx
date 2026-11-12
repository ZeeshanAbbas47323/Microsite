'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Notice, Toggle } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
import { useDashboard } from './session';

interface MerchantProduct {
  id: string;
  sku: string;
  name: string;
  price: string;
  currency: string;
  image: { url: string; alt: string } | null;
  category: { id: string; name: string } | null;
  stockQty: number;
  active: boolean;
  visible: boolean;
  featured: boolean;
}

const PAGE_SIZE = 25;

/** FR-6.4: choose which Getorio products appear on the store and which are featured. */
export function ProductsManager() {
  const { store } = useDashboard();
  const [items, setItems] = useState<MerchantProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        ...(query ? { search: query } : {}),
      });
      const res = await api<{ items: MerchantProduct[]; total: number }>(
        `/stores/${store.id}/products?${q}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
      setItems([]);
    }
  }, [store, page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setFlags(
    product: MerchantProduct,
    flags: Partial<Pick<MerchantProduct, 'visible' | 'featured'>>,
  ) {
    if (!store) return;
    setSaving(product.id);
    setError(null);
    const previous = items;
    setItems((list) => list?.map((p) => (p.id === product.id ? { ...p, ...flags } : p)) ?? null);
    try {
      const res = await api<{ product: MerchantProduct }>(
        `/stores/${store.id}/products/${encodeURIComponent(product.id)}`,
        { method: 'PATCH', body: flags },
      );
      setItems((list) => list?.map((p) => (p.id === product.id ? res.product : p)) ?? null);
    } catch (e) {
      setItems(previous);
      setError(e instanceof Error ? e.message : 'Could not update the product');
    } finally {
      setSaving(null);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-neutral-600">
          Products, prices and stock come from Getorio. Choose what shows on your store; changes go
          live right away.
        </p>
      </div>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <Input
          aria-label="Search products"
          placeholder="Search by name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {items === null ? (
        <p className="text-neutral-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500">
          No products found in Getorio.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                {p.image ? (
                  <Image
                    src={p.image.url}
                    alt=""
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-40 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-neutral-500">
                  {p.sku} · {formatMoney(p.price, p.currency)} ·{' '}
                  {p.stockQty > 0 ? `${p.stockQty} in stock` : 'Out of stock'}
                </p>
                {!p.active ? <Badge tone="red">Inactive in Getorio</Badge> : null}
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-56">
                <Toggle
                  label="Show on store"
                  checked={p.visible}
                  disabled={saving === p.id}
                  onChange={(v) => setFlags(p, { visible: v })}
                />
                <Toggle
                  label="Featured"
                  checked={p.featured}
                  disabled={saving === p.id || !p.visible}
                  onChange={(v) => setFlags(p, { featured: v })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button
            variant="secondary"
            disabled={page === pages}
            onClick={() => setPage((n) => n + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
