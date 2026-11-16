'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setCsrfToken, type SessionInfo, type Store } from './api';

export type Locale = 'en' | 'ur';
const LOCALE_KEY = 'ms_locale';

interface DashboardState {
  session: SessionInfo;
  store: Store | null;
  setStore: (store: Store | null) => void;
  refreshStore: () => Promise<Store | null>;
  /** Dashboard UI language (English or Urdu, right-to-left). */
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const Ctx = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDashboard outside DashboardProvider');
  return ctx;
}

/** Loads the merchant session and their store; sends unauthenticated visitors to the start page. */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      if (localStorage.getItem(LOCALE_KEY) === 'ur') setLocaleState('ur');
    } catch {
      // storage unavailable: keep English
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const refreshStore = useCallback(async () => {
    const { store: s } = await api<{ store: Store | null }>('/stores/me');
    setStore(s);
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api<SessionInfo>('/auth/session');
        setCsrfToken(s.csrfToken);
        const { store: st } = await api<{ store: Store | null }>('/stores/me');
        if (cancelled) return;
        setSession(s);
        setStore(st);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) router.replace('/?signed_out=1');
        else setError(e instanceof Error ? e.message : 'Could not load your account');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex min-h-dvh items-center justify-center p-6 text-center text-neutral-700"
      >
        {error}
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-500" aria-busy="true">
        Loading…
      </div>
    );
  }
  return (
    <Ctx.Provider value={{ session, store, setStore, refreshStore, locale, setLocale }}>
      {children}
    </Ctx.Provider>
  );
}
