'use client';

/** Client for the dashboard BFF (`/api/dashboard/*`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let csrfToken = '';
export function setCsrfToken(token: string) {
  csrfToken = token;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const res = await fetch(`/api/dashboard${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string; details?: unknown };
  } | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'error',
      data?.error?.message ?? 'Something went wrong',
      data?.error?.details,
    );
  }
  return data as T;
}

export interface SessionInfo {
  merchant: { id: string; tenantId: string; role: string };
  csrfToken: string;
  expiresAt: string;
}

export interface StoreSettings {
  shippingFlatFee: string;
  freeShippingThreshold: string | null;
  notifications: { customerEmail: boolean; customerMessage: boolean };
  whatsappButton: boolean;
  rtl: boolean;
}

export interface Store {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'suspended';
  currency: string;
  subdomain: string | null;
  hostname: string | null;
  url: string | null;
  settings: StoreSettings;
  layoutId: string | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
}
