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
    const firstDay = first.toISOString().slice(0, 10);
    // Midnight in Pakistan, as UTC, for the orders query.
    const since = new Date(first.getTime() - PKT_OFFSET_MS);

    const [stats, orders] = await Promise.all([
      this.db.storeDailyStat.findMany({
        where: { storeId, getorioTenantId: tenantId, day: { gte: first } },
      }),
      this.db.$queryRaw<{ day: string; orders: bigint; revenue: Prisma.Decimal | null }[]>`
        SELECT DATE_FORMAT(DATE_ADD(created_at, INTERVAL 5 HOUR), '%Y-%m-%d') AS day,
               COUNT(*) AS orders, SUM(total) AS revenue
        FROM orders
        WHERE store_id = ${storeId} AND getorio_tenant_id = ${tenantId}
          AND created_at >= ${since} AND status <> 'cancelled'
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
      from: firstDay,
      to: today,
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
      days: series,
    };
  }
}
