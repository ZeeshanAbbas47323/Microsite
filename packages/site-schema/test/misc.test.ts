import { describe, expect, it } from 'vitest';
import {
  checkSubdomain,
  contrastRatio,
  CURRENT_SCHEMA_VERSION,
  getConfigVersion,
  meetsWcagAA,
  migrateSiteConfig,
  needsMigration,
  relativeLuminance,
  runMigrations,
  SiteConfigMigrationError,
  subdomainSchema,
  type Migration,
} from '../src';
import { sampleConfig } from './fixtures';

describe('contrast', () => {
  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#1a73e8', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#1a73e8'),
      10,
    );
  });
  it('checks WCAG AA thresholds', () => {
    expect(meetsWcagAA('#777777', '#ffffff')).toBe(false);
    expect(meetsWcagAA('#777777', '#ffffff', { largeText: true })).toBe(true);
    expect(meetsWcagAA('#111111', '#ffffff')).toBe(true);
  });
  it('throws on invalid colors', () => {
    expect(() => relativeLuminance('red')).toThrow();
  });
});

describe('subdomains (FR-1.4)', () => {
  it.each(['abc', 'zara-crafts', 'shop123', 'a1-b2-c3', 'x'.repeat(30), '  MyShop  '])(
    'accepts %s',
    (v) => {
      expect(checkSubdomain(v).ok).toBe(true);
    },
  );
  it('normalizes case and whitespace', () => {
    expect(subdomainSchema.parse('  MyShop ')).toBe('myshop');
  });
  it.each([
    ['ab', 'too_short'],
    ['x'.repeat(31), 'too_long'],
    ['my_shop', 'invalid_characters'],
    ['my.shop', 'invalid_characters'],
    ['shop!', 'invalid_characters'],
    ['dükan', 'invalid_characters'],
    ['-shop', 'hyphen_at_edge'],
    ['shop-', 'hyphen_at_edge'],
    ['xn--shop', 'consecutive_hyphens'],
    ['www', 'reserved'],
    ['api', 'reserved'],
    ['admin', 'reserved'],
    ['dashboard', 'reserved'],
    ['static', 'reserved'],
    ['MAIL', 'reserved'],
  ])('rejects %s (%s)', (v, reason) => {
    const r = checkSubdomain(v);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
    expect(subdomainSchema.safeParse(v).success).toBe(false);
  });
});

describe('migrations (FR-2.6)', () => {
  it('passes a current config through unchanged', () => {
    const config = sampleConfig();
    expect(needsMigration(config)).toBe(false);
    expect(migrateSiteConfig(config)).toEqual(config);
  });

  it('rejects missing, invalid and future versions', () => {
    expect(() => getConfigVersion(null)).toThrow(SiteConfigMigrationError);
    expect(() => getConfigVersion([])).toThrow(SiteConfigMigrationError);
    expect(() => getConfigVersion({})).toThrow(/version/);
    expect(() => getConfigVersion({ version: 0 })).toThrow(SiteConfigMigrationError);
    expect(() => getConfigVersion({ version: 1.5 })).toThrow(SiteConfigMigrationError);
    expect(() =>
      migrateSiteConfig({ ...sampleConfig(), version: CURRENT_SCHEMA_VERSION + 1 }),
    ).toThrow(/newer than the supported/);
  });

  it('runs a migration chain in order without mutating the input', () => {
    const migrations: Record<number, Migration> = {
      1: (c) => ({ ...c, a: 'from-1' }),
      2: (c) => {
        c.b = `${String(c.a)}-then-2`;
        return c;
      },
    };
    const input = { version: 1, keep: true };
    const out = runMigrations(input, migrations, 3);
    expect(out).toEqual({ version: 3, keep: true, a: 'from-1', b: 'from-1-then-2' });
    expect(input).toEqual({ version: 1, keep: true });
    expect(needsMigration(input, 3)).toBe(true);
  });

  it('fails when a step is missing', () => {
    expect(() => runMigrations({ version: 1 }, {}, 2)).toThrow(
      /No migration registered from version 1/,
    );
  });

  it('validates the migrated result', () => {
    expect(() => migrateSiteConfig({ version: 1, layoutId: 'bold-01' })).toThrow();
  });
});
