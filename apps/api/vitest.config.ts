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
    },
  },
});
