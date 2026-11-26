'use client';

import Link from 'next/link';
import { useCustomer } from './customer-store';

/** Header person icon: "My account" when signed in, "Sign in" otherwise. */
export function AccountLink({ href }: { href: string }) {
  const { status, customer } = useCustomer();
  const signedIn = status === 'signed-in' && customer;
  const first = signedIn ? customer.name.trim().split(/\s+/)[0] : '';
  return (
    <Link
      href={href}
      className="relative inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-[var(--ms-radius)] px-2 hover:bg-black/5"
      aria-label={signedIn ? `My account (${customer.name})` : 'Sign in or create an account'}
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
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
      {signedIn ? (
        <span className="hidden max-w-24 truncate text-sm font-medium sm:inline" aria-hidden="true">
          {first}
        </span>
      ) : null}
    </Link>
  );
}
