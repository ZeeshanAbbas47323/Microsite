import { CURRENT_SCHEMA_VERSION } from './constants';
import { siteConfigSchema, type SiteConfig } from './config';

export type RawConfig = Record<string, unknown>;

/** Upgrades a config from version N to N + 1. Receives a deep copy, may mutate and return it. */
export type Migration = (config: RawConfig) => RawConfig;

/**
 * Registered migrations, keyed by the version they upgrade FROM.
 * Example for a future v2: `1: (c) => ({ ...c, newField: 'default' })`.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class SiteConfigMigrationError extends Error {
  override readonly name = 'SiteConfigMigrationError';
}

function isPlainObject(value: unknown): value is RawConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getConfigVersion(input: unknown): number {
  if (!isPlainObject(input)) throw new SiteConfigMigrationError('Site config must be an object');
  const { version } = input;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SiteConfigMigrationError('Site config has no valid "version"');
  }
  return version;
}

export function needsMigration(
  input: unknown,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): boolean {
  return getConfigVersion(input) < targetVersion;
}

/** Runs the migration chain without validating the result. Exposed for tests and tooling. */
export function runMigrations(
  input: unknown,
  migrations: Readonly<Record<number, Migration>>,
  targetVersion: number,
): RawConfig {
  let version = getConfigVersion(input);
  if (version > targetVersion) {
    throw new SiteConfigMigrationError(
      `Site config version ${version} is newer than the supported version ${targetVersion}`,
    );
  }
  let config = structuredClone(input) as RawConfig;
  while (version < targetVersion) {
    const migrate = migrations[version];
    if (!migrate)
      throw new SiteConfigMigrationError(`No migration registered from version ${version}`);
    config = migrate(config);
    version += 1;
    config.version = version;
  }
  return config;
}

/**
 * Brings any stored config up to the current schema version and validates it.
 * Call this on every config read from the database.
 */
export function migrateSiteConfig(input: unknown): SiteConfig {
  return siteConfigSchema.parse(runMigrations(input, MIGRATIONS, CURRENT_SCHEMA_VERSION));
}
