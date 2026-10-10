import { env, exports } from 'cloudflare:workers';
import { listDurableObjectIds, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GuildCore } from '../src/guild-core';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
  formatSessionToken,
  generateSessionSecret,
  getSessionKey,
} from '../src/session';
import {
  GUILD_ID,
  ORIGIN,
  OTHER_USER_ID,
  USER_ID,
  expectApiHeaders,
  runCore,
  tokenFor,
} from './helpers';

const MINUTE = 60 * 1000;
const T0 = 1_800_000_000_000;
const USER = { id: USER_ID, displayName: 'Misa' };

/** Runs `fn` inside a fresh guild Durable Object with a GuildCore driven by a fake clock. */
async function withCore<R>(
  guildId: string,
  fn: (ctx: {
    guildId: string;
    core: GuildCore;
    clock: { t: number };
    sql: SqlStorage;
    request: (secret: string, path?: string, method?: string) => Promise<Response>;
  }) => Promise<R>,
): Promise<R> {
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
  return runInDurableObject(stub, async (_instance, state) => {
    const clock = { t: T0 };
    const core = new GuildCore(state.storage, () => clock.t);
    const request = async (secret: string, path = '/api/me', method = 'GET') =>
      core.handle(
        new Request(`${ORIGIN}${path}`, {
          method,
          headers: { Authorization: `Bearer ${await tokenFor(guildId, secret)}` },
        }),
      );
    return fn({ guildId, core, clock, sql: state.storage.sql, request });
  });
}

describe('schema migrations', () => {
  it('creates the tables and records the schema version', async () => {
    await withCore('700000000000000001', ({ core, sql }) => {
      const tables = sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .toArray()
        .map((r) => r.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          'players',
          'sessions',
          'schema_version',
          'ledger',
          'balances',
          'leet_sync',
          'guild_meta',
          'creatures',
          'expeditions',
          'player_progress',
          'server_firsts',
        ]),
      );
      const version = sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one();
      expect(version.v).toBe(6);
      // Running migrations again is a no-op.
      core.migrate();
      expect(sql.exec('SELECT * FROM schema_version').toArray()).toHaveLength(6);
      return Promise.resolve();
    });
  });
});

describe('migration 5 (guild timezone)', () => {
  it('applies on a schema-4 object and existing rows get the default timezone', async () => {
    await runCore('740000000000000010', async ({ core, sql }) => {
      await core.createSession('740000000000000010', USER);
      // Put the database back the way it was at version 4: no timezone column.
      sql.exec('ALTER TABLE guild_meta DROP COLUMN timezone');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN last_attempt_at');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN last_error');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN last_days');
      sql.exec('DELETE FROM schema_version WHERE version IN (5, 6)');
      expect(sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v).toBe(
        4,
      );
      expect(
        sql
          .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'guild_meta')
          .toArray()
          .map((c) => c.name),
      ).toEqual(['id', 'guild_id']);

      core.migrate();

      expect(sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v).toBe(
        6,
      );
      expect(sql.exec('SELECT id, guild_id, timezone FROM guild_meta').toArray()).toEqual([
        { id: 1, guild_id: '740000000000000010', timezone: 'Europe/Helsinki' },
      ]);
      expect(core.timezone()).toBe('Europe/Helsinki');
    });
  });

  it('rejects a NULL timezone', async () => {
    await runCore('740000000000000011', ({ sql }) => {
      expect(() =>
        sql.exec("INSERT INTO guild_meta (id, guild_id, timezone) VALUES (1, 'a', NULL)"),
      ).toThrow(/NOT NULL/i);
      return Promise.resolve();
    });
  });
});

describe('sessions', () => {
  it('verifies a fresh session and rejects unknown secrets', async () => {
    await withCore('700000000000000002', async ({ guildId, core }) => {
      const secret = await core.createSession(guildId, USER);
      expect(await core.verifySession(secret)).toEqual(USER);
      expect(await core.verifySession(generateSessionSecret())).toBeNull();
    });
  });

  it('updates the display name on re-login', async () => {
    await withCore('700000000000000003', async ({ guildId, core }) => {
      const first = await core.createSession(guildId, USER);
      await core.createSession(guildId, { id: USER_ID, displayName: 'Renamed' });
      expect(await core.verifySession(first)).toEqual({ id: USER_ID, displayName: 'Renamed' });
    });
  });

  it('expires after the idle timeout', async () => {
    await withCore('700000000000000004', async ({ guildId, core, clock, sql }) => {
      const secret = await core.createSession(guildId, USER);
      clock.t = T0 + SESSION_IDLE_MS - 1;
      expect(await core.verifySession(secret)).toEqual(USER);
      // That use slid the window; now go idle for the full hour.
      clock.t += SESSION_IDLE_MS;
      expect(await core.verifySession(secret)).toBeNull();
      expect(sql.exec('SELECT * FROM sessions').toArray()).toHaveLength(0);
    });
  });

  it('slides the idle window while in use', async () => {
    await withCore('700000000000000005', async ({ guildId, core, clock }) => {
      const secret = await core.createSession(guildId, USER);
      for (let i = 1; i <= 4; i++) {
        clock.t = T0 + i * 50 * MINUTE;
        expect(await core.verifySession(secret)).toEqual(USER);
      }
    });
  });

  it('expires at the absolute limit even when continuously used', async () => {
    await withCore('700000000000000006', async ({ guildId, core, clock }) => {
      const secret = await core.createSession(guildId, USER);
      for (let t = 30 * MINUTE; t < SESSION_ABSOLUTE_MS; t += 30 * MINUTE) {
        clock.t = T0 + t;
        expect(await core.verifySession(secret)).toEqual(USER);
      }
      clock.t = T0 + SESSION_ABSOLUTE_MS;
      expect(await core.verifySession(secret)).toBeNull();
    });
  });

  it('writes last_used_at at most once per 5 minutes', async () => {
    await withCore('700000000000000007', async ({ guildId, core, clock, sql }) => {
      const secret = await core.createSession(guildId, USER);
      const lastUsed = () =>
        sql.exec<{ last_used_at: number }>('SELECT last_used_at FROM sessions').one().last_used_at;
      clock.t = T0 + SESSION_TOUCH_INTERVAL_MS - 1;
      await core.verifySession(secret);
      expect(lastUsed()).toBe(T0);
      clock.t = T0 + SESSION_TOUCH_INTERVAL_MS;
      await core.verifySession(secret);
      expect(lastUsed()).toBe(T0 + SESSION_TOUCH_INTERVAL_MS);
    });
  });

  it('deletes expired sessions when a new one is created', async () => {
    await withCore('700000000000000008', async ({ guildId, core, clock, sql }) => {
      await core.createSession(guildId, USER);
      await core.createSession(guildId, { id: '222222222222222222', displayName: 'Other' });
      clock.t = T0 + SESSION_ABSOLUTE_MS + 1;
      await core.createSession(guildId, USER);
      expect(sql.exec('SELECT * FROM sessions').toArray()).toHaveLength(1);
    });
  });

  it('keeps at most 10 sessions per user', async () => {
    await withCore('700000000000000009', async ({ guildId, core, clock, sql }) => {
      const secrets: string[] = [];
      for (let i = 0; i < 12; i++) {
        clock.t = T0 + i;
        secrets.push(await core.createSession(guildId, USER));
      }
      expect(sql.exec('SELECT * FROM sessions').toArray()).toHaveLength(10);
      expect(await core.verifySession(secrets[0] ?? '')).toBeNull();
      expect(await core.verifySession(secrets[11] ?? '')).toEqual(USER);
    });
  });
});

describe('guild id binding', () => {
  it('stores the guild id on first session creation and keeps it', async () => {
    await runCore('740000000000000001', async ({ core, sql }) => {
      expect(sql.exec('SELECT * FROM guild_meta').toArray()).toEqual([]);
      await core.createSession('740000000000000001', USER);
      await core.createSession('740000000000000001', { id: OTHER_USER_ID, displayName: 'Other' });
      expect(sql.exec('SELECT id, guild_id FROM guild_meta').toArray()).toEqual([
        { id: 1, guild_id: '740000000000000001' },
      ]);
    });
  });

  it('throws on a different guild id and creates no session', async () => {
    await runCore('740000000000000002', async ({ core, sql }) => {
      await core.createSession('740000000000000002', USER);
      await expect(core.createSession('740000000000000009', USER)).rejects.toThrow(/guild/);
      expect(sql.exec('SELECT * FROM sessions').toArray()).toHaveLength(1);
      expect(sql.exec<{ guild_id: string }>('SELECT guild_id FROM guild_meta').one().guild_id).toBe(
        '740000000000000002',
      );
    });
  });

  it('allows only one guild_meta row', async () => {
    await runCore('740000000000000003', ({ sql }) => {
      sql.exec("INSERT INTO guild_meta (id, guild_id) VALUES (1, 'a')");
      expect(() => sql.exec("INSERT INTO guild_meta (id, guild_id) VALUES (2, 'b')")).toThrow(
        /CHECK/i,
      );
      return Promise.resolve();
    });
  });
});

describe('authenticated routes in the Durable Object', () => {
  it('GET /api/me returns the user, guild, timezone and balances', async () => {
    await withCore(GUILD_ID, async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      const res = await request(secret);
      expect(res.status).toBe(200);
      expectApiHeaders(res);
      expect(await res.json()).toEqual({
        user: USER,
        guildId: GUILD_ID,
        timezone: 'Europe/Helsinki',
        balances: { bait: 0, essence: 0 },
        // No leet source is configured here, so the status says so.
        leetSync: {
          source: 'disabled',
          lastAttemptAt: T0,
          lastSyncedAt: null,
          lastError: 'disabled',
          lastDays: null,
        },
      });
    });
  });

  it("GET /api/me returns the guild's stored timezone", async () => {
    await runCore('740000000000000012', async ({ guildId, core, sql, request }) => {
      sql.exec(
        "INSERT INTO guild_meta (id, guild_id, timezone) VALUES (1, ?, 'America/New_York')",
        guildId,
      );
      const secret = await core.createSession(guildId, USER);
      const res = await request(secret);
      expect((await res.json<{ timezone: string }>()).timezone).toBe('America/New_York');
    });
  });

  it('404s on unknown routes and 405s on wrong methods', async () => {
    await withCore('700000000000000010', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      const unknown = await request(secret, '/api/nope');
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ error: 'not_found' });
      expectApiHeaders(unknown);
      const proto = await request(secret, '/api/constructor');
      expect(proto.status).toBe(404);
      const wrong = await request(secret, '/api/me', 'POST');
      expect(wrong.status).toBe(405);
      expect(wrong.headers.get('Allow')).toBe('GET');
      expectApiHeaders(wrong);
    });
  });

  it('does not expose session creation over HTTP', async () => {
    await withCore('700000000000000011', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      for (const path of ['/api/auth/session', '/api/session', '/createSession']) {
        expect((await request(secret, path, 'POST')).status).toBe(404);
      }
    });
  });

  it('401s on expired sessions', async () => {
    await withCore('700000000000000012', async ({ guildId, core, clock, request }) => {
      const secret = await core.createSession(guildId, USER);
      clock.t = T0 + SESSION_IDLE_MS;
      const res = await request(secret);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_session' });
      expectApiHeaders(res);
    });
  });

  it('rate limits per player with a token bucket', async () => {
    await withCore('700000000000000013', async ({ guildId, core, clock, request }) => {
      const secret = await core.createSession(guildId, USER);
      const other = await core.createSession(guildId, {
        id: '222222222222222222',
        displayName: 'Other',
      });
      for (let i = 0; i < 30; i++) expect((await request(secret)).status).toBe(200);
      const limited = await request(secret);
      expect(limited.status).toBe(429);
      expect(limited.headers.get('Retry-After')).toBe('1');
      expect(await limited.json()).toEqual({ error: 'rate_limited' });
      expectApiHeaders(limited);
      // Other players are unaffected, and the bucket refills one token per second.
      expect((await request(other)).status).toBe(200);
      clock.t += 1000;
      expect((await request(secret)).status).toBe(200);
      expect((await request(secret)).status).toBe(429);
    });
  });
});

describe('Worker routing to the guild Durable Object', () => {
  const call = (path: string, headers: Record<string, string> = {}) =>
    exports.default.fetch(new Request(`${ORIGIN}${path}`, { headers }));

  it('401s without a token and does not touch a Durable Object for malformed tokens', async () => {
    const guildId = '800000000000000001';
    const before = (await listDurableObjectIds(env.GUILD_WORLD)).length;
    const malformed = [
      undefined,
      'Bearer nope',
      `Bearer s1.${guildId}.short`,
      `Bearer s1.123.${'a'.repeat(43)}.${'a'.repeat(43)}`,
      `Bearer s1.${guildId}.${'a'.repeat(43)}`, // old 3-part format
      `Bearer s1.${guildId}.${'a'.repeat(43)}.${'a'.repeat(43)}`, // well-formed but bad MAC
      `Basic s1.${guildId}.${'a'.repeat(43)}.${'a'.repeat(43)}`,
    ];
    for (const auth of malformed) {
      const res = await call('/api/me', auth === undefined ? {} : { Authorization: auth });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_session' });
      expectApiHeaders(res);
    }
    expect((await listDurableObjectIds(env.GUILD_WORLD)).length).toBe(before);
  });

  it('rejects tampered tokens before addressing any Durable Object', async () => {
    const guildId = '800000000000000005';
    const forgedGuild = '800000000000000006';
    const secret = await env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId)).createSession(
      guildId,
      USER,
    );
    const good = await tokenFor(guildId, secret);
    const [version, , , mac] = good.split('.');
    const otherSecret = generateSessionSecret();
    const wrongKey = await getSessionKey('some-other-client-secret');
    const tampered = [
      `${version ?? ''}.${forgedGuild}.${secret}.${mac ?? ''}`, // other guild, original MAC
      `${version ?? ''}.${guildId}.${otherSecret}.${mac ?? ''}`, // other secret, original MAC
      await formatSessionToken(wrongKey, guildId, secret), // MAC from a different client secret
      // One flipped MAC character (not the last: its low bits are padding).
      `${version ?? ''}.${guildId}.${secret}.${(mac ?? '').startsWith('A') ? 'B' : 'A'}${(mac ?? '').slice(1)}`,
    ];
    const before = (await listDurableObjectIds(env.GUILD_WORLD)).map((id) => id.toString());
    for (const token of tampered) {
      const res = await call('/api/me', { Authorization: `Bearer ${token}` });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_session' });
    }
    const after = (await listDurableObjectIds(env.GUILD_WORLD)).map((id) => id.toString());
    expect(after).toEqual(before);
    expect(after).not.toContain(env.GUILD_WORLD.idFromName(forgedGuild).toString());
    // The untampered token still works.
    expect((await call('/api/me', { Authorization: `Bearer ${good}` })).status).toBe(200);
  });

  it('401s for a well-formed token with an unknown secret', async () => {
    const token = await tokenFor('800000000000000002', generateSessionSecret());
    const res = await call('/api/me', { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_session' });
  });

  it('does not accept a session token from another guild', async () => {
    const secret = await env.GUILD_WORLD.get(
      env.GUILD_WORLD.idFromName('800000000000000003'),
    ).createSession('800000000000000003', USER);
    const own = await call('/api/me', {
      Authorization: `Bearer ${await tokenFor('800000000000000003', secret)}`,
    });
    expect(own.status).toBe(200);
    const forged = await call('/api/me', {
      Authorization: `Bearer ${await tokenFor('800000000000000004', secret)}`,
    });
    expect(forged.status).toBe(401);
  });

  it('unauthenticated unknown API routes are 401, not 404', async () => {
    expect((await call('/api/nope')).status).toBe(401);
  });
});
