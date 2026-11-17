'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EDITOR_MESSAGE_SOURCE, PREVIEW_MESSAGE_SOURCE } from '@/components/PreviewBridge';

export type Device = 'desktop' | 'tablet' | 'mobile';

const WIDTH: Record<Device, string> = { desktop: '100%', tablet: '820px', mobile: '390px' };

interface Slot {
  src: string;
  n: number;
}

/**
 * The store preview. Two iframes take turns: a new version loads hidden behind the current one
 * and is swapped in once ready, so edits never flash a blank page. Talks to the in-frame
 * PreviewBridge to highlight and select sections.
 */
export function PreviewFrame({
  src,
  device,
  title,
  selectedId,
  hoverId,
  onSelect,
  onNavigate,
}: {
  src: string | null;
  device: Device;
  title: string;
  selectedId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  /** The preview moved to another page (a link was followed inside it). */
  onNavigate: (path: string) => void;
}) {
  const [slots, setSlots] = useState<[Slot | null, Slot | null]>([null, null]);
  const [active, setActive] = useState<0 | 1>(0);
  const [loading, setLoading] = useState(false);
  const frames = useRef<[HTMLIFrameElement | null, HTMLIFrameElement | null]>([null, null]);
  const counter = useRef(0);
  const origin = src ? new URL(src).origin : null;
  const latest = useRef({ selectedId, hoverId, active, onSelect, onNavigate });
  latest.current = { selectedId, hoverId, active, onSelect, onNavigate };
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swap a loaded frame in once it has painted (its bridge says "ready"), not on bare `load`.
  const reveal = useCallback((index: 0 | 1) => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    setLoading(false);
    if (index !== latest.current.active) requestAnimationFrame(() => setActive(index));
  }, []);
  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

  // A new src goes into the hidden slot; the first one goes straight into the visible slot.
  useEffect(() => {
    if (!src) return;
    setSlots((current) => {
      const visible = current[latest.current.active];
      if (visible?.src === src) return current;
      counter.current += 1;
      const slot = { src, n: counter.current };
      const next: [Slot | null, Slot | null] = [...current];
      next[visible ? 1 - latest.current.active : latest.current.active] = slot;
      return next;
    });
    setLoading(true);
  }, [src]);

  const send = useCallback(
    (index: 0 | 1, message: Record<string, unknown>) => {
      if (!origin) return;
      frames.current[index]?.contentWindow?.postMessage(
        { source: EDITOR_MESSAGE_SOURCE, ...message },
        origin,
      );
    },
    [origin],
  );

  useEffect(() => {
    send(active, { type: 'select', id: selectedId, scroll: true });
  }, [selectedId, active, send]);
  useEffect(() => {
    send(active, { type: 'hover', id: hoverId });
  }, [hoverId, active, send]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin || e.data?.source !== PREVIEW_MESSAGE_SOURCE) return;
      const index = frames.current.findIndex((f) => f?.contentWindow === e.source);
      if (index < 0) return;
      const data = e.data as { type: string; id?: string; path?: string };
      if (data.type === 'ready') {
        // Restore the selection outline without jumping away from the kept scroll position.
        send(index as 0 | 1, { type: 'select', id: latest.current.selectedId, scroll: false });
        if (index === latest.current.active) {
          if (data.path) latest.current.onNavigate(data.path);
        } else {
          reveal(index as 0 | 1);
        }
      } else if (data.type === 'select' && index === latest.current.active && data.id) {
        latest.current.onSelect(data.id);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, send, reveal]);

  function onLoad(index: 0 | 1) {
    if (index === active) {
      setLoading(false);
      return;
    }
    // Pages without the bridge (errors, other routes) still get shown.
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(() => reveal(index), 2500);
  }

  return (
    <div className="relative flex h-full w-full justify-center overflow-hidden bg-neutral-100 p-3 sm:p-5">
      <div
        className="relative h-full overflow-hidden rounded-xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200 transition-[width] duration-300"
        style={{ width: WIDTH[device], maxWidth: '100%' }}
      >
        {!src ? (
          <p className="p-10 text-center text-sm text-neutral-500">Preparing preview…</p>
        ) : null}
        {([0, 1] as const).map((i) => {
          const slot = slots[i];
          if (!slot) return null;
          const shown = i === active;
          return (
            <iframe
              key={slot.n}
              ref={(el) => {
                frames.current[i] = el;
              }}
              src={slot.src}
              title={title}
              onLoad={() => onLoad(i)}
              aria-hidden={shown ? undefined : true}
              tabIndex={shown ? undefined : -1}
              className={`absolute inset-0 h-full w-full border-0 ${shown ? 'z-10' : 'pointer-events-none z-0 opacity-0'}`}
            />
          );
        })}
        {loading && slots[active] ? (
          <span
            className="absolute end-3 top-3 z-20 rounded-full bg-neutral-900/80 px-2.5 py-1 text-xs font-medium text-white"
            role="status"
          >
            Updating…
          </span>
        ) : null}
      </div>
    </div>
  );
}
