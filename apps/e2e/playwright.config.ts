import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

config({ path: '../../.env', quiet: true });

const port = process.env.WEB_PORT ?? '3000';

/**
 * End-to-end tests against a running stack (API with the order-sync worker + web), e.g.
 * `pnpm --filter @microstore/api dev` and `pnpm --filter @microstore/web dev`, or Docker.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
