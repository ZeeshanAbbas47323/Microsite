/** Optional bot check on checkout (FR-5.9). */
export interface CaptchaVerifier {
  verify(token: string | undefined, remoteIp: string): Promise<boolean>;
}

/** Cloudflare Turnstile server-side verification. */
export class TurnstileVerifier implements CaptchaVerifier {
  constructor(
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async verify(token: string | undefined, remoteIp: string): Promise<boolean> {
    if (!token || token.length > 2048) return false;
    try {
      const res = await this.fetchImpl(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: this.secret, response: token, remoteip: remoteIp }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch {
      return false;
    }
  }
}
