import type {
  GetorioOrderStatus,
  GetorioProduct,
  ListProductsQuery,
  MicrostoreFlags,
  MicrostoreOrderPayload,
  Paginated,
} from './types';

/**
 * Everything Microstore needs from the Getorio OMS. All calls are scoped to a Getorio tenant.
 * Implementations throw `GetorioError`; check `error.retryable` to decide whether to retry later.
 * Server-side only: never import this into browser code.
 */
export interface GetorioClient {
  listProducts(tenantId: string, query: ListProductsQuery): Promise<Paginated<GetorioProduct>>;
  /** Returns null when the product does not exist for this tenant. */
  getProduct(tenantId: string, productId: string): Promise<GetorioProduct | null>;
  /** Stock per requested product or variant id. Unknown ids are omitted from the result. */
  getStock(tenantId: string, ids: string[]): Promise<Record<string, number>>;
  /**
   * Creates the order in Getorio. Repeating the call with the same idempotency key returns the
   * same order id; reusing the key with a different payload fails with `conflict`.
   */
  createOrder(
    tenantId: string,
    order: MicrostoreOrderPayload,
    idempotencyKey: string,
  ): Promise<{ getorioOrderId: string }>;
  getOrderStatus(tenantId: string, getorioOrderId: string): Promise<GetorioOrderStatus>;
  setProductMicrostoreFlags(
    tenantId: string,
    productId: string,
    flags: MicrostoreFlags,
  ): Promise<void>;
}
