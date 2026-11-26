'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from '../api';
import { SyncBadge } from '../Overview';
import { useDashboard } from '../session';
import {
  Avatar,
  CustomerBadges,
  localPhone,
  relativeDays,
  shortDate,
  whatsappLink,
  type CustomerProfileData,
} from './shared';

const SUGGESTED_TAGS = ['VIP', 'Wholesale', 'Influencer', 'Return risk', 'Family'];

/** Shopify-style customer profile: lifetime stats, order history, addresses, notes and tags. */
export function CustomerProfile({ customerId }: { customerId: string }) {
  const { store } = useDashboard();
  const currency = store?.currency ?? 'PKR';
  const [c, setC] = useState<CustomerProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    try {
      const { customer } = await api<{ customer: CustomerProfileData }>(
        `/stores/${store.id}/customers/${customerId}`,
      );
      setC(customer);
      setNotes(customer.notes ?? '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this customer');
    }
  }, [store, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(id);
  }, [saved]);

  async function save(body: { notes?: string | null; tags?: string[] }, what: string) {
    if (!store || !c) return;
    setSaving(what);
    try {
      const { customer } = await api<{ customer: CustomerProfileData }>(
        `/stores/${store.id}/customers/${c.id}`,
        { method: 'PATCH', body },
      );
      setC(customer);
      setSaved(what === 'notes' ? 'Note saved' : 'Tags updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(null);
    }
  }

  function addTag(e?: FormEvent) {
    e?.preventDefault();
    const tag = tagInput.trim();
    if (!c || !tag || c.tags.includes(tag) || c.tags.length >= 10) return;
    setTagInput('');
    void save({ tags: [...c.tags, tag.slice(0, 30)] }, 'tags');
  }

  if (error && !c) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <BackLink />
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!c) {
    return (
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
        <BackLink />
        <div className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl bg-neutral-100 lg:col-span-2" />
          <div className="h-80 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      </div>
    );
  }

  const maxMonth = Math.max(1, ...c.stats.months.map((m) => m.orders));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={c.name} id={c.id} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-neutral-900">{c.name}</h1>
            <p className="text-sm text-neutral-500">
              {c.city ? `${c.city} · ` : ''}Customer since{' '}
              {shortDate(c.firstOrderAt ?? c.createdAt)}
            </p>
            <div className="mt-2">
              <CustomerBadges c={c} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone ? (
            <>
              <a
                href={whatsappLink(c.phone)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
              >
                WhatsApp
              </a>
              <a
                href={`tel:${c.phone}`}
                className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50"
              >
                Call
              </a>
            </>
          ) : null}
          {c.email ? (
            <a
              href={`mailto:${c.email}`}
              className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50"
            >
              Email
            </a>
          ) : null}
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">{saved}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total spent"
          value={formatMoney(c.totalSpent, currency)}
          hint={`${c.ordersCount} order${c.ordersCount === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Average order"
          value={formatMoney(c.stats.averageOrder, currency)}
          hint={
            c.stats.cancelledOrders ? `${c.stats.cancelledOrders} cancelled` : 'No cancellations'
          }
        />
        <Kpi
          label="Last order"
          value={relativeDays(c.lastOrderAt)}
          hint={shortDate(c.lastOrderAt)}
        />
        <Kpi
          label="Orders every"
          value={c.stats.daysBetweenOrders !== null ? `${c.stats.daysBetweenOrders} days` : '—'}
          hint={c.stats.daysBetweenOrders !== null ? 'On average' : 'Needs two or more orders'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Monthly activity */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="font-semibold text-neutral-900">Orders in the last 12 months</h2>
            <div
              className="mt-4 flex h-32 items-end gap-1.5"
              role="img"
              aria-label={c.stats.months.map((m) => `${m.month}: ${m.orders} orders`).join(', ')}
            >
              {c.stats.months.map((m) => (
                <div
                  key={m.month}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={`${m.month}: ${m.orders} orders, ${formatMoney(m.spent, currency)}`}
                >
                  <span className="text-[10px] tabular-nums text-neutral-500">
                    {m.orders || ''}
                  </span>
                  <div
                    className="w-full rounded-t bg-brand-500"
                    style={{
                      height: `${(m.orders / maxMonth) * 85}%`,
                      minHeight: m.orders ? 4 : 1,
                      opacity: m.orders ? 1 : 0.15,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 text-[10px] text-neutral-400" aria-hidden="true">
              {c.stats.months.map((m) => (
                <span key={m.month} className="flex-1 text-center">
                  {
                    new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en', {
                      month: 'short',
                      timeZone: 'UTC',
                    })[0]
                  }
                </span>
              ))}
            </div>
          </section>

          {/* Orders */}
          <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-semibold text-neutral-900">Orders</h2>
              <span className="text-sm text-neutral-500">{c.orders.length} shown</span>
            </div>
            {c.orders.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th
                        scope="col"
                        className="px-5 py-2 text-start font-medium tracking-wide uppercase"
                      >
                        Order
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-start font-medium tracking-wide uppercase"
                      >
                        Date
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-start font-medium tracking-wide uppercase"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-end font-medium tracking-wide uppercase"
                      >
                        Items
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-2 text-end font-medium tracking-wide uppercase"
                      >
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {c.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-5 py-3">
                          <span className="font-mono font-medium text-neutral-900">
                            {o.orderRef}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {o.viaAccount ? <Badge tone="indigo">Signed in</Badge> : null}
                            {o.discountCode ? <Badge tone="green">{o.discountCode}</Badge> : null}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-neutral-600">{shortDate(o.createdAt)}</td>
                        <td className="px-3 py-3">
                          <SyncBadge status={o.status} />
                        </td>
                        <td className="px-3 py-3 text-end tabular-nums">{o.itemCount}</td>
                        <td className="px-5 py-3 text-end font-medium tabular-nums">
                          {formatMoney(o.total, currency)}
                          {Number(o.discountTotal) > 0 ? (
                            <span className="block text-xs font-normal text-green-700">
                              −{formatMoney(o.discountTotal, currency)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-sm text-neutral-500">
                No orders yet. This customer signed up but has not ordered.
              </p>
            )}
          </section>

          {/* Top products */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="font-semibold text-neutral-900">Most bought</h2>
            {c.topProducts.length ? (
              <ul className="mt-3 divide-y divide-neutral-100">
                {c.topProducts.map((p) => (
                  <li
                    key={`${p.productId}-${p.name}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-neutral-800">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-neutral-600">
                      × {p.qty} · {formatMoney(p.total, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Nothing yet.</p>
            )}
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="font-semibold text-neutral-900">Contact</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Phone">{c.phone ? localPhone(c.phone) : '—'}</Row>
              <Row label="Email">
                {c.email ? <span className="break-all">{c.email}</span> : '—'}
              </Row>
              <Row label="Account">
                {c.registered ? `Signed up ${shortDate(c.registeredAt)}` : 'Guest (no account)'}
              </Row>
              {c.registered ? <Row label="Last sign-in">{relativeDays(c.lastLoginAt)}</Row> : null}
              <Row label="Marketing">
                {c.acceptsMarketing ? (
                  <Badge tone="green">Subscribed</Badge>
                ) : (
                  <span className="text-neutral-500">Not subscribed</span>
                )}
              </Row>
            </dl>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="font-semibold text-neutral-900">Addresses</h2>
            {c.addresses.length ? (
              <ul className="mt-3 space-y-3">
                {c.addresses.map((a) => (
                  <li key={a.id} className="rounded-lg border border-neutral-100 p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-neutral-900">
                      {a.label} {a.isDefault ? <Badge tone="indigo">Default</Badge> : null}
                    </p>
                    <p className="text-neutral-600">
                      {a.name} · {localPhone(a.phone)}
                    </p>
                    <p className="text-neutral-600">
                      {a.address}, {a.city}
                    </p>
                  </li>
                ))}
              </ul>
            ) : c.orders[0] ? (
              <div className="mt-3 text-sm text-neutral-600">
                <p className="text-xs font-medium text-neutral-500">From the latest order</p>
                <p>
                  {c.orders[0].address}, {c.orders[0].city}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">No saved address.</p>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="font-semibold text-neutral-900">Tags</h2>
            <p className="text-xs text-neutral-500">Only you can see these.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 ps-2.5 pe-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200 ring-inset"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => void save({ tags: c.tags.filter((x) => x !== tag) }, 'tags')}
                    className="rounded-full px-1 hover:bg-brand-100"
                  >
                    ×
                  </button>
                </span>
              ))}
              {!c.tags.length ? (
                <span className="text-sm text-neutral-500">No tags yet.</span>
              ) : null}
            </div>
            <form onSubmit={addTag} className="mt-3 flex gap-2">
              <label className="flex-1">
                <span className="sr-only">New tag</span>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  maxLength={30}
                  placeholder="Add a tag"
                  className="h-9 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </label>
              <Button
                type="submit"
                variant="secondary"
                className="h-9"
                loading={saving === 'tags'}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter((s) => !c.tags.includes(s)).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void save({ tags: [...c.tags, s] }, 'tags')}
                  className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:border-brand-400 hover:text-brand-700"
                >
                  + {s}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
            <h2 className="font-semibold text-neutral-900">Notes</h2>
            <label className="mt-3 block">
              <span className="sr-only">Notes about this customer</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="e.g. Prefers delivery after 6 pm"
                className="w-full rounded-lg border border-neutral-300 p-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </label>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-400">{notes.length}/1000</span>
              <Button
                variant="secondary"
                className="h-9"
                loading={saving === 'notes'}
                disabled={notes === (c.notes ?? '')}
                onClick={() => void save({ notes: notes.trim() || null }, 'notes')}
              >
                Save note
              </Button>
            </div>
          </section>

          {c.discountCodes.length ? (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
              <h2 className="font-semibold text-neutral-900">Discount codes used</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {c.discountCodes.map((d) => (
                  <li key={d.code} className="flex justify-between">
                    <span className="font-mono font-medium">{d.code}</span>
                    <span className="text-neutral-600">
                      {d.uses}× · saved {formatMoney(d.saved, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/customers"
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
    >
      ← All customers
    </Link>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-end text-neutral-900">{children}</dd>
    </div>
  );
}
