/** Client-safe money helpers (no schema imports, keeps product page bundles small). */
export function formatMoney(amount: string | number, currency: string): string {
  const value = Number(amount);
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    // Whole amounts show no decimals (Rs 3,400); others always two (Rs 99.50).
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/** Decimal string → integer paisa. */
export function toMinor(amount: string): number {
  const [whole = '0', frac = ''] = amount.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

export function fromMinor(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}
