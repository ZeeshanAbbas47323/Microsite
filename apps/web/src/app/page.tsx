import Link from 'next/link';

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ signed_out?: string }>;
}) {
  const { signed_out } = await searchParams;
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
    </main>
  );
}
