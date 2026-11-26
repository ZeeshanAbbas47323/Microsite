'use client';

import type { SiteConfig } from '@microstore/site-schema';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from '../api';
import { StatusBadge } from '../DashboardShell';
import { useT } from '../i18n';
import { formatDate, SyncBadge, type OrderRow } from '../Overview';
import { useDashboard } from '../session';
import { ShareKit } from '../ShareKit';
import { useStoreActions } from '../useStoreActions';

// -- Data ---------------------------------------------------------------------------------

interface Totals {
  visits: number;
  pageViews: number;
  orders: number;
  revenue: string;
  conversionRate: number | null;
}
interface Day {
  date: string;
  visits: number;
  orders: number;
  revenue: string;
}
interface Analytics {
  from: string;
  to: string;
  totals: Totals;
  previous: Totals;
  days: Day[];
  topProducts: { productId: string; name: string; qty: number; revenue: string }[];
  ordersByStatus: Record<string, number>;
}
type Event =
  | {
      type: 'order';
      at: string;
      orderRef: string;
      customer: string;
      total: string;
      currency: string;
      status: OrderRow['status'];
    }
  | { type: 'design'; at: string; kind: 'published' | 'draft_revision'; source: string };

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
type Metric = 'revenue' | 'orders' | 'visits';

/** Pakistan time greeting. */
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', timeZone: 'Asia/Karachi' }).format(
      new Date(),
    ),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('en-PK', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : formatDate(iso);
}

const metricValue = (d: Day, m: Metric) => (m === 'revenue' ? Number(d.revenue) : d[m]);

// -- Small building blocks ----------------------------------------------------------------

function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs ${className}`}
      {...(title ? { 'aria-label': title } : {})}
    >
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold text-neutral-900">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-neutral-500">New this period</span>;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${flat ? 'text-neutral-500' : up ? 'text-emerald-700' : 'text-red-700'}`}
    >
      <span aria-hidden="true">{flat ? '→' : up ? '↑' : '↓'}</span>
      {flat ? 'No change' : `${up ? '+' : ''}${value}%`}
      <span className="font-normal text-neutral-500">{label}</span>
    </span>
  );
}

/** Tiny trend line; decorative (the card states the number and the change). */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 32;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map(
    (v, i) => `${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`,
  );
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-8 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#0074fc"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Kpi({
  label,
  value,
  delta,
  spark,
  rangeLabel,
}: {
  label: string;
  value: string;
  delta: number | null;
  spark: number[];
  rangeLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
        {value}
      </p>
      <div className="mt-1">
        <Delta value={delta} label={rangeLabel} />
      </div>
      <div className="mt-3">
        <Sparkline values={spark} />
      </div>
    </div>
  );
}

// -- Main chart ---------------------------------------------------------------------------

function TrendChart({ days, metric, currency }: { days: Day[]; metric: Metric; currency: string }) {
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  const values = days.map((d) => metricValue(d, metric));
  const max = Math.max(1, ...values);
  const format = (v: number) =>
    metric === 'revenue' ? formatMoney(v.toFixed(2), currency) : v.toLocaleString('en-PK');
  const ticks = [max, max / 2, 0];
  const label = metric === 'revenue' ? t('Sales') : metric === 'orders' ? t('Orders') : t('Visits');

  return (
    <div>
      <div className="relative flex h-56 gap-2" aria-hidden="true">
        <div className="flex w-16 shrink-0 flex-col justify-between pb-6 text-end text-[11px] text-neutral-400 tabular-nums">
          {ticks.map((v, i) => (
            <span key={i}>
              {metric === 'revenue' ? formatMoney(v.toFixed(0), currency) : Math.round(v)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <span key={i} className="border-t border-dashed border-neutral-200" />
            ))}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]">
            {days.map((d) => {
              const v = metricValue(d, metric);
              return (
                <div key={d.date} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-brand-500 transition-colors group-hover:bg-brand-700"
                    style={{ height: v ? `${Math.max(2, (v / max) * 100)}%` : 0 }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                    <p className="font-semibold">{shortDate(d.date)}</p>
                    <p>
                      {label}: {format(v)}
                    </p>
                    {metric !== 'orders' ? (
                      <p className="text-white/70">
                        {t('Orders')}: {d.orders}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[11px] text-neutral-400">
            <span>{days[0] ? shortDate(days[0].date) : ''}</span>
            <span>{days.at(-1) ? shortDate(days.at(-1)?.date ?? '') : ''}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={showTable}
        onClick={() => setShowTable((s) => !s)}
        className="mt-3 text-sm font-medium text-brand-700 underline"
      >
        {showTable ? t('Hide table') : t('Show as table')}
      </button>
      {showTable ? (
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="text-xs text-neutral-500">
                <th scope="col" className="py-1 text-start font-medium">
                  {t('Date')}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t('Visits')}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t('Orders')}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t('Sales')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 tabular-nums">
              {[...days].reverse().map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="py-1 text-start font-normal">
                    {shortDate(d.date)}
                  </th>
                  <td className="py-1 text-end">{d.visits}</td>
                  <td className="py-1 text-end">{d.orders}</td>
                  <td className="py-1 text-end">{formatMoney(d.revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// -- Store health ---------------------------------------------------------------------------

interface Check {
  label: string;
  done: boolean;
  href: string;
  action: string;
}

function HealthRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{score}%</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">ready</span>
      </span>
    </div>
  );
}

// -- Insights ---------------------------------------------------------------------------------

interface Insight {
  tone: 'good' | 'warn' | 'info';
  icon: string;
  title: string;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

const TONE = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  info: 'bg-brand-50 text-brand-900 ring-brand-200',
} as const;

function buildInsights(
  data: Analytics,
  range: Range,
  currency: string,
  live: boolean,
  unpublished: boolean,
  share: () => void,
): Insight[] {
  const out: Insight[] = [];
  const { totals, previous } = data;
  const failed = data.ordersByStatus.sync_failed ?? 0;
  if (failed) {
    out.push({
      tone: 'warn',
      icon: '⚠',
      title: `${failed} order${failed > 1 ? 's' : ''} did not reach Getorio`,
      text: 'Retry them so they can be packed and shipped.',
      action: { label: 'Open orders', href: '/dashboard/orders' },
    });
  }
  if (unpublished) {
    out.push({
      tone: 'info',
      icon: '✎',
      title: 'You have design changes customers can’t see',
      text: 'Publish to put them live.',
      action: { label: 'Review design', href: '/dashboard/design' },
    });
  }
  const salesChange = change(Number(totals.revenue), Number(previous.revenue));
  if (salesChange !== null && salesChange !== 0 && Number(previous.revenue) > 0) {
    out.push({
      tone: salesChange > 0 ? 'good' : 'warn',
      icon: salesChange > 0 ? '↗' : '↘',
      title: `Sales ${salesChange > 0 ? 'up' : 'down'} ${Math.abs(salesChange)}%`,
      text: `${formatMoney(totals.revenue, currency)} in the last ${range} days vs ${formatMoney(previous.revenue, currency)} before.`,
    });
  }
  const top = data.topProducts[0];
  if (top && Number(totals.revenue) > 0) {
    const share = Math.round((Number(top.revenue) / Number(totals.revenue)) * 100);
    out.push({
      tone: 'info',
      icon: '★',
      title: `${top.name} is your best seller`,
      text: `${top.qty} sold, ${share}% of your sales. Feature it on your home page.`,
      action: { label: 'Choose featured products', href: '/dashboard/products' },
    });
  }
  // Best weekday, once there is enough to compare.
  if (totals.orders >= 3) {
    const byDay = new Map<string, number>();
    for (const d of data.days) {
      const day = new Intl.DateTimeFormat('en-PK', { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(`${d.date}T00:00:00Z`),
      );
      byDay.set(day, (byDay.get(day) ?? 0) + d.orders);
    }
    const [bestDay, count] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    if (count > 0)
      out.push({
        tone: 'info',
        icon: '📅',
        title: `${bestDay} is your busiest day`,
        text: 'Plan offers and WhatsApp posts for the day before.',
      });
  }
  if (live && totals.visits === 0) {
    out.push({
      tone: 'info',
      icon: '📣',
      title: 'No visitors yet in this period',
      text: 'Share your store on WhatsApp and Instagram with a ready-made poster.',
      action: { label: 'Open share kit', onClick: share },
    });
  } else if (
    totals.visits >= 20 &&
    totals.conversionRate !== null &&
    totals.conversionRate < 0.01
  ) {
    out.push({
      tone: 'warn',
      icon: '🛒',
      title: 'Visitors look but rarely order',
      text: 'Clear delivery and payment answers help: add them to your FAQ.',
      action: { label: 'Edit FAQ', href: '/dashboard/design' },
    });
  } else if (totals.conversionRate !== null && totals.conversionRate >= 0.03) {
    out.push({
      tone: 'good',
      icon: '✓',
      title: `Strong conversion: ${(totals.conversionRate * 100).toFixed(1)}%`,
      text: 'More visitors will mean more orders. Share your store link.',
      action: { label: 'Open share kit', onClick: share },
    });
  }
  return out.slice(0, 4);
}

// -- Page ---------------------------------------------------------------------------------

export function OverviewPage() {
  const { store } = useDashboard();
  const t = useT();
  const { publish, unpublish, busy, error } = useStoreActions();
  const [range, setRange] = useState<Range>(30);
  const [metric, setMetric] = useState<Metric>('revenue');
  const [data, setData] = useState<Analytics | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [visibleProducts, setVisibleProducts] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const storeId = store?.id;

  useEffect(() => {
    if (!storeId) return;
    let live = true;
    api<Analytics>(`/stores/${storeId}/analytics?days=${range}`)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [storeId, range]);

  const loadSide = useCallback(() => {
    if (!storeId) return;
    api<{ events: Event[] }>(`/stores/${storeId}/activity`)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
    api<{ items: OrderRow[] }>(`/stores/${storeId}/orders?pageSize=5`)
      .then((r) => setOrders(r.items))
      .catch(() => setOrders([]));
    api<{ config: SiteConfig }>(`/stores/${storeId}/config/draft`)
      .then((r) => setConfig(r.config))
      .catch(() => setConfig(null));
    api<{ items: { visible: boolean }[] }>(`/stores/${storeId}/products?pageSize=100`)
      .then((r) => setVisibleProducts(r.items.filter((p) => p.visible).length))
      .catch(() => setVisibleProducts(null));
  }, [storeId]);
  useEffect(loadSide, [loadSide]);

  const live = store?.status === 'published';
  const checks = useMemo<Check[]>(() => {
    if (!store || !config) return [];
    const s = store.settings;
    return [
      { label: 'Store is published', done: live, href: '/dashboard', action: 'Publish' },
      {
        label: 'Logo added',
        done: Boolean(config.business.logoUrl),
        href: '/dashboard/settings',
        action: 'Add logo',
      },
      {
        label: 'Business description',
        done: config.business.description.length >= 30,
        href: '/dashboard/settings',
        action: 'Describe',
      },
      {
        label: 'WhatsApp number',
        done: Boolean(config.business.contact.whatsapp),
        href: '/dashboard/settings',
        action: 'Add',
      },
      {
        label: 'At least 4 products on sale',
        done: (visibleProducts ?? 0) >= 4,
        href: '/dashboard/products',
        action: 'Choose',
      },
      {
        label: 'Delivery charges set',
        done:
          Number(s.shippingFlatFee) > 0 ||
          (s.cityShippingRates?.length ?? 0) > 0 ||
          s.freeShippingThreshold !== null,
        href: '/dashboard/settings',
        action: 'Set',
      },
      {
        label: 'Brand line in the footer',
        done: Boolean(config.footer.about),
        href: '/dashboard/design',
        action: 'Write',
      },
      {
        label: 'Google title for the home page',
        done: Boolean(config.pages[0]?.seo.title),
        href: '/dashboard/design',
        action: 'Write',
      },
    ];
  }, [store, config, live, visibleProducts]);
  const score = checks.length
    ? Math.round((checks.filter((c) => c.done).length / checks.length) * 100)
    : 0;

  if (!store) return null;
  const currency = store.currency;
  const rangeLabel = `vs previous ${range} days`;
  const share = () => setShareOpen(true);
  const insights = data
    ? buildInsights(data, range, currency, live, store.hasUnpublishedChanges && live, share)
    : [];
  const spark = (m: Metric) => (data ? data.days.map((d) => metricValue(d, m)) : []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(120deg,#003a85,#0074fc_55%,#1a8bff)] p-6 text-white shadow-lg sm:p-8">
        <div
          className="pointer-events-none absolute -end-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm text-white/80">{greeting()} 👋</p>
            <h1 className="text-3xl font-bold tracking-tight">{store.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white px-0.5 py-0.5">
                <StatusBadge status={store.status} />
              </span>
              {store.url ? (
                <>
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline decoration-white/40 underline-offset-4 hover:decoration-white"
                  >
                    {store.hostname} ↗
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(store.url ?? '').catch(() => undefined);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium hover:bg-white/25"
                  >
                    {copied ? 'Copied ✓' : 'Copy link'}
                  </button>
                </>
              ) : null}
            </div>
            {store.publishedAt ? (
              <p className="text-xs text-white/70">
                {t('Last published {date}', { date: formatDate(store.publishedAt) })}
              </p>
            ) : null}
          </div>
          {store.status === 'suspended' ? (
            <Notice tone="error">{t('This store is suspended. Contact Getorio support.')}</Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/design?magic=1"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-[#0074fc] shadow-sm hover:bg-blue-50"
              >
                ✨ Magic Store
              </Link>
              <button
                type="button"
                onClick={share}
                className="inline-flex h-10 items-center rounded-xl bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
              >
                {t('Share')}
              </button>
              {!live || store.hasUnpublishedChanges ? (
                <button
                  type="button"
                  onClick={() => void publish().then(loadSide)}
                  disabled={busy !== null}
                  className="inline-flex h-10 items-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-60"
                >
                  {busy === 'publish'
                    ? 'Publishing…'
                    : live
                      ? t('Publish changes')
                      : t('Publish store')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void unpublish()}
                  disabled={busy !== null}
                  className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-white/80 hover:bg-white/10"
                >
                  {t('Unpublish')}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {/* KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('Store performance')}</h2>
        <div
          role="group"
          aria-label={t('Time range')}
          className="flex gap-1 rounded-xl bg-neutral-100 p-1"
        >
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={range === n}
              onClick={() => setRange(n)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${range === n ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              {t('{n} days', { n })}
            </button>
          ))}
        </div>
      </div>
      {data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={t('Sales')}
            value={formatMoney(data.totals.revenue, currency)}
            delta={change(Number(data.totals.revenue), Number(data.previous.revenue))}
            spark={spark('revenue')}
            rangeLabel={rangeLabel}
          />
          <Kpi
            label={t('Orders')}
            value={data.totals.orders.toLocaleString('en-PK')}
            delta={change(data.totals.orders, data.previous.orders)}
            spark={spark('orders')}
            rangeLabel={rangeLabel}
          />
          <Kpi
            label={t('Visits')}
            value={data.totals.visits.toLocaleString('en-PK')}
            delta={change(data.totals.visits, data.previous.visits)}
            spark={spark('visits')}
            rangeLabel={rangeLabel}
          />
          <Kpi
            label={t('Conversion')}
            value={
              data.totals.conversionRate === null
                ? '–'
                : `${(data.totals.conversionRate * 100).toFixed(1)}%`
            }
            delta={
              data.totals.conversionRate !== null && data.previous.conversionRate !== null
                ? change(data.totals.conversionRate, data.previous.conversionRate)
                : null
            }
            spark={data.days.map((d) => (d.visits ? d.orders / d.visits : 0))}
            rangeLabel={rangeLabel}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title={t('Trend')}
          actions={
            <div
              role="group"
              aria-label="Metric"
              className="flex gap-1 rounded-xl bg-neutral-100 p-1"
            >
              {(
                [
                  ['revenue', 'Sales'],
                  ['orders', 'Orders'],
                  ['visits', 'Visits'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metric === m}
                  onClick={() => setMetric(m)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${metric === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          }
        >
          {data ? (
            <TrendChart days={data.days} metric={metric} currency={currency} />
          ) : (
            <div className="h-56 animate-pulse rounded-xl bg-neutral-100" />
          )}
        </Panel>

        <Panel title="Store health">
          {config ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <HealthRing score={score} />
                <p className="text-sm text-neutral-600">
                  {score === 100
                    ? 'Everything is set up. Great work!'
                    : `${checks.filter((c) => !c.done).length === 1 ? 'One quick step' : `${checks.filter((c) => !c.done).length} quick steps`} to a store customers trust.`}
                </p>
              </div>
              <ul className="space-y-1.5">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${c.done ? 'bg-emerald-500 text-white' : 'border-2 border-neutral-300'}`}
                      aria-hidden="true"
                    >
                      {c.done ? '✓' : ''}
                    </span>
                    <span
                      className={`flex-1 ${c.done ? 'text-neutral-500 line-through decoration-neutral-300' : ''}`}
                    >
                      {c.label}
                      <span className="sr-only">{c.done ? ' (done)' : ' (to do)'}</span>
                    </span>
                    {!c.done && c.href !== '/dashboard' ? (
                      <Link
                        href={c.href}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        {c.action} →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-neutral-100" />
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Smart insights">
          {data ? (
            insights.length ? (
              <ul className="space-y-3">
                {insights.map((i) => (
                  <li key={i.title} className={`flex gap-3 rounded-xl p-3 ring-1 ${TONE[i.tone]}`}>
                    <span className="text-lg leading-6" aria-hidden="true">
                      {i.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{i.title}</p>
                      <p className="text-sm opacity-90">{i.text}</p>
                      {i.action ? (
                        i.action.href ? (
                          <Link
                            href={i.action.href}
                            className="mt-1 inline-block text-sm font-semibold underline"
                          >
                            {i.action.label} →
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={i.action.onClick}
                            className="mt-1 text-sm font-semibold underline"
                          >
                            {i.action.label} →
                          </button>
                        )
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">
                Insights appear here as orders and visits come in.
              </p>
            )
          ) : (
            <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
          )}
        </Panel>

        <Panel title="Best sellers">
          {data?.topProducts.length ? (
            <ol className="space-y-3">
              {data.topProducts.map((p, i) => {
                const max = Number(data.topProducts[0]?.revenue ?? 1) || 1;
                return (
                  <li key={p.productId} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="me-2 text-xs text-neutral-400 tabular-nums">{i + 1}</span>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-neutral-500"> · {p.qty} sold</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatMoney(p.revenue, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-100" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(4, (Number(p.revenue) / max) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-neutral-500">
              {data ? 'Your best sellers will show here after your first orders.' : t('Loading…')}
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title={t('Recent orders')}
          actions={
            <Link href="/dashboard/orders" className="text-sm font-medium text-brand-700">
              {t('View all')}
            </Link>
          }
        >
          {orders === null ? (
            <p className="text-sm text-neutral-500">{t('Loading…')}</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {t('No orders yet. Share your store link to get your first order.')}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                      aria-hidden="true"
                    >
                      {o.customerName.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium">
                        {o.customerName} <span className="text-neutral-400">· {o.orderRef}</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {o.city} · {timeAgo(o.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatMoney(o.total, o.currency)}
                    </span>
                    <SyncBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Activity">
          {events === null ? (
            <p className="text-sm text-neutral-500">{t('Loading…')}</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing yet.</p>
          ) : (
            <ol className="relative space-y-4 border-s border-neutral-200 ps-5">
              {events.slice(0, 8).map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span
                    className={`absolute -start-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${e.type === 'order' ? 'bg-emerald-500' : e.kind === 'published' ? 'bg-brand-600' : 'bg-neutral-400'}`}
                    aria-hidden="true"
                  />
                  {e.type === 'order' ? (
                    <p>
                      <span className="font-medium">New order {e.orderRef}</span> from {e.customer}{' '}
                      · <span className="tabular-nums">{formatMoney(e.total, e.currency)}</span>
                    </p>
                  ) : (
                    <p>
                      {e.kind === 'published'
                        ? 'Store published'
                        : e.source === 'command'
                          ? 'AI assistant changed the design'
                          : e.source === 'restore'
                            ? 'An earlier design was restored'
                            : e.source === 'generate'
                              ? 'Store created'
                              : 'Design saved'}
                    </p>
                  )}
                  <p className="text-xs text-neutral-500">{timeAgo(e.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Quick actions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ['✨', 'Magic Store', 'AI redesign', '/dashboard/design?magic=1'],
              ['🎨', 'Edit design', 'Theme & sections', '/dashboard/design'],
              ['🛍️', 'Products', 'Choose what shows', '/dashboard/products'],
              ['📦', 'Orders', 'Track & retry', '/dashboard/orders'],
              ['🚚', 'Delivery', 'Fees by city', '/dashboard/settings'],
            ] as const
          ).map(([icon, title, text, href]) => (
            <Link
              key={title}
              href={href}
              className="group rounded-xl border border-neutral-200 p-3 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm"
            >
              <span className="text-xl" aria-hidden="true">
                {icon}
              </span>
              <p className="mt-1 text-sm font-semibold">{title}</p>
              <p className="text-xs text-neutral-500">{text}</p>
            </Link>
          ))}
          <button
            type="button"
            onClick={share}
            className="rounded-xl border border-neutral-200 p-3 text-start transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm"
          >
            <span className="text-xl" aria-hidden="true">
              📣
            </span>
            <p className="mt-1 text-sm font-semibold">Share</p>
            <p className="text-xs text-neutral-500">Poster & WhatsApp</p>
          </button>
        </div>
      </Panel>

      {shareOpen && config ? (
        <ShareKit
          onClose={() => setShareOpen(false)}
          info={{
            name: config.business.name,
            tagline: config.business.tagline,
            url: store.url,
            live,
            city: config.business.contact.city,
            category: config.business.category,
            colors: {
              primary: config.theme.primaryColor,
              secondary: config.theme.secondaryColor,
              background: config.theme.backgroundColor,
            },
          }}
        />
      ) : null}
    </div>
  );
}
