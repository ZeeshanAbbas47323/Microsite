export type GetorioErrorKind =
  /** Network error, timeout, 5xx, 429 or open circuit. Safe to retry later. */
  | 'unavailable'
  /** Bad or missing API key / tenant scope. Retrying will not help. */
  | 'unauthorized'
  | 'not_found'
  /** Same idempotency key used with a different payload. */
  | 'conflict'
  /** Getorio refused the request as invalid (4xx). */
  | 'rejected'
  /** Getorio answered with a body that does not match the contract. */
  | 'invalid_response';

const RETRYABLE: ReadonlySet<GetorioErrorKind> = new Set(['unavailable']);

export class GetorioError extends Error {
  override readonly name = 'GetorioError';
  readonly kind: GetorioErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    kind: GetorioErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.kind = kind;
    this.status = options.status;
    this.retryable = RETRYABLE.has(kind);
  }
}

export function isGetorioError(error: unknown): error is GetorioError {
  return error instanceof GetorioError;
}
