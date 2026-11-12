import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Integration tests share one MySQL test database.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts', 'src/worker.ts'],
      reporter: ['text', 'html', 'lcov'],
      // Spec §12: at least 80% on checkout, order sync and the rest of the core.
      thresholds: { lines: 85, statements: 85, functions: 80, branches: 75 },
    },
  },
});
