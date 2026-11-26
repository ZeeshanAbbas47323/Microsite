'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { api } from './api';
import { Icon, PATHS } from './editor/icons';
import { useT } from './i18n';
import { useDashboard } from './session';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: PATHS.home },
  { href: '/dashboard/orders', label: 'Orders', icon: PATHS.orders },
  { href: '/dashboard/products', label: 'Products', icon: PATHS.products },
  { href: '/dashboard/customers', label: 'Customers', icon: PATHS.customers },
  { href: '/dashboard/discounts', label: 'Discounts', icon: PATHS.discounts },
  { href: '/dashboard/design', label: 'Design', icon: PATHS.design },
  { href: '/dashboard/domains', label: 'Domains', icon: PATHS.domains },
];
const SETTINGS: NavItem = { href: '/dashboard/settings', label: 'Settings', icon: PATHS.settings };
const ADMIN: NavItem = { href: '/dashboard/admin', label: 'Admin', icon: PATHS.admin };

export function StatusBadge({ status }: { status: 'draft' | 'published' | 'suspended' }) {
  const t = useT();
  return status === 'published' ? (
    <Badge tone="green">{t('Live')}</Badge>
  ) : status === 'suspended' ? (
    <Badge tone="red">{t('Suspended')}</Badge>
  ) : (
    <Badge tone="amber">{t('Not published')}</Badge>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { store, session, locale, setLocale } = useDashboard();
  const t = useT();
  const isAdmin = session.merchant.role === 'platform_admin';
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = pathname.startsWith('/dashboard/onboarding');
  // Platform admins usually have no store of their own.
  const adminPage = pathname.startsWith('/dashboard/admin');

  useEffect(() => {
    if (!store && !onboarding && !(adminPage && isAdmin))
      router.replace(isAdmin ? '/dashboard/admin' : '/dashboard/onboarding');
    // Having a store while on onboarding means it was just created: continue in the editor.
    if (store && onboarding) router.replace('/dashboard/design?welcome=1');
  }, [store, onboarding, adminPage, isAdmin, router]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/?signed_out=1');
  }

  if (!store) {
    if (adminPage && isAdmin)
      return <div className="min-h-dvh bg-neutral-50 px-4 py-6 sm:px-8">{children}</div>;
    return onboarding ? <div className="min-h-dvh bg-neutral-50">{children}</div> : null;
  }

  // The theme editor is full-screen with its own top bar (and an Exit link back here).
  if (pathname.startsWith('/dashboard/design')) return <>{children}</>;

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const link = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          {...(active ? { 'aria-current': 'page' as const } : {})}
          className={`flex h-9 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-sm ${active ? 'bg-white font-semibold text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-neutral-200/70' : 'font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-900'}`}
        >
          <span className={active ? 'text-neutral-900' : 'text-neutral-500'}>
            <Icon d={item.icon} className="h-[18px] w-[18px]" />
          </span>
          {t(item.label)}
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-dvh bg-[#f1f1f1] text-neutral-900 md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-neutral-200 bg-[#ebebeb] md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-b-0 md:border-e">
        {/* Store */}
        <div className="flex items-center gap-2.5 px-3 pb-2 pt-3 md:px-4 md:pt-4">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white"
          >
            {store.name.trim()[0]?.toUpperCase() ?? 'M'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{store.name}</p>
            <p className="text-xs text-neutral-500">Microstore</p>
          </div>
          <StatusBadge status={store.status} />
        </div>

        <nav
          aria-label={t('Dashboard')}
          className="overflow-x-auto px-2 pb-2 md:flex-1 md:overflow-y-auto md:pt-2"
        >
          <ul className="flex gap-0.5 md:flex-col">
            {NAV.map(link)}
            {isAdmin ? link(ADMIN) : null}
            {/* On phones the bottom block is hidden, so Settings joins the scrolling row. */}
            <li className="md:hidden">
              <ul className="flex">{link(SETTINGS)}</ul>
            </li>
          </ul>

          {store.url && store.status === 'published' ? (
            <div className="mt-5 hidden md:block">
              <p className="px-2.5 pb-1 text-xs font-medium text-neutral-500">
                {t('Sales channels')}
              </p>
              <a
                href={store.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-900"
              >
                <span className="text-neutral-500">
                  <Icon d={PATHS.store} className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1">{t('Online store')}</span>
                <span className="text-neutral-400 opacity-0 group-hover:opacity-100">
                  <Icon d={PATHS.external} className="h-4 w-4" />
                </span>
                <span className="sr-only">{t('(opens in a new tab)')}</span>
              </a>
            </div>
          ) : null}
        </nav>

        {/* Bottom: settings, language, sign out */}
        <div className="hidden space-y-0.5 border-t border-neutral-300/60 p-2 md:block">
          <ul>{link(SETTINGS)}</ul>
          <LanguageSwitch locale={locale} onChange={setLocale} label={t('Language')} />
          <button
            type="button"
            onClick={logout}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-900"
          >
            <span className="text-neutral-500">
              <Icon d={PATHS.logout} className="h-[18px] w-[18px]" />
            </span>
            {t('Sign out')}
          </button>
        </div>
        <div className="flex items-center justify-between px-3 pb-2 md:hidden">
          <LanguageSwitch locale={locale} onChange={setLocale} label={t('Language')} />
          <button
            type="button"
            onClick={logout}
            className="rounded-md px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-200/60"
          >
            {t('Sign out')}
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}

function LanguageSwitch({
  locale,
  onChange,
  label,
}: {
  locale: 'en' | 'ur';
  onChange: (locale: 'en' | 'ur') => void;
  label: string;
}) {
  return (
    <div className="flex h-9 items-center gap-2.5 px-2.5">
      <span className="text-neutral-500">
        <Icon d={PATHS.language} className="h-[18px] w-[18px]" />
      </span>
      <div role="group" aria-label={label} className="flex rounded-md bg-neutral-300/50 p-0.5">
        {(
          [
            ['en', 'English'],
            ['ur', 'اردو'],
          ] as const
        ).map(([value, name]) => (
          <button
            key={value}
            type="button"
            lang={value}
            aria-pressed={locale === value}
            onClick={() => onChange(value)}
            className={`rounded px-2 py-0.5 text-xs ${locale === value ? 'bg-white font-semibold text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
