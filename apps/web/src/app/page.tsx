import Link from 'next/link';
import { headers } from 'next/headers';
import { devLoginEnabled, isLocalHost } from '@/lib/dev-login';

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ signed_out?: string }>;
}) {
  const { signed_out } = await searchParams;
  const demoLogin = devLoginEnabled() && isLocalHost((await headers()).get('host'));
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-bold">Getorio Microstore</h1>
      {signed_out ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You are signed out.</p>
      ) : null}
      <p className="text-neutral-600">
        Open Microstore from inside Getorio to sign in. Already signed in?{' '}
        <Link href="/dashboard" className="font-semibold text-indigo-700 underline">
          Go to your dashboard
        </Link>
        .
      </p>
      {demoLogin ? (
        <form
          method="post"
          action="/dev-login"
          className="space-y-3 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-4"
        >
          <p className="text-sm font-semibold text-indigo-900">Local development</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="as"
              value="merchant"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Sign in as demo merchant
            </button>
            <button
              type="submit"
              name="as"
              value="admin"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-indigo-800 ring-1 ring-indigo-300 hover:bg-white"
            >
              Sign in as platform admin
            </button>
          </div>
          <p className="text-xs text-neutral-600">
            Shown because DEV_DEMO_LOGIN=true. Never enable it outside your own machine.
          </p>
        </form>
      ) : null}
    </main>
  );
}
