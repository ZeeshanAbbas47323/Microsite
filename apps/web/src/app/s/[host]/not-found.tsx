export default function StoreNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center text-neutral-900">
      <h1 className="text-3xl font-bold">Page not available</h1>
      <p className="max-w-md text-neutral-600">
        This store or page is not available right now. Please check the address or try again later.
      </p>
    </main>
  );
}
