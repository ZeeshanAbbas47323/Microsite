'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
import { useT } from './i18n';

interface Day {
  date: string;
  visits: number;
  pageViews: number;
  orders: number;
  revenue: string;
}

interface Summary {
  from: string;
  to: string;
  totals: {
    visits: number;
    pageViews: number;
    orders: number;
    revenue: string;
    conversionRate: number | null;
  };
  days: Day[];
}

const RANGES = [7, 30, 90] as const;

function shortDate(date: string) {
  return new Intl.DateTimeFormat('en-PK', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Phase 3 analytics: visits, orders, revenue and conversion, with a daily visits chart. */
export function AnalyticsCard({ storeId, currency }: { storeId: string; currency: string }) {
  const t = useT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api<Summary>(`/stores/${storeId}/analytics?days=${days}`)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [storeId, days]);

  const range = (
    <div role="group" aria-label={t('Time range')} className="flex gap-1">
      {RANGES.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={days === n}
          onClick={() => setDays(n)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${days === n ? 'bg-neutral-900 text-white' : 'text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'}`}
        >
          {t('{n} days', { n })}
        </button>
      ))}
    </div>
  );

  const totals = data?.totals;
  const max = Math.max(1, ...(data?.days.map((d) => d.visits) ?? [0]));

  return (
    <Card title={t('Store performance')} actions={range}>
      {failed ? (
        <p className="text-sm text-neutral-500">{t('Could not load the numbers.')}</p>
      ) : !data || !totals ? (
        <p className="text-sm text-neutral-500">{t('Loading…')}</p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                [t('Visits'), totals.visits.toLocaleString('en-PK')],
                [t('Orders'), totals.orders.toLocaleString('en-PK')],
                [t('Sales'), formatMoney(totals.revenue, currency)],
                [
                  t('Conversion'),
                  totals.conversionRate === null
                    ? '–'
                    : `${(totals.conversionRate * 100).toFixed(1)}%`,
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{value}</dd>
              </div>
            ))}
          </dl>

          <figure>
            <figcaption className="mb-2 text-xs text-neutral-500">
              {t('Visits per day')} · {shortDate(data.from)} – {shortDate(data.to)}
            </figcaption>
            <div
              className="flex h-28 items-end gap-0.5 border-b border-neutral-200"
              aria-hidden="true"
            >
              {data.days.map((d) => (
                <div
                  key={d.date}
                  className="group relative flex h-full flex-1 items-end"
                  // Whole column is the hover target, not just the bar.
                >
                  <div
                    className="w-full rounded-t-[4px] bg-indigo-500 group-hover:bg-indigo-700"
                    style={{ height: d.visits ? `${Math.max(4, (d.visits / max) * 100)}%` : 0 }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                    <p className="font-semibold">{shortDate(d.date)}</p>
                    <p>
                      {t('Visits')}: {d.visits} · {t('Orders')}: {d.orders}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-neutral-500" aria-hidden="true">
              <span>{shortDate(data.from)}</span>
              <span>{shortDate(data.to)}</span>
            </div>
          </figure>

          <button
            type="button"
            aria-expanded={showTable}
            onClick={() => setShowTable((s) => !s)}
            className="text-sm font-medium text-indigo-700 underline"
          >
            {showTable ? t('Hide table') : t('Show as table')}
          </button>
          {showTable ? (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('Visits per day')}</caption>
                <thead>
                  <tr className="text-start text-xs text-neutral-500">
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
                  {[...data.days].reverse().map((d) => (
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
          <p className="text-xs text-neutral-500">
            {t('Visits count browser sessions on your store. Bots and previews are not counted.')}
          </p>
        </div>
      )}
    </Card>
  );
}
