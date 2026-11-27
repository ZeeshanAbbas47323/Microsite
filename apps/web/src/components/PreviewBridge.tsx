'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Draft preview inside the theme editor (dashboard iframe). Draws hover/selection outlines on
 * sections (`data-ms-section`), tells the editor which section was clicked, and scrolls to the
 * section the editor selects. Double-clicking a marked text (`data-ms-text`) edits it in place and
 * streams the new value to the editor. Messages are exchanged only with the dashboard's origin.
 */
export const PREVIEW_MESSAGE_SOURCE = 'microstore-preview';
export const EDITOR_MESSAGE_SOURCE = 'microstore-editor';

const ORIGIN_KEY = 'ms_editor_origin';
const ACCENT = '#0074fc';

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

    // "Magic store": header, sections and footer rise into place one after another.
    const playReveal = () => {
      const blocks = [...document.querySelectorAll<HTMLElement>('[data-ms-section]')];
      document.documentElement.dataset.msReveal = '1';
      window.scrollTo({ top: 0, behavior: 'instant' });
      for (const el of blocks) {
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'translateY(28px)';
      }
      blocks.forEach((el, i) => {
        setTimeout(
          () => {
            el.style.transition =
              'opacity 0.6s ease, transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1)';
            el.style.opacity = '1';
            el.style.transform = 'none';
            setTimeout(() => {
              el.style.removeProperty('transition');
              el.style.removeProperty('opacity');
              el.style.removeProperty('transform');
              schedule();
            }, 800);
          },
          350 + i * 220,
        );
      });
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
    // -- Inline text editing: double-click a marked text (`data-ms-text`) to type over it. --
    const style = document.createElement('style');
    style.textContent = `[data-ms-text]{cursor:text}[data-ms-text]:hover{outline:1px dashed ${ACCENT}80;outline-offset:2px;border-radius:2px}[data-ms-image]{cursor:pointer}img[data-ms-image]:hover,div[data-ms-image]:hover{outline:2px dashed ${ACCENT};outline-offset:-2px}[data-ms-editing]{outline:2px solid ${ACCENT}!important;outline-offset:3px;border-radius:2px;cursor:text}`;
    document.head.appendChild(style);

    let editing: { el: HTMLElement; id: string; path: string; original: string } | null = null;
    const textOf = (el: HTMLElement) =>
      el.hasAttribute('data-ms-multiline')
        ? el.innerText.replace(/\n{3,}/g, '\n\n')
        : (el.textContent ?? '').replace(/\s+/g, ' ');

    const finishEdit = (revert: boolean) => {
      if (!editing) return;
      const { el, id, path, original } = editing;
      editing = null;
      let value = textOf(el).trim();
      if (revert || (value === '' && el.hasAttribute('data-ms-required'))) {
        value = original;
        el.textContent = original;
      }
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-ms-editing');
      window.getSelection()?.removeAllRanges();
      post({ type: 'text', id, path, value });
      post({ type: 'edit-end' });
    };

    const startEdit = (el: HTMLElement, section: HTMLElement) => {
      const id = section.dataset.msSection;
      const path = el.dataset.msText;
      if (!id || !path) return;
      if (editing?.el === el) return;
      finishEdit(false);
      editing = { el, id, path, original: textOf(el).trim() };
      el.setAttribute('data-ms-editing', '');
      try {
        el.contentEditable = 'plaintext-only';
      } catch {
        el.contentEditable = 'true'; // Firefox before plaintext-only
      }
      el.spellcheck = true;
      el.focus();
      // Caret where the person double-clicked: keep the word the browser selected.
      if (!el.contains(window.getSelection()?.anchorNode ?? null)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      selected = id;
      redraw();
      post({ type: 'select', id });
      post({ type: 'edit-start', id, path });
    };

    // An image under the pointer, even one sitting behind the text (overlay heroes).
    const imageAt = (e: MouseEvent) =>
      document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(
          (node): node is HTMLElement => node instanceof HTMLElement && 'msImage' in node.dataset,
        );

    const onDblClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const el = target?.closest<HTMLElement>('[data-ms-text]');
      const section = el ? sectionOf(el) : null;
      if (el && section) {
        e.preventDefault();
        e.stopPropagation();
        startEdit(el, section);
        return;
      }
      // Double-clicking an image asks the editor to replace it (it opens the file picker).
      const image = imageAt(e);
      const imageSection = image ? sectionOf(image) : null;
      const id = imageSection?.dataset.msSection;
      if (!image || !id || !image.dataset.msImage) return;
      e.preventDefault();
      e.stopPropagation();
      finishEdit(false);
      window.getSelection()?.removeAllRanges();
      selected = id;
      redraw();
      post({ type: 'select', id });
      post({
        type: 'image',
        id,
        path: image.dataset.msImage,
        purpose: image.dataset.msImagePurpose === 'logo' ? 'logo' : 'image',
      });
    };

    const onInput = (e: Event) => {
      if (!editing || e.target !== editing.el) return;
      const { el, id, path } = editing;
      const max = Number(el.dataset.msMax) || 0;
      let value = textOf(el);
      if (max && value.length > max) {
        value = value.slice(0, max);
        el.textContent = value;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      post({ type: 'text', id, path, value: value.trim() });
      schedule();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!editing) return;
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        finishEdit(true);
      } else if (
        e.key === 'Enter' &&
        !(e.shiftKey && editing.el.hasAttribute('data-ms-multiline'))
      ) {
        e.preventDefault();
        finishEdit(false);
      } else if (e.key === ' ' && editing.el.closest('summary')) {
        // A space inside <summary> would toggle the FAQ instead of typing.
        e.preventDefault();
        document.execCommand('insertText', false, ' ');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (editing && e.key === ' ' && editing.el.closest('summary')) e.preventDefault();
    };

    const onFocusOut = (e: FocusEvent) => {
      if (editing && e.target === editing.el) finishEdit(false);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!editing || !editing.el.contains(e.target as Node)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      document.execCommand(
        'insertText',
        false,
        editing.el.hasAttribute('data-ms-multiline') ? text : text.replace(/\s+/g, ' '),
      );
    };

    // In the editor a click on a section selects it instead of following its links.
    const onClick = (e: MouseEvent) => {
      const section = sectionOf(e.target);
      if (!section || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      // Clicks inside the text being edited only move the caret.
      if (editing && e.target instanceof Node && editing.el.contains(e.target)) return;
      selected = section.dataset.msSection ?? null;
      redraw();
      post({ type: 'select', id: selected });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== EDITOR_MESSAGE_SOURCE) return;
      const { type, id, scroll } = e.data as { type: string; id: string | null; scroll?: boolean };
      if (type === 'finish-edit') {
        finishEdit(false);
        return;
      }
      if (type === 'reveal') {
        playReveal();
        return;
      }
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
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('paste', onPaste, true);
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
      document.removeEventListener('dblclick', onDblClick, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('paste', onPaste, true);
      finishEdit(false);
      style.remove();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      hoverBox.remove();
      selectBox.remove();
    };
  }, [pathname]);

  return null;
}
