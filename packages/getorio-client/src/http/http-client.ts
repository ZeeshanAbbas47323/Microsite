import type { z } from 'zod';
import type { GetorioClient } from '../client';
import { GetorioError, type GetorioErrorKind } from '../errors';
import {
  createOrderResponseSchema,
  listProductsQuerySchema,
  orderStatusSchema,
  paginatedProductsSchema,
  productSchema,
  stockResponseSchema,
  type GetorioOrderStatus,
  type GetorioProduct,
  type ListProductsQuery,
  type MicrostoreFlags,
  type MicrostoreOrderPayload,
  type Paginated,
} from '../types';
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker';

export interface HttpGetorioClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-attempt timeout (spec §6: 5 s). */
  timeoutMs?: number;
  /** Extra attempts for retryable failures. Only idempotent calls are retried. */
  maxRetries?: number;
  /** Base delay for exponential backoff with full jitter. */
  retryBaseDelayMs?: number;
  circuitBreaker?: CircuitBreakerOptions;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface RequestSpec<T> {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  tenantId: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  schema: z.ZodType<T> | null;
  /** Safe to repeat (GET, PUT, or POST carrying an idempotency key). */
  idempotent: boolean;
  /** Return null instead of throwing on 404. */
  nullOn404?: boolean;
}

const API_PREFIX = '/microstore/v1';

function kindForStatus(status: number): GetorioErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429 || status >= 500) return 'unavailable';
  return 'rejected';
}

/**
 * HTTP implementation of the Getorio contract in docs/GETORIO_API_CONTRACT.md.
 * Server-side only: it holds the service API key.
 */
export class HttpGetorioClient implements GetorioClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  readonly breaker: CircuitBreaker;

  constructor(options: HttpGetorioClientOptions) {
    if (!options.baseUrl) throw new Error('GETORIO_API_BASE_URL is required');
    if (!options.apiKey) throw new Error('GETORIO_API_KEY is required');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 200;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = options.random ?? Math.random;
    this.breaker = new CircuitBreaker(options.circuitBreaker);
  }

  async listProducts(
    tenantId: string,
    query: ListProductsQuery,
  ): Promise<Paginated<GetorioProduct>> {
    const q = listProductsQuerySchema.parse(query);
    return this.request({
      method: 'GET',
      path: '/products',
      tenantId,
      query: {
        page: q.page,
        pageSize: q.pageSize,
        search: q.search || undefined,
        categoryId: q.categoryId,
        onlyMicrostore: q.onlyMicrostore,
      },
      schema: paginatedProductsSchema,
      idempotent: true,
    });
  }

  async getProduct(tenantId: string, productId: string): Promise<GetorioProduct | null> {
    return this.request({
      method: 'GET',
      path: `/products/${encodeURIComponent(productId)}`,
      tenantId,
      schema: productSchema,
      idempotent: true,
      nullOn404: true,
    });
  }

  async getStock(tenantId: string, ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    const res = await this.request({
      method: 'POST',
      path: '/stock/query',
      tenantId,
      body: { ids: [...new Set(ids)] },
      schema: stockResponseSchema,
      idempotent: true,
    });
    return res.stock;
  }

  async createOrder(
    tenantId: string,
    order: MicrostoreOrderPayload,
    idempotencyKey: string,
  ): Promise<{ getorioOrderId: string }> {
    return this.request({
      method: 'POST',
      path: '/orders',
      tenantId,
      body: order,
      headers: { 'Idempotency-Key': idempotencyKey },
      schema: createOrderResponseSchema,
      idempotent: true,
    });
  }

  async getOrderStatus(tenantId: string, getorioOrderId: string): Promise<GetorioOrderStatus> {
    return this.request({
      method: 'GET',
      path: `/orders/${encodeURIComponent(getorioOrderId)}/status`,
      tenantId,
      schema: orderStatusSchema,
      idempotent: true,
    });
  }

  async setProductMicrostoreFlags(
    tenantId: string,
    productId: string,
    flags: MicrostoreFlags,
  ): Promise<void> {
    await this.request({
      method: 'PUT',
      path: `/products/${encodeURIComponent(productId)}/microstore-flags`,
      tenantId,
      body: { visible: flags.visible, featured: flags.featured },
      schema: null,
      idempotent: true,
    });
  }

  // ---------------------------------------------------------------------------------------

  private async request<T>(spec: RequestSpec<T> & { nullOn404: true }): Promise<T | null>;
  private async request<T>(spec: RequestSpec<T>): Promise<T>;
  private async request<T>(spec: RequestSpec<T>): Promise<T | null> {
    const attempts = spec.idempotent ? this.maxRetries + 1 : 1;
    let lastError: GetorioError | undefined;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        const cap = this.retryBaseDelayMs * 2 ** (attempt - 1);
        await this.sleep(Math.round(this.random() * cap));
      }
      if (!this.breaker.allowRequest()) {
        throw new GetorioError('unavailable', 'Getorio circuit is open', { cause: lastError });
      }
      try {
        const result = await this.attempt(spec);
        this.breaker.recordSuccess();
        return result;
      } catch (error) {
        const err = error as GetorioError;
        if (err.retryable) {
          this.breaker.recordFailure();
        } else {
          // The service answered; it is up even if it refused this request.
          this.breaker.recordSuccess();
          if (err.kind === 'not_found' && spec.nullOn404) return null;
          throw err;
        }
        lastError = err;
      }
    }
    throw lastError as GetorioError;
  }

  private async attempt<T>(spec: RequestSpec<T>): Promise<T> {
    const url = new URL(this.baseUrl + API_PREFIX + spec.path);
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: spec.method,
        headers: {
          Accept: 'application/json',
          'X-Api-Key': this.apiKey,
          'X-Getorio-Tenant': spec.tenantId,
          ...(spec.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...spec.headers,
        },
        body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
      throw new GetorioError(
        'unavailable',
        timedOut ? 'Getorio request timed out' : 'Getorio is unreachable',
        {
          cause,
        },
      );
    }

    if (!response.ok) {
      const kind = kindForStatus(response.status);
      throw new GetorioError(
        kind,
        `Getorio responded ${response.status} for ${spec.method} ${spec.path}`,
        {
          status: response.status,
        },
      );
    }

    if (spec.schema === null) return undefined as T;

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new GetorioError('invalid_response', 'Getorio returned invalid JSON', {
        status: response.status,
        cause,
      });
    }
    const parsed = spec.schema.safeParse(json);
    if (!parsed.success) {
      throw new GetorioError(
        'invalid_response',
        `Unexpected response shape for ${spec.method} ${spec.path}`,
        {
          status: response.status,
          cause: parsed.error,
        },
      );
    }
    return parsed.data;
  }
}
