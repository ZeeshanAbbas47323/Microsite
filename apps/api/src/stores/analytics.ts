import { Prisma } from '../generated/prisma/client';
import type { Db } from '../db';
import type { StoreService } from './store-service';

/** Pakistan Standard Time has no daylight saving, so a fixed offset is exact. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Calendar day in Pakistan (YYYY-MM-DD) for an instant. */
export function karachiDay(at: Date): string {
  return new Date(at.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Crawlers and link previews are not visits. */
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|lighthouse/i;

export const ANALYTICS_RANGES = [7, 30, 90] as const;

export interface AnalyticsDay {
  date: string;
  visits: number;
  pageViews: number;
  orders: number;
  revenue: string;
}

/**
 * Phase 3 analytics: visits, page views, orders and conversion per store and day. Visits are
 * counted from a storefront beacon (one per browser session); nothing about the visitor is kept.
 */
export class AnalyticsService {
  constructor(
    private readonly db: Db,
    private readonly stores: StoreService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Returns false when the hit was ignored (bot). */
  async recordPageView(
    store: { id: string; getorioTenantId: string },
    { newVisit, userAgent }: { newVisit: boolean; userAgent: string | undefined },
  ): Promise<boolean> {
    if (!userAgent || BOT_UA.test(userAgent)) return false;
    const day = karachiDay(this.now());
    const visits = newVisit ? 1 : 0;
    // Single statement so concurrent hits never race on the first row of the day.
    await this.db.$executeRaw`
      INSERT INTO store_daily_stats (store_id, getorio_tenant_id, day, visits, page_views, updated_at)
      VALUES (${store.id}, ${store.getorioTenantId}, ${day}, ${visits}, 1, NOW(3))
      ON DUPLICATE KEY UPDATE
        visits = visits + VALUES(visits),
        page_views = page_views + 1,
        updated_at = NOW(3)`;
    return true;
  }

  async summary(tenantId: string, storeId: string, days: number) {
    await this.stores.get(tenantId, storeId); // ownership check
    const today = karachiDay(this.now());
    const first = new Date(`${today}T00:00:00.000Z`);
    first.setUTCDate(first.getUTCDate() - (days - 1));
    const previousFirst = new Date(first);
    previousFirst.setUTCDate(previousFirst.getUTCDate() - days);

    const [current, previous, topProducts, statuses] = await Promise.all([
      this.window(tenantId, storeId, first, days),
      this.window(tenantId, storeId, previousFirst, days),
      this.topProducts(tenantId, storeId, first),
      this.db.order.groupBy({
        by: ['status'],
        where: {
          storeId,
          getorioTenantId: tenantId,
          createdAt: { gte: new Date(first.getTime() - PKT_OFFSET_MS) },
        },
        _count: { _all: true },
      }),
    ]);

    return {
      from: first.toISOString().slice(0, 10),
      to: today,
      totals: current.totals,
      /** The same number of days just before, for "vs previous period". */
      previous: previous.totals,
      days: current.days,
      topProducts,
      ordersByStatus: Object.fromEntries(statuses.map((s) => [s.status, s._count._all])),
    };
  }

  /** Daily series and totals for `days` Pakistan days starting at `first`. */
  private async window(tenantId: string, storeId: string, first: Date, days: number) {
    const end = new Date(first);
    end.setUTCDate(end.getUTCDate() + days);
    // Midnight in Pakistan, as UTC, for the orders query.
    const since = new Date(first.getTime() - PKT_OFFSET_MS);
    const until = new Date(end.getTime() - PKT_OFFSET_MS);

    const [stats, orders] = await Promise.all([
      this.db.storeDailyStat.findMany({
        where: { storeId, getorioTenantId: tenantId, day: { gte: first, lt: end } },
      }),
      this.db.$queryRaw<{ day: string; orders: bigint; revenue: Prisma.Decimal | null }[]>`
        SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL 5 HOUR), '%Y-%m-%d') AS day,
               COUNT(*) AS orders, SUM(total) AS revenue
        FROM orders
        WHERE store_id = ${storeId} AND getorio_tenant_id = ${tenantId}
          AND created_at >= ${since} AND created_at < ${until} AND status <> 'cancelled'
        GROUP BY day`,
    ]);

    const byDay = new Map<string, AnalyticsDay>();
    for (let i = 0; i < days; i++) {
      const d = new Date(first);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      byDay.set(date, { date, visits: 0, pageViews: 0, orders: 0, revenue: '0.00' });
    }
    for (const s of stats) {
      const row = byDay.get(s.day.toISOString().slice(0, 10));
      if (row) Object.assign(row, { visits: s.visits, pageViews: s.pageViews });
    }
    for (const o of orders) {
      const row = byDay.get(o.day);
      if (row)
        Object.assign(row, {
          orders: Number(o.orders),
          revenue: new Prisma.Decimal(o.revenue ?? 0).toFixed(2),
        });
    }

    const series = [...byDay.values()];
    const visits = series.reduce((n, d) => n + d.visits, 0);
    const orderCount = series.reduce((n, d) => n + d.orders, 0);
    const revenue = series
      .reduce((sum, d) => sum.plus(d.revenue), new Prisma.Decimal(0))
      .toFixed(2);
    return {
      days: series,
      totals: {
        visits,
        pageViews: series.reduce((n, d) => n + d.pageViews, 0),
        orders: orderCount,
        revenue,
        /** Orders per visit, 0–1; null without visits. */
        // Capped: orders from before visits were counted (or from shared carts) can outnumber visits.
        conversionRate:
          visits > 0 ? Math.min(1, Math.round((orderCount / visits) * 10_000) / 10_000) : null,
      },
    };
  }

  /** Best sellers since `first` (cancelled orders excluded), by sales. */
  private async topProducts(tenantId: string, storeId: string, first: Date) {
    const rows = await this.db.$queryRaw<
      { productId: string; name: string; qty: Prisma.Decimal | bigint; revenue: Prisma.Decimal }[]
    >`
      SELECT i.getorio_product_id AS productId, MAX(i.name_snapshot) AS name,
             SUM(i.qty) AS qty, SUM(i.line_total) AS revenue
      FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.store_id = ${storeId} AND o.getorio_tenant_id = ${tenantId}
        AND o.created_at >= ${new Date(first.getTime() - PKT_OFFSET_MS)} AND o.status <> 'cancelled'
      GROUP BY i.getorio_product_id
      ORDER BY revenue DESC
      LIMIT 5`;
    return rows.map((r) => ({
      productId: r.productId,
      // Variant names are stored as "Product - Size 9"; show the product.
      name: r.name.split(' - ')[0] ?? r.name,
      qty: Number(r.qty),
      revenue: new Prisma.Decimal(r.revenue).toFixed(2),
    }));
  }

  /** Latest orders and design events, newest first (customer first names only). */
  async activity(tenantId: string, storeId: string) {
    await this.stores.get(tenantId, storeId);
    const [orders, versions] = await Promise.all([
      this.db.order.findMany({
        where: { storeId, getorioTenantId: tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          orderRef: true,
          customerName: true,
          total: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
      this.db.siteVersion.findMany({
        where: { storeId, getorioTenantId: tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { kind: true, source: true, createdAt: true },
      }),
    ]);
    const events = [
      ...orders.map((o) => ({
        type: 'order' as const,
        at: o.createdAt.toISOString(),
        orderRef: o.orderRef,
        customer: o.customerName.split(/\s+/)[0] ?? '',
        total: o.total.toFixed(2),
        currency: o.currency,
        status: o.status,
      })),
      ...versions.map((v) => ({
        type: 'design' as const,
        at: v.createdAt.toISOString(),
        kind: v.kind,
        source: v.source,
      })),
    ];
    return { events: events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15) };
  }
}
