import type { SiteRevalidator } from './store-service';

/**
 * Asks apps/web to drop cached storefront pages for these hostnames (ISR `revalidateTag`).
 * Failures are logged and swallowed: pages still refresh within 60 s on their own.
 */
export class HttpSiteRevalidator implements SiteRevalidator {
  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async revalidateStore(_storeId: string, hostnames: string[]) {
    if (!hostnames.length) return;
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': this.secret },
        body: JSON.stringify({ hostnames: hostnames.slice(0, 20) }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) this.onError(new Error(`Revalidate responded ${res.status}`));
    } catch (error) {
      this.onError(error);
    }
  }
}
