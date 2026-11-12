'use client';

import Link from 'next/link';
import { useCartCount } from './cart-store';

export function CartLink({ href }: { href: string }) {
  const count = useCartCount();
  return (
    <Link
      href={href}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-[var(--ms-radius)] hover:bg-black/5"
      aria-label={count ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M6 7h12l-1 13H7L6 7Z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      {count > 0 ? (
        <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-[var(--ms-primary)] px-1 text-center text-[11px] font-bold leading-5 text-[var(--ms-on-primary)]">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
