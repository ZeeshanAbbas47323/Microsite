'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
import { StatusBadge } from './DashboardShell';
import { useDashboard } from './session';
import { useStoreActions } from './useStoreActions';

export interface OrderRow {
  id: string;
  orderRef: string;
  status: 'pending_sync' | 'synced' | 'sync_failed' | 'cancelled';
  customerName: string;
  customerPhone: string;
  city: string;
  total: string;
  currency: string;
  itemCount: number;
  stockUnverified: boolean;
  getorioOrderId: string | null;
  getorioOrderUrl: string | null;
  syncAttempts: number;
  lastSyncError: string | null;
  createdAt: string;
}

export function SyncBadge({ status }: { status: OrderRow['status'] }) {
  if (status === 'synced') return <Badge tone="green">In Getorio</Badge>;
  if (status === 'sync_failed') return <Badge tone="red">Sync failed</Badge>;
  if (status === 'cancelled') return <Badge>Cancelled</Badge>;
  return <Badge tone="amber">Sending to Getorio</Badge>;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}

/** FR-6.1: store status, URL, quick links and recent orders. */
export function Overview() {
  const { store } = useDashboard();
  const { publish, unpublish, busy, error } = useStoreActions();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    if (!store) return;
    api<{ items: OrderRow[] }>(`/stores/${store.id}/orders?pageSize=5`)
      .then((r) => setOrders(r.items))
      .catch(() => setOrders([]));
  }, [store]);

  if (!store) return null;
  const live = store.status === 'published';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{store.name}</h2>
              <StatusBadge status={store.status} />
            </div>
            {store.url ? (
              <p className="text-sm">
                {live ? (
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-700 underline"
                  >
                    {store.hostname}
                  </a>
                ) : (
                  <span className="text-neutral-600">{store.hostname}</span>
                )}
              </p>
            ) : null}
            {store.publishedAt ? (
              <p className="text-xs text-neutral-500">
                Last published {formatDate(store.publishedAt)}
              </p>
            ) : null}
            {store.status === 'draft' ? (
              <p className="text-sm text-neutral-600">
                Customers can’t see your store until you publish it.
              </p>
            ) : null}
            {store.hasUnpublishedChanges && store.status === 'published' ? (
              <p className="text-sm text-amber-800">
                You have changes that customers can’t see yet.
              </p>
            ) : null}
          </div>
          {store.status === 'suspended' ? (
            <Notice tone="error">This store is suspended. Contact Getorio support.</Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/design"
                className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-neutral-300 hover:bg-neutral-50"
              >
                Edit design
              </Link>
              {live ? (
                <Button variant="secondary" onClick={unpublish} loading={busy === 'unpublish'}>
                  Unpublish
                </Button>
              ) : null}
              {!live || store.hasUnpublishedChanges ? (
                <Button onClick={publish} loading={busy === 'publish'}>
                  {live ? 'Publish changes' : 'Publish store'}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['/dashboard/products', 'Choose products', 'Pick which Getorio products appear.'],
          ['/dashboard/orders', 'Orders', 'See orders and their Getorio status.'],
          ['/dashboard/settings', 'Settings', 'Shipping, contact details, address.'],
        ].map(([href, title, text]) => (
          <Link
            key={href}
            href={href as string}
            className="rounded-xl border border-neutral-200 bg-white p-4 hover:border-indigo-300"
          >
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-neutral-600">{text}</p>
          </Link>
        ))}
      </div>

      <Card
        title="Recent orders"
        actions={
          <Link href="/dashboard/orders" className="text-sm font-medium text-indigo-700">
            View all
          </Link>
        }
      >
        {orders === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No orders yet. Share your store link to get your first order.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {o.orderRef} · {o.customerName}
                  </p>
                  <p className="text-neutral-500">{formatDate(o.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatMoney(o.total, o.currency)}</span>
                  <SyncBadge status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
