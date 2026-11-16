'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Notice } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api } from './api';
import { formatDate } from './Overview';
import { useDashboard } from './session';

interface QueueInfo {
  name: string;
  counts: Record<string, number>;
  failed: {
    id: string;
    name: string;
    data: { orderId: string | null };
    failedReason: string | null;
    attemptsMade: number;
    finishedOn: string | null;
  }[];
}
interface FailedSync {
  id: string;
  orderRef: string;
  storeName: string;
  syncAttempts: number;
  lastSyncError: string | null;
  total: string;
  currency: string;
  createdAt: string;
}

/** Platform admin: background queues and failed order syncs across all stores (§9.6). */
export function AdminPanel() {
  const { session } = useDashboard();
  const [queues, setQueues] = useState<QueueInfo[] | null>(null);
  const [failed, setFailed] = useState<FailedSync[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [q, f] = await Promise.all([
        api<{ queues: QueueInfo[] }>('/admin/queues'),
        api<{ orders: FailedSync[] }>('/admin/failed-syncs'),
      ]);
      setQueues(q.queues);
      setFailed(f.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  }, []);

  useEffect(() => {
    if (session.merchant.role === 'platform_admin') void load();
  }, [load, session.merchant.role]);

  if (session.merchant.role !== 'platform_admin')
    return <Notice tone="error">This page is for Getorio platform admins.</Notice>;

  async function run(key: string, path: string) {
    setBusy(key);
    try {
      await api(path, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platform admin</h1>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card title="Background queues">
        {!queues ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="space-y-6">
            {queues.map((q) => (
              <div key={q.name} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{q.name}</h3>
                  {Object.entries(q.counts).map(([state, n]) => (
                    <Badge key={state} tone={state === 'failed' && n > 0 ? 'red' : 'neutral'}>
                      {state}: {n}
                    </Badge>
                  ))}
                </div>
                {q.failed.length ? (
                  <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 text-sm">
                    {q.failed.map((j) => (
                      <li
                        key={j.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3"
                      >
                        <div>
                          <p className="font-medium">
                            {j.id}{' '}
                            <span className="text-neutral-500">· {j.attemptsMade} attempts</span>
                          </p>
                          <p className="text-red-700">{j.failedReason}</p>
                        </div>
                        <Button
                          variant="secondary"
                          loading={busy === `job-${j.id}`}
                          onClick={() =>
                            run(
                              `job-${j.id}`,
                              `/admin/queues/${q.name}/jobs/${encodeURIComponent(j.id)}/retry`,
                            )
                          }
                        >
                          Retry job
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No failed jobs.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Failed order syncs (all stores)">
        {!failed ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : failed.length === 0 ? (
          <p className="text-sm text-neutral-500">No failed syncs.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {failed.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {o.orderRef} · {o.storeName} · {formatMoney(o.total, o.currency)}
                  </p>
                  <p className="text-neutral-500">
                    {formatDate(o.createdAt)} · {o.syncAttempts} attempts
                  </p>
                  {o.lastSyncError ? <p className="text-red-700">{o.lastSyncError}</p> : null}
                </div>
                <Button
                  variant="secondary"
                  loading={busy === o.id}
                  onClick={() => run(o.id, `/admin/orders/${o.id}/retry-sync`)}
                >
                  Retry sync
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
