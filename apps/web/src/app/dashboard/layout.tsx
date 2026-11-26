import type { Metadata } from 'next';
import { Noto_Nastaliq_Urdu } from 'next/font/google';
import type { ReactNode } from 'react';
import { DashboardShell } from '@/dashboard/DashboardShell';
import { DashboardProvider } from '@/dashboard/session';

export const metadata: Metadata = {
  title: { default: 'Microstore', template: '%s | Microstore' },
  robots: { index: false, follow: false },
};

// Used only while the dashboard is in Urdu (see globals.css `html[lang='ur']`).
const urdu = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-urdu',
  preload: false,
});

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${urdu.variable} font-urdu-scope`}>
      <DashboardProvider>
        <DashboardShell>{children}</DashboardShell>
      </DashboardProvider>
    </div>
  );
}
