'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Draft preview inside the theme editor (dashboard iframe). Draws hover/selection outlines on
 * sections (`data-ms-section`), tells the editor which section was clicked, and scrolls to the
 * section the editor selects. Messages are exchanged only with the dashboard's origin.
 */
export const PREVIEW_MESSAGE_SOURCE = 'microstore-preview';
export const EDITOR_MESSAGE_SOURCE = 'microstore-editor';

const ORIGIN_KEY = 'ms_editor_origin';
const ACCENT = '#4f46e5';

/** The dashboard origin embedding us. Later in-frame navigations lose the referrer, so cache it. */
function editorOrigin(): string | null {
  const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList })
    .ancestorOrigins;
  let origin = ancestors?.length ? ancestors[0] : null;
  if (!origin && document.referrer) {
    const ref = new URL(document.referrer).origin;
    if (ref !== window.location.origin) origin = ref;
  }
  try {
    if (origin) sessionStorage.setItem(ORIGIN_KEY, origin);
    else origin = sessionStorage.getItem(ORIGIN_KEY);
  } catch {
    // storage blocked
  }
  return origin ?? null;
}

function makeBox(style: string) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:absolute;pointer-events:none;z-index:2147483646;display:none;box-sizing:border-box;${style}`;
  document.body.appendChild(el);
  return el;
}

export function PreviewBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.parent === window) return;
    const origin = editorOrigin();
    if (!origin) return;
    const post = (message: Record<string, unknown>) =>
      window.parent.postMessage({ source: PREVIEW_MESSAGE_SOURCE, ...message }, origin);

    const hoverBox = makeBox(`border:2px dashed ${ACCENT};border-radius:4px;`);
    const selectBox = makeBox(`border:2px solid ${ACCENT};border-radius:4px;`);
    const chip = document.createElement('span');
    chip.style.cssText = `position:absolute;left:-2px;top:-26px;background:${ACCENT};color:#fff;font:600 12px/1 system-ui,sans-serif;padding:6px 8px;border-radius:4px 4px 0 0;white-space:nowrap;`;
    selectBox.appendChild(chip);

    let hovered: string | null = null;
    let selected: string | null = null;
    const find = (id: string | null) =>
      id ? document.querySelector<HTMLElement>(`[data-ms-section="${CSS.escape(id)}"]`) : null;
    const place = (box: HTMLElement, el: HTMLElement | null) => {
      if (!el) {
        box.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        display: 'block',
        top: `${r.top + window.scrollY}px`,
        left: `${r.left + window.scrollX}px`,
        width: `${r.width}px`,
        height: `${Math.max(r.height, 8)}px`,
      });
    };
    const redraw = () => {
      place(hoverBox, hovered && hovered !== selected ? find(hovered) : null);
      const sel = find(selected);
      place(selectBox, sel);
      chip.textContent = sel?.dataset.msLabel ?? '';
      // Keep the chip inside the page when the section starts at the very top.
      chip.style.top = sel && sel.getBoundingClientRect().top + window.scrollY < 26 ? '0' : '-26px';
    };

    const sectionOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('[data-ms-section]') : null;

    const onMove = (e: MouseEvent) => {
      const id = sectionOf(e.target)?.dataset.msSection ?? null;
      if (id !== hovered) {
        hovered = id;
        redraw();
      }
    };
    const onLeave = () => {
      hovered = null;
      redraw();
    };
    // In the editor a click on a section selects it instead of following its links.
    const onClick = (e: MouseEvent) => {
      const section = sectionOf(e.target);
      if (!section || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      selected = section.dataset.msSection ?? null;
      redraw();
      post({ type: 'select', id: selected });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== EDITOR_MESSAGE_SOURCE) return;
      const { type, id, scroll } = e.data as { type: string; id: string | null; scroll?: boolean };
      if (type === 'select') {
        const changed = id !== selected;
        selected = id;
        if (scroll !== false && changed)
          find(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (type === 'hover') {
        hovered = id;
      }
      redraw();
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('click', onClick, true);
    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    post({
      type: 'ready',
      path: window.location.pathname,
      sections: [...document.querySelectorAll<HTMLElement>('[data-ms-section]')].map(
        (el) => el.dataset.msSection,
      ),
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      hoverBox.remove();
      selectBox.remove();
    };
  }, [pathname]);

  return null;
}
