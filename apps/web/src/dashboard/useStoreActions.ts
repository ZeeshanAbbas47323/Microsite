'use client';

import { useState } from 'react';
import { api, type Store } from './api';
import { useDashboard } from './session';

/** Publish / unpublish shared by the overview and the design editor (FR-6.7). */
export function useStoreActions() {
  const { store, setStore } = useDashboard();
  const [busy, setBusy] = useState<'publish' | 'unpublish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'publish' | 'unpublish') {
    if (!store) return null;
    setBusy(action);
    setError(null);
    try {
      const res = await api<{ store: Store }>(`/stores/${store.id}/${action}`, { method: 'POST' });
      setStore(res.store);
      return res.store;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { publish: () => run('publish'), unpublish: () => run('unpublish'), busy, error };
}
