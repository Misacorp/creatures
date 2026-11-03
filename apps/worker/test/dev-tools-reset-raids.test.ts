// The `reset-raids-dungeons` dev tool: every raid and dungeon table of the guild is emptied, players' creatures, balances and the clock stay,
// and the next request creates the week fresh (docs/design/dev-tools.md).
import { describe, expect, it } from 'vitest';
import { raidDungeonTables } from '../src/dev-tools-reset-raids';
import { ON, player } from './dev-helpers';
import type { CoreContext } from './helpers';
import { HELSINKI, count, rows, runRaid } from './raid-helpers';
import { V2_WEEK } from './raid-v2-helpers';

/** Every table the tool clears. A new `raid_` or `dungeon_` table fails this test until it is listed here on purpose. */
const EXPECTED_TABLES = [
  'dungeon_days',
  'dungeon_drafts',
  'dungeon_progress',
  'dungeon_runs',
  'dungeon_steps',
  'jackpot_pity',
  'raid_abilities',
  'raid_autofire',
  'raid_events',
  'raid_festival_grants',
  'raid_ladder',
  'raid_live',
  'raid_opt_outs',
  'raid_parties',
  'raid_party_members',
  'raid_placements',
  'raid_readiness',
  'raid_results',
  'raid_reveal_seen',
  'raid_swap_requests',
  'raid_team_cache',
  'raid_teams',
  'raid_track',
  'raid_weeks',
];

/** A week made under the old rules with a placement, a resolved phase and a dungeon run, a queued raid post and a pity row. */
function playedWeek(ctx: CoreContext, userId: string, creatureId: string): void {
  // The caller's session may have made the week already: the old week replaces it.
  ctx.sql.exec('DELETE FROM raid_weeks');
  ctx.sql.exec(
    `INSERT INTO raid_weeks (week_id, boss_id, status, created_at, season_index, festival, difficulty_version, rank, effective_rank)
     VALUES (?, 'tidal-colossus', 'open', ?, 0, 0, 99, 1, 1)`,
    V2_WEEK.id,
    ctx.clock.t,
  );
  ctx.sql.exec('INSERT OR IGNORE INTO raid_ladder (id, rank, best_rank) VALUES (1, 3, 2)');
  ctx.sql.exec('UPDATE raid_ladder SET rank = 3, best_rank = 2 WHERE id = 1');
  ctx.sql.exec(
    'INSERT INTO raid_parties (week_id, party, hp_max, hp_current) VALUES (?, 1, 100, 60)',
    V2_WEEK.id,
  );
  ctx.sql.exec(
    'INSERT INTO raid_party_members (week_id, user_id, party, joined_at) VALUES (?, ?, 1, ?)',
    V2_WEEK.id,
    userId,
    ctx.clock.t,
  );
  ctx.sql.exec(
    'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
    V2_WEEK.id,
    userId,
    creatureId,
  );
  ctx.sql.exec(
    `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
     VALUES (?, 1, 'phase1', 's', '{}', '{}', '{}', ?)`,
    V2_WEEK.id,
    ctx.clock.t,
  );
  ctx.sql.exec(
    "INSERT INTO raid_events (week_id, event, outcome, done_at) VALUES (?, 'phase1', 'ran', ?)",
    V2_WEEK.id,
    ctx.clock.t,
  );
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2) ON CONFLICT(id) DO UPDATE SET slot = 6',
  );
  ctx.sql.exec('INSERT INTO jackpot_pity (user_id, counter) VALUES (?, 4)', userId);
  ctx.sql.exec(
    'INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, 3, ?)',
    userId,
    '2027-01-11',
  );
  ctx.sql.exec(
    "INSERT INTO discord_posts (key, channel_id, content, status, attempts, next_attempt_at, created_at) VALUES ('raid:2027-W02:weekStart:all', 'c', '{}', 'pending', 0, 0, 0), ('other:1', 'c', '{}', 'pending', 0, 0, 0)",
  );
}

const worldCounts = (ctx: CoreContext) => ({
  creatures: count(ctx.sql, 'creatures'),
  balances: rows(ctx.sql, 'SELECT * FROM balances ORDER BY 1'),
  ledger: count(ctx.sql, 'ledger'),
  analytics: count(ctx.sql, 'analytics_events'),
  clock: rows(ctx.sql, "SELECT value FROM dev_state WHERE key = 'clock_offset_ms'"),
});

describe('the reset-raids-dungeons dev tool', () => {
  it('covers exactly the raid and dungeon tables of the schema (a new one fails here until it is listed)', async () => {
    await runRaid((ctx) => {
      expect(raidDungeonTables(ctx.sql)).toEqual(EXPECTED_TABLES);
    });
  });

  it('wants the word reset, and does not exist without the dev tools', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        expect(await p.dev('reset-raids-dungeons', {})).toMatchObject({ status: 400 });
        expect(await p.dev('reset-raids-dungeons', { confirm: 'RESET' })).toMatchObject({
          status: 400,
        });
        expect(await p.dev('reset-raids-dungeons', { confirm: 'reset', x: 1 })).toMatchObject({
          status: 400,
        });
      },
      { core: ON },
    );
    await runRaid(async (ctx) => {
      const p = await player(ctx);
      expect(await p.dev('reset-raids-dungeons', { confirm: 'reset' })).toMatchObject({
        status: 404,
      });
    });
  });

  it('empties every raid and dungeon table, keeps creatures, balances and the clock, and the next week is fresh (rules 1 without the flag)', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        await p.tool('set-balances', { bait: 5 });
        playedWeek(ctx, p.id, p.creatureIds[0] as string);
        const before = worldCounts(ctx);
        const res = (await p.tool('reset-raids-dungeons', { confirm: 'reset' })) as {
          deleted: Record<string, number>;
        };
        expect(res.deleted).toMatchObject({
          raid_weeks: 1,
          raid_results: 1,
          raid_placements: 1,
          raid_track: 1,
          raid_ladder: 1,
          jackpot_pity: 1,
          dungeon_progress: 1,
          discord_posts: 1,
        });
        for (const table of EXPECTED_TABLES.filter((t) => t !== 'raid_ladder')) {
          expect(count(ctx.sql, table), table).toBe(0);
        }
        expect(rows(ctx.sql, 'SELECT rank, best_rank FROM raid_ladder')).toEqual([
          { rank: null, best_rank: null },
        ]);
        // The other post stays; creatures, balances, ledger, analytics and the clock too.
        expect(count(ctx.sql, 'discord_posts', "key = 'other:1'")).toBe(1);
        expect(worldCounts(ctx).creatures).toBe(before.creatures);
        expect(worldCounts(ctx).balances).toEqual(before.balances);
        expect(worldCounts(ctx).ledger).toBe(before.ledger);
        expect(worldCounts(ctx).clock).toEqual(before.clock);
        // The next raid request makes the week fresh.
        const week = ctx.core.raid.currentWeek(HELSINKI);
        expect(week).toMatchObject({ weekId: V2_WEEK.id, rules: 1, status: 'open' });
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        // A second run changes nothing but the fresh week.
        await p.tool('reset-raids-dungeons', { confirm: 'reset' });
        expect(count(ctx.sql, 'raid_weeks')).toBe(0);
      },
      { start: V2_WEEK.open, core: ON },
    );
  });

  it('makes the next week a combat v2 week at track slot 1 when the flag is on', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        playedWeek(ctx, p.id, p.creatureIds[0] as string);
        expect(ctx.core.raid.currentWeek(HELSINKI)).toMatchObject({ rules: 1 });
        await p.tool('reset-raids-dungeons', { confirm: 'reset' });
        expect(ctx.core.raid.currentWeek(HELSINKI)).toMatchObject({
          weekId: V2_WEEK.id,
          rules: 2,
          trackSlot: 1,
        });
        expect(rows(ctx.sql, 'SELECT slot FROM raid_track')).toEqual([{ slot: 1 }]);
      },
      { start: V2_WEEK.open, core: { ...ON, combatV2: true } },
    );
  });
});
