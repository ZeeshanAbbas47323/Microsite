import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SsoLanding } from '@/dashboard/SsoLanding';

export const metadata: Metadata = {
  title: 'Signing in… | Microstore',
  // The one-time token is in the URL; never leak it through the Referer header.
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function SsoPage() {
  return (
    <Suspense>
      <SsoLanding />
    </Suspense>
  );
}
