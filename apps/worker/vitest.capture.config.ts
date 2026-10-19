import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Node's process exists here (vitest config runs in Node) but the Worker tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Placeholders so wrangler does not warn about missing required secrets (see vitest.config.ts).
process.env['DISCORD_CLIENT_SECRET'] ??= 'test-only-client-secret';
process.env['DISCORD_BOT_TOKEN'] ??= 'test-only-bot-token';

/**
 * The config of `pnpm fixtures:capture`: only `test/capture/**`, which the normal config leaves out.
 * `scripts/capture-fixtures.mjs` runs vitest with it.
 */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    include: ['test/capture/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
