import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Node's process exists here (vitest config runs in Node) but the Worker tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Placeholders so wrangler does not warn about missing required secrets (see vitest.config.ts).
process.env['DISCORD_CLIENT_SECRET'] ??= 'test-only-client-secret';
process.env['DISCORD_BOT_TOKEN'] ??= 'test-only-bot-token';

/**
 * The config of `pnpm --filter @creatures/worker month:local`: only the simulated month's local dry run (`test/valley-month.local.test.ts`),
 * which the normal config leaves out because a month is too slow for the suite.
 */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    include: ['test/valley-month.local.test.ts'],
    testTimeout: 1_200_000,
    // The month's own console output is the answer.
    disableConsoleIntercept: true,
  },
});
