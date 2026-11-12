import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DashboardShell } from '@/dashboard/DashboardShell';
import { DashboardProvider } from '@/dashboard/session';

export const metadata: Metadata = {
  title: { default: 'Microstore', template: '%s | Microstore' },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}
