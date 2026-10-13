import { content, quirkText } from '@creatures/game';
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
  undoChannelPinMigration,
  undoDiscordPostsMigration,
  undoLiveMigration,
  undoProgressionMigration,
  undoAutofireMigration,
  undoPacingMigration,
  undoQuirkMigration,
  undoRaidMigration,
  LATEST_SCHEMA_VERSION,
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
          'raid_weeks',
          'raid_parties',
          'raid_party_members',
          'raid_opt_outs',
          'raid_teams',
          'raid_placements',
          'raid_results',
          'raid_events',
          'jackpot_pity',
          'discord_posts',
          'raid_abilities',
          'raid_live',
          'raid_reveal_seen',
          'raid_autofire',
        ]),
      );
      const version = sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one();
      expect(version.v).toBe(LATEST_SCHEMA_VERSION);
      // Running migrations again is a no-op.
      core.migrate();
      expect(sql.exec('SELECT * FROM schema_version').toArray()).toHaveLength(
        LATEST_SCHEMA_VERSION,
      );
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
      sql.exec('ALTER TABLE leet_sync DROP COLUMN source');
      sql.exec('DELETE FROM schema_version WHERE version IN (5, 6)');
      undoRaidMigration(sql);
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
        LATEST_SCHEMA_VERSION,
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

describe('migration 9 (announcement channel and Discord posts)', () => {
  it('applies on a schema-8 object and keeps existing rows', async () => {
    await runCore('740000000000000020', async ({ core, sql }) => {
      await core.createSession('740000000000000020', USER, '555555555555555555');
      sql.exec(
        "INSERT INTO discord_posts (key, channel_id, content, status, attempts, next_attempt_at, created_at) VALUES ('k', '1', 'x', 'pending', 0, 0, 0)",
      );
      undoDiscordPostsMigration(sql);
      expect(sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v).toBe(
        8,
      );
      const columns = () =>
        sql
          .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'guild_meta')
          .toArray()
          .map((c) => c.name);
      expect(columns()).toEqual(['id', 'guild_id', 'timezone']);
      expect(
        sql.exec("SELECT name FROM sqlite_master WHERE name = 'discord_posts'").toArray(),
      ).toEqual([]);

      core.migrate();

      expect(sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v).toBe(
        LATEST_SCHEMA_VERSION,
      );
      expect(columns()).toEqual([
        'id',
        'guild_id',
        'timezone',
        'announce_channel_id',
        'announce_channel_pinned',
      ]);
      expect(
        sql.exec('SELECT guild_id, timezone, announce_channel_id FROM guild_meta').toArray(),
      ).toEqual([
        { guild_id: '740000000000000020', timezone: 'Europe/Helsinki', announce_channel_id: null },
      ]);
      expect(sql.exec('SELECT COUNT(*) AS n FROM discord_posts').one()).toEqual({ n: 0 });
      expect(
        sql
          .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'discord_posts')
          .toArray()
          .map((c) => c.name),
      ).toEqual([
        'id',
        'key',
        'channel_id',
        'content',
        'status',
        'attempts',
        'next_attempt_at',
        'created_at',
      ]);
    });
  });
});

describe('migration 10 (the live finale)', () => {
  const columns = (sql: SqlStorage, table: string) =>
    sql
      .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', table)
      .toArray()
      .map((c) => c.name);
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;

  it('applies on a schema-9 object and keeps the raid data', async () => {
    await runCore('740000000000000030', async ({ core, sql }) => {
      await core.createSession('740000000000000030', USER, '555555555555555555');
      sql.exec("INSERT INTO jackpot_pity (user_id, counter) VALUES ('u1', 4)");
      sql.exec(
        "INSERT INTO raid_weeks (week_id, boss_id, status, created_at) VALUES ('2026-W40', 'b', 'phase2', 1)",
      );
      undoLiveMigration(sql);
      expect(version(sql)).toBe(9);
      for (const table of ['raid_abilities', 'raid_live', 'raid_reveal_seen']) {
        expect(sql.exec('SELECT name FROM sqlite_master WHERE name = ?', table).toArray()).toEqual(
          [],
        );
      }

      core.migrate();

      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(columns(sql, 'raid_abilities')).toEqual(['week_id', 'user_id', 'ability_id']);
      expect(columns(sql, 'raid_live')).toEqual([
        'week_id',
        'party',
        'practice',
        'seed',
        'input',
        'members',
        'abilities',
        'started_at',
        'round_ms',
        'rounds',
        'pacing',
      ]);
      expect(columns(sql, 'raid_reveal_seen')).toEqual(['user_id', 'week_id', 'seen_at']);
      // Everything from before is still there.
      expect(sql.exec('SELECT user_id, counter FROM jackpot_pity').toArray()).toEqual([
        { user_id: 'u1', counter: 4 },
      ]);
      expect(
        sql.exec("SELECT week_id, status FROM raid_weeks WHERE week_id = '2026-W40'").toArray(),
      ).toEqual([{ week_id: '2026-W40', status: 'phase2' }]);
      expect(sql.exec('SELECT announce_channel_id FROM guild_meta').one()).toEqual({
        announce_channel_id: '555555555555555555',
      });
      // The tables hold what the rules say: one pick per player and week, practice is 0 or 1.
      const live = (practice: number, party = 1) =>
        sql.exec(
          "INSERT INTO raid_live (week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds, pacing) VALUES ('w', ?, ?, 's', '{}', '[]', '[]', 0, 10000, 12, 1)",
          party,
          practice,
        );
      live(0);
      live(1);
      expect(() => live(0)).toThrow(/UNIQUE|constraint/i);
      expect(() => live(2, 2)).toThrow(/CHECK|constraint/i);
      sql.exec(
        "INSERT INTO raid_abilities (week_id, user_id, ability_id) VALUES ('w', 'u', 'rally')",
      );
      expect(() =>
        sql.exec(
          "INSERT INTO raid_abilities (week_id, user_id, ability_id) VALUES ('w', 'u', 'purge')",
        ),
      ).toThrow(/UNIQUE|constraint/i);
      // Running the migrations again is a no-op.
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
    });
  });
});

describe('migration 11 (pinned announcement channel, session channel)', () => {
  const columns = (sql: SqlStorage, table: string) =>
    sql
      .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', table)
      .toArray()
      .map((c) => c.name);
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;

  it('applies on a schema-10 object: nothing is pinned and old sessions have no channel', async () => {
    await runCore('740000000000000040', async ({ core, sql, request }) => {
      const secret = await core.createSession('740000000000000040', USER, '555555555555555555');
      undoChannelPinMigration(sql);
      expect(version(sql)).toBe(10);
      expect(columns(sql, 'guild_meta')).toEqual([
        'id',
        'guild_id',
        'timezone',
        'announce_channel_id',
      ]);
      expect(columns(sql, 'sessions')).not.toContain('channel_id');

      core.migrate();

      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(columns(sql, 'guild_meta')).toEqual([
        'id',
        'guild_id',
        'timezone',
        'announce_channel_id',
        'announce_channel_pinned',
      ]);
      expect(columns(sql, 'sessions')).toContain('channel_id');
      expect(
        sql.exec('SELECT announce_channel_id, announce_channel_pinned FROM guild_meta').one(),
      ).toEqual({
        announce_channel_id: '555555555555555555',
        announce_channel_pinned: 0,
      });
      expect(sql.exec('SELECT channel_id FROM sessions').toArray()).toEqual([{ channel_id: null }]);
      // The old session still works; it just has no launch channel.
      expect((await request(secret, '/api/me')).status).toBe(200);
      // Running the migrations again is a no-op.
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
    });
  });
});

describe('migration 12 (Boss Rank ladder, seasons, Festival)', () => {
  const columns = (sql: SqlStorage, table: string) =>
    sql
      .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', table)
      .toArray()
      .map((c) => c.name);
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;

  it('applies on a schema-11 object: an open week stays as it was and the ladder starts unplaced', async () => {
    await runCore('740000000000000050', async ({ core, sql }) => {
      await core.createSession('740000000000000050', USER);
      sql.exec(
        "INSERT INTO raid_weeks (week_id, boss_id, status, created_at) VALUES ('2026-W40', 'b', 'phase1', 1)",
      );
      sql.exec(
        "INSERT INTO raid_parties (week_id, party, hp_max, hp_current, boss_atk) VALUES ('2026-W40', 1, 5000, 3000, 40)",
      );
      sql.exec(
        "INSERT INTO server_firsts (kind, species, user_id, drop_id, at) VALUES ('jackpot', 'jackpot', 'u1', 'jackpot:2026-W39', 5)",
      );
      undoProgressionMigration(sql);
      expect(version(sql)).toBe(11);
      expect(columns(sql, 'raid_weeks')).toEqual(['week_id', 'boss_id', 'status', 'created_at']);
      expect(
        sql.exec('SELECT name FROM sqlite_master WHERE name = ?', 'raid_ladder').toArray(),
      ).toEqual([]);

      core.migrate();

      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(columns(sql, 'raid_weeks')).toEqual([
        'week_id',
        'boss_id',
        'status',
        'created_at',
        'rank',
        'effective_rank',
        'festival',
        'season_index',
        'festival_species',
        'ladder_at',
        'ladder_won',
        'rank_after',
      ]);
      // The week that was open keeps everything and has no rank or season: it behaves as before.
      expect(
        sql
          .exec(
            "SELECT week_id, status, rank, effective_rank, festival, season_index, festival_species, ladder_at FROM raid_weeks WHERE week_id = '2026-W40'",
          )
          .toArray(),
      ).toEqual([
        {
          week_id: '2026-W40',
          status: 'phase1',
          rank: null,
          effective_rank: null,
          festival: null,
          season_index: null,
          festival_species: null,
          ladder_at: null,
        },
      ]);
      expect(sql.exec('SELECT hp_max, hp_current, boss_atk FROM raid_parties').one()).toEqual({
        hp_max: 5000,
        hp_current: 3000,
        boss_atk: 40,
      });
      // The ladder is one row with no rank yet and no best rank.
      expect(sql.exec('SELECT id, rank, best_rank FROM raid_ladder').toArray()).toEqual([
        { id: 1, rank: null, best_rank: null },
      ]);
      expect(() => sql.exec('INSERT INTO raid_ladder (id, rank) VALUES (2, 1)')).toThrow(
        /CHECK|constraint/i,
      );
      // server_firsts kept its rows and takes the new kind, and still refuses an unknown one.
      expect(sql.exec('SELECT kind, species, user_id FROM server_firsts').toArray()).toEqual([
        { kind: 'jackpot', species: 'jackpot', user_id: 'u1' },
      ]);
      sql.exec(
        "INSERT INTO server_firsts (kind, species, user_id, drop_id, at) VALUES ('festival', 'lanternfin', 'u1', 'festival:2026-W45', 6)",
      );
      expect(() =>
        sql.exec(
          "INSERT INTO server_firsts (kind, species, user_id, drop_id, at) VALUES ('bogus', 'x', 'u1', 'd', 6)",
        ),
      ).toThrow(/CHECK|constraint/i);
      // One Festival grant per player and week.
      const grant = () =>
        sql.exec(
          "INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, created_at) VALUES ('2026-W45', 'u1', 'lanternfin', 'new', 1)",
        );
      grant();
      expect(grant).toThrow(/UNIQUE|constraint/i);
      expect(() =>
        sql.exec(
          "INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, created_at) VALUES ('2026-W45', 'u2', 'lanternfin', 'bogus', 1)",
        ),
      ).toThrow(/CHECK|constraint/i);
      // Running the migrations again is a no-op.
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(sql.exec('SELECT id, rank, best_rank FROM raid_ladder').toArray()).toHaveLength(1);
    });
  });
});

describe('migration 13 (creature quirks)', () => {
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;
  const quirks = (sql: SqlStorage) =>
    sql
      .exec<{ id: string; quirk_id: string | null }>(
        'SELECT id, quirk_id FROM creatures ORDER BY id',
      )
      .toArray();

  /** One creature per species (and one of an unknown species), each for a different player. */
  function seedCreatures(sql: SqlStorage): string[] {
    const species = [...content.creatures.map((c) => c.id), 'removed-species'];
    species.forEach((id, i) => {
      sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
         VALUES (?, ?, ?, ?, 1, 'test', ?)`,
        `c${String(i).padStart(2, '0')}`,
        `u${String(i)}`,
        id,
        id,
        i,
      );
    });
    return species;
  }

  it('adds the column and gives every existing creature a quirk from the data', async () => {
    await runCore('740000000000000060', async ({ core, sql }) => {
      await core.createSession('740000000000000060', USER);
      undoQuirkMigration(sql);
      expect(version(sql)).toBe(12);
      expect(
        sql
          .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'creatures')
          .toArray()
          .map((c) => c.name),
      ).not.toContain('quirk_id');
      const species = seedCreatures(sql);
      expect(species).toHaveLength(content.creatures.length + 1);

      core.migrate();

      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      const after = quirks(sql);
      expect(after).toHaveLength(species.length);
      for (const row of after) {
        expect(row.quirk_id, row.id).not.toBeNull();
        expect(quirkText(row.quirk_id ?? ''), row.id).toBeDefined();
      }
      // Drawn from live randomness: with this many creatures the quirks are not all the same.
      expect(new Set(after.map((r) => r.quirk_id)).size).toBeGreaterThan(5);
      // The other columns are untouched.
      expect(
        sql
          .exec('SELECT id, user_id, species, level, origin FROM creatures WHERE id = ?', 'c00')
          .one(),
      ).toEqual({ id: 'c00', user_id: 'u0', species: 'splashet', level: 1, origin: 'test' });
    });
  });

  it('stores the quirk: running the migrations again changes nothing', async () => {
    await runCore('740000000000000061', async ({ core, sql }) => {
      await core.createSession('740000000000000061', USER);
      undoQuirkMigration(sql);
      seedCreatures(sql);
      core.migrate();
      const first = quirks(sql);
      core.migrate();
      expect(quirks(sql)).toEqual(first);
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
    });
  });

  it('can be replayed after the column was dropped, and keeps the table writable', async () => {
    await runCore('740000000000000062', async ({ core, sql }) => {
      await core.createSession('740000000000000062', USER);
      undoQuirkMigration(sql);
      seedCreatures(sql);
      core.migrate();
      undoQuirkMigration(sql);
      core.migrate();
      for (const row of quirks(sql)) expect(quirkText(row.quirk_id ?? '')).toBeDefined();
      sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at, quirk_id)
         VALUES ('new', 'nu', 'cindle', 'cindle', 1, 'test', 0, 'hums-quietly')`,
      );
      expect(sql.exec('SELECT quirk_id FROM creatures WHERE id = ?', 'new').one()).toEqual({
        quirk_id: 'hums-quietly',
      });
    });
  });

  it('does nothing harmful on a database without creatures', async () => {
    await runCore('740000000000000063', async ({ core, sql }) => {
      await core.createSession('740000000000000063', USER);
      undoQuirkMigration(sql);
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(quirks(sql)).toEqual([]);
    });
  });
});

describe('migration 14 (Auto fire preferences)', () => {
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;
  const columns = (sql: SqlStorage) =>
    sql
      .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'raid_autofire')
      .toArray()
      .map((c) => c.name);
  const put = (sql: SqlStorage, week: string, user: string, target: string, on: number) =>
    sql.exec('INSERT INTO raid_autofire VALUES (?, ?, ?, ?)', week, user, target, on);

  it('adds the table on a schema-13 object and keeps everything else', async () => {
    await runCore('740000000000000070', async ({ core, sql }) => {
      await core.createSession('740000000000000070', USER, '555555555555555555');
      sql.exec("INSERT INTO jackpot_pity (user_id, counter) VALUES ('u1', 4)");
      undoAutofireMigration(sql);
      expect(version(sql)).toBe(13);
      expect(columns(sql)).toEqual([]);

      core.migrate();

      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(columns(sql)).toEqual(['week_id', 'user_id', 'target', 'auto_fire']);
      expect(sql.exec('SELECT user_id, counter FROM jackpot_pity').toArray()).toEqual([
        { user_id: 'u1', counter: 4 },
      ]);
      expect(sql.exec('SELECT announce_channel_id FROM guild_meta').one()).toEqual({
        announce_channel_id: '555555555555555555',
      });
      // Running the migrations again is a no-op.
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(sql.exec('SELECT * FROM schema_version').toArray()).toHaveLength(
        LATEST_SCHEMA_VERSION,
      );
    });
  });

  it('holds one preference per player, week and target, and only on or off', async () => {
    await runCore('740000000000000071', async ({ core, sql }) => {
      await core.createSession('740000000000000071', USER);
      put(sql, 'w', 'u', 'basic', 0);
      put(sql, 'w', 'u', 'c1', 1);
      put(sql, 'w', 'v', 'basic', 1);
      put(sql, 'x', 'u', 'basic', 1);
      expect(() => put(sql, 'w', 'u', 'basic', 1)).toThrow(/UNIQUE|constraint/i);
      expect(() => put(sql, 'w', 'u', 'c2', 2)).toThrow(/CHECK|constraint/i);
      expect(sql.exec('SELECT COUNT(*) AS n FROM raid_autofire').one()).toEqual({ n: 4 });
    });
  });

  it('can be replayed after the table was dropped', async () => {
    await runCore('740000000000000072', async ({ core, sql }) => {
      await core.createSession('740000000000000072', USER);
      undoAutofireMigration(sql);
      core.migrate();
      undoAutofireMigration(sql);
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      put(sql, 'w', 'u', 'basic', 0);
      expect(sql.exec('SELECT auto_fire FROM raid_autofire').one()).toEqual({ auto_fire: 0 });
    });
  });
});

describe('migration 15 (content-paced live rounds)', () => {
  const version = (sql: SqlStorage) =>
    sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v;
  const columns = (sql: SqlStorage) =>
    sql
      .exec<{ name: string }>('SELECT name FROM pragma_table_info(?)', 'raid_live')
      .toArray()
      .map((c) => c.name);
  const insert = (sql: SqlStorage, party: number, withPacing: boolean) =>
    sql.exec(
      `INSERT INTO raid_live (week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds${withPacing ? ', pacing' : ''}) VALUES ('w', ?, 0, 's', '{}', '[]', '[]', 0, 10000, 12${withPacing ? ', 1' : ''})`,
      party,
    );

  it('adds the pacing column on a schema-14 object, and a fight stored before it reads as fixed rounds (0)', async () => {
    await runCore('740000000000000080', async ({ core, sql }) => {
      await core.createSession('740000000000000080', USER, '555555555555555555');
      undoPacingMigration(sql);
      expect(version(sql)).toBe(14);
      expect(columns(sql)).not.toContain('pacing');
      // A fight stored under the old fixed 10 second rounds.
      insert(sql, 1, false);

      core.migrate();

      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(columns(sql)).toContain('pacing');
      expect(sql.exec('SELECT party, round_ms, pacing FROM raid_live').toArray()).toEqual([
        { party: 1, round_ms: 10_000, pacing: 0 },
      ]);
      // New fights say 1, and everything else is still there.
      insert(sql, 2, true);
      expect(sql.exec('SELECT party, pacing FROM raid_live ORDER BY party').toArray()).toEqual([
        { party: 1, pacing: 0 },
        { party: 2, pacing: 1 },
      ]);
      expect(sql.exec('SELECT announce_channel_id FROM guild_meta').one()).toEqual({
        announce_channel_id: '555555555555555555',
      });
      // Running the migrations again is a no-op.
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      expect(sql.exec('SELECT * FROM schema_version').toArray()).toHaveLength(
        LATEST_SCHEMA_VERSION,
      );
    });
  });

  it('can be replayed after the column was dropped', async () => {
    await runCore('740000000000000081', async ({ core, sql }) => {
      await core.createSession('740000000000000081', USER);
      undoPacingMigration(sql);
      core.migrate();
      undoPacingMigration(sql);
      core.migrate();
      expect(version(sql)).toBe(LATEST_SCHEMA_VERSION);
      insert(sql, 1, true);
      expect(sql.exec('SELECT pacing FROM raid_live').one()).toEqual({ pacing: 1 });
    });
  });
});

describe('the announcement channel', () => {
  const channelOf = (sql: SqlStorage) =>
    sql
      .exec<{ announce_channel_id: string | null }>('SELECT announce_channel_id FROM guild_meta')
      .one().announce_channel_id;

  it('is the channel most recently launched from: updated on every login', async () => {
    await runCore('740000000000000021', async ({ core, sql, guildId }) => {
      await core.createSession(guildId, USER, null);
      expect(channelOf(sql)).toBeNull();
      await core.createSession(guildId, USER, '555555555555555551');
      expect(channelOf(sql)).toBe('555555555555555551');
      await core.createSession(guildId, USER, '555555555555555552');
      expect(channelOf(sql)).toBe('555555555555555552');
      // A login without a channel keeps the last known one.
      await core.createSession(guildId, USER, null);
      await core.createSession(guildId, USER);
      expect(channelOf(sql)).toBe('555555555555555552');
    });
  });

  it('ignores anything that is not a snowflake', async () => {
    await runCore('740000000000000022', async ({ core, sql, guildId }) => {
      await core.createSession(guildId, USER, '555555555555555551');
      for (const bad of [
        '',
        'abc',
        '12345',
        '555555555555555551/../x',
        '5'.repeat(30),
        ' 555555555555555551',
      ]) {
        await core.createSession(guildId, USER, bad);
        expect(channelOf(sql)).toBe('555555555555555551');
      }
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
      null,
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
    ).createSession('800000000000000003', USER, null);
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
