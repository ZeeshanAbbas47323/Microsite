import { z } from 'zod';

/** Same city typed differently ("  karachi ", "Karachi") must match one rate. */
export function normalizeCity(city: string): string {
  return city.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export const MAX_CITY_RATES = 50;

const money = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Must be an amount like 250 or 250.00');

/** Per-city delivery fees (Phase 3). A matching city replaces the flat fee. */
export const cityShippingRatesSchema = z
  .array(
    z.strictObject({
      city: z
        .string()
        .trim()
        .min(1, 'Enter a city')
        .max(60)
        .regex(/^[\p{L}\p{M} .'-]+$/u, 'Use letters only'),
      fee: money,
    }),
  )
  .max(MAX_CITY_RATES)
  .refine(
    (rates) => new Set(rates.map((r) => normalizeCity(r.city))).size === rates.length,
    'Each city can only be listed once',
  );
export type CityShippingRate = z.infer<typeof cityShippingRatesSchema>[number];

export interface ShippingRules {
  shippingFlatFee: string;
  freeShippingThreshold: string | null;
  cityShippingRates?: readonly CityShippingRate[];
}

/** Delivery fee before the free-shipping threshold: the city's rate, else the flat fee. */
export function baseShippingFee(rules: ShippingRules, city: string | undefined): string {
  if (city && rules.cityShippingRates?.length) {
    const key = normalizeCity(city);
    const match = rules.cityShippingRates.find((r) => normalizeCity(r.city) === key);
    if (match) return match.fee;
  }
  return rules.shippingFlatFee;
}
