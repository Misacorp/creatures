// Deploy-time Discord setup for the feedback command (docs/design/feedback.md). Run by the deploy
// job with plain `node` and the target environment's DISCORD_BOT_TOKEN:
//
//   node apps/worker/scripts/discord-app.mjs public-key <production|staging>
//     Reads the app's public key (`verify_key`, not a secret) and writes `public_key=<hex>` to
//     $GITHUB_OUTPUT, so the Worker can check interaction signatures. Warns when the app's
//     Interactions Endpoint URL is not this game's.
//   node apps/worker/scripts/discord-app.mjs register <production|staging>
//     Creates or updates the global `/feedback` command (`POST /applications/{id}/commands` replaces
//     a command of the same name and leaves the Activity's entry point command alone). Skipped when
//     Discord already has the same definition.
//
// Every failure is a warning and exit code 0: the game is already deployed, and the feedback
// command must never fail a deploy. The bot token is only sent to discord.com and never printed.
import { appendFileSync, readFileSync } from 'node:fs';

const API = 'https://discord.com/api/v10';
const HOSTS = { production: 'creatures.misacorp.dev', staging: 'creatures-staging.misacorp.dev' };
const TIMEOUT_MS = 15_000;

const [mode, target] = process.argv.slice(2);
const token = process.env.DISCORD_BOT_TOKEN ?? '';

function warn(message) {
  console.log(`::warning::feedback command (${target}): ${message}`);
}

function discord(path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': 'DiscordBot (https://github.com/Misacorp/creatures, 1)',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function currentApp() {
  const res = await discord('/applications/@me');
  if (!res.ok) throw new Error(`GET /applications/@me answered HTTP ${res.status}`);
  const app = await res.json();
  if (typeof app?.id !== 'string' || !/^\d{15,22}$/.test(app.id)) {
    throw new Error('the application id has the wrong shape');
  }
  return app;
}

async function publicKey() {
  const app = await currentApp();
  const key = app.verify_key;
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) {
    throw new Error('verify_key has the wrong shape');
  }
  const expected = `https://${HOSTS[target]}/api/discord/interactions`;
  if (app.interactions_endpoint_url !== expected) {
    warn(`the Interactions Endpoint URL in the Discord developer portal is not ${expected} yet.`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `public_key=${key}\n`);
  console.log(`public key read (${key.slice(0, 8)}...)`);
}

/** The fields we set, in a stable form, so an unchanged command is not sent again. */
function comparable(command) {
  return JSON.stringify({
    name: command.name,
    type: command.type ?? 1,
    description: command.description,
    contexts: [...(command.contexts ?? [])].sort(),
    integration_types: [...(command.integration_types ?? [])].sort(),
    options: command.options ?? [],
  });
}

async function register() {
  const command = JSON.parse(
    readFileSync(new URL('../src/feedback-command.json', import.meta.url), 'utf8'),
  );
  const app = await currentApp();
  const listed = await discord(`/applications/${app.id}/commands`);
  if (!listed.ok) throw new Error(`listing commands answered HTTP ${listed.status}`);
  const existing = (await listed.json()).find(
    (c) => c?.name === command.name && (c?.type ?? 1) === 1,
  );
  if (existing !== undefined && comparable(existing) === comparable(command)) {
    console.log(`/${command.name} is already registered and up to date.`);
    return;
  }
  const res = await discord(`/applications/${app.id}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`registering /${command.name} answered HTTP ${res.status}`);
  console.log(`/${command.name} registered (HTTP ${res.status}).`);
}

if (!Object.hasOwn(HOSTS, target ?? '') || (mode !== 'public-key' && mode !== 'register')) {
  console.log('::error::usage: discord-app.mjs <public-key|register> <production|staging>');
  process.exit(1);
}
if (token === '') {
  warn('DISCORD_BOT_TOKEN is empty; skipping.');
  process.exit(0);
}
try {
  if (mode === 'public-key') await publicKey();
  else await register();
} catch (err) {
  // Only our own messages and error names: a response body could carry anything.
  warn(err instanceof Error && err.message !== '' ? err.message : 'failed');
}
