'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Draft preview only: the dashboard reloads the preview iframe on every edit, which would jump
 * back to the top. Remember the scroll position per page for this tab and restore it on load.
 */
export function PreviewScrollKeeper() {
  const pathname = usePathname();
  useEffect(() => {
    const key = `ms_preview_scroll:${pathname}`;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(key)) || 0;
    } catch {
      // storage blocked: start at the top
    }
    const restore = () => {
      if (saved > 0 && window.scrollY < saved) window.scrollTo({ top: saved, behavior: 'instant' });
    };
    restore();
    // Images and fonts can grow the page after the first paint; try again once they are in.
    const frame = requestAnimationFrame(restore);
    window.addEventListener('load', restore, { once: true });
    const late = setTimeout(restore, 400);

    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {
          // ignore
        }
      });
    };
    // Only remember positions the visitor chose, not our own restore jumps before it settles.
    const listen = setTimeout(
      () => window.addEventListener('scroll', onScroll, { passive: true }),
      450,
    );
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(late);
      clearTimeout(listen);
      window.removeEventListener('load', restore);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);
  return null;
}
