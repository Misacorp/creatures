import { basicAbilities, content, placementRank, raidWeekPlan } from '@creatures/game';
import { scaleBoss } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { RAID_DIFFICULTY_VERSION } from '../src/raid-difficulty';
import { readLadder } from '../src/raid-ladder';
import { redeclareWeek } from '../src/raid-redeclare';
import { addWeeks, weekIndex } from '../src/raid-schedule';
import { LATEST_SCHEMA_VERSION, undoDifficultyMigration, type CoreContext } from './helpers';
import {
  DAY,
  HELSINKI,
  W02,
  count,
  forcePool,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
  type Seeded,
} from './raid-helpers';

/**
 * Re-declaring an open week when the raid difficulty rules change (`raid-redeclare.ts`). The rules
 * themselves cannot change inside a test, so a week is made to look as if it was declared under older
 * rules: version 0 and a rank the current rules would not give.
 */

const LEVEL = 12;
const STALE_RANK = 1;

const seedMany = (ctx: CoreContext, n: number, level = LEVEL): Seeded[] =>
  Array.from({ length: n }, (_, i) => seedPlayer(ctx, 1 + i, { level }));

interface WeekState {
  difficulty_version: number;
  rank: number | null;
  effective_rank: number | null;
  boss_id: string;
  status: string;
}

const weekState = (ctx: CoreContext, weekId = W02.id): WeekState =>
  rows<WeekState & Record<string, string | number | null>>(
    ctx.sql,
    'SELECT difficulty_version, rank, effective_rank, boss_id, status FROM raid_weeks WHERE week_id = ?',
    weekId,
  )[0] as WeekState;

/** Everything of a week that is not its declared numbers: it must survive a re-declaration. */
function kept(ctx: CoreContext, weekId = W02.id): string {
  const q = (table: string, order: string) =>
    rows(ctx.sql, `SELECT * FROM ${table} WHERE week_id = ? ORDER BY ${order}`, weekId);
  const week = rows(
    ctx.sql,
    'SELECT week_id, boss_id, status, created_at, season_index, festival, festival_species FROM raid_weeks WHERE week_id = ?',
    weekId,
  );
  return JSON.stringify({
    week,
    parties: q('raid_parties', 'party'),
    members: q('raid_party_members', 'user_id'),
    placements: q('raid_placements', 'party, slot'),
    teams: q('raid_teams', 'user_id'),
    abilities: q('raid_abilities', 'user_id'),
    optOuts: q('raid_opt_outs', 'user_id'),
    events: q('raid_events', 'event'),
  });
}

/** Opens a week with players who have placed a creature and picked an ability. */
function openWeekWithChoices(ctx: CoreContext, players: number): Seeded[] {
  const seeded = seedMany(ctx, players);
  ctx.core.raid.currentWeek(HELSINKI);
  const ability = basicAbilities()[1]?.id as string;
  seeded.forEach((p, i) => {
    expect(ctx.core.raid.place(p.id, HELSINKI, p.creatureIds[0] as string, i)).toMatchObject({
      ok: true,
    });
    expect(ctx.core.raid.setAbility(p.id, HELSINKI, ability)).toMatchObject({ ok: true });
  });
  return seeded;
}

/** Makes the open week look as if it was declared under older rules (a lower rank, no version). */
function makeStale(ctx: CoreContext, weekId = W02.id): void {
  ctx.sql.exec(
    'UPDATE raid_weeks SET difficulty_version = 0, rank = ?, effective_rank = ? WHERE week_id = ?',
    STALE_RANK,
    STALE_RANK,
    weekId,
  );
  ctx.sql.exec('UPDATE raid_ladder SET rank = ?', STALE_RANK);
  ctx.core.raid.invalidateDifficultyCheck();
}

const redeclaredEvents = (ctx: CoreContext) =>
  rows<{ props_json: string; actor_hash: string | null }>(
    ctx.sql,
    "SELECT props_json, actor_hash FROM analytics_events WHERE kind = 'raid_week_redeclared' ORDER BY id",
  ).map((r) => ({
    props: JSON.parse(r.props_json) as Record<string, unknown>,
    actor: r.actor_hash,
  }));

describe('the raid difficulty version', () => {
  it('is stamped on a new week and is above the version of weeks from before it existed', async () => {
    await runRaid((ctx) => {
      seedMany(ctx, 4);
      ctx.core.raid.currentWeek(HELSINKI);
      expect(RAID_DIFFICULTY_VERSION).toBeGreaterThan(0);
      expect(weekState(ctx).difficulty_version).toBe(RAID_DIFFICULTY_VERSION);
    });
  });
});

describe('re-declaring an open week', () => {
  it('declares the rank again with the current rules and keeps everything else', async () => {
    await runRaid((ctx) => {
      const players = openWeekWithChoices(ctx, 4);
      const placed = placementRank(players.flatMap(() => [LEVEL, LEVEL, LEVEL]));
      expect(placed).toBeGreaterThan(STALE_RANK);
      const before = kept(ctx);
      const boss = weekState(ctx).boss_id;
      makeStale(ctx);

      ctx.core.raid.runDue(HELSINKI);

      const plan = raidWeekPlan(weekIndex(W02.id), placed);
      expect(weekState(ctx)).toMatchObject({
        difficulty_version: RAID_DIFFICULTY_VERSION,
        rank: placed,
        effective_rank: plan.effectiveRank,
        boss_id: boss,
        status: 'open',
      });
      // The server's first week: its placement was made again.
      expect(readLadder(ctx.sql).rank).toBe(placed);
      // Same boss, week id, sign-ups, board, teams, abilities: nothing but the numbers moved.
      expect(kept(ctx)).toBe(before);
      expect(count(ctx.sql, 'raid_placements')).toBe(4);
      expect(count(ctx.sql, 'raid_abilities')).toBe(4);
    });
  });

  it('makes the boss at Phase 1 follow the re-declared rank: HP pool and Attack from the current rules', async () => {
    await runRaid((ctx) => {
      const players = openWeekWithChoices(ctx, 4);
      const placed = placementRank(players.flatMap(() => [LEVEL, LEVEL, LEVEL]));
      makeStale(ctx);

      ctx.clock.t = W02.afterPhase1;
      ctx.core.raid.runDue(HELSINKI);

      const [run] = storedRuns(ctx.sql);
      const boss = content.bosses.find((b) => b.id === run?.input.boss.id);
      if (boss === undefined) throw new Error('boss missing');
      const effective = raidWeekPlan(weekIndex(W02.id), placed).effectiveRank;
      const scaled = scaleBoss(boss, 4, effective);
      expect(scaled.maxHp).toBeGreaterThan(scaleBoss(boss, 4, STALE_RANK).maxHp);
      expect(run?.input.bossHpPool).toEqual({ max: scaled.maxHp, current: scaled.maxHp });
      expect(run?.input.bossAtk).toBe(scaled.atk);
      // The pool is stored with the first stage and the week keeps its version.
      expect(weekState(ctx).difficulty_version).toBe(RAID_DIFFICULTY_VERSION);
    });
  });

  it('logs raid_week_redeclared once, with the old and new numbers and no player', async () => {
    await runRaid((ctx) => {
      const players = openWeekWithChoices(ctx, 4);
      const placed = placementRank(players.flatMap(() => [LEVEL, LEVEL, LEVEL]));
      makeStale(ctx);
      ctx.core.raid.runDue(HELSINKI);
      const logged = redeclaredEvents(ctx);
      expect(logged).toHaveLength(1);
      expect(logged[0]?.actor).toBeNull();
      expect(logged[0]?.props).toEqual({
        boss: weekState(ctx).boss_id,
        versionBefore: 0,
        versionAfter: RAID_DIFFICULTY_VERSION,
        rankBefore: STALE_RANK,
        rankAfter: placed,
        effectiveRankBefore: STALE_RANK,
        effectiveRankAfter: raidWeekPlan(weekIndex(W02.id), placed).effectiveRank,
        placedAgain: true,
      });
    });
  });

  it('keeps the ladder’s rank for a week after the server’s first, and eases a Festival from it', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4);
        // Week 1 was played and moved the ladder to rank 6; the open week is the Festival (W06).
        const festival = addWeeks(W02.id, 4);
        ctx.sql.exec('UPDATE raid_ladder SET rank = 6, best_rank = 5');
        ctx.clock.t = W02.monday + 4 * 7 * DAY;
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.sql.exec(
          `INSERT INTO raid_weeks (week_id, boss_id, status, created_at, season_index, festival, festival_species, rank, effective_rank, ladder_at, ladder_won, rank_after, difficulty_version)
           VALUES (?, ?, 'finale', 1, 0, 0, NULL, 5, 5, 2, 1, 6, 0)`,
          addWeeks(W02.id, 3),
          content.bosses[0]?.id,
        );
        ctx.sql.exec(
          'UPDATE raid_weeks SET difficulty_version = 0, rank = 2, effective_rank = 1 WHERE week_id = ?',
          festival,
        );
        ctx.core.raid.invalidateDifficultyCheck();

        ctx.core.raid.runDue(HELSINKI);

        const plan = raidWeekPlan(weekIndex(festival), 6);
        expect(plan.festival).toBe(true);
        expect(plan.effectiveRank).toBeLessThan(6);
        expect(weekState(ctx, festival)).toMatchObject({
          difficulty_version: RAID_DIFFICULTY_VERSION,
          rank: 6,
          effective_rank: plan.effectiveRank,
        });
        // The ladder moved earlier, so nothing is placed again.
        expect(readLadder(ctx.sql)).toEqual({ rank: 6, bestRank: 5 });
        expect(redeclaredEvents(ctx)[0]?.props).toMatchObject({ placedAgain: false });
        // The past week is not touched.
        expect(weekState(ctx, addWeeks(W02.id, 3)).difficulty_version).toBe(0);
      },
      { start: W02.monday + 4 * 7 * DAY },
    );
  });

  it('only stamps the version on a week that has no rank yet (nobody was in)', async () => {
    await runRaid((ctx) => {
      ctx.core.raid.currentWeek(HELSINKI);
      expect(weekState(ctx).rank).toBeNull();
      ctx.sql.exec('UPDATE raid_weeks SET difficulty_version = 0');
      ctx.core.raid.invalidateDifficultyCheck();
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toMatchObject({
        difficulty_version: RAID_DIFFICULTY_VERSION,
        rank: null,
      });
      expect(readLadder(ctx.sql).rank).toBeNull();
    });
  });

  it('does it on a request, not only on the alarm', async () => {
    await runRaid(async (ctx) => {
      const players = openWeekWithChoices(ctx, 4);
      const placed = placementRank(players.flatMap(() => [LEVEL, LEVEL, LEVEL]));
      const secret = await ctx.core.createSession(ctx.guildId, {
        id: (players[0] as Seeded).id,
        displayName: 'Player 1',
      });
      makeStale(ctx);
      const res = await ctx.request(secret, '/api/raid');
      expect(res.status).toBe(200);
      expect((await res.json<{ rank: number }>()).rank).toBe(placed);
      expect(weekState(ctx).difficulty_version).toBe(RAID_DIFFICULTY_VERSION);
    });
  });

  it('is done once when requests arrive in parallel', async () => {
    await runRaid(async (ctx) => {
      const players = openWeekWithChoices(ctx, 4);
      const placed = placementRank(players.flatMap(() => [LEVEL, LEVEL, LEVEL]));
      const secrets = await Promise.all(
        players.map((p) => ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name })),
      );
      makeStale(ctx);
      const responses = await Promise.all([
        ...secrets.map((s) => ctx.request(s, '/api/raid')),
        ...secrets.map((s) => ctx.request(s, '/api/raid')),
      ]);
      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect(redeclaredEvents(ctx)).toHaveLength(1);
      expect(weekState(ctx)).toMatchObject({
        difficulty_version: RAID_DIFFICULTY_VERSION,
        rank: placed,
      });
    });
  });

  it('does nothing the second time', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      makeStale(ctx);
      ctx.core.raid.runDue(HELSINKI);
      const after = weekState(ctx);
      const kept1 = kept(ctx);
      // Even if the numbers were edited and the scan is asked for again, the stored version guards it.
      ctx.sql.exec('UPDATE raid_weeks SET rank = 2, effective_rank = 2');
      ctx.core.raid.invalidateDifficultyCheck();
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toMatchObject({ rank: 2, effective_rank: 2 });
      expect(after.difficulty_version).toBe(RAID_DIFFICULTY_VERSION);
      expect(kept(ctx)).toBe(kept1);
      expect(redeclareWeek(ctx.sql, W02.id)).toBeNull();
      expect(redeclaredEvents(ctx)).toHaveLength(1);
    });
  });

  it('does nothing for a week already at the current version', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      const before = weekState(ctx);
      ctx.core.raid.invalidateDifficultyCheck();
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toEqual(before);
      expect(redeclaredEvents(ctx)).toHaveLength(0);
    });
  });
});

describe('a week that must not be re-declared', () => {
  it('keeps its numbers once Phase 1 has resolved', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      ctx.clock.t = W02.afterPhase1;
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx).status).toBe('phase1');
      const pool = storedRuns(ctx.sql)[0]?.input.bossHpPool;
      makeStale(ctx);
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toMatchObject({
        difficulty_version: 0,
        rank: STALE_RANK,
        effective_rank: STALE_RANK,
      });
      expect(redeclaredEvents(ctx)).toHaveLength(0);
      expect(pool).toBeDefined();
    });
  });

  it('keeps its numbers when a stage has resolved for some party only (the week is still open)', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      ctx.sql.exec(
        `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
         VALUES (?, 1, 'phase1', 's', '{}', '{}', '{}', 1)`,
        W02.id,
      );
      makeStale(ctx);
      expect(redeclareWeek(ctx.sql, W02.id)).toBeNull();
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toMatchObject({ difficulty_version: 0, rank: STALE_RANK });
    });
  });

  it('keeps its numbers once the pool is fixed or a real live fight exists', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      makeStale(ctx);
      forcePool(ctx.sql, 500);
      expect(redeclareWeek(ctx.sql, W02.id)).toBeNull();
      ctx.sql.exec('UPDATE raid_parties SET hp_max = NULL, hp_current = NULL, boss_atk = NULL');
      ctx.sql.exec(
        `INSERT INTO raid_live (week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds)
         VALUES (?, 1, 0, 's', '{}', '[]', '[]', 1, 1000, 12)`,
        W02.id,
      );
      expect(redeclareWeek(ctx.sql, W02.id)).toBeNull();
      expect(weekState(ctx)).toMatchObject({ difficulty_version: 0, rank: STALE_RANK });
    });
  });

  it('never touches a finished week', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      ctx.sql.exec("UPDATE raid_weeks SET status = 'finale'");
      makeStale(ctx);
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toMatchObject({ difficulty_version: 0, rank: STALE_RANK });
    });
  });

  it('never touches a week from before the ladder (a legacy week)', async () => {
    await runRaid((ctx) => {
      openWeekWithChoices(ctx, 4);
      makeStale(ctx);
      ctx.sql.exec('UPDATE raid_weeks SET season_index = NULL');
      expect(redeclareWeek(ctx.sql, W02.id)).toBeNull();
    });
  });
});

describe('migration 24', () => {
  it('adds the version to an old database: existing weeks get 0 and an open one is re-declared', async () => {
    await runRaid((ctx) => {
      const players = openWeekWithChoices(ctx, 4);
      const placed = placementRank(players.flatMap(() => [LEVEL, LEVEL, LEVEL]));
      ctx.sql.exec('UPDATE raid_weeks SET rank = ?, effective_rank = ?', STALE_RANK, STALE_RANK);
      ctx.sql.exec('UPDATE raid_ladder SET rank = ?', STALE_RANK);
      undoDifficultyMigration(ctx.sql);
      // The undo also takes back migration 25 (the daily allowance table), which sits above it.
      expect(
        ctx.sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v,
      ).toBe(LATEST_SCHEMA_VERSION - 2);
      expect(() => ctx.sql.exec('SELECT difficulty_version FROM raid_weeks').toArray()).toThrow();

      ctx.core.migrate();
      expect(
        ctx.sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v,
      ).toBe(LATEST_SCHEMA_VERSION);
      expect(weekState(ctx).difficulty_version).toBe(0);
      // Migrating again changes nothing.
      ctx.core.migrate();
      expect(weekState(ctx).difficulty_version).toBe(0);

      ctx.core.raid.invalidateDifficultyCheck();
      ctx.core.raid.runDue(HELSINKI);
      expect(weekState(ctx)).toMatchObject({
        difficulty_version: RAID_DIFFICULTY_VERSION,
        rank: placed,
      });
      expect(count(ctx.sql, 'raid_placements')).toBe(4);
    });
  });
});
