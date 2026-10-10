import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The property and description tests run hundreds of seeded fights on purpose. On a busy CI
    // runner (all packages test in parallel) they can pass the 5 s default, so allow more time.
    testTimeout: 30_000,
  },
});
