'use client';

import { Badge } from '@/components/ui';

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  registered: boolean;
  tags: string[];
  ordersCount: number;
  totalSpent: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  inactive: boolean;
  createdAt: string;
}

export interface CustomerProfileData extends CustomerRow {
  notes: string | null;
  acceptsMarketing: boolean;
  lastLoginAt: string | null;
  registeredAt: string | null;
  addresses: {
    id: string;
    label: string;
    name: string;
    phone: string;
    address: string;
    city: string;
    isDefault: boolean;
  }[];
  stats: {
    averageOrder: string;
    cancelledOrders: number;
    daysBetweenOrders: number | null;
    discountSaved: string;
    months: { month: string; orders: number; spent: string }[];
  };
  topProducts: { productId: string; name: string; qty: number; total: string }[];
  discountCodes: { code: string; uses: number; saved: string }[];
  orders: {
    id: string;
    orderRef: string;
    status: 'pending_sync' | 'synced' | 'sync_failed' | 'cancelled';
    total: string;
    discountCode: string | null;
    discountTotal: string;
    city: string;
    address: string;
    itemCount: number;
    viaAccount: boolean;
    createdAt: string;
  }[];
}

/** Series colours: new customers in the brand blue, returning in teal (both pass 3:1 on white). */
export const NEW_COLOR = '#0074fc';
export const RETURNING_COLOR = '#0d9488';

const AVATAR_TONES = [
  'bg-brand-100 text-brand-800',
  'bg-teal-100 text-teal-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

export function Avatar({
  name,
  id,
  size = 'md',
}: {
  name: string;
  id: string;
  size?: 'md' | 'lg';
}) {
  const tone = AVATAR_TONES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tone} ${size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs'}`}
    >
      {initials(name) || '?'}
    </span>
  );
}

/** "+923001234567" → "0300 1234567". */
export function localPhone(phone: string | null) {
  if (!phone) return '';
  const m = /^\+92(\d{3})(\d{7})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]}` : phone;
}

export function whatsappLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

export function relativeDays(iso: string | null) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeZone: 'Asia/Karachi' }).format(
    new Date(iso),
  );
}

export function CustomerBadges({ c }: { c: CustomerRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {c.registered ? <Badge tone="indigo">Account</Badge> : <Badge>Guest</Badge>}
      {c.ordersCount >= 2 ? <Badge tone="green">Repeat</Badge> : null}
      {c.inactive ? <Badge tone="amber">At risk</Badge> : null}
      {c.tags.map((t) => (
        <Badge key={t} tone="neutral">
          {t}
        </Badge>
      ))}
    </span>
  );
}

/** Signed change against the previous period, e.g. "▲ 12%". */
export function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0)
    return (
      <span className="text-xs text-neutral-500">{now > 0 ? 'New this period' : 'No change'}</span>
    );
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-700' : 'text-red-700'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%{' '}
      <span className="font-normal text-neutral-500">vs previous</span>
    </span>
  );
}

/** CSV cell; neutralises spreadsheet formulas (=, +, -, @). */
export function csvCell(value: string | number) {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
