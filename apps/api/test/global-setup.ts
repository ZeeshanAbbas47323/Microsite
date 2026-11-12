import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/**
 * Applies pending Prisma migrations to the MySQL test database once per run (non-destructive;
 * tests clear rows themselves in `resetDb`).
 */
export default function setup() {
  config({ path: '../../.env', quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');
  if (!new URL(url).pathname.slice(1).endsWith('_test')) {
    throw new Error('DATABASE_URL_TEST must point at a database whose name ends in _test');
  }
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
  process.env.DATABASE_URL = url;
}
