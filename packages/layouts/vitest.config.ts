import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'html', 'lcov'],
      // Presentational components: many style-only branches; core logic packages keep stricter limits.
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 65 },
    },
  },
});
