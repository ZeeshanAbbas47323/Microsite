import { z } from 'zod';

/**
 * Money on the wire is a decimal string with up to 2 fraction digits ("1499", "1499.5", "1499.50"),
 * matching MySQL DECIMAL(12,2). Do arithmetic in integer minor units (paisa), never in floats.
 */
export const MONEY_REGEX = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

export const moneySchema = z
  .string()
  .regex(MONEY_REGEX, { error: 'Must be a decimal amount like 1499.00' });
export type Money = z.infer<typeof moneySchema>;

export function toMinorUnits(amount: Money): number {
  if (!MONEY_REGEX.test(amount)) throw new Error(`Invalid money amount: ${amount}`);
  const [whole = '0', fraction = ''] = amount.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function fromMinorUnits(minor: number): Money {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid minor amount: ${minor}`);
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}
