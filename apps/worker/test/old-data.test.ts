import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { pruneOldData } from '../src/old-data';
import { latestReveal } from '../src/raid-reveal';
import { addWeeks, weekIdFor } from '../src/raid-schedule';
import { gameDay, zonedTimeToEpoch } from '../src/time';
import { runCore, T0, type CoreContext } from './helpers';
import { nextGuild } from './raid-helpers';

const TZ = 'Europe/Helsinki';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The start of the game day of T0. */
const DAY_START = zonedTimeToEpoch(
  gameDay(T0, TZ, RULES.daily.reset),
  RULES.daily.reset.hour,
  RULES.daily.reset.minute,
  TZ,
);

const count = (sql: SqlStorage, table: string, where = '1 = 1'): number =>
  sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).one().n;

function prune(ctx: CoreContext): boolean {
  return pruneOldData(ctx.storage, T0, TZ);
}

/** Row counts of the tables a prune may touch, to see that a second run changes nothing. */
function snapshot(sql: SqlStorage, tables: string[]): Record<string, number> {
  return Object.fromEntries(tables.map((t) => [t, count(sql, t)]));
}

function column(sql: SqlStorage, table: string, name: string): string[] {
  return sql
    .exec<{ k: string }>(`SELECT DISTINCT ${name} AS k FROM ${table} ORDER BY k`)
    .toArray()
    .map((r) => r.k);
}

function trip(
  sql: SqlStorage,
  id: string,
  status: 'active' | 'claimed' | 'cancelled',
  at: number,
): void {
  sql.exec(
    `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at,
       status, claimed_at, result)
     VALUES (?, 'u1', 'c1', 'short', 'basic', 1, 0, ?, ?, ?, ?, ?)`,
    id,
    at - HOUR,
    at,
    status,
    status === 'claimed' ? at : null,
    status === 'claimed' ? '{}' : null,
  );
  sql.exec(
    "INSERT INTO expedition_offers (expedition_id, user_id, goals_json, offered_at) VALUES (?, 'u1', '[]', ?)",
    id,
    at,
  );
}

function job(sql: SqlStorage, id: string, claimedAt: number | null): void {
  sql.exec(
    `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at)
     VALUES (?, 'u1', ?, 'craft', NULL, '{}', ?, ?, ?)`,
    id,
    `c-${id}`,
    DAY_START - 3 * DAY,
    DAY_START - 3 * DAY + HOUR,
    claimedAt,
  );
}

describe('old trips and Workshop jobs', () => {
  it('deletes claimed trips from before today, their offers and old cancelled trips, once', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      trip(sql, 'old-claimed', 'claimed', DAY_START - HOUR);
      trip(sql, 'today-claimed', 'claimed', DAY_START + HOUR);
      trip(sql, 'active', 'active', DAY_START - 5 * DAY);
      trip(sql, 'wipe-old', 'cancelled', DAY_START - 40 * DAY);
      trip(sql, 'wipe-recent', 'cancelled', DAY_START - 10 * DAY);
      // The totals are their own rows.
      sql.exec(
        "INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES ('u1', 'c1', 5, 3)",
      );
      sql.exec("INSERT INTO account_stats (user_id, stat, value) VALUES ('u1', 'trips', 3)");

      expect(prune(ctx)).toBe(false);
      const kept = ['active', 'today-claimed', 'wipe-recent'];
      expect(column(sql, 'expeditions', 'id')).toEqual(kept);
      expect(column(sql, 'expedition_offers', 'expedition_id')).toEqual(kept);
      expect(count(sql, 'explorer_progress')).toBe(1);
      expect(count(sql, 'account_stats')).toBe(1);

      const before = snapshot(sql, ['expeditions', 'expedition_offers']);
      expect(prune(ctx)).toBe(false);
      expect(snapshot(sql, ['expeditions', 'expedition_offers'])).toEqual(before);
    });
  });

  it('works through a big backlog in batches and says so', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      for (let i = 0; i < 10_500; i++) {
        sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at)
           VALUES (?, 'u1', ?, 'craft', NULL, '{}', 1, 2, 3)`,
          `j${String(i)}`,
          `c${String(i)}`,
        );
      }
      expect(prune(ctx)).toBe(true);
      expect(count(sql, 'workshop_jobs')).toBe(500);
      expect(prune(ctx)).toBe(false);
      expect(count(sql, 'workshop_jobs')).toBe(0);
    });
  });

  it("deletes claimed jobs from before today and keeps today's and open ones", async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      job(sql, 'old', DAY_START - HOUR);
      job(sql, 'today', DAY_START + HOUR);
      job(sql, 'open', null);
      sql.exec("INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES ('u1', 'c1', 40)");
      prune(ctx);
      expect(column(sql, 'workshop_jobs', 'id')).toEqual(['open', 'today']);
      expect(count(sql, 'crafting_skill')).toBe(1);
      const before = snapshot(sql, ['workshop_jobs']);
      prune(ctx);
      expect(snapshot(sql, ['workshop_jobs'])).toEqual(before);
    });
  });

  it('finds what to delete through the partial indexes', async () => {
    await runCore(nextGuild(), (ctx) => {
      prune(ctx);
      const plan = (q: string): string =>
        ctx.sql
          .exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${q}`)
          .toArray()
          .map((r) => r.detail)
          .join(' | ');
      expect(
        plan(
          "SELECT id FROM expeditions WHERE status = 'claimed' AND claimed_at < 5 ORDER BY claimed_at LIMIT 5",
        ),
      ).toContain('expeditions_claimed_at');
      expect(
        plan(
          'SELECT rowid FROM workshop_jobs WHERE claimed_at IS NOT NULL AND claimed_at < 5 LIMIT 5',
        ),
      ).toContain('workshop_jobs_claimed_at');
    });
  });
});

function gamesDay(sql: SqlStorage, day: string, locked: boolean, awarded: boolean): void {
  sql.exec(
    `INSERT INTO games_days (day, lineup_json, created_at, locked_at, show_at, ends_at, awarded_at)
     VALUES (?, '[]', 1, ?, ?, ?, ?)`,
    day,
    locked ? 2 : null,
    locked ? 3 : null,
    locked ? 4 : null,
    awarded ? 5 : null,
  );
}

function gamesDetail(sql: SqlStorage, day: string): void {
  sql.exec(
    "INSERT INTO games_results (day, idx, event_id, input_json, result_json) VALUES (?, 0, 'melon-run', '[]', NULL)",
    day,
  );
  sql.exec(
    `INSERT INTO games_entries (day, user_id, event_id, slot, creature_id, entered_at)
     VALUES (?, 'u1', 'melon-run', 0, ?, 1)`,
    day,
    `c-${day}`,
  );
  sql.exec(
    `INSERT INTO games_placings (day, event_id, user_id, creature_ids, place, medal, score, bot)
     VALUES (?, 'melon-run', 'u1', '[]', 1, 'gold', 5, 0)`,
    day,
  );
}

const GAMES_DETAIL = ['games_results', 'games_entries', 'games_placings'];

describe('old Valley Games days', () => {
  it('keeps the shown, awarded and unawarded days and the stats, and drops the rest', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      // 01-08, 01-09 and 01-11 are awarded; 01-12 is locked and shown but not awarded; 01-13 is open for
      // entries.
      for (const [d, awarded] of [
        ['2027-01-08', true],
        ['2027-01-09', true],
        ['2027-01-11', true],
        ['2027-01-12', false],
      ] as const) {
        gamesDay(sql, d, true, awarded);
        gamesDetail(sql, d);
      }
      gamesDay(sql, '2027-01-13', false, false);
      gamesDetail(sql, '2027-01-13');
      sql.exec(
        "INSERT INTO games_medals (user_id, gold, silver, bronze, pins, pocket) VALUES ('u1', 4, 0, 0, 0, 9)",
      );
      sql.exec(
        "INSERT INTO games_records (creature_id, event_id, user_id, best, day) VALUES ('c1', 'melon-run', 'u1', 7, '2027-01-08')",
      );
      expect(prune(ctx)).toBe(false);
      // The latest shown day is 01-12, the latest awarded 01-11 and the unawarded one 01-12: nothing
      // before 01-11 is read.
      for (const t of GAMES_DETAIL) {
        expect(column(sql, t, 'day')).toEqual(['2027-01-11', '2027-01-12', '2027-01-13']);
      }
      expect(count(sql, 'games_days')).toBe(5);
      expect(count(sql, 'games_medals')).toBe(1);
      expect(count(sql, 'games_records')).toBe(1);

      const before = snapshot(sql, GAMES_DETAIL);
      prune(ctx);
      expect(snapshot(sql, GAMES_DETAIL)).toEqual(before);
    });
  });

  it('deletes nothing before a show and an award both exist', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      gamesDay(sql, '2027-01-08', true, false);
      gamesDetail(sql, '2027-01-08');
      gamesDay(sql, '2027-01-09', true, false);
      gamesDetail(sql, '2027-01-09');
      prune(ctx);
      expect(count(sql, 'games_results')).toBe(2);
    });
  });

  it("drops earlier weeks' stall buys and keeps this week's", async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      for (const week of ['2027-01-06', '2027-01-13', '2027-01-20']) {
        sql.exec(
          "INSERT INTO games_stall_buys (user_id, week, offer_id, bought) VALUES ('u1', ?, 'x', 1)",
          week,
        );
      }
      // T0 is Friday 2027-01-15 (guild time): the stall week is the coming Wednesday, 01-20.
      prune(ctx);
      expect(column(sql, 'games_stall_buys', 'week')).toEqual(['2027-01-20']);
    });
  });
});

const RAID_DETAIL = [
  'raid_parties',
  'raid_party_members',
  'raid_opt_outs',
  'raid_teams',
  'raid_placements',
  'raid_abilities',
  'raid_autofire',
  'raid_reveal_seen',
  'raid_live',
];

function raidWeek(sql: SqlStorage, week: string, status: string, user: string): void {
  sql.exec(
    "INSERT INTO raid_weeks (week_id, boss_id, status, created_at) VALUES (?, 'b', ?, 1)",
    week,
    status,
  );
  sql.exec('INSERT INTO raid_parties (week_id, party) VALUES (?, 1)', week);
  sql.exec(
    'INSERT INTO raid_party_members (week_id, user_id, party, joined_at) VALUES (?, ?, 1, 1)',
    week,
    user,
  );
  sql.exec('INSERT INTO raid_opt_outs (week_id, user_id) VALUES (?, ?)', week, user);
  sql.exec(
    'INSERT INTO raid_teams (week_id, user_id, creature_ids) VALUES (?, ?, NULL)',
    week,
    user,
  );
  sql.exec(
    'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
    week,
    user,
    `c-${week}`,
  );
  sql.exec(
    "INSERT INTO raid_abilities (week_id, user_id, ability_id) VALUES (?, ?, 'a')",
    week,
    user,
  );
  sql.exec(
    "INSERT INTO raid_autofire (week_id, user_id, target, auto_fire) VALUES (?, ?, 't', 1)",
    week,
    user,
  );
  sql.exec('INSERT INTO raid_reveal_seen (user_id, week_id, seen_at) VALUES (?, ?, 1)', user, week);
  sql.exec(
    "INSERT INTO raid_events (week_id, event, outcome, done_at) VALUES (?, 'finale', 'ran', 1)",
    week,
  );
  sql.exec(
    `INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, created_at)
     VALUES (?, ?, 'sproutle', 'new', 1)`,
    week,
    user,
  );
}

function raidLive(sql: SqlStorage, week: string, practice: number): void {
  sql.exec(
    `INSERT INTO raid_live (week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds)
     VALUES (?, 1, ?, 's', 'i', '[]', '[]', 1, 1000, 5)`,
    week,
    practice,
  );
}

const SUMMARY =
  '{"cleared":true,"members":[{"userId":"u1","alias":"m1"}],"essence":{},"jackpot":[]}';

function raidResult(sql: SqlStorage, week: string): void {
  sql.exec(
    `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
     VALUES (?, 1, 'finale', 'seed', '{"a":1}', '{"b":2}', ?, 1)`,
    week,
    SUMMARY,
  );
}

describe('old raid weeks', () => {
  const current = weekIdFor(T0, TZ);
  const last = addWeeks(current, -1);
  const older = addWeeks(current, -2);
  const stuck = addWeeks(current, -4);
  const oldest = addWeeks(current, -5);

  it('keeps this week and last whole, strips older ones to their stats', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      for (const week of [current, last, older, oldest]) {
        raidWeek(sql, week, week === current ? 'phase1' : 'finale', 'u1');
        raidResult(sql, week);
        raidLive(sql, week, 0);
      }
      raidLive(sql, older, 1);
      sql.exec(
        'UPDATE raid_weeks SET rank = 3, ladder_won = 1, rank_after = 4 WHERE week_id = ?',
        older,
      );
      prune(ctx);

      for (const t of RAID_DETAIL) {
        expect(column(sql, t, 'week_id')).toEqual([last, current].sort());
      }
      // The stats stay: the weeks, the done markers, the Festival grants and every summary.
      expect(count(sql, 'raid_weeks')).toBe(4);
      expect(count(sql, 'raid_events')).toBe(4);
      expect(count(sql, 'raid_festival_grants')).toBe(4);
      expect(count(sql, 'raid_results')).toBe(4);
      expect(
        sql
          .exec<{ rank_after: number }>(
            'SELECT rank_after FROM raid_weeks WHERE week_id = ?',
            older,
          )
          .one().rank_after,
      ).toBe(4);
      const stripped = sql
        .exec<{ week_id: string; seed: string; result: string; summary: string }>(
          "SELECT week_id, seed, result, summary FROM raid_results WHERE input = ''",
        )
        .toArray();
      expect(stripped.map((r) => r.week_id).sort()).toEqual([oldest, older].sort());
      expect(stripped.every((r) => r.seed === '' && r.result === '' && r.summary === SUMMARY)).toBe(
        true,
      );
      expect(count(sql, 'raid_results', "input <> ''")).toBe(2);

      const tables = [...RAID_DETAIL, 'raid_results'];
      const before = snapshot(sql, tables);
      expect(prune(ctx)).toBe(false);
      expect(snapshot(sql, tables)).toEqual(before);
    });
  });

  it('keeps a week whose finale has not finished, and one with a live finale still unresolved', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      raidWeek(sql, oldest, 'phase2', 'u1');
      raidResult(sql, oldest);
      raidWeek(sql, stuck, 'finale', 'u1');
      // A real live finale with no finale result: still to resolve.
      raidLive(sql, stuck, 0);
      prune(ctx);
      expect(count(sql, 'raid_parties')).toBe(2);
      expect(count(sql, 'raid_live')).toBe(1);
      expect(count(sql, 'raid_results', "input <> ''")).toBe(1);
      // Its practice fights go all the same.
      raidLive(sql, stuck, 1);
      prune(ctx);
      expect(count(sql, 'raid_live')).toBe(1);
      expect(count(sql, 'raid_live', 'practice = 0')).toBe(1);
    });
  });

  it('offers no reveal for a week older than last week, and its replay and stats are not found', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      raidWeek(sql, older, 'finale', 'u1');
      sql.exec(
        `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
         VALUES (?, 1, 'finale', '', '', '', ?, 1)`,
        older,
        SUMMARY,
      );
      sql.exec('DELETE FROM raid_reveal_seen');
      expect(latestReveal(sql, 'u1', last)).toBeNull();
      expect(latestReveal(sql, 'u1', older)?.week).toBe(older);
      expect(ctx.core.raid.replay('u1', older, 1, 'finale')).toBeNull();
      expect(ctx.core.raid.stats('u1', older, 1, 'finale')).toBeNull();
    });
  });
});

describe('old Discord posts', () => {
  it('drops sent and failed posts after a week and keeps pending and recent ones', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      const post = (key: string, status: string, at: number): void => {
        sql.exec(
          `INSERT INTO discord_posts (key, channel_id, content, status, next_attempt_at, created_at)
           VALUES (?, '1', 'x', ?, ?, ?)`,
          key,
          status,
          at,
          at,
        );
      };
      post('old-sent', 'sent', T0 - 8 * DAY);
      post('old-failed', 'failed', T0 - 8 * DAY);
      post('old-pending', 'pending', T0 - 8 * DAY);
      post('new-sent', 'sent', T0 - 6 * DAY);
      prune(ctx);
      expect(column(sql, 'discord_posts', 'key')).toEqual(['new-sent', 'old-pending']);
      prune(ctx);
      expect(count(sql, 'discord_posts')).toBe(2);
    });
  });

  it('is not stopped by a pass that fails', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { sql } = ctx;
      sql.exec('DROP TABLE games_stall_buys');
      sql.exec(
        `INSERT INTO discord_posts (key, channel_id, content, status, next_attempt_at, created_at)
         VALUES ('k', '1', 'x', 'sent', 1, 1)`,
      );
      expect(prune(ctx)).toBe(false);
      expect(count(sql, 'discord_posts')).toBe(0);
    });
  });
});
