'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Notice } from '@/components/ui';
import { api, ApiError, type Store } from './api';
import { useT } from './i18n';
import { formatDate } from './Overview';
import { useDashboard } from './session';

interface Domain {
  id: string;
  hostname: string;
  type: 'subdomain' | 'custom';
  apex: boolean;
  verified: boolean;
  isPrimary: boolean;
  status: 'pending' | 'active' | 'attention';
  url: string;
  verification: { name: string; value: string } | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckError: string | null;
  createdAt: string;
}
interface DomainList {
  subdomain: Domain | null;
  redirects: { hostname: string; until: string | null }[];
  domains: Domain[];
  rootDomain: string;
  target: { ips: string[]; cname: string };
  limit: number;
}
interface DnsCheck {
  key: 'ownership' | 'routing';
  ok: boolean;
  found: string[];
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

// -- Small parts ---------------------------------------------------------------------------

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
      aria-label={`Copy ${label}`}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

function StatusPill({ domain }: { domain: Domain }) {
  const map = {
    active: ['bg-emerald-50 text-emerald-800 ring-emerald-200', 'bg-emerald-500', 'Connected'],
    pending: ['bg-amber-50 text-amber-900 ring-amber-200', 'bg-amber-500', 'Waiting for DNS'],
    attention: ['bg-red-50 text-red-800 ring-red-200', 'bg-red-500', 'Needs attention'],
  } as const;
  const [cls, dot, label] = map[domain.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-neutral-200 bg-white shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-neutral-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-neutral-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// -- DNS records -----------------------------------------------------------------------------

interface DnsRecord {
  key: DnsCheck['key'];
  type: string;
  name: string;
  value: string;
  purpose: string;
}

function recordsFor(domain: Domain, target: DomainList['target']): DnsRecord[] {
  const labels = domain.hostname.split('.');
  // Most DNS panels want the name relative to the zone: "@" for the apex, "www" for www.brand.pk.
  const zoneLabels = domain.apex ? labels.length : labels.length - 1;
  const relative = (full: string) => {
    const parts = full.split('.');
    const rel = parts.slice(0, parts.length - zoneLabels).join('.');
    return rel || '@';
  };
  const routing: DnsRecord[] = domain.apex
    ? target.ips.map((ip) => ({
        key: 'routing' as const,
        type: 'A',
        name: '@',
        value: ip,
        purpose: 'Sends visitors to your store',
      }))
    : [
        {
          key: 'routing',
          type: 'CNAME',
          name: relative(domain.hostname),
          value: target.cname,
          purpose: 'Sends visitors to your store',
        },
      ];
  return [
    ...(domain.verification
      ? [
          {
            key: 'ownership' as const,
            type: 'TXT',
            name: relative(domain.verification.name),
            value: domain.verification.value,
            purpose: 'Proves the domain is yours',
          },
        ]
      : []),
    ...routing,
  ];
}

function DnsTable({
  domain,
  target,
  checks,
}: {
  domain: Domain;
  target: DomainList['target'];
  checks: DnsCheck[] | undefined;
}) {
  const records = recordsFor(domain, target);
  const state = (key: DnsCheck['key']) => checks?.find((c) => c.key === key);
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">DNS records for {domain.hostname}</caption>
        <thead className="bg-neutral-50 text-xs text-neutral-600 uppercase tracking-wide">
          <tr>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Name / Host
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Value / Points to
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              TTL
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {records.map((r) => {
            const s = state(r.key);
            return (
              <tr key={`${r.type}-${r.value}`}>
                <td className="px-3 py-3 align-top">
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-bold text-brand-800">
                    {r.type}
                  </span>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[13px] break-all">{r.name}</code>
                    <CopyButton value={r.name} label={`${r.type} name`} />
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{r.purpose}</p>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[13px] break-all">{r.value}</code>
                    <CopyButton value={r.value} label={`${r.type} value`} />
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-neutral-600">Auto / 3600</td>
                <td className="px-3 py-3 align-top">
                  {domain.verified && !s ? (
                    <span className="text-xs font-semibold text-emerald-700">✓ Verified</span>
                  ) : !s ? (
                    <span className="text-xs text-neutral-500">Not checked yet</span>
                  ) : s.ok ? (
                    <span className="text-xs font-semibold text-emerald-700">✓ Found</span>
                  ) : (
                    <div className="text-xs">
                      <span className="font-semibold text-red-700">✗ Not found</span>
                      {s.found.length ? (
                        <p className="mt-0.5 text-neutral-500">
                          We see: <span className="font-mono">{s.found.join(', ')}</span>
                        </p>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -- Custom domain card --------------------------------------------------------------------------

function DomainCard({
  domain,
  target,
  storeId,
  onChange,
}: {
  domain: Domain;
  target: DomainList['target'];
  storeId: string;
  onChange: (list?: DomainList) => Promise<void>;
}) {
  const [open, setOpen] = useState(!domain.verified);
  const [checks, setChecks] = useState<DnsCheck[]>();
  const [busy, setBusy] = useState<'verify' | 'primary' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  async function verify() {
    setBusy('verify');
    setMessage(null);
    try {
      const res = await api<{ domain: Domain; checks: DnsCheck[] }>(
        `/stores/${storeId}/domains/${domain.id}/verify`,
        { method: 'POST' },
      );
      setChecks(res.checks);
      setMessage(
        res.checks.every((c) => c.ok)
          ? {
              tone: 'success',
              text: `${domain.hostname} is connected. SSL is set up automatically.`,
            }
          : {
              tone: 'error',
              text: 'Some records are missing. DNS changes can take from a few minutes up to 24 hours.',
            },
      );
      await onChange();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function act(kind: 'primary' | 'remove') {
    setBusy(kind);
    setMessage(null);
    try {
      const list = await api<DomainList>(
        `/stores/${storeId}/domains/${domain.id}${kind === 'primary' ? '/primary' : ''}`,
        { method: kind === 'primary' ? 'POST' : 'DELETE' },
      );
      await onChange(list);
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-neutral-200">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg"
          aria-hidden="true"
        >
          🌐
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={domain.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold break-all text-neutral-900 hover:text-brand-700 hover:underline"
            >
              {domain.hostname}
            </a>
            {domain.isPrimary ? <Tag tone="brand">Primary</Tag> : null}
            <Tag>{domain.apex ? 'Root domain' : 'Subdomain'}</Tag>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {domain.verifiedAt
              ? `Connected ${formatDate(domain.verifiedAt)}`
              : `Added ${formatDate(domain.createdAt)}`}
            {domain.lastCheckedAt ? ` · Last checked ${formatDate(domain.lastCheckedAt)}` : ''}
            {domain.verified ? ' · 🔒 SSL automatic' : ''}
          </p>
        </div>
        <StatusPill domain={domain} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={domain.verified ? 'secondary' : 'primary'}
            className="h-9"
            loading={busy === 'verify'}
            onClick={() => void verify()}
          >
            {domain.verified ? 'Re-check' : 'Verify DNS'}
          </Button>
          {domain.verified && !domain.isPrimary ? (
            <Button
              variant="secondary"
              className="h-9"
              loading={busy === 'primary'}
              onClick={() => void act('primary')}
            >
              Make primary
            </Button>
          ) : null}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="h-9 rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {open ? 'Hide DNS' : 'DNS records'}
          </button>
        </div>
      </div>

      {domain.status === 'attention' && domain.lastCheckError ? (
        <div className="mx-4 mb-3">
          <Notice tone="error">
            Last check: {domain.lastCheckError}. Your store keeps working on this domain, but fix
            the record soon.
          </Notice>
        </div>
      ) : null}
      {message ? (
        <div className="mx-4 mb-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}

      {open ? (
        <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/60 p-4">
          <div className="text-sm text-neutral-700">
            <p className="font-semibold text-neutral-900">
              Add these records at your domain provider
            </p>
            <p className="mt-0.5">
              Sign in where you bought <strong>{domain.hostname}</strong> (GoDaddy, Namecheap,
              PKNIC, Cloudflare…), open <em>DNS settings</em>, add the records below, then press{' '}
              <em>Verify DNS</em>.
              {domain.apex
                ? ' Remove any other A records on "@" so all visitors reach your store.'
                : ' Remove any other A or CNAME record with the same name first.'}
            </p>
          </div>
          <DnsTable domain={domain} target={target} checks={checks} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Using Cloudflare? Set the record to <strong>DNS only</strong> (grey cloud) until the
              domain shows Connected.
            </p>
            {confirmRemove ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-700">
                  Remove {domain.hostname}?
                  {domain.isPrimary ? ' Customers will use your free address again.' : ''}
                </span>
                <Button
                  variant="danger"
                  className="h-8"
                  loading={busy === 'remove'}
                  onClick={() => void act('remove')}
                >
                  Remove
                </Button>
                <Button variant="ghost" className="h-8" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-sm font-medium text-red-700 hover:underline"
              >
                Remove domain
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

// -- Page ------------------------------------------------------------------------------------------

const STEPS = [
  ['1', 'Add your domain', 'Type the domain you already own, like brand.pk or www.brand.com.'],
  ['2', 'Update DNS', 'Copy two records into your domain provider’s DNS settings.'],
  ['3', 'Verify', 'We check the records. SSL (https) is set up for you automatically.'],
] as const;

const PROVIDERS = [
  ['GoDaddy', 'My Products → your domain → DNS → Add new record.'],
  ['Namecheap', 'Domain List → Manage → Advanced DNS → Add new record.'],
  ['Cloudflare', 'DNS → Records → Add record. Keep the proxy off (DNS only) while connecting.'],
  ['PKNIC (.pk)', 'PKNIC only holds name servers: add the records at the DNS host those point to.'],
] as const;

const FAQ = [
  [
    'How long does it take?',
    'Usually a few minutes. Some providers take up to 24 hours (rarely 48) before new records are visible.',
  ],
  [
    'Do I need to buy an SSL certificate?',
    'No. Once the domain is verified, a free certificate is issued and renewed for you automatically.',
  ],
  [
    'Will my email stop working?',
    'No. Only add the records shown here; leave your MX (email) records as they are.',
  ],
  [
    'What happens to my free address?',
    'It keeps working. If you make your own domain primary, the free address redirects to it.',
  ],
  [
    'Can I use my own server or hosting?',
    'Point the domain at our server (the A record IP above). Your store runs on our servers, so there is nothing to install on yours.',
  ],
] as const;

export function DomainsManager() {
  const { store, setStore } = useDashboard();
  const t = useT();
  const [data, setData] = useState<DomainList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostname, setHostname] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Subdomain change
  const [editing, setEditing] = useState(false);
  const [sub, setSub] = useState('');
  const [subCheck, setSubCheck] = useState<{ available: boolean; message?: string } | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subMsg, setSubMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const storeId = store?.id;

  const refreshStore = useCallback(async () => {
    if (!storeId) return;
    const res = await api<{ store: Store }>(`/stores/${storeId}`);
    setStore(res.store);
  }, [storeId, setStore]);

  const load = useCallback(
    async (list?: DomainList) => {
      if (!storeId) return;
      try {
        setData(list ?? (await api<DomainList>(`/stores/${storeId}/domains`)));
        setError(null);
        if (list) await refreshStore();
      } catch (e) {
        setError(errorText(e));
      }
    },
    [storeId, refreshStore],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Live availability while typing a new subdomain.
  useEffect(() => {
    if (!editing || !sub || sub === store?.subdomain) {
      setSubCheck(null);
      return;
    }
    const id = setTimeout(() => {
      api<{ available: boolean; message?: string }>(
        `/subdomains/check?name=${encodeURIComponent(sub)}`,
      )
        .then(setSubCheck)
        .catch(() => setSubCheck(null));
    }, 350);
    return () => clearTimeout(id);
  }, [sub, editing, store?.subdomain]);

  if (!store) return null;

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !hostname.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api(`/stores/${storeId}/domains`, { method: 'POST', body: { hostname } });
      setHostname('');
      await load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : errorText(err));
    } finally {
      setAdding(false);
    }
  }

  async function saveSubdomain() {
    if (!storeId) return;
    setSubBusy(true);
    setSubMsg(null);
    try {
      const res = await api<{ store: Store }>(`/stores/${storeId}/settings`, {
        method: 'PATCH',
        body: { subdomain: sub },
      });
      setStore(res.store);
      setEditing(false);
      setSubMsg({
        tone: 'success',
        text: 'Address changed. The old one redirects here for 30 days.',
      });
      await load();
    } catch (err) {
      setSubMsg({ tone: 'error', text: errorText(err) });
    } finally {
      setSubBusy(false);
    }
  }

  const free = data?.subdomain;
  const primary = data
    ? (data.domains.find((d) => d.isPrimary) ?? (free?.isPrimary ? free : null))
    : null;
  const atLimit = data ? data.domains.length >= data.limit : false;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Domains')}</h1>
          <p className="text-sm text-neutral-500">
            Your free Getorio address, and your own domain if you have one.
          </p>
        </div>
        {primary ? (
          <div className="rounded-xl bg-brand-50 px-4 py-2 text-sm ring-1 ring-brand-200">
            <span className="text-brand-900">Customers visit </span>
            <a
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 hover:underline"
            >
              {primary.hostname} ↗
            </a>
          </div>
        ) : null}
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Free subdomain */}
          <Section
            title="Free Getorio address"
            description="Included with every store, with https. You can change the name any time."
          >
            {!data ? (
              <div className="h-16 animate-pulse rounded-xl bg-neutral-100" />
            ) : free ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white"
                    aria-hidden="true"
                  >
                    G
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={free.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold break-all hover:text-brand-700 hover:underline"
                      >
                        {free.hostname}
                      </a>
                      {free.isPrimary ? <Tag tone="brand">Primary</Tag> : null}
                      <Tag>Subdomain</Tag>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      🔒 SSL included ·{' '}
                      {free.isPrimary
                        ? 'This is the address customers see'
                        : `Redirects to ${primary?.hostname ?? 'your primary domain'}`}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {store.status === 'published' ? 'Live' : 'Ready'}
                  </span>
                  <div className="flex gap-2">
                    <CopyButton value={free.url} label="store address" />
                    {!free.isPrimary ? (
                      <Button
                        variant="secondary"
                        className="h-8"
                        onClick={async () => {
                          await load(
                            await api<DomainList>(
                              `/stores/${store.id}/domains/${free.id}/primary`,
                              {
                                method: 'POST',
                              },
                            ),
                          );
                        }}
                      >
                        Make primary
                      </Button>
                    ) : null}
                    {!editing ? (
                      <Button
                        variant="secondary"
                        className="h-8"
                        onClick={() => {
                          setSub(store.subdomain ?? '');
                          setEditing(true);
                          setSubMsg(null);
                        }}
                      >
                        Change
                      </Button>
                    ) : null}
                  </div>
                </div>

                {editing ? (
                  <div className="space-y-3 rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                    <label htmlFor="subdomain" className="block text-sm font-medium">
                      New address
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-neutral-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
                        <input
                          id="subdomain"
                          value={sub}
                          onChange={(e) => setSub(e.target.value.toLowerCase().replace(/\s/g, ''))}
                          spellCheck={false}
                          aria-describedby="subdomain-hint"
                          className="h-10 min-w-0 flex-1 px-3 text-sm outline-none"
                        />
                        <span className="shrink-0 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-600">
                          .{data.rootDomain}
                        </span>
                      </div>
                      <Button
                        className="h-10"
                        loading={subBusy}
                        disabled={!subCheck?.available}
                        onClick={() => void saveSubdomain()}
                      >
                        Save
                      </Button>
                      <Button variant="ghost" className="h-10" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                    <p id="subdomain-hint" className="text-xs" aria-live="polite">
                      {subCheck ? (
                        subCheck.available ? (
                          <span className="font-medium text-emerald-700">✓ Available</span>
                        ) : (
                          <span className="font-medium text-red-700">
                            {subCheck.message ?? 'Not available'}
                          </span>
                        )
                      ) : (
                        <span className="text-neutral-500">
                          3–30 letters, numbers or hyphens. The old address keeps redirecting for 30
                          days.
                        </span>
                      )}
                    </p>
                  </div>
                ) : null}
                {subMsg ? <Notice tone={subMsg.tone}>{subMsg.text}</Notice> : null}

                {data.redirects.length ? (
                  <div className="text-sm">
                    <p className="font-medium text-neutral-700">Old addresses still redirecting</p>
                    <ul className="mt-1 space-y-1">
                      {data.redirects.map((r) => (
                        <li key={r.hostname} className="flex flex-wrap gap-2 text-neutral-600">
                          <span className="font-mono text-[13px] line-through decoration-neutral-300">
                            {r.hostname}
                          </span>
                          <span>
                            → until {r.until ? formatDate(r.until).split(',')[0] : 'soon'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No subdomain yet.</p>
            )}
          </Section>

          {/* Custom domains */}
          <Section
            title="Your own domain"
            description="Already own a domain? Point it at our server and your store opens on it."
            actions={
              data ? (
                <span className="text-xs text-neutral-500">
                  {data.domains.length} of {data.limit} used
                </span>
              ) : null
            }
          >
            <form onSubmit={addDomain} className="flex flex-wrap items-start gap-2">
              <div className="min-w-60 flex-1">
                <label htmlFor="new-domain" className="sr-only">
                  Domain name
                </label>
                <input
                  id="new-domain"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="brand.pk or www.brand.com"
                  spellCheck={false}
                  autoCapitalize="off"
                  disabled={atLimit}
                  aria-invalid={Boolean(addError)}
                  aria-describedby={addError ? 'new-domain-error' : undefined}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-neutral-100"
                />
                {addError ? (
                  <p id="new-domain-error" className="mt-1 text-sm text-red-700">
                    {addError}
                  </p>
                ) : null}
              </div>
              <Button type="submit" loading={adding} disabled={!hostname.trim() || atLimit}>
                Connect domain
              </Button>
            </form>
            {atLimit ? (
              <p className="mt-2 text-xs text-neutral-500">
                Remove a domain to connect another one.
              </p>
            ) : null}

            {data && data.domains.length ? (
              <ul className="mt-5 space-y-4">
                {data.domains.map((d) => (
                  <DomainCard
                    key={`${d.id}-${d.status}-${d.isPrimary}`}
                    domain={d}
                    target={data.target}
                    storeId={store.id}
                    onChange={load}
                  />
                ))}
              </ul>
            ) : data ? (
              <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                {STEPS.map(([n, title, text]) => (
                  <li key={n} className="rounded-xl border border-dashed border-neutral-300 p-4">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                      {n}
                    </span>
                    <p className="mt-2 text-sm font-semibold">{title}</p>
                    <p className="text-xs text-neutral-500">{text}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </Section>
        </div>

        {/* Side panel */}
        <aside className="space-y-6">
          <Section title="Our server">
            <p className="text-sm text-neutral-600">
              Point your domain here. Root domains (brand.pk) use the A record; subdomains
              (www.brand.pk) use the CNAME.
            </p>
            <dl className="mt-3 space-y-3 text-sm">
              {data?.target.ips.map((ip) => (
                <div key={ip}>
                  <dt className="text-xs font-medium text-neutral-500 uppercase">A record IP</dt>
                  <dd className="mt-0.5 flex items-center justify-between gap-2">
                    <code className="font-mono font-semibold">{ip}</code>
                    <CopyButton value={ip} label="server IP" />
                  </dd>
                </div>
              ))}
              {data ? (
                <div>
                  <dt className="text-xs font-medium text-neutral-500 uppercase">CNAME target</dt>
                  <dd className="mt-0.5 flex items-center justify-between gap-2">
                    <code className="font-mono font-semibold break-all">{data.target.cname}</code>
                    <CopyButton value={data.target.cname} label="CNAME target" />
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
              If your server or firewall only allows known addresses, add the IP above to its allow
              list (whitelist).
            </p>
          </Section>

          <Section title="Where to add records">
            <ul className="space-y-3 text-sm">
              {PROVIDERS.map(([name, how]) => (
                <li key={name}>
                  <p className="font-semibold">{name}</p>
                  <p className="text-neutral-600">{how}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Questions">
            <div className="divide-y divide-neutral-100">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-2.5 first:pt-0 last:pb-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                    {q}
                    <span
                      className="text-neutral-400 transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-1.5 text-sm text-neutral-600">{a}</p>
                </details>
              ))}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
