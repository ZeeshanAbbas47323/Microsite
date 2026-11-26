'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
import { Icon, PATHS } from './editor/icons';
import { useT } from './i18n';
import { formatDate, SyncBadge, type OrderRow } from './Overview';
import { useDashboard } from './session';

interface OrderDetail extends OrderRow {
  address: string;
  customerEmail: string | null;
  notes: string | null;
  subtotal: string;
  shippingFee: string;
  items: { sku: string; name: string; qty: number; unitPrice: string; lineTotal: string }[];
}
interface ListResponse {
  items: OrderRow[];
  total: number;
  statusCounts: Partial<Record<OrderRow['status'], number>>;
  totalValue: string;
}

type Status = '' | OrderRow['status'];
type SortKey = 'createdAt' | 'total' | 'customerName' | 'city';
type ColumnKey = 'date' | 'customer' | 'city' | 'items' | 'total' | 'status';

const STATUSES: [Status, string][] = [
  ['', 'All'],
  ['pending_sync', 'Sending'],
  ['sync_failed', 'Failed'],
  ['synced', 'In Getorio'],
  ['cancelled', 'Cancelled'],
];
const COLUMNS: [ColumnKey, string][] = [
  ['date', 'Date'],
  ['customer', 'Customer'],
  ['city', 'City'],
  ['items', 'Items'],
  ['total', 'Total'],
  ['status', 'Status'],
];
const PAGE_SIZES = [10, 20, 50, 100] as const;
const RANGES = [
  ['', 'All time'],
  ['0', 'Today'],
  ['6', 'Last 7 days'],
  ['29', 'Last 30 days'],
  ['89', 'Last 90 days'],
  ['custom', 'Custom'],
] as const;
type RangeKey = (typeof RANGES)[number][0];

/** Calendar day in Pakistan, `daysAgo` days before today (YYYY-MM-DD). */
function pktDay(daysAgo = 0) {
  return new Date(Date.now() + 5 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** CSV cell; neutralises spreadsheet formulas (=, +, -, @). */
function csvCell(value: string | number) {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, rows: OrderRow[]) {
  const header = [
    'Order',
    'Date',
    'Customer',
    'Phone',
    'City',
    'Items',
    'Discount code',
    'Discount',
    'Total',
    'Currency',
    'Status',
  ];
  const lines = rows.map((o) =>
    [
      o.orderRef,
      formatDate(o.createdAt),
      o.customerName,
      o.customerPhone,
      o.city,
      o.itemCount,
      o.discountCode ?? '',
      o.discountTotal,
      o.total,
      o.currency,
      o.status,
    ]
      .map(csvCell)
      .join(','),
  );
  const blob = new Blob([`\uFEFF${[header.join(','), ...lines].join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
  align = 'start',
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (c: SortKey) => void;
  align?: 'start' | 'end';
}) {
  const active = sort === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-3 py-2.5 font-medium ${align === 'end' ? 'text-end' : 'text-start'}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 rounded hover:text-neutral-900 ${active ? 'text-neutral-900' : ''}`}
      >
        {label}
        <span aria-hidden="true" className={active ? '' : 'opacity-30'}>
          {active && dir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  );
}

/** FR-6.5: microstore orders as a searchable, sortable data table with Getorio sync status. */
export function OrdersList() {
  const { store } = useDashboard();
  const t = useT();
  const [status, setStatus] = useState<Status>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangeKey>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, OrderRow>>(new Map());
  const [open, setOpen] = useState<Record<string, OrderDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  // Links such as /dashboard/orders?search=MS-ABC123 (from a customer profile) open pre-filtered.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('search')?.trim();
    if (q) setSearchInput(q.slice(0, 100));
  }, []);

  // Debounced search.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!columnsOpen) return;
    const close = (e: MouseEvent) => {
      if (!columnsRef.current?.contains(e.target as Node)) setColumnsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [columnsOpen]);

  const dates = useMemo(() => {
    if (range === '') return {};
    if (range === 'custom') return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
    return { from: pktDay(Number(range)), to: pktDay() };
  }, [range, from, to]);

  const query = useCallback(
    (p: number, size: number, withStatus = true) =>
      new URLSearchParams({
        page: String(p),
        pageSize: String(size),
        sort,
        dir,
        ...(withStatus && status ? { status } : {}),
        ...(search ? { search } : {}),
        ...dates,
      }),
    [sort, dir, status, search, dates],
  );

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      setData(await api<ListResponse>(`/stores/${store.id}/orders?${query(page, pageSize)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [store, query, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSort(column: SortKey) {
    if (sort === column) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(column);
      setDir(column === 'customerName' || column === 'city' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  async function toggle(o: OrderRow) {
    if (!store) return;
    if (open[o.id]) {
      setOpen(({ [o.id]: _removed, ...rest }) => rest);
      return;
    }
    const { order } = await api<{ order: OrderDetail }>(`/stores/${store.id}/orders/${o.id}`);
    setOpen((m) => ({ ...m, [o.id]: order }));
  }

  async function retry(rows: OrderRow[]) {
    if (!store) return;
    const failed = rows.filter((o) => o.status === 'sync_failed');
    if (!failed.length) return;
    setBusy('retry');
    setError(null);
    let ok = 0;
    for (const o of failed) {
      try {
        await api(`/stores/${store.id}/orders/${o.id}/retry-sync`, { method: 'POST' });
        ok++;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Retry failed');
      }
    }
    setBusy(null);
    setSelected(new Map());
    setToast(`${ok} order${ok === 1 ? '' : 's'} sent to Getorio again.`);
    await load();
  }

  async function exportAll() {
    if (!store || !data) return;
    setBusy('export');
    try {
      const rows: OrderRow[] = [];
      for (let p = 1; p <= Math.min(20, Math.ceil(data.total / 100)); p++) {
        const r = await api<ListResponse>(`/stores/${store.id}/orders?${query(p, 100)}`);
        rows.push(...r.items);
      }
      download(`orders-${pktDay()}.csv`, rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const rows = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const allOnPage = rows.length > 0 && rows.every((o) => selected.has(o.id));
  const someOnPage = rows.some((o) => selected.has(o.id));
  const failedSelected = [...selected.values()].filter((o) => o.status === 'sync_failed').length;
  const show = (c: ColumnKey) => !hidden.has(c);
  const colCount = 3 + COLUMNS.filter(([c]) => show(c)).length;
  const counts = data?.statusCounts ?? {};
  const allCount = Object.values(counts).reduce((n, v) => n + (v ?? 0), 0);
  const filtered = Boolean(search || range || status);

  const pageList = useMemo(() => {
    const list: (number | '…')[] = [];
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 1) list.push(p);
      else if (list.at(-1) !== '…') list.push('…');
    }
    return list;
  }, [pages, page]);

  const failedCount = counts.sync_failed ?? 0;
  const stats: { label: string; value: string; tone?: 'red' }[] = [
    { label: t('Orders'), value: data ? data.total.toLocaleString('en-PK') : '–' },
    {
      label: t('Sales'),
      value: data ? formatMoney(data.totalValue, store?.currency ?? 'PKR') : '–',
    },
    { label: t('In Getorio'), value: data ? String(counts.synced ?? 0) : '–' },
    {
      label: t('Needs attention'),
      value: data ? String(failedCount) : '–',
      ...(failedCount ? { tone: 'red' as const } : {}),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('Orders')}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('Refresh')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void exportAll()}
            loading={busy === 'export'}
            disabled={!data?.total}
          >
            {t('Export')}
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <dl className="grid grid-cols-2 divide-neutral-200 rounded-xl border border-neutral-200 bg-white sm:grid-cols-4 sm:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-3">
            <dt className="text-xs font-medium text-neutral-500">
              {filtered && s.label !== t('Needs attention')
                ? `${s.label} · ${t('filtered')}`
                : s.label}
            </dt>
            <dd
              className={`mt-0.5 text-lg font-semibold tabular-nums ${s.tone === 'red' ? 'text-red-700' : ''}`}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {/* Views + bulk actions */}
        {selected.size > 0 ? (
          <div className="flex h-12 flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 text-sm">
            <span className="font-semibold">{selected.size} selected</span>
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={!failedSelected}
              loading={busy === 'retry'}
              onClick={() => void retry([...selected.values()])}
            >
              Retry sync{failedSelected ? ` (${failedSelected})` : ''}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={() => download(`orders-selected-${pktDay()}.csv`, [...selected.values()])}
            >
              Export selected
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="ms-auto rounded-md px-2 py-1 font-medium text-neutral-600 hover:bg-neutral-200/60"
            >
              Clear selection
            </button>
          </div>
        ) : (
          <div
            role="group"
            aria-label={t('Filter orders')}
            className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-2 py-2"
          >
            {STATUSES.map(([value, label]) => {
              const active = status === value;
              const n = value ? (counts[value] ?? 0) : allCount;
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm ${active ? 'bg-neutral-200/70 font-semibold text-neutral-900' : 'font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}`}
                >
                  {t(label)}
                  <span
                    className={`text-xs tabular-nums ${value === 'sync_failed' && n ? 'rounded-full bg-red-100 px-1.5 text-red-800' : 'text-neutral-500'}`}
                  >
                    {data ? n : '–'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-2 border-b border-neutral-200 p-2">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search orders</span>
            <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-neutral-400">
              <Icon d={PATHS.search} className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order no., customer, phone or city"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white ps-8 pe-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">Date range</span>
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value as RangeKey);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
            >
              {RANGES.map(([v, label]) => (
                <option key={v || 'all'} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {range === 'custom' ? (
            <>
              <label className="text-xs text-neutral-600">
                From
                <input
                  type="date"
                  value={from}
                  max={to || pktDay()}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                  className="mt-0.5 block h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                />
              </label>
              <label className="text-xs text-neutral-600">
                To
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={pktDay()}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                  className="mt-0.5 block h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                />
              </label>
            </>
          ) : null}
          <div className="relative" ref={columnsRef}>
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen((o) => !o)}
            >
              Columns
            </Button>
            {columnsOpen ? (
              <fieldset className="absolute end-0 z-20 mt-1 w-48 space-y-1 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                <legend className="sr-only">Visible columns</legend>
                {COLUMNS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={show(key)}
                      onChange={() =>
                        setHidden((h) => {
                          const next = new Set(h);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setRange('');
                setStatus('');
                setPage(1);
              }}
              className="h-9 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Orders</caption>
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr className="border-b border-neutral-200">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all orders on this page"
                    className="accent-brand-600"
                    checked={allOnPage}
                    ref={(el) => {
                      if (el) el.indeterminate = someOnPage && !allOnPage;
                    }}
                    onChange={() =>
                      setSelected((m) => {
                        const next = new Map(m);
                        for (const o of rows) {
                          if (allOnPage) next.delete(o.id);
                          else next.set(o.id, o);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Order
                </th>
                {show('date') ? (
                  <SortHeader label="Date" column="createdAt" {...{ sort, dir, onSort }} />
                ) : null}
                {show('customer') ? (
                  <SortHeader label="Customer" column="customerName" {...{ sort, dir, onSort }} />
                ) : null}
                {show('city') ? (
                  <SortHeader label="City" column="city" {...{ sort, dir, onSort }} />
                ) : null}
                {show('items') ? (
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    Items
                  </th>
                ) : null}
                {show('total') ? (
                  <SortHeader label="Total" column="total" align="end" {...{ sort, dir, onSort }} />
                ) : null}
                {show('status') ? (
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">
                    Status
                  </th>
                ) : null}
                <th scope="col" className="px-3 py-2.5 text-end font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100" aria-busy={loading}>
              {!data && loading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={colCount} className="px-3 py-2.5">
                      <div className="h-5 animate-pulse rounded bg-neutral-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-14 text-center text-neutral-500">
                    <p className="text-3xl" aria-hidden="true">
                      📦
                    </p>
                    <p className="mt-2 font-medium text-neutral-700">
                      {filtered ? 'No orders match these filters.' : 'No orders yet.'}
                    </p>
                    {!filtered ? (
                      <p className="text-sm">Share your store link to get your first order.</p>
                    ) : null}
                  </td>
                </tr>
              ) : (
                rows.map((o) => {
                  const detail = open[o.id];
                  const isSelected = selected.has(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr
                        className={`transition-colors ${isSelected ? 'bg-brand-50/60' : 'hover:bg-neutral-50'} ${loading ? 'opacity-60' : ''}`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select order ${o.orderRef}`}
                            className="accent-brand-600"
                            checked={isSelected}
                            onChange={() =>
                              setSelected((m) => {
                                const next = new Map(m);
                                if (next.has(o.id)) next.delete(o.id);
                                else next.set(o.id, o);
                                return next;
                              })
                            }
                          />
                        </td>
                        <th scope="row" className="px-3 py-2.5 text-start font-normal">
                          <button
                            type="button"
                            onClick={() => void toggle(o)}
                            aria-expanded={Boolean(detail)}
                            className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-neutral-900 hover:underline"
                          >
                            <span
                              aria-hidden="true"
                              className={`text-[10px] text-neutral-400 transition-transform ${detail ? 'rotate-90' : ''}`}
                            >
                              ▶
                            </span>
                            {o.orderRef}
                          </button>
                          {o.stockUnverified ? (
                            <span className="ms-2">
                              <Badge tone="amber">Check stock</Badge>
                            </span>
                          ) : null}
                        </th>
                        {show('date') ? (
                          <td className="px-3 py-2.5 whitespace-nowrap text-neutral-600">
                            {formatDate(o.createdAt)}
                          </td>
                        ) : null}
                        {show('customer') ? (
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{o.customerName}</p>
                            <p className="text-xs text-neutral-500">{o.customerPhone}</p>
                          </td>
                        ) : null}
                        {show('city') ? <td className="px-3 py-2.5">{o.city}</td> : null}
                        {show('items') ? (
                          <td className="px-3 py-2.5 text-end tabular-nums">{o.itemCount}</td>
                        ) : null}
                        {show('total') ? (
                          <td className="px-3 py-2.5 text-end font-semibold tabular-nums whitespace-nowrap">
                            {formatMoney(o.total, o.currency)}
                            {o.discountCode ? (
                              <span
                                className="mt-0.5 block text-xs font-medium text-green-700"
                                title={`Discount code ${o.discountCode}: −${formatMoney(o.discountTotal, o.currency)}`}
                              >
                                <span aria-hidden="true">🏷 </span>
                                {o.discountCode}
                                {Number(o.discountTotal) > 0
                                  ? ` −${formatMoney(o.discountTotal, o.currency)}`
                                  : ' · free delivery'}
                              </span>
                            ) : null}
                          </td>
                        ) : null}
                        {show('status') ? (
                          <td className="px-3 py-2.5">
                            <SyncBadge status={o.status} />
                          </td>
                        ) : null}
                        <td className="px-3 py-2.5 text-end whitespace-nowrap">
                          {o.status === 'sync_failed' ? (
                            <Button
                              variant="secondary"
                              className="h-8 px-3"
                              onClick={() => void retry([o])}
                              disabled={busy === 'retry'}
                            >
                              Retry
                            </Button>
                          ) : o.getorioOrderUrl ? (
                            <a
                              href={o.getorioOrderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-brand-700 hover:underline"
                            >
                              Getorio ↗
                            </a>
                          ) : null}
                        </td>
                      </tr>
                      {o.status === 'sync_failed' && o.lastSyncError ? (
                        <tr>
                          <td
                            colSpan={colCount}
                            className="bg-red-50/60 px-12 py-1.5 text-xs text-red-800"
                          >
                            Last error: {o.lastSyncError}
                          </td>
                        </tr>
                      ) : null}
                      {detail ? (
                        <tr>
                          <td colSpan={colCount} className="bg-neutral-50 px-12 py-4">
                            <div className="grid gap-6 text-sm sm:grid-cols-[1fr_1.4fr]">
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-neutral-500 uppercase">
                                  Customer
                                </p>
                                <p className="font-medium">{detail.customerName}</p>
                                <p>
                                  <a href={`tel:${detail.customerPhone}`} className="underline">
                                    {detail.customerPhone}
                                  </a>
                                  {' · '}
                                  <a
                                    href={`https://wa.me/${detail.customerPhone.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-emerald-700 underline"
                                  >
                                    WhatsApp
                                  </a>
                                </p>
                                {detail.customerEmail ? <p>{detail.customerEmail}</p> : null}
                                <p className="text-neutral-600">
                                  {detail.address}, {detail.city}
                                </p>
                                {detail.notes ? (
                                  <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
                                    Note: {detail.notes}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-semibold text-neutral-500 uppercase">
                                  Items · cash on delivery
                                </p>
                                <table className="w-full">
                                  <caption className="sr-only">Items in {o.orderRef}</caption>
                                  <tbody>
                                    {detail.items.map((i, idx) => (
                                      <tr key={idx}>
                                        <td className="py-0.5">
                                          {i.name}{' '}
                                          <span className="text-xs text-neutral-400">{i.sku}</span>
                                        </td>
                                        <td className="py-0.5 text-end tabular-nums text-neutral-600">
                                          {i.qty} × {formatMoney(i.unitPrice, o.currency)}
                                        </td>
                                        <td className="py-0.5 text-end tabular-nums">
                                          {formatMoney(i.lineTotal, o.currency)}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="border-t border-neutral-200 text-neutral-600">
                                      <td className="pt-1" colSpan={2}>
                                        Subtotal
                                      </td>
                                      <td className="pt-1 text-end tabular-nums">
                                        {formatMoney(detail.subtotal, o.currency)}
                                      </td>
                                    </tr>
                                    {detail.discountCode ? (
                                      <tr className="text-green-700">
                                        <td colSpan={2}>
                                          Discount{' '}
                                          <span className="rounded border border-dashed border-green-600 px-1 font-mono text-xs font-semibold">
                                            {detail.discountCode}
                                          </span>
                                        </td>
                                        <td className="text-end tabular-nums">
                                          {Number(detail.discountTotal) > 0
                                            ? `−${formatMoney(detail.discountTotal, o.currency)}`
                                            : 'Free delivery'}
                                        </td>
                                      </tr>
                                    ) : null}
                                    <tr className="text-neutral-600">
                                      <td colSpan={2}>Delivery</td>
                                      <td className="text-end tabular-nums">
                                        {formatMoney(detail.shippingFee, o.currency)}
                                      </td>
                                    </tr>
                                    <tr className="font-semibold">
                                      <td colSpan={2}>Total</td>
                                      <td className="text-end tabular-nums">
                                        {formatMoney(detail.total, o.currency)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-3 text-neutral-600">
            <span>
              {data && data.total
                ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, data.total)} of ${data.total}`
                : 'No results'}
            </span>
            <label className="flex items-center gap-1.5">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-md border border-neutral-300 bg-white px-1.5"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((n) => n - 1)}
                className="h-8 rounded-md px-2 hover:bg-neutral-100 disabled:opacity-40"
              >
                ‹ Prev
              </button>
              {pageList.map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="px-1 text-neutral-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    aria-current={p === page ? 'page' : undefined}
                    onClick={() => setPage(p)}
                    className={`h-8 min-w-8 rounded-md px-2 tabular-nums ${p === page ? 'bg-neutral-900 font-semibold text-white' : 'hover:bg-neutral-100'}`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={page === pages}
                onClick={() => setPage((n) => n + 1)}
                className="h-8 rounded-md px-2 hover:bg-neutral-100 disabled:opacity-40"
              >
                Next ›
              </button>
            </nav>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed end-6 bottom-6 z-50 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
