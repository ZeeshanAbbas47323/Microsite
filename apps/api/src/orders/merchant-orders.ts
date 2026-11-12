import type { Db } from '../db';
import type { OrderStatus } from '../generated/prisma/client';
import { AppError, notFound } from '../lib/errors';
import type { StoreService } from '../stores/store-service';
import type { OrderSyncQueue, OrderSyncService } from './order-sync';

export interface OrderListQuery {
  page: number;
  pageSize: number;
  status?: OrderStatus;
}

/** FR-6.5: the merchant's view of microstore orders, always scoped by tenant. */
export class MerchantOrderService {
  constructor(
    private readonly db: Db,
    private readonly stores: StoreService,
    private readonly sync: OrderSyncService,
    private readonly queue: OrderSyncQueue & { requeue?: (orderId: string) => Promise<void> },
    /** e.g. `https://app.getorio.com/orders/{id}`; omitted when unknown. */
    private readonly getorioOrderUrlTemplate?: string,
  ) {}

  async list(tenantId: string, storeId: string, q: OrderListQuery) {
    await this.stores.get(tenantId, storeId);
    const where = { storeId, getorioTenantId: tenantId, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([
      this.db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { items: true } } },
      }),
      this.db.order.count({ where }),
    ]);
    return {
      items: rows.map(({ _count, ...o }) => ({ ...this.toDto(o), itemCount: _count.items })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async get(tenantId: string, storeId: string, orderId: string) {
    const order = await this.db.order.findFirst({
      where: { id: orderId, storeId, getorioTenantId: tenantId },
      include: { items: true },
    });
    if (!order) throw notFound('Order');
    return {
      ...this.toDto(order),
      notes: order.notes,
      customerEmail: order.customerEmail,
      address: order.address,
      subtotal: order.subtotal.toFixed(2),
      shippingFee: order.shippingFee.toFixed(2),
      items: order.items.map((i) => ({
        productId: i.getorioProductId,
        variantId: i.variantId,
        sku: i.sku,
        name: i.nameSnapshot,
        qty: i.qty,
        unitPrice: i.unitPrice.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
    };
  }

  async retrySync(tenantId: string, storeId: string, orderId: string) {
    const order = await this.db.order.findFirst({
      where: { id: orderId, storeId, getorioTenantId: tenantId },
    });
    if (!order) throw notFound('Order');
    if (order.status !== 'sync_failed' && order.status !== 'pending_sync') {
      throw new AppError(409, 'conflict', `Order is already ${order.status}`);
    }
    await this.sync.markForRetry(order.id);
    await (this.queue.requeue ? this.queue.requeue(order.id) : this.queue.enqueue(order.id));
    return this.get(tenantId, storeId, orderId);
  }

  private toDto(o: {
    id: string;
    orderRef: string;
    status: OrderStatus;
    customerName: string;
    customerPhone: string;
    city: string;
    total: { toFixed(n: number): string };
    currency: string;
    paymentMethod: string;
    stockUnverified: boolean;
    getorioOrderId: string | null;
    syncAttempts: number;
    lastSyncError: string | null;
    createdAt: Date;
  }) {
    return {
      id: o.id,
      orderRef: o.orderRef,
      status: o.status,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      city: o.city,
      total: o.total.toFixed(2),
      currency: o.currency,
      paymentMethod: o.paymentMethod,
      stockUnverified: o.stockUnverified,
      getorioOrderId: o.getorioOrderId,
      getorioOrderUrl:
        o.getorioOrderId && this.getorioOrderUrlTemplate
          ? this.getorioOrderUrlTemplate.replace('{id}', encodeURIComponent(o.getorioOrderId))
          : null,
      syncAttempts: o.syncAttempts,
      lastSyncError: o.lastSyncError,
      createdAt: o.createdAt.toISOString(),
    };
  }
}
