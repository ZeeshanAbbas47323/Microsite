'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Input, Notice, Select } from '@/components/ui';
import { api, ApiError } from './api';
import { StatusBadge } from './DashboardShell';
import { formatDate } from './Overview';

interface AdminStore {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'suspended';
  hostname: string | null;
  url: string | null;
  getorioTenantId: string;
  orderCount: number;
  createdAt: string;
}

const PAGE_SIZE = 25;

/** Phase 3 admin panel: every store across tenants, with suspend / unsuspend (audited). */
export function AdminStores() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminStore[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Store whose suspend/unsuspend form is open. */
  const [acting, setActing] = useState<AdminStore | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) params.set('search', query);
    if (status) params.set('status', status);
    try {
      setData(await api(`/admin/stores?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stores');
    }
  }, [page, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(e: FormEvent) {
    e.preventDefault();
    if (!acting) return;
    setBusy(true);
    setError(null);
    try {
      const action = acting.status === 'suspended' ? 'unsuspend' : 'suspend';
      await api(`/admin/stores/${acting.id}/${action}`, { method: 'POST', body: { reason } });
      setActing(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the store');
    } finally {
      setBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <Card title={`Stores${data ? ` (${data.total})` : ''}`}>
      <form
        role="search"
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <Input
          aria-label="Search by name, address or tenant id"
          placeholder="Name, address or tenant id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          <option value="published">Live</option>
          <option value="draft">Not published</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!data ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-neutral-500">No stores match.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {data.items.map((s) => (
            <li key={s.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {s.name} <StatusBadge status={s.status} />
                  </p>
                  <p className="truncate text-neutral-500">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {s.hostname}
                      </a>
                    ) : (
                      'No address'
                    )}{' '}
                    · tenant {s.getorioTenantId} · {s.orderCount} orders · created{' '}
                    {formatDate(s.createdAt)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setActing(acting?.id === s.id ? null : s);
                    setReason('');
                  }}
                >
                  {s.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                </Button>
              </div>
              {acting?.id === s.id ? (
                <form onSubmit={act} className="flex flex-wrap gap-2 rounded-lg bg-neutral-50 p-3">
                  <Input
                    aria-label={`Reason to ${s.status === 'suspended' ? 'unsuspend' : 'suspend'} ${s.name}`}
                    placeholder="Reason (kept in the audit log)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    className="min-w-0 flex-1"
                    autoFocus
                  />
                  <Button type="submit" loading={busy} disabled={reason.trim().length < 3}>
                    {s.status === 'suspended' ? 'Unsuspend store' : 'Suspend store'}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
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
      ) : null}
    </Card>
  );
}
