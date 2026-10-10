import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The RNG and odds tests draw 100k–1M seeded values on purpose. On a busy CI runner (all
    // packages test in parallel) they can pass the 5 s default, so allow more time.
    testTimeout: 30_000,
  },
});
