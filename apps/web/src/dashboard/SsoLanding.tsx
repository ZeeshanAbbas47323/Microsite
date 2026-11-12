'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/** Getorio redirects here with a short-lived token (requirements §5). */
export function SsoLanding() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, '', '/sso');
    if (!token) {
      setError('This sign-in link is incomplete. Open Microstore again from Getorio.');
      return;
    }
    api('/auth/sso', { method: 'POST', body: { token } })
      .then(() => router.replace('/dashboard'))
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 401
            ? 'This sign-in link has expired or was already used. Open Microstore again from Getorio.'
            : 'We could not sign you in right now. Please try again.',
        ),
      );
  }, [params, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold text-neutral-900">Sign-in failed</h1>
          <p role="alert" className="max-w-md text-neutral-600">
            {error}
          </p>
        </>
      ) : (
        <p className="text-neutral-600" aria-busy="true">
          Signing you in…
        </p>
      )}
    </main>
  );
}
