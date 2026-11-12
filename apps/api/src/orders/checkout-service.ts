import { createHash, randomInt } from 'node:crypto';
import { fromMinorUnits, toMinorUnits, type GetorioProduct } from '@microstore/getorio-client';
import { emailSchema, pkPhoneSchema, plainText } from '@microstore/site-schema';
import { z } from 'zod';
import type { CatalogService } from '../catalog/catalog-service';
import type { Db } from '../db';
import { Prisma, type Store } from '../generated/prisma/client';
import { AppError, conflict } from '../lib/errors';
import { newId } from '../lib/ids';
import { storeSettingsSchema } from '../stores/settings';
import type { OrderSyncQueue } from './order-sync';

export const MAX_CART_LINES = 50;
export const MAX_LINE_QTY = 99;

// Letters (any script), spaces and a few name punctuation marks; must contain at least two letters.
const personName = plainText(120, { min: 2 }).refine(
  (v) => (v.match(/\p{L}/gu) ?? []).length >= 2,
  {
    error: 'Please enter your full name',
  },
);

export const checkoutBodySchema = z.strictObject({
  customer: z.strictObject({
    name: personName,
    phone: pkPhoneSchema,
    email: z.union([z.literal(''), emailSchema]).optional(),
  }),
  shipping: z.strictObject({
    address: plainText(250, { min: 5 }),
    city: plainText(80, { min: 2 }),
  }),
  notes: plainText(500, { multiline: true }).optional(),
  items: z
    .array(
      z.strictObject({
        productId: z.string().min(1).max(64),
        variantId: z.string().min(1).max(64).nullable().optional(),
        qty: z.number().int().min(1).max(MAX_LINE_QTY),
      }),
    )
    .min(1)
    .max(MAX_CART_LINES),
  paymentMethod: z.literal('cod').default('cod'),
  /** Honeypot: hidden in the form, must stay empty (FR-5.9). */
  website: z.string().max(200).optional(),
});
export type CheckoutBody = z.input<typeof checkoutBodySchema>;

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, {
  error: 'Idempotency-Key header must be 16-128 URL-safe characters',
});

/** Payment methods (FR-5.3). Only COD in MVP; gateways plug in here later. */
export interface PaymentMethod {
  id: string;
  /** Whether the order needs an online payment before it is confirmed. */
  requiresOnlinePayment: boolean;
}
export const PAYMENT_METHODS: Record<string, PaymentMethod> = {
  cod: { id: 'cod', requiresOnlinePayment: false },
};

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateOrderRef(): string {
  let ref = 'MS-';
  for (let i = 0; i < 7; i++) ref += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return ref;
}

interface PricedLine {
  product: GetorioProduct;
  variantId: string | null;
  name: string;
  sku: string;
  qty: number;
  unitMinor: number;
}

export interface OrderSummary {
  orderRef: string;
  status: string;
  currency: string;
  subtotal: string;
  shippingFee: string;
  total: string;
  paymentMethod: string;
  items: {
    productId: string;
    variantId: string | null;
    name: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
  }[];
  createdAt: string;
}

export class CheckoutService {
  constructor(
    private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly queue: OrderSyncQueue,
  ) {}

  /**
   * FR-5.5: re-validates and re-prices the cart from Getorio, stores the order as `pending_sync`
   * and enqueues the Getorio sync. The order is persisted before any external write (§9.3).
   */
  async placeOrder(
    store: Store,
    rawBody: unknown,
    idempotencyKey: string,
  ): Promise<{ order: OrderSummary; created: boolean }> {
    const body = checkoutBodySchema.parse(rawBody);
    if (body.website) throw new AppError(400, 'bad_request', 'Your order could not be placed');
    const requestHash = hashRequest(body);

    const existing = await this.findExisting(store.id, idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw conflict('This checkout was already submitted with a different cart');
      return { order: toSummary(existing), created: false };
    }

    const { lines, unverified } = await this.priceLines(store, mergeLines(body.items));
    const settings = storeSettingsSchema.parse(store.settings);
    const subtotalMinor = lines.reduce((sum, l) => sum + l.unitMinor * l.qty, 0);
    const threshold =
      settings.freeShippingThreshold === null ? null : toMinorUnits(settings.freeShippingThreshold);
    const shippingMinor =
      threshold !== null && subtotalMinor >= threshold ? 0 : toMinorUnits(settings.shippingFlatFee);

    const orderId = newId();
    try {
      await this.db.$transaction(async (tx) => {
        await tx.order.create({
          data: {
            id: orderId,
            storeId: store.id,
            getorioTenantId: store.getorioTenantId,
            orderRef: await this.uniqueRef(tx),
            idempotencyKey,
            requestHash,
            status: 'pending_sync',
            customerName: body.customer.name,
            customerPhone: body.customer.phone,
            customerEmail: body.customer.email || null,
            address: body.shipping.address,
            city: body.shipping.city,
            notes: body.notes || null,
            subtotal: fromMinorUnits(subtotalMinor),
            shippingFee: fromMinorUnits(shippingMinor),
            total: fromMinorUnits(subtotalMinor + shippingMinor),
            currency: store.currency,
            paymentMethod: PAYMENT_METHODS[body.paymentMethod]?.id ?? 'cod',
            stockUnverified: unverified,
            items: {
              create: lines.map((l) => ({
                id: newId(),
                getorioTenantId: store.getorioTenantId,
                getorioProductId: l.product.id,
                variantId: l.variantId,
                sku: l.sku,
                nameSnapshot: l.name,
                unitPrice: fromMinorUnits(l.unitMinor),
                qty: l.qty,
                lineTotal: fromMinorUnits(l.unitMinor * l.qty),
              })),
            },
          },
        });
      });
    } catch (error) {
      // A concurrent submit with the same key won the race: answer like a retry.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.findExisting(store.id, idempotencyKey);
        if (winner && winner.requestHash === requestHash)
          return { order: toSummary(winner), created: false };
        if (winner) throw conflict('This checkout was already submitted with a different cart');
      }
      throw error;
    }

    // If enqueueing fails the order stays pending_sync and the sweeper picks it up.
    await this.queue.enqueue(orderId).catch(() => undefined);
    const order = await this.db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    return { order: toSummary(order), created: true };
  }

  private findExisting(storeId: string, idempotencyKey: string) {
    return this.db.order.findUnique({
      where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
      include: { items: true },
    });
  }

  private async uniqueRef(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 5; i++) {
      const ref = generateOrderRef();
      if (!(await tx.order.findUnique({ where: { orderRef: ref }, select: { id: true } })))
        return ref;
    }
    throw new Error('Could not allocate an order reference');
  }

  private async priceLines(
    store: Store,
    items: { productId: string; variantId: string | null; qty: number }[],
  ) {
    const problems: { productId: string; variantId: string | null; reason: string }[] = [];
    const lines: PricedLine[] = [];
    let unverified = false;

    for (const item of items) {
      const res = await this.catalog.getForCheckout(store.getorioTenantId, item.productId);
      unverified ||= res.unverified;
      const product = res.product;
      if (!product || !product.active || !product.microstore.visible) {
        problems.push({ ...item, reason: 'unavailable' });
        continue;
      }
      if (product.currency !== store.currency) {
        problems.push({ ...item, reason: 'unavailable' });
        continue;
      }
      const activeVariants = product.variants.filter((v) => v.active);
      if (activeVariants.length > 0 || item.variantId) {
        const variant = activeVariants.find((v) => v.id === item.variantId);
        if (!variant) {
          problems.push({ ...item, reason: item.variantId ? 'unavailable' : 'variant_required' });
          continue;
        }
        if (variant.stockQty < item.qty) {
          problems.push({
            ...item,
            reason: variant.stockQty > 0 ? 'insufficient_stock' : 'out_of_stock',
          });
          continue;
        }
        lines.push({
          product,
          variantId: variant.id,
          name: `${product.name} - ${variant.name}`.slice(0, 200),
          sku: variant.sku,
          qty: item.qty,
          unitMinor: toMinorUnits(variant.price),
        });
        continue;
      }
      if (product.stockQty < item.qty) {
        problems.push({
          ...item,
          reason: product.stockQty > 0 ? 'insufficient_stock' : 'out_of_stock',
        });
        continue;
      }
      lines.push({
        product,
        variantId: null,
        name: product.name,
        sku: product.sku,
        qty: item.qty,
        unitMinor: toMinorUnits(product.price),
      });
    }

    if (problems.length) {
      throw new AppError(
        409,
        'out_of_stock',
        'Some items in your cart are no longer available',
        problems,
      );
    }
    return { lines, unverified };
  }
}

/** Same product+variant lines are merged so quantities are checked against stock together. */
function mergeLines(items: CheckoutBodyItem[]) {
  const merged = new Map<string, { productId: string; variantId: string | null; qty: number }>();
  for (const item of items) {
    const variantId = item.variantId ?? null;
    const k = `${item.productId}\u0000${variantId ?? ''}`;
    const prev = merged.get(k);
    if (prev) prev.qty += item.qty;
    else merged.set(k, { productId: item.productId, variantId, qty: item.qty });
  }
  for (const line of merged.values()) {
    if (line.qty > MAX_LINE_QTY) {
      throw new AppError(400, 'validation_error', `At most ${MAX_LINE_QTY} of one item per order`);
    }
  }
  return [...merged.values()];
}
type CheckoutBodyItem = z.output<typeof checkoutBodySchema>['items'][number];

function hashRequest(body: z.output<typeof checkoutBodySchema>) {
  const normalized = {
    customer: body.customer,
    shipping: body.shipping,
    notes: body.notes ?? '',
    items: mergeLines(body.items).sort((a, b) =>
      `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`),
    ),
    paymentMethod: body.paymentMethod,
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

export function toSummary(order: OrderWithItems): OrderSummary {
  return {
    orderRef: order.orderRef,
    status: order.status === 'cancelled' ? 'cancelled' : 'received',
    currency: order.currency,
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    paymentMethod: order.paymentMethod,
    items: order.items.map((i) => ({
      productId: i.getorioProductId,
      variantId: i.variantId,
      name: i.nameSnapshot,
      qty: i.qty,
      unitPrice: i.unitPrice.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2),
    })),
    createdAt: order.createdAt.toISOString(),
  };
}
