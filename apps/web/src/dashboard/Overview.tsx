'use client';

import { Badge } from '@/components/ui';
import { useT } from './i18n';

export interface OrderRow {
  id: string;
  orderRef: string;
  status: 'pending_sync' | 'synced' | 'sync_failed' | 'cancelled';
  customerName: string;
  customerPhone: string;
  city: string;
  total: string;
  currency: string;
  itemCount: number;
  stockUnverified: boolean;
  getorioOrderId: string | null;
  getorioOrderUrl: string | null;
  syncAttempts: number;
  lastSyncError: string | null;
  createdAt: string;
}

export function SyncBadge({ status }: { status: OrderRow['status'] }) {
  const t = useT();
  if (status === 'synced') return <Badge tone="green">{t('In Getorio')}</Badge>;
  if (status === 'sync_failed') return <Badge tone="red">{t('Sync failed')}</Badge>;
  if (status === 'cancelled') return <Badge>{t('Cancelled')}</Badge>;
  return <Badge tone="amber">{t('Sending to Getorio')}</Badge>;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}
