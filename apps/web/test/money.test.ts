import { describe, expect, it } from 'vitest';
import { formatMoney, fromMinor, toMinor } from '../src/lib/money';

describe('money', () => {
  it('converts decimal strings and minor units', () => {
    expect(toMinor('1499')).toBe(149900);
    expect(toMinor('1499.5')).toBe(149950);
    expect(fromMinor(149905)).toBe('1499.05');
  });
  it('formats PKR', () => {
    expect(formatMoney('3400.00', 'PKR')).toMatch(/3,400/);
    expect(formatMoney('99.50', 'PKR')).toMatch(/99\.50/);
  });
});
