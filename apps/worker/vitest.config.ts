import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Node's process exists here (vitest config runs in Node) but the Worker tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Placeholders so wrangler does not warn about missing required secrets. Tests inject a fake
// Discord client and never use these values.
process.env['DISCORD_CLIENT_SECRET'] ??= 'test-only-client-secret';
process.env['DISCORD_BOT_TOKEN'] ??= 'test-only-bot-token';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
});
