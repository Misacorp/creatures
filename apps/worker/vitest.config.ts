import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { configDefaults, defineConfig } from 'vitest/config';

// Node's process exists here (vitest config runs in Node) but the Worker tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Placeholders so wrangler does not warn about missing required secrets. Tests inject a fake
// Discord client and never use these values.
process.env['DISCORD_CLIENT_SECRET'] ??= 'test-only-client-secret';
process.env['DISCORD_BOT_TOKEN'] ??= 'test-only-bot-token';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    // Some tests drive many requests through a Durable Object (for example 50 expedition trips).
    // They take well under 2 s alone, but on a busy CI runner (all packages test in parallel) they
    // can pass the 5 s default, so allow more time, as the engine and game packages do.
    testTimeout: 30_000,
    // scripts/*.test.mjs are node:test files (plain Node scripts), run by `node --test`.
    // test/capture/** is the fixture capture (`pnpm fixtures:capture`, vitest.capture.config.ts).
    exclude: [...configDefaults.exclude, 'scripts/**', 'test/capture/**'],
  },
});
