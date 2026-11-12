import type { GetorioClient } from '../client';
import { GetorioError, type GetorioErrorKind } from '../errors';
import {
  listProductsQuerySchema,
  microstoreOrderPayloadSchema,
  type GetorioOrderStatus,
  type GetorioProduct,
  type ListProductsQuery,
  type MicrostoreFlags,
  type MicrostoreOrderPayload,
  type Paginated,
} from '../types';

export interface MockOrder {
  getorioOrderId: string;
  idempotencyKey: string;
  payload: MicrostoreOrderPayload;
  status: GetorioOrderStatus['status'];
  createdAt: string;
  updatedAt: string;
}

interface TenantData {
  products: Map<string, GetorioProduct>;
  orders: Map<string, MockOrder>;
  /** idempotency key -> order id */
  idempotency: Map<string, string>;
}

export interface InMemoryGetorioClientOptions {
  /** Initial products per tenant id. */
  catalog?: Record<string, GetorioProduct[]>;
  /** Artificial delay per call, to make loading states visible in local dev. */
  latencyMs?: number;
  now?: () => Date;
}

export interface MockCall {
  method: keyof GetorioClient;
  tenantId: string;
}

/** Stable JSON for comparing payloads regardless of key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/**
 * In-memory Getorio used for local development and tests (spec §6). Tenant-isolated, idempotent
 * order creation, and fault injection so "Getorio is down" flows can be exercised.
 */
export class InMemoryGetorioClient implements GetorioClient {
  private readonly tenants = new Map<string, TenantData>();
  private readonly latencyMs: number;
  private readonly now: () => Date;
  private available = true;
  private pendingFailures: GetorioErrorKind[] = [];
  private orderSeq = 100000;
  /** Every call made, in order. Useful to assert caching or retry behaviour. */
  readonly calls: MockCall[] = [];

  constructor({
    catalog = {},
    latencyMs = 0,
    now = () => new Date(),
  }: InMemoryGetorioClientOptions = {}) {
    this.latencyMs = latencyMs;
    this.now = now;
    for (const [tenantId, products] of Object.entries(catalog))
      this.seedProducts(tenantId, products);
  }

  // -- Test / dev controls -----------------------------------------------------------------

  /** Simulate a full outage (every call fails with `unavailable`) or recovery. */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /** Make the next `count` calls fail with the given error kind. */
  failNext(count: number, kind: GetorioErrorKind = 'unavailable'): void {
    this.pendingFailures.push(...Array.from({ length: count }, () => kind));
  }

  seedProducts(tenantId: string, products: GetorioProduct[]): void {
    const tenant = this.tenant(tenantId);
    for (const p of products) tenant.products.set(p.id, structuredClone(p));
  }

  updateProduct(tenantId: string, productId: string, patch: Partial<GetorioProduct>): void {
    const product = this.tenant(tenantId).products.get(productId);
    if (!product) throw new Error(`Unknown product ${productId}`);
    Object.assign(product, structuredClone(patch), { updatedAt: this.now().toISOString() });
  }

  getOrders(tenantId: string): MockOrder[] {
    return structuredClone([...this.tenant(tenantId).orders.values()]);
  }

  setOrderStatus(
    tenantId: string,
    getorioOrderId: string,
    status: GetorioOrderStatus['status'],
  ): void {
    const order = this.tenant(tenantId).orders.get(getorioOrderId);
    if (!order) throw new Error(`Unknown order ${getorioOrderId}`);
    order.status = status;
    order.updatedAt = this.now().toISOString();
  }

  // -- GetorioClient -----------------------------------------------------------------------

  async listProducts(
    tenantId: string,
    query: ListProductsQuery,
  ): Promise<Paginated<GetorioProduct>> {
    await this.enter('listProducts', tenantId);
    const parsed = listProductsQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new GetorioError('rejected', 'Invalid product query', { status: 422 });
    const { page, pageSize, search, categoryId, onlyMicrostore } = parsed.data;
    const needle = search?.toLowerCase();

    const matching = [...this.tenant(tenantId).products.values()].filter(
      (p) =>
        (!onlyMicrostore || (p.active && p.microstore.visible)) &&
        (!categoryId || p.category?.id === categoryId) &&
        (!needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle)),
    );
    const start = (page - 1) * pageSize;
    return {
      items: structuredClone(matching.slice(start, start + pageSize)),
      page,
      pageSize,
      total: matching.length,
    };
  }

  async getProduct(tenantId: string, productId: string): Promise<GetorioProduct | null> {
    await this.enter('getProduct', tenantId);
    const product = this.tenant(tenantId).products.get(productId);
    return product ? structuredClone(product) : null;
  }

  async getStock(tenantId: string, ids: string[]): Promise<Record<string, number>> {
    await this.enter('getStock', tenantId);
    const products = [...this.tenant(tenantId).products.values()];
    const stock: Record<string, number> = {};
    for (const id of new Set(ids)) {
      const product = products.find((p) => p.id === id);
      if (product) {
        stock[id] = product.stockQty;
        continue;
      }
      const variant = products.flatMap((p) => p.variants).find((v) => v.id === id);
      if (variant) stock[id] = variant.stockQty;
    }
    return stock;
  }

  async createOrder(
    tenantId: string,
    order: MicrostoreOrderPayload,
    idempotencyKey: string,
  ): Promise<{ getorioOrderId: string }> {
    await this.enter('createOrder', tenantId);
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new GetorioError('rejected', 'A valid idempotency key is required', { status: 400 });
    }
    const parsed = microstoreOrderPayloadSchema.safeParse(order);
    if (!parsed.success)
      throw new GetorioError('rejected', 'Invalid order payload', { status: 422 });
    const payload = parsed.data;
    const tenant = this.tenant(tenantId);

    const existingId = tenant.idempotency.get(idempotencyKey);
    if (existingId) {
      const existing = tenant.orders.get(existingId) as MockOrder;
      if (canonical(existing.payload) !== canonical(payload)) {
        throw new GetorioError(
          'conflict',
          'Idempotency key was already used with a different order',
          {
            status: 409,
          },
        );
      }
      return { getorioOrderId: existingId };
    }

    for (const item of payload.items) {
      const product = tenant.products.get(item.productId);
      if (!product || (item.variantId && !product.variants.some((v) => v.id === item.variantId))) {
        throw new GetorioError('rejected', `Unknown product ${item.productId}`, { status: 422 });
      }
    }

    // The order is already promised to the customer, so stock is decremented but never rejected.
    for (const item of payload.items) {
      const product = tenant.products.get(item.productId) as GetorioProduct;
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (variant) variant.stockQty = Math.max(0, variant.stockQty - item.qty);
      product.stockQty = Math.max(0, product.stockQty - item.qty);
    }

    const getorioOrderId = `GO-${++this.orderSeq}`;
    const at = this.now().toISOString();
    tenant.orders.set(getorioOrderId, {
      getorioOrderId,
      idempotencyKey,
      payload: structuredClone(payload),
      status: 'pending',
      createdAt: at,
      updatedAt: at,
    });
    tenant.idempotency.set(idempotencyKey, getorioOrderId);
    return { getorioOrderId };
  }

  async getOrderStatus(tenantId: string, getorioOrderId: string): Promise<GetorioOrderStatus> {
    await this.enter('getOrderStatus', tenantId);
    const order = this.tenant(tenantId).orders.get(getorioOrderId);
    if (!order) throw new GetorioError('not_found', 'Order not found', { status: 404 });
    return { getorioOrderId, status: order.status, updatedAt: order.updatedAt };
  }

  async setProductMicrostoreFlags(
    tenantId: string,
    productId: string,
    flags: MicrostoreFlags,
  ): Promise<void> {
    await this.enter('setProductMicrostoreFlags', tenantId);
    const product = this.tenant(tenantId).products.get(productId);
    if (!product) throw new GetorioError('not_found', 'Product not found', { status: 404 });
    product.microstore = { visible: flags.visible, featured: flags.featured };
    product.updatedAt = this.now().toISOString();
  }

  // -- Internals ---------------------------------------------------------------------------

  private tenant(tenantId: string): TenantData {
    let data = this.tenants.get(tenantId);
    if (!data) {
      data = { products: new Map(), orders: new Map(), idempotency: new Map() };
      this.tenants.set(tenantId, data);
    }
    return data;
  }

  private async enter(method: keyof GetorioClient, tenantId: string): Promise<void> {
    this.calls.push({ method, tenantId });
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    if (!this.available)
      throw new GetorioError('unavailable', 'Getorio mock is unavailable', { status: 503 });
    const failure = this.pendingFailures.shift();
    if (failure) throw new GetorioError(failure, `Injected ${failure} failure`);
    if (!tenantId) throw new GetorioError('unauthorized', 'Missing tenant', { status: 401 });
  }
}
