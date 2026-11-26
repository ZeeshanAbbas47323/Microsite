'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from '../api';
import { Icon, PATHS } from '../editor/icons';
import { useT } from '../i18n';
import { useDashboard } from '../session';
import {
  Avatar,
  CustomerBadges,
  Delta,
  downloadCsv,
  localPhone,
  NEW_COLOR,
  relativeDays,
  RETURNING_COLOR,
  shortDate,
  type CustomerRow,
} from './shared';

type Segment = 'all' | 'registered' | 'guest' | 'repeat' | 'new' | 'inactive';
type SortKey = 'lastOrderAt' | 'totalSpent' | 'ordersCount' | 'createdAt' | 'name';

interface ListResponse {
  items: CustomerRow[];
  total: number;
  segmentCounts: Record<Segment, number>;
  totalSpent: string;
}

interface Analytics {
  days: number;
  from: string;
  to: string;
  totals: {
    customers: number;
    buyers: number;
    registered: number;
    acceptsMarketing: number;
    repeatCustomers: number;
    repeatRate: number;
    lifetimeValue: string;
    ordersPerCustomer: number;
  };
  period: {
    activeCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    revenueNew: string;
    revenueReturning: string;
    previousActiveCustomers: number;
    previousNewCustomers: number;
  };
  series: {
    date: string;
    newCustomers: number;
    returningCustomers: number;
    revenueNew: string;
    revenueReturning: string;
  }[];
  topCustomers: CustomerRow[];
  cities: { city: string; customers: number; spent: string }[];
}

const SEGMENTS: [Segment, string, string][] = [
  ['all', 'All', 'Everyone who ordered or signed up'],
  ['registered', 'Accounts', 'Signed up on your store'],
  ['guest', 'Guests', 'Ordered without an account'],
  ['repeat', 'Repeat', 'Two or more orders'],
  ['new', 'New', 'First seen in the last 30 days'],
  ['inactive', 'At risk', 'No order in 60 days'],
];
const SORTS: [SortKey, 'asc' | 'desc', string][] = [
  ['lastOrderAt', 'desc', 'Last order'],
  ['totalSpent', 'desc', 'Most spent'],
  ['ordersCount', 'desc', 'Most orders'],
  ['createdAt', 'desc', 'Newest customers'],
  ['name', 'asc', 'Name A–Z'],
];
const RANGES = [7, 30, 90] as const;
const PAGE_SIZE = 20;

/** Customers: analytics on top, then a searchable, segmented customer table. */
export function CustomersPage() {
  const { store } = useDashboard();
  const t = useT();
  const router = useRouter();
  const currency = store?.currency ?? 'PKR';
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [segment, setSegment] = useState<Segment>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('lastOrderAt');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const dir = SORTS.find(([k]) => k === sort)?.[1] ?? 'desc';
  const query = useCallback(
    (p: number, size: number) =>
      new URLSearchParams({
        page: String(p),
        pageSize: String(size),
        segment,
        sort,
        dir,
        ...(search ? { search } : {}),
      }),
    [segment, sort, dir, search],
  );

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      setData(await api<ListResponse>(`/stores/${store.id}/customers?${query(page, PAGE_SIZE)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load customers');
    } finally {
      setLoading(false);
    }
  }, [store, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!store) return;
    let live = true;
    api<Analytics>(`/stores/${store.id}/customers/analytics?days=${days}`)
      .then((s) => live && setStats(s))
      .catch(() => live && setStats(null));
    return () => {
      live = false;
    };
  }, [store, days]);

  async function exportCsv() {
    if (!store || !data) return;
    setBusy(true);
    try {
      const rows: CustomerRow[] = [];
      for (let p = 1; p <= Math.min(20, Math.ceil(data.total / 100)); p++) {
        rows.push(
          ...(await api<ListResponse>(`/stores/${store.id}/customers?${query(p, 100)}`)).items,
        );
      }
      downloadCsv(
        `customers-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'Name',
          'Phone',
          'Email',
          'City',
          'Type',
          'Orders',
          'Total spent',
          'First order',
          'Last order',
          'Tags',
        ],
        rows.map((c) => [
          c.name,
          localPhone(c.phone),
          c.email ?? '',
          c.city ?? '',
          c.registered ? 'Account' : 'Guest',
          c.ordersCount,
          c.totalSpent,
          shortDate(c.firstOrderAt),
          shortDate(c.lastOrderAt),
          c.tags.join('; '),
        ]),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Customers')}</h1>
          <p className="text-sm text-neutral-500">
            {stats
              ? `${stats.totals.customers.toLocaleString('en-PK')} customers · ${stats.totals.registered.toLocaleString('en-PK')} with an account`
              : ' '}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void exportCsv()}
            loading={busy}
            disabled={!data?.total}
          >
            Export CSV
          </Button>
          <Button variant="secondary" onClick={() => void load()}>
            {t('Refresh')}
          </Button>
        </div>
      </div>

      <Insights stats={stats} days={days} setDays={setDays} currency={currency} />

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {/* Segments */}
        <div
          role="group"
          aria-label="Customer segments"
          className="flex gap-1 overflow-x-auto border-b border-neutral-200 p-2"
        >
          {SEGMENTS.map(([value, label, hint]) => {
            const active = segment === value;
            return (
              <button
                key={value}
                type="button"
                title={hint}
                aria-pressed={active}
                onClick={() => {
                  setSegment(value);
                  setPage(1);
                }}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm ${active ? 'bg-neutral-200/70 font-semibold text-neutral-900' : 'font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}`}
              >
                {label}
                <span
                  className={`text-xs tabular-nums ${value === 'inactive' && data?.segmentCounts.inactive ? 'rounded-full bg-amber-100 px-1.5 text-amber-800' : 'text-neutral-500'}`}
                >
                  {data ? data.segmentCounts[value] : '–'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 p-2">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search customers</span>
            <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-neutral-400">
              <Icon d={PATHS.search} className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, phone, email or city"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white ps-8 pe-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm text-neutral-900"
            >
              {SORTS.map(([k, , label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  Customer
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  Type
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  City
                </th>
                <th scope="col" className="px-3 py-2.5 text-end font-medium">
                  Orders
                </th>
                <th scope="col" className="px-3 py-2.5 text-end font-medium">
                  Spent
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  Last order
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-neutral-100 ${loading ? 'opacity-60' : ''}`}>
              {rows.map((c) => {
                const href = `/dashboard/customers/${c.id}`;
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(href)}
                    className="cursor-pointer hover:bg-brand-50/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} id={c.id} />
                        <div className="min-w-0">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium text-neutral-900 hover:text-brand-700 hover:underline"
                          >
                            {c.name}
                          </Link>
                          <p className="truncate text-xs text-neutral-500">
                            {[localPhone(c.phone), c.email].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <CustomerBadges c={c} />
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{c.city ?? '—'}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{c.ordersCount}</td>
                    <td className="px-3 py-3 text-end font-medium tabular-nums">
                      {formatMoney(c.totalSpent, currency)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      <span title={shortDate(c.lastOrderAt)}>{relativeDays(c.lastOrderAt)}</span>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <p className="font-medium text-neutral-800">
                      {search || segment !== 'all' ? 'No customers match' : 'No customers yet'}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {search || segment !== 'all'
                        ? 'Try another search or segment.'
                        : 'Customers appear here after their first order or when they sign up on your store.'}
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of{' '}
              {data.total} · {formatMoney(data.totalSpent, currency)} spent
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="tabular-nums">
                {page} / {pages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// -- Analytics -----------------------------------------------------------------------------

function Insights({
  stats,
  days,
  setDays,
  currency,
}: {
  stats: Analytics | null;
  days: number;
  setDays: (d: (typeof RANGES)[number]) => void;
  currency: string;
}) {
  const [table, setTable] = useState(false);
  const p = stats?.period;
  const revenueNew = Number(p?.revenueNew ?? 0);
  const revenueReturning = Number(p?.revenueReturning ?? 0);
  const revenueAll = revenueNew + revenueReturning;
  const maxCity = Math.max(1, ...(stats?.cities.map((c) => c.customers) ?? [1]));

  return (
    <section aria-label="Customer analytics" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-900">Customer insights</h2>
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex rounded-lg bg-neutral-100 p-0.5 text-sm"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`rounded-md px-3 py-1.5 font-medium ${days === r ? 'bg-white text-brand-700 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active customers" value={p ? p.activeCustomers.toLocaleString('en-PK') : '–'}>
          {p ? <Delta now={p.activeCustomers} before={p.previousActiveCustomers} /> : null}
        </Stat>
        <Stat label="New customers" value={p ? p.newCustomers.toLocaleString('en-PK') : '–'}>
          {p ? <Delta now={p.newCustomers} before={p.previousNewCustomers} /> : null}
        </Stat>
        <Stat label="Repeat rate" value={stats ? `${stats.totals.repeatRate}%` : '–'}>
          <span className="text-xs text-neutral-500">
            {stats
              ? `${stats.totals.repeatCustomers} of ${stats.totals.buyers} buyers came back`
              : ' '}
          </span>
        </Stat>
        <Stat
          label="Avg. lifetime value"
          value={
            stats ? formatMoney(Math.round(Number(stats.totals.lifetimeValue)), currency) : '–'
          }
        >
          <span className="text-xs text-neutral-500">
            {stats ? `${stats.totals.ordersPerCustomer} orders per customer` : ' '}
          </span>
        </Stat>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-neutral-900">New vs returning customers</h3>
              <p className="text-xs text-neutral-500">Customers who ordered each day</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-neutral-600">
              <Legend color={NEW_COLOR} label="New" />
              <Legend color={RETURNING_COLOR} label="Returning" />
              <button
                type="button"
                onClick={() => setTable((v) => !v)}
                className="font-medium text-brand-700 hover:underline"
              >
                {table ? 'Show chart' : 'Show table'}
              </button>
            </div>
          </div>
          {stats ? (
            table ? (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-xs text-neutral-500">
                    <tr>
                      <th scope="col" className="py-1 text-start font-medium">
                        Day
                      </th>
                      <th scope="col" className="py-1 text-end font-medium">
                        New
                      </th>
                      <th scope="col" className="py-1 text-end font-medium">
                        Returning
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {stats.series.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1">{d.date}</td>
                        <td className="py-1 text-end tabular-nums">{d.newCustomers}</td>
                        <td className="py-1 text-end tabular-nums">{d.returningCustomers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StackedBars series={stats.series} />
            )
          ) : (
            <div className="h-56 animate-pulse rounded-lg bg-neutral-50" />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h3 className="font-semibold text-neutral-900">Sales by customer type</h3>
            <p className="text-xs text-neutral-500">Last {days} days</p>
            <div
              className="mt-4 flex h-3 overflow-hidden rounded-full bg-neutral-100"
              aria-hidden="true"
            >
              <div
                style={{
                  width: `${revenueAll ? (revenueNew / revenueAll) * 100 : 0}%`,
                  background: NEW_COLOR,
                }}
              />
              <div
                style={{
                  width: `${revenueAll ? (revenueReturning / revenueAll) * 100 : 0}%`,
                  background: RETURNING_COLOR,
                }}
              />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="flex items-center gap-2">
                  <Legend color={NEW_COLOR} label="New" />
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(revenueNew.toFixed(2), currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="flex items-center gap-2">
                  <Legend color={RETURNING_COLOR} label="Returning" />
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(revenueReturning.toFixed(2), currency)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h3 className="font-semibold text-neutral-900">Top cities</h3>
            {stats?.cities.length ? (
              <ul className="mt-3 space-y-2.5">
                {stats.cities.map((c) => (
                  <li key={c.city} className="text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-neutral-800">{c.city}</span>
                      <span className="tabular-nums text-neutral-600">
                        {c.customers} · {formatMoney(c.spent, currency)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-neutral-100">
                      <div
                        className="h-1.5 rounded-full bg-brand-500"
                        style={{ width: `${(c.customers / maxCity) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">{stats ? 'No orders yet.' : ' '}</p>
            )}
          </div>
        </div>
      </div>

      {stats?.topCustomers.length ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
          <h3 className="mb-3 font-semibold text-neutral-900">Best customers</h3>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {stats.topCustomers.map((c, i) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/customers/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-neutral-100 p-3 hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <Avatar name={c.name} id={c.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      <span className="text-neutral-400">#{i + 1}</span> {c.name}
                    </span>
                    <span className="block text-xs text-neutral-500 tabular-nums">
                      {formatMoney(c.totalSpent, currency)} · {c.ordersCount} order
                      {c.ordersCount === 1 ? '' : 's'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
        {value}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function StackedBars({ series }: { series: Analytics['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((d) => d.newCustomers + d.returningCustomers));
  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(max / 4));
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  }, [max]);
  const top = Math.max(max, ticks.at(-1) ?? 1);
  const h = 200;
  const total = series.reduce((n, d) => n + d.newCustomers + d.returningCustomers, 0);
  const active = hover !== null ? series[hover] : null;
  return (
    <div className="relative">
      <div className="absolute end-0 -top-1 text-xs text-neutral-600" aria-live="polite">
        {active
          ? `${active.date}: ${active.newCustomers} new, ${active.returningCustomers} returning`
          : `${total} customer orders`}
      </div>
      <div className="mt-5 flex gap-2">
        <div
          className="relative w-6 text-end text-[10px] text-neutral-400"
          style={{ height: h }}
          aria-hidden="true"
        >
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute end-0 -translate-y-1/2"
              style={{ top: h - (v / top) * h }}
            >
              {v}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: h }}>
          {ticks.map((v) => (
            <div
              key={v}
              className="absolute inset-x-0 border-t border-dashed border-neutral-100"
              style={{ top: h - (v / top) * h }}
              aria-hidden="true"
            />
          ))}
          <div
            className="absolute inset-0 flex items-end gap-[2px]"
            role="img"
            aria-label={`New and returning customers per day, ${total} in total`}
          >
            {series.map((d, i) => {
              const n = (d.newCustomers / top) * h;
              const r = (d.returningCustomers / top) * h;
              return (
                <div
                  key={d.date}
                  className={`flex h-full flex-1 flex-col justify-end rounded-t ${hover === i ? 'bg-brand-50' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    style={{ height: r, background: RETURNING_COLOR }}
                    className="rounded-t-sm"
                  />
                  <div
                    style={{ height: n, background: NEW_COLOR }}
                    className={r ? '' : 'rounded-t-sm'}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className="ms-8 mt-1 flex justify-between text-[10px] text-neutral-400"
        aria-hidden="true"
      >
        <span>{series[0]?.date.slice(5)}</span>
        <span>{series.at(-1)?.date.slice(5)}</span>
      </div>
    </div>
  );
}
