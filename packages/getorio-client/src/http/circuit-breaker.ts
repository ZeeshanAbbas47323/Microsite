export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  /** How long the circuit stays open before one trial call is let through. */
  resetTimeoutMs?: number;
  now?: () => number;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Minimal consecutive-failure circuit breaker. While open, calls fail fast so a Getorio outage
 * does not tie up request handlers for the full timeout on every call.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly now: () => number;
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor({
    failureThreshold = 5,
    resetTimeoutMs = 30_000,
    now = Date.now,
  }: CircuitBreakerOptions = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.now = now;
  }

  get state(): CircuitState {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.resetTimeoutMs ? 'half_open' : 'open';
  }

  /** Whether a call may proceed now. In half-open state only one trial call is allowed. */
  allowRequest(): boolean {
    const state = this.state;
    if (state === 'closed') return true;
    if (state === 'open' || this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  recordFailure(): void {
    this.trialInFlight = false;
    this.failures += 1;
    if (this.openedAt !== null || this.failures >= this.failureThreshold)
      this.openedAt = this.now();
  }
}
