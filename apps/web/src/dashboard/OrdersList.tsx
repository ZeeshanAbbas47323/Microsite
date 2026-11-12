'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
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

const FILTERS = [
  ['', 'All'],
  ['pending_sync', 'Sending'],
  ['sync_failed', 'Failed'],
  ['synced', 'In Getorio'],
] as const;
const PAGE_SIZE = 20;

/** FR-6.5: microstore orders with Getorio sync status and manual retry. */
export function OrdersList() {
  const { store } = useDashboard();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: OrderRow[]; total: number } | null>(null);
  const [open, setOpen] = useState<Record<string, OrderDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    const q = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      ...(status ? { status } : {}),
    });
    try {
      setData(await api(`/stores/${store.id}/orders?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    }
  }, [store, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(o: OrderRow) {
    if (!store) return;
    if (open[o.id]) {
      setOpen(({ [o.id]: _removed, ...rest }) => rest);
      return;
    }
    const { order } = await api<{ order: OrderDetail }>(`/stores/${store.id}/orders/${o.id}`);
    setOpen((m) => ({ ...m, [o.id]: order }));
  }

  async function retry(o: OrderRow) {
    if (!store) return;
    setRetrying(o.id);
    setError(null);
    try {
      await api(`/stores/${store.id}/orders/${o.id}/retry-sync`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <div role="group" aria-label="Filter orders" className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${status === value ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white ring-neutral-300 hover:bg-neutral-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!data ? (
        <p className="text-neutral-500">Loading…</p>
      ) : data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500">
          No orders here yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((o) => {
            const detail = open[o.id];
            return (
              <li key={o.id} className="rounded-xl border border-neutral-200 bg-white">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => void toggle(o)}
                    aria-expanded={Boolean(detail)}
                    className="min-w-48 flex-1 text-start"
                  >
                    <p className="font-semibold">
                      {o.orderRef}{' '}
                      <span className="font-normal text-neutral-600">
                        · {o.customerName}, {o.city}
                      </span>
                    </p>
                    <p className="text-sm text-neutral-500">
                      {formatDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                    </p>
                  </button>
                  <span className="font-semibold">{formatMoney(o.total, o.currency)}</span>
                  <SyncBadge status={o.status} />
                  {o.stockUnverified ? <Badge tone="amber">Check stock</Badge> : null}
                  {o.status === 'sync_failed' ? (
                    <Button
                      variant="secondary"
                      onClick={() => retry(o)}
                      loading={retrying === o.id}
                    >
                      Retry sync
                    </Button>
                  ) : null}
                  {o.getorioOrderUrl ? (
                    <a
                      href={o.getorioOrderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-indigo-700 underline"
                    >
                      Open in Getorio
                    </a>
                  ) : null}
                </div>
                {o.status === 'sync_failed' && o.lastSyncError ? (
                  <p className="px-4 pb-3 text-sm text-red-700">Last error: {o.lastSyncError}</p>
                ) : null}
                {detail ? (
                  <div className="grid gap-4 border-t border-neutral-100 p-4 text-sm sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="font-medium">Customer</p>
                      <p>{detail.customerName}</p>
                      <p>
                        <a href={`tel:${detail.customerPhone}`} className="underline">
                          {detail.customerPhone}
                        </a>
                      </p>
                      {detail.customerEmail ? <p>{detail.customerEmail}</p> : null}
                      <p className="text-neutral-600">
                        {detail.address}, {detail.city}
                      </p>
                      {detail.notes ? (
                        <p className="text-neutral-600">Note: {detail.notes}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Items (cash on delivery)</p>
                      {detail.items.map((i, idx) => (
                        <p key={idx} className="flex justify-between gap-2">
                          <span>
                            {i.name} × {i.qty}
                          </span>
                          <span>{formatMoney(i.lineTotal, o.currency)}</span>
                        </p>
                      ))}
                      <p className="flex justify-between border-t border-neutral-100 pt-1 text-neutral-600">
                        <span>Shipping</span>
                        <span>{formatMoney(detail.shippingFee, o.currency)}</span>
                      </p>
                      <p className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>{formatMoney(detail.total, o.currency)}</span>
                      </p>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
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
