import { describe, expect, it } from 'vitest';
import { baseShippingFee, cityShippingRatesSchema, normalizeCity } from '../src';

const rules = {
  shippingFlatFee: '300.00',
  freeShippingThreshold: null,
  cityShippingRates: [
    { city: 'Karachi', fee: '150.00' },
    { city: 'Dera Ghazi Khan', fee: '450' },
  ],
};

describe('city shipping rates', () => {
  it('uses the city rate when the city matches, ignoring case and spacing', () => {
    expect(baseShippingFee(rules, 'karachi')).toBe('150.00');
    expect(baseShippingFee(rules, '  dera   ghazi KHAN ')).toBe('450');
    expect(normalizeCity(' Lahore Cantt ')).toBe('lahore cantt');
  });

  it('falls back to the flat fee', () => {
    expect(baseShippingFee(rules, 'Lahore')).toBe('300.00');
    expect(baseShippingFee(rules, undefined)).toBe('300.00');
    expect(baseShippingFee({ ...rules, cityShippingRates: [] }, 'Karachi')).toBe('300.00');
  });

  it('validates the rate list', () => {
    expect(cityShippingRatesSchema.safeParse(rules.cityShippingRates).success).toBe(true);
    for (const bad of [
      [
        { city: 'Karachi', fee: '1' },
        { city: ' karachi', fee: '2' },
      ],
      [{ city: '<script>', fee: '1' }],
      [{ city: 'Karachi', fee: '-5' }],
      [{ city: '', fee: '5' }],
      Array.from({ length: 51 }, (_, i) => ({ city: `City ${'x'.repeat(i)}`, fee: '1' })),
    ]) {
      expect(cityShippingRatesSchema.safeParse(bad).success).toBe(false);
    }
  });
});
