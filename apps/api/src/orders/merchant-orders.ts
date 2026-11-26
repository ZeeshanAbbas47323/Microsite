import type { Db } from '../db';
import type { OrderStatus } from '../generated/prisma/client';
import { AppError, notFound } from '../lib/errors';
import type { StoreService } from '../stores/store-service';
import type { OrderSyncQueue, OrderSyncService } from './order-sync';

export const ORDER_SORTS = ['createdAt', 'total', 'customerName', 'city'] as const;

export interface OrderListQuery {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  /** Order ref, customer name, phone or city. */
  search?: string;
  sort?: (typeof ORDER_SORTS)[number];
  dir?: 'asc' | 'desc';
  /** Pakistan calendar days, inclusive (YYYY-MM-DD). */
  from?: string;
  to?: string;
}

/** Midnight in Pakistan (UTC+5, no DST) as an instant. */
const pktDayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) - 5 * 3600_000);

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
    const search = q.search?.trim();
    // Phones are stored as +92…; match "0321-765…" or "92321…" by the digits after the prefix.
    const phone = (search ?? '').replace(/\D/g, '').replace(/^(92|0)/, '');
    const base = {
      storeId,
      getorioTenantId: tenantId,
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: pktDayStart(q.from) } : {}),
              ...(q.to ? { lt: new Date(pktDayStart(q.to).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { orderRef: { contains: search } },
              { customerName: { contains: search } },
              ...(phone.length >= 4 ? [{ customerPhone: { contains: phone } }] : []),
              { city: { contains: search } },
            ],
          }
        : {}),
    };
    const where = { ...base, ...(q.status ? { status: q.status } : {}) };
    const sort = q.sort ?? 'createdAt';
    const dir = q.dir ?? 'desc';
    const [rows, total, statuses, sum] = await Promise.all([
      this.db.order.findMany({
        where,
        orderBy: [{ [sort]: dir }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { items: true } } },
      }),
      this.db.order.count({ where }),
      // Counts per status for the filter tabs (same search and dates, any status).
      this.db.order.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.db.order.aggregate({ where, _sum: { total: true } }),
    ]);
    return {
      items: rows.map(({ _count, ...o }) => ({ ...this.toDto(o), itemCount: _count.items })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      statusCounts: Object.fromEntries(statuses.map((r) => [r.status, r._count._all])),
      /** Sum of totals for every matching order (all pages). */
      totalValue: (sum._sum.total ?? 0).toFixed(2),
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
