'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Brings slideshow sections (`data-ms-carousel`, rendered by the layouts) to life: arrows, dots,
 * autoplay with a pause button, keyboard arrows and swipe. Autoplay waits while the carousel is
 * hovered, focused, off screen or in a background tab, and never starts for reduced motion.
 */
function setup(root: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>('[data-ms-track]');
  const slides = track ? [...track.querySelectorAll<HTMLElement>(':scope > [data-ms-slide]')] : [];
  if (!track || slides.length < 2) return () => undefined;

  const fade = root.dataset.transition === 'fade';
  const seconds = Number(root.dataset.autoplay) || 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rtl = getComputedStyle(root).direction === 'rtl';
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-ms-dot]')];
  const play = root.querySelector<HTMLButtonElement>('[data-ms-play]');

  let index = 0;
  let playing = seconds > 0 && !reduce;
  let hovered = false;
  let focused = false;
  let onScreen = true;

  const first = slides[0] as HTMLElement;
  const offset = (el: HTMLElement) => el.offsetLeft - first.offsetLeft;
  const inView = () =>
    fade
      ? 1
      : Math.max(
          1,
          Math.round(track.clientWidth / Math.max(1, first.getBoundingClientRect().width)),
        );
  const lastStart = () => Math.max(0, slides.length - inView());

  const paint = () => {
    const last = lastStart();
    dots.forEach((dot, i) => {
      dot.hidden = i > last;
      dot.setAttribute('aria-current', String(i === Math.min(index, last)));
    });
    if (fade) {
      slides.forEach((s, i) => {
        if (i === index) s.setAttribute('data-active', '');
        else s.removeAttribute('data-active');
        s.inert = i !== index;
      });
    }
  };

  const go = (target: number) => {
    const last = lastStart();
    index = target > last ? 0 : target < 0 ? last : target;
    if (!fade) {
      const slide = slides[index];
      if (slide) track.scrollTo({ left: offset(slide), behavior: reduce ? 'auto' : 'smooth' });
    }
    paint();
  };

  const setPlaying = (on: boolean) => {
    playing = on;
    if (play) {
      play.toggleAttribute('data-playing', on);
      play.setAttribute('aria-label', on ? 'Pause slideshow' : 'Play slideshow');
    }
    // Announce slide changes to screen readers only while nothing moves on its own.
    track.setAttribute('aria-live', on ? 'off' : 'polite');
  };

  // Keep the dots right when people swipe or scroll the track themselves.
  let settle = 0;
  const onScroll = () => {
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      const left = track.scrollLeft;
      let best = 0;
      slides.forEach((s, i) => {
        const current = slides[best] as HTMLElement;
        if (Math.abs(offset(s) - left) < Math.abs(offset(current) - left)) best = i;
      });
      // At the very end the last positions all share one dot.
      index = Math.min(best, lastStart());
      paint();
    }, 90);
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const arrow = target?.closest<HTMLElement>('[data-ms-dir]');
    const dot = target?.closest<HTMLElement>('[data-ms-dot]');
    if (arrow && root.contains(arrow)) go(index + (arrow.dataset.msDir === 'next' ? 1 : -1));
    else if (dot && root.contains(dot)) go(Number(dot.dataset.msDot));
    else if (play && target && play.contains(target)) setPlaying(!playing);
    else return;
    restart();
  };

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest('input, textarea, select')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const forward = (e.key === 'ArrowRight') !== rtl;
    go(index + (forward ? 1 : -1));
    restart();
  };

  // Fade slides do not scroll, so swipes are read from the pointer.
  let startX: number | null = null;
  const onDown = (e: PointerEvent) => {
    if (fade) startX = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) < 40) return;
    go(index + (dx < 0 !== rtl ? 1 : -1));
    restart();
  };

  let timer = 0;
  const restart = () => {
    window.clearInterval(timer);
    if (seconds > 0)
      timer = window.setInterval(() => {
        if (!root.isConnected) return cleanup();
        if (playing && !hovered && !focused && onScreen && document.visibilityState === 'visible')
          go(index + 1);
      }, seconds * 1000);
  };

  const enter = () => (hovered = true);
  const leave = () => (hovered = false);
  const focusIn = () => (focused = true);
  const focusOut = (e: FocusEvent) => {
    if (!root.contains(e.relatedTarget as Node | null)) focused = false;
  };
  const onResize = () => go(Math.min(index, lastStart()));
  const observer = new IntersectionObserver(([entry]) => {
    onScreen = Boolean(entry?.isIntersecting);
  });
  observer.observe(root);

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('pointerenter', enter);
  root.addEventListener('pointerleave', leave);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  setPlaying(playing);
  paint();
  restart();
  root.setAttribute('data-ready', '');

  function cleanup() {
    window.clearInterval(timer);
    window.clearTimeout(settle);
    observer.disconnect();
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('pointerenter', enter);
    root.removeEventListener('pointerleave', leave);
    root.removeEventListener('focusin', focusIn);
    root.removeEventListener('focusout', focusOut);
    track?.removeEventListener('pointerdown', onDown);
    track?.removeEventListener('pointerup', onUp);
    track?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    root.removeAttribute('data-ready');
  }
  return cleanup;
}

export function Carousels() {
  const pathname = usePathname();
  useEffect(() => {
    const running = new Map<HTMLElement, () => void>();
    const scan = () => {
      for (const [root, stop] of running) {
        if (!root.isConnected) {
          stop();
          running.delete(root);
        }
      }
      document.querySelectorAll<HTMLElement>('[data-ms-carousel]').forEach((root) => {
        if (!running.has(root)) running.set(root, setup(root));
      });
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      for (const stop of running.values()) stop();
    };
  }, [pathname]);
  return null;
}
