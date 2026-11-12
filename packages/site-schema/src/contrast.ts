import { HEX_COLOR_REGEX } from './primitives';

/** WCAG 2.1 AA minimum contrast for normal-size text. */
export const WCAG_AA_NORMAL = 4.5;
/** WCAG 2.1 AA minimum contrast for large text (18pt / 14pt bold). */
export const WCAG_AA_LARGE = 3;

function expandHex(hex: string): string {
  if (!HEX_COLOR_REGEX.test(hex)) throw new Error(`Invalid hex color: ${hex}`);
  const h = hex.slice(1);
  return h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = expandHex(hex);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two hex colors, from 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function meetsWcagAA(
  foreground: string,
  background: string,
  { largeText = false } = {},
): boolean {
  return contrastRatio(foreground, background) >= (largeText ? WCAG_AA_LARGE : WCAG_AA_NORMAL);
}
