import { toMinorUnits } from '@microstore/getorio-client';
import { z } from 'zod';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import type { Discount, DiscountType, Prisma } from '../generated/prisma/client';
import { AppError, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { StoreService } from '../stores/store-service';

export const DISCOUNT_TYPES = ['percentage', 'fixed', 'free_shipping'] as const;
export const MAX_DISCOUNTS = 200;

const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v), { error: 'Must be an amount like 500 or 99.50' })
  .transform((v) => Number(v).toFixed(2));

export const discountCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, {
    error: 'Use 3-32 letters, numbers, dashes or underscores',
  });

const discountFields = {
  code: discountCodeSchema,
  description: z.string().trim().max(200).nullable().optional(),
  type: z.enum(DISCOUNT_TYPES),
  value: money.default('0.00'),
  maxDiscount: money.nullable().optional(),
  minSubtotal: money.nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(1000).nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  active: z.boolean().optional(),
};

function valueProblem(type?: DiscountType, value?: string): string | null {
  if (type === 'percentage' && (Number(value) <= 0 || Number(value) > 100))
    return 'Percent must be between 1 and 100';
  if (type === 'fixed' && Number(value) <= 0) return 'Amount must be more than 0';
  return null;
}

function checkValue(d: { type?: DiscountType; value?: string }, ctx: z.RefinementCtx) {
  const problem = d.value === undefined ? null : valueProblem(d.type, d.value);
  if (problem) ctx.addIssue({ code: 'custom', path: ['value'], message: problem });
}

export const createDiscountSchema = z.strictObject(discountFields).superRefine(checkValue);
export const updateDiscountSchema = z
  .strictObject(discountFields)
  .partial()
  .superRefine(checkValue);

export type DiscountRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'used_up'
  | 'min_subtotal'
  | 'customer_limit'
  | 'nothing_to_discount';

const REJECTION_MESSAGES: Record<DiscountRejection, string> = {
  not_found: 'This discount code is not valid',
  inactive: 'This discount code is not active',
  not_started: 'This discount code is not active yet',
  expired: 'This discount code has expired',
  used_up: 'This discount code has reached its usage limit',
  min_subtotal: 'Your order does not meet the minimum for this code',
  customer_limit: 'You have already used this discount code',
  nothing_to_discount: 'This code does not lower the price of this order',
};

export class DiscountRejected extends AppError {
  constructor(
    readonly reason: DiscountRejection,
    extra: Record<string, unknown> = {},
  ) {
    super(400, 'bad_request', REJECTION_MESSAGES[reason], { reason, ...extra });
  }
}

export interface AppliedDiscount {
  discount: Discount;
  /** Amount taken off the subtotal (minor units). */
  discountMinor: number;
  /** Shipping after the discount (minor units). */
  shippingMinor: number;
}

/**
 * Applies a code to a priced cart. All checks run on the server: the browser only ever sends
 * the code. Usage limits are re-checked atomically when the order is written (`reserve`).
 */
export async function evaluateDiscount(
  db: Db | Prisma.TransactionClient,
  storeId: string,
  rawCode: string,
  cart: { subtotalMinor: number; shippingMinor: number; phone?: string | null },
  now = new Date(),
): Promise<AppliedDiscount> {
  const parsed = discountCodeSchema.safeParse(rawCode);
  if (!parsed.success) throw new DiscountRejected('not_found');
  const discount = await db.discount.findUnique({
    where: { storeId_code: { storeId, code: parsed.data } },
  });
  if (!discount) throw new DiscountRejected('not_found');
  if (!discount.active) throw new DiscountRejected('inactive');
  if (discount.startsAt > now) throw new DiscountRejected('not_started');
  if (discount.endsAt && discount.endsAt <= now) throw new DiscountRejected('expired');
  if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit)
    throw new DiscountRejected('used_up');
  if (
    discount.minSubtotal !== null &&
    cart.subtotalMinor < toMinorUnits(discount.minSubtotal.toFixed(2))
  )
    throw new DiscountRejected('min_subtotal', { minSubtotal: discount.minSubtotal.toFixed(2) });
  if (discount.perCustomerLimit !== null && cart.phone) {
    const used = await db.order.count({
      where: {
        storeId,
        discountId: discount.id,
        customerPhone: cart.phone,
        status: { not: 'cancelled' },
      },
    });
    if (used >= discount.perCustomerLimit) throw new DiscountRejected('customer_limit');
  }

  let discountMinor = 0;
  let shippingMinor = cart.shippingMinor;
  if (discount.type === 'percentage') {
    discountMinor = Math.round((cart.subtotalMinor * Number(discount.value)) / 100);
    if (discount.maxDiscount !== null)
      discountMinor = Math.min(discountMinor, toMinorUnits(discount.maxDiscount.toFixed(2)));
  } else if (discount.type === 'fixed') {
    discountMinor = toMinorUnits(discount.value.toFixed(2));
  } else {
    if (shippingMinor === 0) throw new DiscountRejected('nothing_to_discount');
    shippingMinor = 0;
  }
  discountMinor = Math.min(discountMinor, cart.subtotalMinor);
  return { discount, discountMinor, shippingMinor };
}

/** Takes one use of the code inside the order transaction; fails if the last use just went. */
export async function reserveDiscount(tx: Prisma.TransactionClient, discount: Discount) {
  const res = await tx.discount.updateMany({
    where: {
      id: discount.id,
      active: true,
      ...(discount.usageLimit !== null ? { usedCount: { lt: discount.usageLimit } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (res.count === 0) throw new DiscountRejected('used_up');
}

/** Dashboard side: create, edit and report on discount codes (always tenant scoped). */
export class DiscountService {
  constructor(
    private readonly db: Db,
    private readonly stores: StoreService,
  ) {}

  async list(tenantId: string, storeId: string) {
    await this.stores.get(tenantId, storeId);
    const rows = await this.db.discount.findMany({
      where: { storeId, getorioTenantId: tenantId },
      orderBy: { createdAt: 'desc' },
      take: MAX_DISCOUNTS,
    });
    const stats = await this.db.order.groupBy({
      by: ['discountId'],
      where: { storeId, discountId: { in: rows.map((r) => r.id) }, status: { not: 'cancelled' } },
      _count: { _all: true },
      _sum: { total: true, discountTotal: true },
    });
    const byId = new Map(stats.map((s) => [s.discountId, s]));
    const now = new Date();
    const items = rows.map((d) => {
      const s = byId.get(d.id);
      return {
        ...toDto(d, now),
        orders: s?._count._all ?? 0,
        sales: (s?._sum.total ?? 0).toFixed(2),
        discounted: (s?._sum.discountTotal ?? 0).toFixed(2),
      };
    });
    return {
      items,
      totals: {
        active: items.filter((i) => i.status === 'active').length,
        orders: items.reduce((n, i) => n + i.orders, 0),
        sales: items.reduce((n, i) => n + Number(i.sales), 0).toFixed(2),
        discounted: items.reduce((n, i) => n + Number(i.discounted), 0).toFixed(2),
      },
    };
  }

  async create(session: Session, storeId: string, raw: unknown) {
    await this.stores.get(session.getorioTenantId, storeId);
    const input = createDiscountSchema.parse(raw);
    checkDates(input.startsAt, input.endsAt);
    const count = await this.db.discount.count({ where: { storeId } });
    if (count >= MAX_DISCOUNTS) throw conflict(`A store can have at most ${MAX_DISCOUNTS} codes`);
    if (
      await this.db.discount.findUnique({ where: { storeId_code: { storeId, code: input.code } } })
    )
      throw conflict('A discount with this code already exists');
    const discount = await this.db.discount.create({
      data: {
        id: newId(),
        storeId,
        getorioTenantId: session.getorioTenantId,
        code: input.code,
        description: input.description || null,
        type: input.type,
        value: input.type === 'free_shipping' ? '0.00' : input.value,
        maxDiscount: input.type === 'percentage' ? (input.maxDiscount ?? null) : null,
        minSubtotal: input.minSubtotal ?? null,
        usageLimit: input.usageLimit ?? null,
        perCustomerLimit: input.perCustomerLimit ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        active: input.active ?? true,
      },
    });
    await this.audit(session, storeId, 'discount.created', { code: discount.code });
    return toDto(discount);
  }

  async update(session: Session, storeId: string, discountId: string, raw: unknown) {
    const current = await this.find(session.getorioTenantId, storeId, discountId);
    const input = updateDiscountSchema.parse(raw);
    const type = input.type ?? current.type;
    if (
      input.type &&
      input.value === undefined &&
      type !== 'free_shipping' &&
      input.type !== current.type
    )
      throw new AppError(400, 'validation_error', 'Set a value for the new discount type');
    const problem = valueProblem(type, input.value ?? current.value.toFixed(2));
    if (problem)
      throw new AppError(400, 'validation_error', problem, [{ path: 'value', message: problem }]);
    const startsAt = input.startsAt ?? current.startsAt.toISOString();
    const endsAt = input.endsAt === undefined ? current.endsAt?.toISOString() : input.endsAt;
    checkDates(startsAt, endsAt);
    if (input.code && input.code !== current.code) {
      if (
        await this.db.discount.findUnique({
          where: { storeId_code: { storeId, code: input.code } },
        })
      )
        throw conflict('A discount with this code already exists');
    }
    const discount = await this.db.discount.update({
      where: { id: current.id },
      data: {
        ...(input.code ? { code: input.code } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        type,
        ...(type === 'free_shipping'
          ? { value: '0.00' }
          : input.value !== undefined
            ? { value: input.value }
            : {}),
        ...(type !== 'percentage'
          ? { maxDiscount: null }
          : input.maxDiscount !== undefined
            ? { maxDiscount: input.maxDiscount }
            : {}),
        ...(input.minSubtotal !== undefined ? { minSubtotal: input.minSubtotal } : {}),
        ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
        ...(input.perCustomerLimit !== undefined
          ? { perCustomerLimit: input.perCustomerLimit }
          : {}),
        ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await this.audit(session, storeId, 'discount.updated', { code: discount.code });
    return toDto(discount);
  }

  async remove(session: Session, storeId: string, discountId: string) {
    const current = await this.find(session.getorioTenantId, storeId, discountId);
    // Orders keep their code and amount snapshots; their link is set to null.
    await this.db.discount.delete({ where: { id: current.id } });
    await this.audit(session, storeId, 'discount.deleted', { code: current.code });
  }

  private async find(tenantId: string, storeId: string, discountId: string) {
    await this.stores.get(tenantId, storeId);
    const d = await this.db.discount.findFirst({
      where: { id: discountId, storeId, getorioTenantId: tenantId },
    });
    if (!d) throw notFound('Discount');
    return d;
  }

  private async audit(session: Session, storeId: string, action: string, metadata: object) {
    await this.db.auditLog.create({
      data: {
        id: newId(),
        storeId,
        getorioTenantId: session.getorioTenantId,
        actor: `merchant:${session.merchantId}`,
        action,
        metadata: JSON.parse(JSON.stringify(metadata)),
      },
    });
  }
}

function checkDates(startsAt?: string | null, endsAt?: string | null) {
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))
    throw new AppError(400, 'validation_error', 'End date must be after the start date', [
      { path: 'endsAt', message: 'End date must be after the start date' },
    ]);
}

export type DiscountStatus = 'active' | 'scheduled' | 'expired' | 'used_up' | 'disabled';

export function discountStatus(d: Discount, now = new Date()): DiscountStatus {
  if (!d.active) return 'disabled';
  if (d.endsAt && d.endsAt <= now) return 'expired';
  if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return 'used_up';
  if (d.startsAt > now) return 'scheduled';
  return 'active';
}

/** Customer-facing one-liner, e.g. "20% off (up to Rs 500) on orders over Rs 2,000". */
export function describeDiscount(d: Discount) {
  const amount = (v: { toFixed(n: number): string }) =>
    `Rs ${Number(v.toFixed(2)).toLocaleString('en-PK')}`;
  const main =
    d.type === 'percentage'
      ? `${Number(d.value.toFixed(2))}% off${d.maxDiscount ? ` (up to ${amount(d.maxDiscount)})` : ''}`
      : d.type === 'fixed'
        ? `${amount(d.value)} off`
        : 'Free delivery';
  return d.minSubtotal ? `${main} on orders over ${amount(d.minSubtotal)}` : main;
}

export function toDto(d: Discount, now = new Date()) {
  return {
    id: d.id,
    code: d.code,
    description: d.description,
    summary: describeDiscount(d),
    type: d.type,
    value: d.value.toFixed(2),
    maxDiscount: d.maxDiscount?.toFixed(2) ?? null,
    minSubtotal: d.minSubtotal?.toFixed(2) ?? null,
    usageLimit: d.usageLimit,
    perCustomerLimit: d.perCustomerLimit,
    usedCount: d.usedCount,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt?.toISOString() ?? null,
    active: d.active,
    status: discountStatus(d, now),
    createdAt: d.createdAt.toISOString(),
  };
}
