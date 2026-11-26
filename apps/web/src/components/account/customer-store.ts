'use client';

import { useEffect, useSyncExternalStore } from 'react';

export interface CustomerAddress {
  id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  isDefault: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  acceptsMarketing: boolean;
  memberSince: string;
  orders: number;
  totalSpent: string;
  addresses: CustomerAddress[];
}

export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Calls the same-origin account endpoint (`/api/storefront/account/*`). */
export async function accountApi<T>(
  path = '',
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api/storefront/account${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string; details?: { path: string; message: string }[] };
  } | null;
  if (!res.ok) {
    const fields: Record<string, string> = {};
    if (Array.isArray(data?.error?.details))
      for (const d of data.error.details) fields[d.path.split('.').pop() ?? d.path] = d.message;
    throw new AccountError(
      res.status,
      res.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : (data?.error?.message ?? 'Something went wrong'),
      fields,
    );
  }
  return data as T;
}

// A tiny shared store so the header, account page and checkout agree on who is signed in.
type State = { status: 'loading' | 'signed-out' | 'signed-in'; customer: Customer | null };
let state: State = { status: 'loading', customer: null };
let started = false;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

export const customerSession = {
  set(customer: Customer | null) {
    set(customer ? { status: 'signed-in', customer } : { status: 'signed-out', customer: null });
  },
  async refresh() {
    try {
      const { customer } = await accountApi<{ customer: Customer }>();
      customerSession.set(customer);
    } catch {
      customerSession.set(null);
    }
  },
  async signOut() {
    await accountApi('/logout', { method: 'POST' }).catch(() => undefined);
    customerSession.set(null);
  },
};

const SERVER: State = { status: 'loading', customer: null };

export function useCustomer(): State {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
  useEffect(() => {
    if (!started) {
      started = true;
      void customerSession.refresh();
    }
  }, []);
  return snapshot;
}

/** "+923001234567" → "03001234567" for form fields. */
export function localPhone(phone: string | null | undefined) {
  if (!phone) return '';
  return phone.startsWith('+92') ? `0${phone.slice(3)}` : phone;
}
