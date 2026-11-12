'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { api } from './api';
import { useDashboard } from './session';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/design', label: 'Design' },
  { href: '/dashboard/products', label: 'Products' },
  { href: '/dashboard/orders', label: 'Orders' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export function StatusBadge({ status }: { status: 'draft' | 'published' | 'suspended' }) {
  return status === 'published' ? (
    <Badge tone="green">Live</Badge>
  ) : status === 'suspended' ? (
    <Badge tone="red">Suspended</Badge>
  ) : (
    <Badge tone="amber">Not published</Badge>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { store } = useDashboard();
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = pathname.startsWith('/dashboard/onboarding');

  useEffect(() => {
    if (!store && !onboarding) router.replace('/dashboard/onboarding');
    // Having a store while on onboarding means it was just created: continue in the editor.
    if (store && onboarding) router.replace('/dashboard/design?welcome=1');
  }, [store, onboarding, router]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/?signed_out=1');
  }

  if (!store) {
    return onboarding ? <div className="min-h-dvh bg-neutral-50">{children}</div> : null;
  }

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900 md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-neutral-200 bg-white md:min-h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-4 md:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Microstore
            </p>
            <p className="truncate font-semibold">{store.name}</p>
            <div className="mt-1">
              <StatusBadge status={store.status} />
            </div>
          </div>
        </div>
        <nav aria-label="Dashboard" className="overflow-x-auto px-2 pb-2 md:pb-4">
          <ul className="flex gap-1 md:flex-col">
            {NAV.map((item) => {
              const active =
                item.href === '/dashboard'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    {...(active ? { 'aria-current': 'page' as const } : {})}
                    className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-700 hover:bg-neutral-100'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="hidden space-y-1 px-2 md:block">
          {store.url && store.status === 'published' ? (
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              View store ↗
            </a>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="block w-full rounded-lg px-3 py-2 text-start text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
