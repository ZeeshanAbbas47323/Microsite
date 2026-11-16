'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const SESSION_KEY = 'ms_visit';

/** Phase 3 analytics: one beacon per page view; the first in a browser session counts a visit. */
export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    let newVisit = false;
    try {
      newVisit = sessionStorage.getItem(SESSION_KEY) === null;
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // storage blocked: count page views only
    }
    const body = JSON.stringify({ newVisit });
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/storefront/visit', new Blob([body], { type: 'application/json' }));
    if (!sent) {
      void fetch('/api/storefront/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [pathname]);
  return null;
}
