'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Badge, Button, Notice, Toggle } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { api, ApiError } from '../api';
import { useT } from '../i18n';
import { useDashboard } from '../session';

type DiscountType = 'percentage' | 'fixed' | 'free_shipping';
type Status = 'active' | 'scheduled' | 'expired' | 'used_up' | 'disabled';

interface Discount {
  id: string;
  code: string;
  description: string | null;
  summary: string;
  type: DiscountType;
  value: string;
  maxDiscount: string | null;
  minSubtotal: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  status: Status;
  createdAt: string;
  orders: number;
  sales: string;
  discounted: string;
}
interface ListResponse {
  items: Discount[];
  totals: { active: number; orders: number; sales: string; discounted: string };
}

const STATUS_BADGE: Record<Status, [string, 'green' | 'amber' | 'red' | 'neutral' | 'indigo']> = {
  active: ['Active', 'green'],
  scheduled: ['Scheduled', 'indigo'],
  expired: ['Expired', 'neutral'],
  used_up: ['Used up', 'amber'],
  disabled: ['Off', 'neutral'],
};
const FILTERS: ['' | Status, string][] = [
  ['', 'All'],
  ['active', 'Active'],
  ['scheduled', 'Scheduled'],
  ['expired', 'Expired'],
  ['used_up', 'Used up'],
  ['disabled', 'Off'],
];
const TYPES: [DiscountType, string, string][] = [
  ['percentage', 'Percentage', 'e.g. 20% off the order'],
  ['fixed', 'Fixed amount', 'e.g. Rs 500 off the order'],
  ['free_shipping', 'Free delivery', 'Delivery fee becomes free'],
];

/** `datetime-local` value in Pakistan time for an ISO instant (and back). */
const toLocal = (iso: string) =>
  new Date(Date.parse(iso) + 5 * 3600_000).toISOString().slice(0, 16);
const fromLocal = (v: string) => new Date(Date.parse(`${v}:00.000Z`) - 5 * 3600_000).toISOString();

function randomCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return `SAVE-${s}`;
}

/** Discount codes: create, edit, switch off and see how much each one sold. */
export function DiscountsManager() {
  const { store } = useDashboard();
  const t = useT();
  const currency = store?.currency ?? 'PKR';
  const [data, setData] = useState<ListResponse | null>(null);
  const [filter, setFilter] = useState<'' | Status>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Discount | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Discount | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    try {
      setData(await api<ListResponse>(`/stores/${store.id}/discounts`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load discounts');
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  async function toggleActive(d: Discount) {
    if (!store) return;
    try {
      await api(`/stores/${store.id}/discounts/${d.id}`, {
        method: 'PATCH',
        body: { active: !d.active },
      });
      setToast(`${d.code} ${d.active ? 'switched off' : 'switched on'}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update');
    }
  }

  async function remove(d: Discount) {
    if (!store) return;
    try {
      await api(`/stores/${store.id}/discounts/${d.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      setToast(`${d.code} deleted`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setToast(`${code} copied`);
    } catch {
      // ignore
    }
  }

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (d) =>
          (!filter || d.status === filter) &&
          (!search ||
            d.code.includes(search.trim().toUpperCase()) ||
            d.description?.toLowerCase().includes(search.toLowerCase())),
      ),
    [data, filter, search],
  );
  const count = (s: '' | Status) => (data?.items ?? []).filter((d) => !s || d.status === s).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Discounts')}</h1>
          <p className="text-sm text-neutral-500">
            Codes customers type at checkout. Every code is checked on our server.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>+ Create discount</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active codes" value={data ? String(data.totals.active) : '–'} />
        <Kpi
          label="Orders with a code"
          value={data ? data.totals.orders.toLocaleString('en-PK') : '–'}
        />
        <Kpi
          label="Sales from codes"
          value={data ? formatMoney(data.totals.sales, currency) : '–'}
        />
        <Kpi
          label="Discount given"
          value={data ? formatMoney(data.totals.discounted, currency) : '–'}
        />
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {toast ? (
        <div
          role="status"
          className="fixed end-6 bottom-6 z-50 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter discounts" className="flex gap-1 overflow-x-auto">
          {FILTERS.map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-brand-600 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50'}`}
            >
              {label}
              <span
                className={`text-xs tabular-nums ${filter === value ? 'text-brand-100' : 'text-neutral-400'}`}
              >
                {data ? count(value) : ''}
              </span>
            </button>
          ))}
        </div>
        <label className="w-full sm:w-64">
          <span className="sr-only">Search codes</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes"
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </label>
      </div>

      {data && data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
          <p className="text-3xl" aria-hidden="true">
            🏷️
          </p>
          <h2 className="mt-2 text-lg font-semibold text-neutral-900">
            Create your first discount code
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
            Run an Eid sale, thank loyal customers or offer free delivery. Share the code on
            WhatsApp or Instagram and customers enter it at checkout.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => setEditing('new')}>Create discount</Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium tracking-wide uppercase"
                  >
                    Code
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-start font-medium tracking-wide uppercase"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-start font-medium tracking-wide uppercase"
                  >
                    Used
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-end font-medium tracking-wide uppercase"
                  >
                    Sales
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-start font-medium tracking-wide uppercase"
                  >
                    Dates
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-end font-medium tracking-wide uppercase"
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {items.map((d) => {
                  const [label, tone] = STATUS_BADGE[d.status];
                  const pct = d.usageLimit ? Math.min(100, (d.usedCount / d.usageLimit) * 100) : 0;
                  return (
                    <tr key={d.id} className="align-top hover:bg-neutral-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md border border-dashed border-brand-300 bg-brand-50 px-2 py-0.5 font-mono text-sm font-semibold text-brand-800">
                            {d.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copy(d.code)}
                            className="text-xs font-medium text-brand-700 hover:underline"
                            aria-label={`Copy ${d.code}`}
                          >
                            Copy
                          </button>
                        </div>
                        <p className="mt-1 text-neutral-700">{d.summary}</p>
                        {d.description ? (
                          <p className="text-xs text-neutral-500">{d.description}</p>
                        ) : null}
                        {d.perCustomerLimit ? (
                          <p className="text-xs text-neutral-500">
                            {d.perCustomerLimit === 1
                              ? 'Once per customer'
                              : `${d.perCustomerLimit} times per customer`}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={tone}>{label}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <span className="tabular-nums">
                          {d.usedCount}
                          {d.usageLimit ? (
                            <span className="text-neutral-500"> / {d.usageLimit}</span>
                          ) : null}
                        </span>
                        {d.usageLimit ? (
                          <div
                            className="mt-1 h-1.5 w-24 rounded-full bg-neutral-100"
                            aria-hidden="true"
                          >
                            <div
                              className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500">No limit</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        <span className="font-medium">{formatMoney(d.sales, currency)}</span>
                        <span className="block text-xs text-neutral-500">
                          {d.orders} order{d.orders === 1 ? '' : 's'} · −
                          {formatMoney(d.discounted, currency)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-600">
                        <p>From {formatDay(d.startsAt)}</p>
                        <p>{d.endsAt ? `Until ${formatDay(d.endsAt)}` : 'No end date'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={d.active}
                            aria-label={`${d.code} active`}
                            onClick={() => void toggleActive(d)}
                            className={`relative h-6 w-10 shrink-0 rounded-full transition ${d.active ? 'bg-brand-600' : 'bg-neutral-300'}`}
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.active ? 'start-[18px]' : 'start-0.5'}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(d)}
                            className="text-sm font-medium text-brand-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(d)}
                            className="text-sm font-medium text-red-700 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data && items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      No codes match.
                    </td>
                  </tr>
                ) : null}
                {!data ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10">
                      <div className="h-6 animate-pulse rounded bg-neutral-100" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing ? (
        <DiscountForm
          storeId={store?.id ?? ''}
          currency={currency}
          discount={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (code, created) => {
            setEditing(null);
            setToast(created ? `${code} created` : `${code} saved`);
            await load();
          }}
        />
      ) : null}

      {confirmDelete ? (
        <Modal title={`Delete ${confirmDelete.code}?`} onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-neutral-600">
            Customers will not be able to use this code any more. Orders that already used it keep
            their discount.
            {confirmDelete.orders
              ? ` It was used on ${confirmDelete.orders} order${confirmDelete.orders === 1 ? '' : 's'}.`
              : ''}{' '}
            To pause it instead, switch it off.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove(confirmDelete)}>
              Delete code
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 text-xl leading-none text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DiscountForm({
  storeId,
  currency,
  discount,
  onClose,
  onSaved,
}: {
  storeId: string;
  currency: string;
  discount: Discount | null;
  onClose: () => void;
  onSaved: (code: string, created: boolean) => void | Promise<void>;
}) {
  const [code, setCode] = useState(discount?.code ?? '');
  const [description, setDescription] = useState(discount?.description ?? '');
  const [type, setType] = useState<DiscountType>(discount?.type ?? 'percentage');
  const [value, setValue] = useState(
    discount && discount.type !== 'free_shipping' ? String(Number(discount.value)) : '',
  );
  const [maxDiscount, setMaxDiscount] = useState(
    discount?.maxDiscount ? String(Number(discount.maxDiscount)) : '',
  );
  const [minSubtotal, setMinSubtotal] = useState(
    discount?.minSubtotal ? String(Number(discount.minSubtotal)) : '',
  );
  const [usageLimit, setUsageLimit] = useState(
    discount?.usageLimit ? String(discount.usageLimit) : '',
  );
  const [oncePerCustomer, setOncePerCustomer] = useState(
    discount ? discount.perCustomerLimit === 1 : true,
  );
  const [startsAt, setStartsAt] = useState(toLocal(discount?.startsAt ?? new Date().toISOString()));
  const [hasEnd, setHasEnd] = useState(Boolean(discount?.endsAt));
  const [endsAt, setEndsAt] = useState(
    discount?.endsAt
      ? toLocal(discount.endsAt)
      : toLocal(new Date(Date.now() + 7 * 86_400_000).toISOString()),
  );
  const [active, setActive] = useState(discount?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const money = (v: string) => formatMoney(v || '0', currency);
  const preview =
    type === 'percentage'
      ? `${value || '0'}% off${maxDiscount ? ` (up to ${money(maxDiscount)})` : ''}`
      : type === 'fixed'
        ? `${money(value)} off`
        : 'Free delivery';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    const body = {
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      type,
      ...(type !== 'free_shipping' ? { value: value || '0' } : {}),
      maxDiscount: type === 'percentage' && maxDiscount ? maxDiscount : null,
      minSubtotal: minSubtotal || null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      perCustomerLimit: oncePerCustomer ? 1 : null,
      startsAt: fromLocal(startsAt),
      endsAt: hasEnd ? fromLocal(endsAt) : null,
      active,
    };
    try {
      await api(
        discount ? `/stores/${storeId}/discounts/${discount.id}` : `/stores/${storeId}/discounts`,
        {
          method: discount ? 'PATCH' : 'POST',
          body,
        },
      );
      await onSaved(body.code, !discount);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as { path: string; message: string }[])
          map[d.path.split('.')[0] ?? d.path] = d.message;
        setErrors(map);
      }
      setFormError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const input =
    'h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none aria-[invalid=true]:border-red-500';
  const err = (k: string) =>
    errors[k] ? <p className="mt-1 text-sm text-red-700">{errors[k]}</p> : null;

  return (
    <Modal title={discount ? `Edit ${discount.code}` : 'Create discount'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="d-code" className="mb-1 block text-sm font-medium text-neutral-800">
            Discount code
          </label>
          <div className="flex gap-2">
            <input
              id="d-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
              maxLength={32}
              placeholder="EID20"
              required
              aria-invalid={Boolean(errors.code)}
              className={`${input} font-mono uppercase`}
            />
            <Button type="button" variant="secondary" onClick={() => setCode(randomCode())}>
              Generate
            </Button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Customers type this at checkout. Letters, numbers and dashes.
          </p>
          {err('code')}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-800">Type</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map(([v, label, hint]) => (
              <label
                key={v}
                className={`cursor-pointer rounded-xl border p-3 text-sm ${type === v ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-neutral-200 hover:border-neutral-300'}`}
              >
                <input
                  type="radio"
                  name="d-type"
                  value={v}
                  checked={type === v}
                  onChange={() => setType(v)}
                  className="sr-only"
                />
                <span className="block font-semibold text-neutral-900">{label}</span>
                <span className="block text-xs text-neutral-500">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {type !== 'free_shipping' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="d-value" className="mb-1 block text-sm font-medium text-neutral-800">
                {type === 'percentage' ? 'Percent off' : `Amount off (${currency})`}
              </label>
              <div className="relative">
                <input
                  id="d-value"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder={type === 'percentage' ? '20' : '500'}
                  aria-invalid={Boolean(errors.value)}
                  className={`${input} pe-10`}
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-neutral-500">
                  {type === 'percentage' ? '%' : currency}
                </span>
              </div>
              {err('value')}
            </div>
            {type === 'percentage' ? (
              <div>
                <label htmlFor="d-max" className="mb-1 block text-sm font-medium text-neutral-800">
                  Maximum discount <span className="font-normal text-neutral-500">(optional)</span>
                </label>
                <input
                  id="d-max"
                  inputMode="decimal"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="e.g. 1000"
                  className={input}
                />
                <p className="mt-1 text-xs text-neutral-500">Caps the discount on big orders.</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="d-min" className="mb-1 block text-sm font-medium text-neutral-800">
              Minimum order <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <input
              id="d-min"
              inputMode="decimal"
              value={minSubtotal}
              onChange={(e) => setMinSubtotal(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="e.g. 2000"
              className={input}
            />
          </div>
          <div>
            <label htmlFor="d-limit" className="mb-1 block text-sm font-medium text-neutral-800">
              Total uses <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <input
              id="d-limit"
              inputMode="numeric"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value.replace(/\D/g, ''))}
              placeholder="Unlimited"
              aria-invalid={Boolean(errors.usageLimit)}
              className={input}
            />
            <p className="mt-1 text-xs text-neutral-500">e.g. first 100 customers only.</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={oncePerCustomer}
            onChange={(e) => setOncePerCustomer(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-brand-600"
          />
          One use per customer (by mobile number)
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="d-start" className="mb-1 block text-sm font-medium text-neutral-800">
              Starts
            </label>
            <input
              id="d-start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-neutral-800">
              <input
                type="checkbox"
                checked={hasEnd}
                onChange={(e) => setHasEnd(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-brand-600"
              />
              Ends
            </label>
            <input
              type="datetime-local"
              aria-label="End date"
              value={endsAt}
              min={startsAt}
              disabled={!hasEnd}
              onChange={(e) => setEndsAt(e.target.value)}
              aria-invalid={Boolean(errors.endsAt)}
              className={`${input} disabled:bg-neutral-50 disabled:text-neutral-400`}
            />
            {err('endsAt')}
          </div>
        </div>
        <p className="-mt-3 text-xs text-neutral-500">Times are Pakistan time.</p>

        <div>
          <label htmlFor="d-desc" className="mb-1 block text-sm font-medium text-neutral-800">
            Internal note <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <input
            id="d-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="e.g. Eid campaign on Instagram"
            className={input}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-neutral-50 p-4">
          <div>
            <p className="text-xs font-medium text-neutral-500">Customers will see</p>
            <p className="font-semibold text-neutral-900">
              <span className="font-mono">{code || 'CODE'}</span> · {preview}
              {minSubtotal ? ` on orders over ${money(minSubtotal)}` : ''}
            </p>
          </div>
          <Toggle checked={active} onChange={setActive} label="Active" />
        </div>

        {formError ? <Notice tone="error">{formError}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {discount ? 'Save changes' : 'Create discount'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
