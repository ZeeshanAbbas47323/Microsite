'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
import { Icon, PATHS } from './editor/icons';
import { useT } from './i18n';
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

type View = 'all' | 'visible' | 'hidden' | 'featured' | 'out';
const VIEWS: [View, string][] = [
  ['all', 'All'],
  ['visible', 'On store'],
  ['hidden', 'Hidden'],
  ['featured', 'Featured'],
  ['out', 'Out of stock'],
];
const MATCHES: Record<View, (p: MerchantProduct) => boolean> = {
  all: () => true,
  visible: (p) => p.visible,
  hidden: (p) => !p.visible,
  featured: (p) => p.featured,
  out: (p) => p.stockQty <= 0,
};

/** The catalogue is read in pages of 100 (the API maximum), up to this many products. */
const FETCH_SIZE = 100;
const MAX_PRODUCTS = 1000;
const PAGE_SIZE = 25;

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-neutral-900' : 'bg-neutral-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

/**
 * FR-6.4: choose which Getorio products appear on the store and which are featured. Laid out as one
 * card with views, search and a table; the whole catalogue is loaded so views and search are instant.
 */
export function ProductsManager() {
  const { store } = useDashboard();
  const t = useT();
  const [items, setItems] = useState<MerchantProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    setError(null);
    try {
      const all: MerchantProduct[] = [];
      let count = 0;
      for (let p = 1; ; p++) {
        const res = await api<{ items: MerchantProduct[]; total: number }>(
          `/stores/${store.id}/products?page=${p}&pageSize=${FETCH_SIZE}`,
        );
        all.push(...res.items);
        count = res.total;
        if (res.items.length < FETCH_SIZE || all.length >= Math.min(count, MAX_PRODUCTS)) break;
      }
      setItems(all);
      setTotal(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
      setItems((list) => list ?? []);
    }
  }, [store]);

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

  const counts = useMemo(() => {
    const c = { all: 0, visible: 0, hidden: 0, featured: 0, out: 0 } as Record<View, number>;
    for (const p of items ?? []) for (const [v] of VIEWS) if (MATCHES[v](p)) c[v]++;
    return c;
  }, [items]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (p) =>
        MATCHES[view](p) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.category?.name.toLowerCase().includes(q) ?? false)),
    );
  }, [items, view, search]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('Products')}</h1>
          <p className="text-sm text-neutral-500">
            {t(
              'Products, prices and stock come from Getorio. Choose what shows on your store; changes go live right away.',
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {store?.url && store.status === 'published' ? (
            <a
              href={`${store.url.replace(/\/$/, '')}/products`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-neutral-300 hover:bg-neutral-50"
            >
              {t('View on store')}
              <Icon d={PATHS.external} className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('Refresh')}
          </Button>
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {total > MAX_PRODUCTS ? (
        <Notice>
          Showing the first {MAX_PRODUCTS.toLocaleString('en-PK')} of{' '}
          {total.toLocaleString('en-PK')} products. Use search to narrow them down.
        </Notice>
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {/* Views */}
        <div
          role="group"
          aria-label={t('Filter products')}
          className="flex gap-1 overflow-x-auto border-b border-neutral-200 p-2"
        >
          {VIEWS.map(([value, label]) => {
            const active = view === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setView(value);
                  setPage(1);
                }}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm ${active ? 'bg-neutral-200/70 font-semibold text-neutral-900' : 'font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}`}
              >
                {t(label)}
                <span className="text-xs text-neutral-500 tabular-nums">
                  {items ? counts[value] : '–'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="border-b border-neutral-200 p-2">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-neutral-400">
              <Icon d={PATHS.search} className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, SKU or category"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white ps-8 pe-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Products</caption>
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr className="border-b border-neutral-200">
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Product
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Inventory
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Category
                </th>
                <th scope="col" className="px-3 py-2.5 text-end font-medium">
                  Price
                </th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">
                  On store
                </th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">
                  Featured
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items === null ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-3 py-3">
                      <div className="h-8 animate-pulse rounded bg-neutral-100" />
                    </td>
                  </tr>
                ))
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-14 text-center text-neutral-500">
                    <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                      <Icon d={PATHS.products} />
                    </span>
                    <p className="font-medium text-neutral-700">
                      {items.length === 0
                        ? 'No products found in Getorio.'
                        : 'No products match this view.'}
                    </p>
                  </td>
                </tr>
              ) : (
                shown.map((p) => {
                  const busy = saving === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <th scope="row" className="px-3 py-2 text-start font-normal">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
                            {p.image ? (
                              <Image
                                src={p.image.url}
                                alt=""
                                width={80}
                                height={80}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-neutral-900">{p.name}</p>
                            <p className="text-xs text-neutral-500">{p.sku}</p>
                          </div>
                        </div>
                      </th>
                      <td className="px-3 py-2">
                        {!p.active ? (
                          <Badge tone="red">Inactive in Getorio</Badge>
                        ) : p.visible ? (
                          <Badge tone="green">{t('On store')}</Badge>
                        ) : (
                          <Badge>{t('Hidden')}</Badge>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 whitespace-nowrap ${p.stockQty > 0 ? 'text-neutral-700' : 'font-medium text-red-700'}`}
                      >
                        {p.stockQty > 0 ? `${p.stockQty} in stock` : t('Out of stock')}
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{p.category?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-end whitespace-nowrap tabular-nums">
                        {formatMoney(p.price, p.currency)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch
                          label={`Show ${p.name} on store`}
                          checked={p.visible}
                          disabled={busy}
                          onChange={(v) => void setFlags(p, { visible: v })}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          aria-pressed={p.featured}
                          aria-label={`Feature ${p.name}`}
                          title={
                            p.visible ? 'Featured on the home page' : 'Show it on the store first'
                          }
                          disabled={busy || !p.visible}
                          onClick={() => void setFlags(p, { featured: !p.featured })}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 ${p.featured ? 'text-amber-500' : 'text-neutral-400'}`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-[18px] w-[18px]"
                            fill={p.featured ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d={PATHS.star} />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-2.5 text-sm text-neutral-600">
          <span>
            {rows.length
              ? `Showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, rows.length)} of ${rows.length}`
              : 'No results'}
          </span>
          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center gap-1">
              <button
                type="button"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
                className="h-8 rounded-md px-2 hover:bg-neutral-100 disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <span className="px-2 tabular-nums">
                {current} / {pages}
              </span>
              <button
                type="button"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
                className="h-8 rounded-md px-2 hover:bg-neutral-100 disabled:opacity-40"
              >
                Next ›
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
