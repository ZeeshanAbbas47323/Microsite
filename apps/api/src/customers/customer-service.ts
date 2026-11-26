import { z } from 'zod';
import type { Session } from '../auth/sessions';
import type { Db } from '../db';
import type { Customer, Prisma } from '../generated/prisma/client';
import { notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { karachiDay } from '../stores/analytics';
import type { StoreService } from '../stores/store-service';

export const CUSTOMER_SORTS = [
  'lastOrderAt',
  'totalSpent',
  'ordersCount',
  'createdAt',
  'name',
] as const;
export const CUSTOMER_SEGMENTS = [
  'all',
  'registered',
  'guest',
  'repeat',
  'new',
  'inactive',
] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

/** Customers with no order for this long count as inactive ("at risk"). */
export const INACTIVE_DAYS = 60;
const NEW_DAYS = 30;
const DAY_MS = 86_400_000;
const PKT_OFFSET_MS = 5 * 3600_000;

export interface CustomerListQuery {
  page: number;
  pageSize: number;
  search?: string;
  segment?: CustomerSegment;
  sort?: (typeof CUSTOMER_SORTS)[number];
  dir?: 'asc' | 'desc';
}

export const customerUpdateSchema = z
  .strictObject({
    notes: z.string().trim().max(1000).nullable().optional(),
    tags: z
      .array(z.string().trim().min(1).max(30))
      .max(10)
      .transform((t) => [...new Set(t)])
      .optional(),
  })
  .refine((v) => v.notes !== undefined || v.tags !== undefined, { error: 'Nothing to update' });

/** The merchant's view of the store's customers (FR: Shopify-style profiles), tenant scoped. */
export class CustomerService {
  constructor(
    private readonly db: Db,
    private readonly stores: StoreService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private segmentWhere(segment: CustomerSegment): Prisma.CustomerWhereInput {
    const now = this.now().getTime();
    switch (segment) {
      case 'registered':
        return { passwordHash: { not: null } };
      case 'guest':
        return { passwordHash: null };
      case 'repeat':
        return { ordersCount: { gte: 2 } };
      case 'new':
        return { createdAt: { gte: new Date(now - NEW_DAYS * DAY_MS) } };
      case 'inactive':
        return { lastOrderAt: { lt: new Date(now - INACTIVE_DAYS * DAY_MS) } };
      default:
        return {};
    }
  }

  async list(tenantId: string, storeId: string, q: CustomerListQuery) {
    await this.stores.get(tenantId, storeId);
    const search = q.search?.trim();
    const digits = (search ?? '').replace(/\D/g, '').replace(/^(92|0)/, '');
    const base: Prisma.CustomerWhereInput = {
      storeId,
      getorioTenantId: tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search.toLowerCase() } },
              { lastCity: { contains: search } },
              ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {}),
    };
    const segment = q.segment ?? 'all';
    const where = { ...base, ...this.segmentWhere(segment) };
    const sort = q.sort ?? 'lastOrderAt';
    const dir = q.dir ?? 'desc';
    const [rows, total, counts, sum] = await Promise.all([
      this.db.customer.findMany({
        where,
        orderBy: [
          sort === 'lastOrderAt' ? { lastOrderAt: { sort: dir, nulls: 'last' } } : { [sort]: dir },
          { createdAt: 'desc' },
        ],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.customer.count({ where }),
      Promise.all(
        CUSTOMER_SEGMENTS.map(async (s) => [
          s,
          await this.db.customer.count({ where: { ...base, ...this.segmentWhere(s) } }),
        ]),
      ),
      this.db.customer.aggregate({ where, _sum: { totalSpent: true } }),
    ]);
    return {
      items: rows.map((c) => this.toDto(c)),
      total,
      page: q.page,
      pageSize: q.pageSize,
      segmentCounts: Object.fromEntries(counts) as Record<CustomerSegment, number>,
      totalSpent: (sum._sum.totalSpent ?? 0).toFixed(2),
    };
  }

  async get(tenantId: string, storeId: string, customerId: string) {
    const c = await this.find(tenantId, storeId, customerId, { addresses: true });
    const [orders, items, codes, cancelled] = await Promise.all([
      this.db.order.findMany({
        where: { customerId: c.id, storeId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { _count: { select: { items: true } } },
      }),
      this.db.orderItem.groupBy({
        by: ['getorioProductId', 'nameSnapshot'],
        where: { order: { customerId: c.id, storeId, status: { not: 'cancelled' } } },
        _sum: { qty: true, lineTotal: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 5,
      }),
      this.db.order.groupBy({
        by: ['discountCode'],
        where: { customerId: c.id, storeId, discountCode: { not: null } },
        _count: { _all: true },
        _sum: { discountTotal: true },
      }),
      this.db.order.count({ where: { customerId: c.id, storeId, status: 'cancelled' } }),
    ]);
    const paid = c.ordersCount - cancelled;
    // Days between orders, from the first to the latest (null with fewer than two).
    const span =
      c.firstOrderAt && c.lastOrderAt && paid >= 2
        ? Math.round((c.lastOrderAt.getTime() - c.firstOrderAt.getTime()) / DAY_MS / (paid - 1))
        : null;
    // Orders per Pakistan month for the last 12 months, for the profile's sparkline.
    const months: { month: string; orders: number; spent: string }[] = [];
    const nowPk = new Date(this.now().getTime() + PKT_OFFSET_MS);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(nowPk.getUTCFullYear(), nowPk.getUTCMonth() - i, 1));
      months.push({ month: d.toISOString().slice(0, 7), orders: 0, spent: '0.00' });
    }
    for (const o of orders) {
      const m = months.find((x) => x.month === karachiDay(o.createdAt).slice(0, 7));
      if (m && o.status !== 'cancelled') {
        m.orders += 1;
        m.spent = (Number(m.spent) + Number(o.total)).toFixed(2);
      }
    }
    return {
      ...this.toDto(c),
      notes: c.notes,
      acceptsMarketing: c.acceptsMarketing,
      lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
      registeredAt: c.registeredAt?.toISOString() ?? null,
      addresses: c.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        name: a.name,
        phone: a.phone,
        address: a.address,
        city: a.city,
        isDefault: a.isDefault,
      })),
      stats: {
        averageOrder: paid > 0 ? (Number(c.totalSpent) / paid).toFixed(2) : '0.00',
        cancelledOrders: cancelled,
        daysBetweenOrders: span,
        discountSaved: codes.reduce((n, x) => n + Number(x._sum.discountTotal ?? 0), 0).toFixed(2),
        months,
      },
      topProducts: items.map((i) => ({
        productId: i.getorioProductId,
        name: i.nameSnapshot,
        qty: i._sum.qty ?? 0,
        total: (i._sum.lineTotal ?? 0).toFixed(2),
      })),
      discountCodes: codes.map((x) => ({
        code: x.discountCode as string,
        uses: x._count._all,
        saved: (x._sum.discountTotal ?? 0).toFixed(2),
      })),
      orders: orders.map((o) => ({
        id: o.id,
        orderRef: o.orderRef,
        status: o.status,
        total: o.total.toFixed(2),
        discountCode: o.discountCode,
        discountTotal: o.discountTotal.toFixed(2),
        city: o.city,
        address: o.address,
        itemCount: o._count.items,
        viaAccount: o.viaAccount,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  async update(session: Session, storeId: string, customerId: string, raw: unknown) {
    const c = await this.find(session.getorioTenantId, storeId, customerId);
    const input = customerUpdateSchema.parse(raw);
    await this.db.customer.update({
      where: { id: c.id },
      data: {
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
    });
    await this.db.auditLog.create({
      data: {
        id: newId(),
        storeId,
        getorioTenantId: session.getorioTenantId,
        actor: `merchant:${session.merchantId}`,
        action: 'customer.updated',
        metadata: { customerId: c.id, fields: Object.keys(input) },
      },
    });
    return this.get(session.getorioTenantId, storeId, customerId);
  }

  /**
   * Customer analytics for the last `days` Pakistan days: new vs returning customers per day,
   * repeat rate, lifetime value, best customers and cities.
   */
  async analytics(tenantId: string, storeId: string, days: number) {
    await this.stores.get(tenantId, storeId);
    const today = karachiDay(this.now());
    const firstDay = new Date(Date.parse(`${today}T00:00:00.000Z`) - (days - 1) * DAY_MS);
    const since = new Date(firstDay.getTime() - PKT_OFFSET_MS);
    const prevSince = new Date(since.getTime() - days * DAY_MS);
    const scope = { storeId, getorioTenantId: tenantId };

    const [orders, prevOrders, all, buyers, repeaters, registered, top, cities, marketing] =
      await Promise.all([
        this.db.order.findMany({
          where: { ...scope, createdAt: { gte: since }, status: { not: 'cancelled' } },
          select: {
            createdAt: true,
            total: true,
            customer: { select: { id: true, firstOrderAt: true } },
          },
        }),
        this.db.order.findMany({
          where: {
            ...scope,
            createdAt: { gte: prevSince, lt: since },
            status: { not: 'cancelled' },
          },
          select: { customer: { select: { id: true, firstOrderAt: true } } },
        }),
        this.db.customer.aggregate({
          where: scope,
          _count: { _all: true },
          _sum: { totalSpent: true, ordersCount: true },
        }),
        this.db.customer.count({ where: { ...scope, ordersCount: { gte: 1 } } }),
        this.db.customer.count({ where: { ...scope, ordersCount: { gte: 2 } } }),
        this.db.customer.count({ where: { ...scope, passwordHash: { not: null } } }),
        this.db.customer.findMany({
          where: { ...scope, ordersCount: { gte: 1 } },
          orderBy: { totalSpent: 'desc' },
          take: 5,
        }),
        this.db.customer.groupBy({
          by: ['lastCity'],
          where: { ...scope, lastCity: { not: null } },
          _count: { _all: true },
          _sum: { totalSpent: true },
          orderBy: { _count: { lastCity: 'desc' } },
          take: 6,
        }),
        this.db.customer.count({ where: { ...scope, acceptsMarketing: true } }),
      ]);

    const series = new Map<
      string,
      {
        date: string;
        new: Set<string>;
        returning: Set<string>;
        revenueNew: number;
        revenueReturning: number;
      }
    >();
    for (let i = 0; i < days; i++) {
      const date = new Date(firstDay.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      series.set(date, {
        date,
        new: new Set(),
        returning: new Set(),
        revenueNew: 0,
        revenueReturning: 0,
      });
    }
    const periodNew = new Set<string>();
    const periodReturning = new Set<string>();
    let revenueNew = 0;
    let revenueReturning = 0;
    for (const o of orders) {
      if (!o.customer) continue;
      const day = series.get(karachiDay(o.createdAt));
      if (!day) continue;
      // "New" = the customer's first order falls in this same day.
      const isNew = o.customer.firstOrderAt
        ? karachiDay(o.customer.firstOrderAt) === day.date
        : true;
      const total = Number(o.total);
      if (isNew) {
        day.new.add(o.customer.id);
        day.revenueNew += total;
        revenueNew += total;
      } else {
        day.returning.add(o.customer.id);
        day.revenueReturning += total;
        revenueReturning += total;
      }
    }
    for (const o of orders) {
      if (!o.customer) continue;
      const first = o.customer.firstOrderAt;
      if (first && first >= since) periodNew.add(o.customer.id);
      else periodReturning.add(o.customer.id);
    }
    const prevNew = new Set(
      prevOrders.flatMap((o) =>
        o.customer?.firstOrderAt &&
        o.customer.firstOrderAt >= prevSince &&
        o.customer.firstOrderAt < since
          ? [o.customer.id]
          : [],
      ),
    );
    const prevActive = new Set(prevOrders.flatMap((o) => (o.customer ? [o.customer.id] : [])));

    const totalSpent = Number(all._sum.totalSpent ?? 0);
    return {
      days,
      from: firstDay.toISOString().slice(0, 10),
      to: today,
      totals: {
        customers: all._count._all,
        buyers,
        registered,
        acceptsMarketing: marketing,
        repeatCustomers: repeaters,
        repeatRate: buyers ? Math.round((repeaters / buyers) * 1000) / 10 : 0,
        lifetimeValue: buyers ? (totalSpent / buyers).toFixed(2) : '0.00',
        ordersPerCustomer: buyers
          ? Math.round(((all._sum.ordersCount ?? 0) / buyers) * 10) / 10
          : 0,
      },
      period: {
        activeCustomers: new Set([...periodNew, ...periodReturning]).size,
        newCustomers: periodNew.size,
        returningCustomers: periodReturning.size,
        revenueNew: revenueNew.toFixed(2),
        revenueReturning: revenueReturning.toFixed(2),
        previousActiveCustomers: prevActive.size,
        previousNewCustomers: prevNew.size,
      },
      series: [...series.values()].map((d) => ({
        date: d.date,
        newCustomers: d.new.size,
        returningCustomers: d.returning.size,
        revenueNew: d.revenueNew.toFixed(2),
        revenueReturning: d.revenueReturning.toFixed(2),
      })),
      topCustomers: top.map((c) => this.toDto(c)),
      cities: cities.map((c) => ({
        city: c.lastCity as string,
        customers: c._count._all,
        spent: (c._sum.totalSpent ?? 0).toFixed(2),
      })),
    };
  }

  private async find<I extends Prisma.CustomerInclude>(
    tenantId: string,
    storeId: string,
    customerId: string,
    include?: I,
  ) {
    await this.stores.get(tenantId, storeId);
    const c = await this.db.customer.findFirst({
      where: { id: customerId, storeId, getorioTenantId: tenantId },
      ...(include ? { include } : {}),
    });
    if (!c) throw notFound('Customer');
    return c as Prisma.CustomerGetPayload<{ include: I }>;
  }

  private toDto(c: Customer) {
    const now = this.now().getTime();
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.lastCity,
      registered: c.passwordHash !== null,
      tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
      ordersCount: c.ordersCount,
      totalSpent: c.totalSpent.toFixed(2),
      firstOrderAt: c.firstOrderAt?.toISOString() ?? null,
      lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
      inactive: c.lastOrderAt ? now - c.lastOrderAt.getTime() > INACTIVE_DAYS * DAY_MS : false,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
