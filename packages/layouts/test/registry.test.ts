import { contrastRatio, layoutIdSchema, navbarSchema, themeSchema } from '@microstore/site-schema';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_ID, getLayout, isKnownLayout, LAYOUTS } from '../src';

describe('layout registry', () => {
  it('has unique, valid ids and valid defaults', () => {
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
    for (const l of LAYOUTS) {
      expect(layoutIdSchema.safeParse(l.id).success).toBe(true);
      expect(l.defaults.layoutId).toBe(l.id);
      expect(themeSchema.safeParse(l.defaults.theme).success).toBe(true);
      expect(navbarSchema.safeParse(l.defaults.navbar).success).toBe(true);
    }
  });

  it('ships WCAG AA contrast defaults (FR-3.2)', () => {
    for (const { defaults } of LAYOUTS) {
      expect(
        contrastRatio(defaults.theme.textColor, defaults.theme.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(defaults.navbar.textColor, defaults.navbar.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('looks layouts up by id', () => {
    expect(getLayout('classic-01')?.name).toBe('Classic');
    expect(getLayout('nope')).toBeUndefined();
    expect(isKnownLayout(DEFAULT_LAYOUT_ID)).toBe(true);
    expect(isKnownLayout('nope')).toBe(false);
  });
});
