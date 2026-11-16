import {
  GetorioError,
  type GetorioClient,
  type GetorioOrderStatus,
} from '@microstore/getorio-client';
import { pkPhoneSchema } from '@microstore/site-schema';
import { z } from 'zod';
import type { Db } from '../db';
import type { KeyValueCache } from '../lib/cache';
import { AppError } from '../lib/errors';
import { toSummary, type OrderSummary } from './checkout-service';

/** Getorio statuses are cached briefly so a refreshing customer does not hammer Getorio. */
export const TRACKING_CACHE_SECONDS = 60;

const trackBodySchema = z.strictObject({
  orderRef: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^MS-[A-Z0-9]{4,12}$/, 'Enter the order number from your confirmation, e.g. MS-AB12CD'),
  phone: pkPhoneSchema,
});

/** What the customer sees. `received` = placed with the store, not yet confirmed by Getorio. */
export type TrackingStatus = 'received' | GetorioOrderStatus['status'];

export interface TrackedOrder {
  order: OrderSummary;
  tracking: { status: TrackingStatus; updatedAt: string };
}

/**
 * FR-5.10: order tracking by order reference + phone. Both must match the same order in this
 * store; any mismatch gets the same "not found" so order numbers cannot be probed.
 */
export class OrderTrackingService {
  constructor(
    private readonly db: Db,
    private readonly getorio: GetorioClient,
    private readonly cache: KeyValueCache,
  ) {}

  async track(store: { id: string; getorioTenantId: string }, rawBody: unknown) {
    const { orderRef, phone } = trackBodySchema.parse(rawBody);
    const order = await this.db.order.findFirst({
      where: { storeId: store.id, orderRef },
      include: { items: true },
    });
    if (!order || order.customerPhone !== phone) {
      throw new AppError(404, 'not_found', 'We could not find an order with that number and phone');
    }

    let tracking: TrackedOrder['tracking'] = {
      status: order.status === 'cancelled' ? 'cancelled' : 'received',
      updatedAt: order.updatedAt.toISOString(),
    };
    if (order.getorioOrderId && order.status === 'synced') {
      const live = await this.liveStatus(store.getorioTenantId, order.getorioOrderId);
      if (live) tracking = { status: live.status, updatedAt: live.updatedAt };
    }
    return { order: toSummary(order), tracking } satisfies TrackedOrder;
  }

  /** Null when Getorio cannot answer right now; the customer then sees the last known status. */
  private async liveStatus(tenantId: string, getorioOrderId: string) {
    const key = `order-status:${tenantId}:${getorioOrderId}`;
    const cached = await this.cache.get<GetorioOrderStatus>(key);
    if (cached) return cached;
    try {
      const status = await this.getorio.getOrderStatus(tenantId, getorioOrderId);
      await this.cache.set(key, status, TRACKING_CACHE_SECONDS);
      return status;
    } catch (error) {
      if (error instanceof GetorioError) return null;
      throw error;
    }
  }
}
