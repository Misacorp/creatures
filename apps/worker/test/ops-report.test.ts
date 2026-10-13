import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { actorHash } from '../src/analytics';
import { DIRECTORY_NAME } from '../src/guild-directory';
import { createHandler } from '../src/index';
import type { Report } from '../src/ops-aggregate';
import {
  ACCESS_TOKEN,
  GUILD_ID,
  OTHER_USER_ID,
  USER_ID,
  fakeDiscord,
  postAuth,
  runCore,
  tokenFor,
  ORIGIN,
  type CoreContext,
} from './helpers';
import { HELSINKI, nextGuild, rows } from './raid-helpers';

const TOKEN = 'ops-test-token-3f9a1c7e5b2d4a60';
const DAY = '2027-01-14';
const NICKNAMES = ['Zorblax Quillfeather', 'Madame Snufflepuss'];
const SERVER_NAMES = ['The Secret Clubhouse'];

const ctx = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
  props: {},
} as unknown as ExecutionContext;

/** The Worker's env with `OPS_TOKEN` replaced (the bindings are shared). */
function opsEnv(token: string | undefined): Env {
  return { ...env, OPS_TOKEN: token } as Env;
}

function directory() {
  return env.GUILD_DIRECTORY.get(env.GUILD_DIRECTORY.idFromName(DIRECTORY_NAME));
}

interface Call {
  token?: string | null;
  method?: string;
  headers?: Record<string, string>;
  env?: Env;
  handler?: ReturnType<typeof createHandler>;
}

function call(query: string, options: Call = {}): Promise<Response> {
  const handler = options.handler ?? createHandler();
  const headers: Record<string, string> = { ...options.headers };
  const token = options.token === undefined ? TOKEN : options.token;
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  const request = new Request(`${ORIGIN}/api/ops/report?${query}`, {
    method: options.method ?? 'GET',
    headers,
  });
  if (handler.fetch === undefined) throw new Error('no fetch');
  return Promise.resolve(
    handler.fetch(
      request as Request<unknown, IncomingRequestCfProperties>,
      options.env ?? opsEnv(TOKEN),
      ctx,
    ),
  );
}

const RANGE = `from=${DAY}&to=${DAY}`;

/** Seeds one guild with a player, events of many kinds, ledger rows and a rollup. */
async function seedGuild(guildId: string, userId: string, nickname: string): Promise<void> {
  await runCore(guildId, async (c: CoreContext) => {
    await c.core.createSession(guildId, { id: userId, displayName: nickname });
    await c.core.analytics.prepare(userId);
    c.core.analytics.touch(userId);
    const a = c.core.analytics;
    a.record(
      {
        kind: 'expedition_send',
        species: 'splashet',
        duration: 'short',
        destination: 'tide-pools',
        supplies: [],
        bought: 0,
        cost: 0,
        rank: 1,
      },
      userId,
    );
    a.record(
      {
        kind: 'gear_drop',
        source: 'dungeon',
        gear: [],
        converted: 0,
        scrap: 5,
        shards: 1,
        glimmer: 0,
        blueprint: null,
        blueprintDuplicate: false,
        parts: { scrap: 5, 'tide-shard': 1 },
      },
      userId,
    );
    a.record({
      kind: 'phase_result',
      phase: 'finale',
      boss: 'unknown',
      rank: 1,
      festival: false,
      partySize: 4,
      win: true,
      rounds: 7,
      topShareBp: 3500,
    });
    a.record({ kind: 'train', species: 'splashet', level: 3, cost: 40 }, userId);
    c.core.credit({
      userId,
      currency: 'bait',
      amount: 120,
      source: 'leet',
      idempotencyKey: 'leet:seed',
    });
    c.core.spend({
      userId,
      currency: 'bait',
      amount: 40,
      purpose: 'training',
      idempotencyKey: `train-${guildId.slice(-8)}`,
      apply: () => 'ok',
    });
    // Everything above happened at the fake clock's time, which is inside the game day of DAY.
    c.core.rollup.rollDay(DAY, HELSINKI);
  });
  await directory().note(guildId, DAY);
}

/** Two guilds with distinctive users, nicknames and ids, seeded once. */
interface Seeded {
  guilds: string[];
  users: string[];
}
let seeded: Promise<Seeded> | null = null;
function seed(): Promise<Seeded> {
  seeded ??= (async () => {
    const guilds = [nextGuild(), nextGuild()];
    const users = [USER_ID, OTHER_USER_ID];
    await seedGuild(guilds[0] ?? '', users[0] ?? '', NICKNAMES[0] ?? '');
    await seedGuild(guilds[1] ?? '', users[1] ?? '', NICKNAMES[1] ?? '');
    return { guilds, users };
  })();
  return seeded;
}

describe('GET /api/ops/report: access', () => {
  it('answers 404 when OPS_TOKEN is not set, even with a bearer token', async () => {
    for (const token of [undefined, '']) {
      const res = await call(RANGE, { env: opsEnv(token) });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('answers 404 for a wrong, missing or malformed token, and for a session token', async () => {
    await seed();
    const guild = nextGuild();
    const session = await tokenFor(guild, 'a'.repeat(43));
    for (const token of ['wrong', TOKEN.slice(0, -1), `${TOKEN}x`, session, '']) {
      expect((await call(RANGE, { token })).status, token).toBe(404);
    }
    expect((await call(RANGE, { token: null })).status).toBe(404);
    expect((await call(RANGE, { token: null, headers: { Authorization: TOKEN } })).status).toBe(
      404,
    );
    expect(
      (await call(RANGE, { token: null, headers: { Authorization: `Basic ${TOKEN}` } })).status,
    ).toBe(404);
    // A cookie never authenticates.
    expect((await call(RANGE, { token: null, headers: { Cookie: `token=${TOKEN}` } })).status).toBe(
      404,
    );
  });

  it('answers 404 for other methods, even with the right token', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect((await call(RANGE, { method })).status, method).toBe(404);
    }
  });

  it('answers 200 with the right token', async () => {
    await seed();
    const res = await call(RANGE);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('rate-limits callers, and does so before anything is computed', async () => {
    await seed();
    let now = 1_000_000;
    const handler = createHandler({ now: () => now });
    const headers = { 'CF-Connecting-IP': '203.0.113.7' };
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await call(RANGE, { handler, headers })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
    const limited = await call(RANGE, { handler, headers });
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    // Another caller has its own bucket.
    expect(
      (await call(RANGE, { handler, headers: { 'CF-Connecting-IP': '203.0.113.8' } })).status,
    ).toBe(200);
    // Tokens come back over time.
    now += 11_000;
    expect((await call(RANGE, { handler, headers })).status).toBe(200);
    // A wrong token spends the caller's tokens too.
    const probe = createHandler({ now: () => now });
    const probes: number[] = [];
    for (let i = 0; i < 7; i++) {
      probes.push((await call(RANGE, { handler: probe, token: 'nope', headers })).status);
    }
    expect(probes).toEqual([404, 404, 404, 404, 404, 429, 429]);
    // With no OPS_TOKEN the route is a plain 404 and is never limited.
    const idle = createHandler({ now: () => now });
    for (let i = 0; i < 10; i++) {
      expect((await call(RANGE, { handler: idle, env: opsEnv(undefined), headers })).status).toBe(
        404,
      );
    }
  });

  it('answers 400 for bad parameters, after the token is accepted', async () => {
    const bad = [
      '',
      'from=2027-01-14',
      'from=2027-01-14&to=nope',
      'from=2027-02-30&to=2027-03-01',
      'from=2027-01-15&to=2027-01-14',
      'from=2027-01-01&to=2027-04-03',
      `${RANGE}&format=xml`,
      `${RANGE}&format=md&format=json`,
      `${RANGE}&debug=1`,
      `${RANGE}&weekly=yes`,
      `${RANGE}&compareFrom=2027-01-01`,
      `${RANGE}&byGuild=0`,
      `${RANGE}&byGuild=true`,
      `${RANGE}&byGuild=`,
      `${RANGE}&byGuild=1&byGuild=1`,
    ];
    for (const query of bad) {
      const res = await call(query, { handler: createHandler() });
      expect(res.status, query).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_query' });
    }
    // Wrong token wins over bad parameters: nothing is revealed.
    expect((await call('', { token: 'nope' })).status).toBe(404);
    // The longest range is fine.
    expect((await call('from=2027-01-01&to=2027-04-02', { handler: createHandler() })).status).toBe(
      200,
    );
  });
});

describe('GET /api/ops/report: the report', () => {
  it('leaves out the per-server breakdown unless byGuild=1 is asked for', async () => {
    const { guilds } = await seed();
    for (const query of [RANGE, `${RANGE}&weekly=1`]) {
      const body = await (await call(query, { handler: createHandler() })).json<Report>();
      expect(body.byGuild, query).toBeUndefined();
      expect(Object.keys(body)).not.toContain('byGuild');
      expect(body.totals.length).toBeGreaterThan(0);
    }
    const md = await (await call(`${RANGE}&format=md&byGuild=1`)).text();
    expect(md).not.toMatch(/g-[0-9a-f]{6}/);
    for (const guild of guilds) expect(md).not.toContain(guild);
  });

  it('reports the true number of known guilds', async () => {
    await seed();
    const { total } = await directory().list(1);
    const body = await (await call(RANGE, { handler: createHandler() })).json<Report>();
    expect(body.guilds.known).toBe(total);
  });

  it('sums the guilds, with stable aliases and per-guild buckets (byGuild=1)', async () => {
    const { guilds } = await seed();
    const body = await (await call(`${RANGE}&byGuild=1`)).json<Report>();
    expect(body.version).toBe(1);
    expect(body).toMatchObject({ from: DAY, to: DAY, days: 1 });
    expect(body.guilds.known).toBeGreaterThanOrEqual(2);
    expect(body.guilds.reporting).toBe(body.guilds.known);
    expect(body.rolledDays).toBeGreaterThanOrEqual(2);

    const total = (metric: string, dims: Record<string, string | number> = {}): number =>
      body.totals
        .filter(
          (r) => r.metric === metric && Object.entries(dims).every(([k, v]) => r.dims[k] === v),
        )
        .reduce((sum, r) => sum + r.value, 0);
    expect(total('dau')).toBe(2);
    expect(total('sessions')).toBe(2);
    expect(total('collection.train')).toBe(2);
    expect(total('raid.phase', { phase: 'finale', win: 1 })).toBe(2);
    expect(total('flow', { currency: 'bait', dir: 'source', label: 'leet' })).toBe(240);
    expect(total('flow', { currency: 'bait', dir: 'sink', label: 'training' })).toBe(80);
    expect(total('flow', { currency: 'tide-shard', dir: 'source', label: 'dungeon' })).toBe(2);

    const aliases = Object.keys(body.byGuild ?? {});
    expect(aliases.length).toBe(body.guilds.reporting);
    for (const alias of aliases) expect(alias).toMatch(/^g-[0-9a-f]{6}([0-9a-f]{2})*$/);
    for (const guild of guilds) expect(JSON.stringify(body)).not.toContain(guild);
    const again = await (
      await call(`${RANGE}&byGuild=1`, { handler: createHandler() })
    ).json<Report>();
    expect(Object.keys(again.byGuild ?? {})).toEqual(aliases);
    expect(body.daily[DAY]?.some((r) => r.metric === 'dau' && r.value === 2)).toBe(true);
  });

  it('adds the previous period for weekly=1 and for an explicit comparison', async () => {
    await seed();
    const weekly = await (
      await call(`from=${DAY}&to=${DAY}&weekly=1`, { handler: createHandler() })
    ).json<Report>();
    expect(weekly.previous).toMatchObject({ from: '2027-01-13', to: '2027-01-13', days: 1 });
    expect(weekly.previous?.totals).toEqual([]);
    const compare = await (
      await call(`from=2027-01-15&to=2027-01-15&compareFrom=${DAY}&compareTo=${DAY}`, {
        handler: createHandler(),
      })
    ).json<Report>();
    expect(compare.previous?.totals.find((r) => r.metric === 'dau')?.value).toBe(2);
    const md = await (
      await call(`from=2027-01-15&to=2027-01-15&compareFrom=${DAY}&compareTo=${DAY}&format=md`, {
        handler: createHandler(),
      })
    ).text();
    expect(md).toContain(`Compared with ${DAY} to ${DAY}`);
    expect(md).toContain('↓ -100%');
  });

  it('renders Markdown with the Resources section first', async () => {
    await seed();
    const res = await call(`${RANGE}&format=md`, { handler: createHandler() });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const md = await res.text();
    expect(md.indexOf('## Resources')).toBeGreaterThan(0);
    expect(md.indexOf('## Resources')).toBeLessThan(md.indexOf('## Summary'));
    expect(md.indexOf('## Summary')).toBeLessThan(md.indexOf('## Alerts'));
    expect(md).toContain('| `bait` | 240 | 80 | +160 |');
  });
});

describe('GET /api/ops/report: privacy', () => {
  it('has no user id, nickname, guild id, name, secret or hash in either format', async () => {
    const { guilds, users } = await seed();
    const hashes = await Promise.all(users.map((u) => actorHash(env.DISCORD_CLIENT_SECRET, u)));
    // The seeded events carry the hashes of both players, so the test is meaningful.
    for (const guild of guilds) {
      const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guild));
      const stored = await runInDurableObject(stub, (_instance, state) =>
        rows<{ actor_hash: string }>(
          state.storage.sql,
          'SELECT DISTINCT actor_hash FROM analytics_events WHERE actor_hash IS NOT NULL',
        ).map((r) => r.actor_hash),
      );
      expect(stored.some((h) => hashes.includes(h))).toBe(true);
    }
    const secrets = [
      ...users,
      ...guilds,
      ...NICKNAMES,
      ...SERVER_NAMES,
      ...hashes,
      GUILD_ID,
      ACCESS_TOKEN,
      TOKEN,
      env.DISCORD_CLIENT_SECRET,
      env.DISCORD_BOT_TOKEN,
    ];
    const queries = [
      RANGE,
      `${RANGE}&weekly=1`,
      `${RANGE}&format=md`,
      `${RANGE}&format=md&weekly=1`,
      `${RANGE}&byGuild=1`,
      'from=2027-01-01&to=2027-03-31&format=json',
    ];
    for (const query of queries) {
      const res = await call(query, { handler: createHandler() });
      expect(res.status, query).toBe(200);
      const text = await res.text();
      for (const secret of secrets) {
        expect(text, `${query} must not contain ${secret.slice(0, 6)}`).not.toContain(secret);
        expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
      }
      // No hash of any length that could be an actor hash or a digest: 32 or more hex characters.
      expect(text).not.toMatch(/[0-9a-fA-F]{32,}/);
      // No Discord snowflake of any kind (17 to 20 digits in a row).
      expect(text).not.toMatch(/\d{17,20}/);
    }
  });

  it('writes only counts in the JSON: every value is an integer and every dim is an id or integer', async () => {
    await seed();
    const body = await (await call(RANGE)).json<Report>();
    const withGuilds = await (
      await call(`${RANGE}&byGuild=1`, { handler: createHandler() })
    ).json<Report>();
    expect(Object.keys(withGuilds.byGuild ?? {}).length).toBeGreaterThan(0);
    const all = [
      ...body.totals,
      ...Object.values(body.daily).flat(),
      ...Object.values(withGuilds.byGuild ?? {}).flat(),
    ];
    expect(all.length).toBeGreaterThan(10);
    for (const r of all) {
      expect(Number.isInteger(r.value) && r.value >= 0).toBe(true);
      for (const v of Object.values(r.dims)) {
        expect(typeof v === 'number' || /^[a-z0-9_.:-]{1,48}$/.test(v)).toBe(true);
      }
    }
    expect(Object.keys(body).sort()).toEqual(
      ['daily', 'days', 'from', 'guilds', 'rolledDays', 'to', 'totals', 'version'].sort(),
    );
  });

  it('keeps the session login separate: the report ignores session auth entirely', async () => {
    await seed();
    // A real login creates a valid session token for a guild; it opens nothing here.
    const handler = createHandler({ createDiscord: () => fakeDiscord() });
    const login = await postAuth(handler, { code: 'c', instanceId: 'i' });
    const { sessionToken } = await login.json<{ sessionToken: string }>();
    expect((await call(RANGE, { token: sessionToken, handler })).status).toBe(404);
    // And the OPS_TOKEN opens no game route.
    const me = await handler.fetch?.(
      new Request(`${ORIGIN}/api/me`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
      opsEnv(TOKEN),
      ctx,
    );
    expect(me?.status).toBe(401);
  });
});

// Last on purpose: the guild it damages stays in the directory for the rest of the file.
describe('GET /api/ops/report: a guild that fails', () => {
  it('skips a guild whose rollup cannot be read and says so', async () => {
    await seed();
    const broken = nextGuild();
    await directory().note(broken, DAY);
    // A guild whose object has no rollup table (a damaged database) fails its call.
    const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(broken));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec('DROP TABLE analytics_daily');
    });
    const body = await (await call(RANGE, { handler: createHandler() })).json<Report>();
    expect(body.guilds.reporting).toBe(body.guilds.known - 1);
    const md = await (await call(`${RANGE}&format=md`, { handler: createHandler() })).text();
    expect(md).toContain('did not answer');
  });
});
