import {
  RULES,
  content,
  createSeededRng,
  essenceForStage,
  festivalCreatureFor,
  jackpotEssenceFor,
  nextRank,
  pickQuirk,
  placementRank,
  raidWeekPlan,
  scaleEssence,
} from '@creatures/game';
import { scaleBoss } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { grantFestivalCreature } from '../src/raid-festival';
import { settleLive } from '../src/raid-live';
import { readLadder, updateLadder } from '../src/raid-ladder';
import { addWeeks, weekIndex } from '../src/raid-schedule';
import type { CoreContext } from './helpers';
import {
  DAY,
  HELSINKI,
  W02,
  count,
  joinEveryone,
  joinRaid,
  raidLedger,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
  type Seeded,
} from './raid-helpers';

/**
 * The Boss Rank ladder on the server: placement, the weekly plan, the ladder update after a finale,
 * seasons and Festival weeks. Weeks are counted from 2027-W02, a normal week (season week 1); 2027-W06
 * is a Festival, and so is 2027-W11.
 */

interface WeekAt {
  id: string;
  monday: number;
  afterPhase2: number;
  afterFinale: number;
}

/** The raid week `n` weeks after 2027-W02, with the instants the tests move the clock to. */
function weekAt(n: number): WeekAt {
  const shift = n * 7 * DAY;
  return {
    id: addWeeks(W02.id, n),
    monday: W02.monday + shift,
    afterPhase2: W02.afterPhase2 + shift,
    afterFinale: W02.afterFinale + shift,
  };
}

const WIN = true;
const LOSS = false;

/**
 * Opens a week: every seeded player is active again and the week's events run. Then every player joins by
 * placing their creatures (placements are per week).
 */
function openWeek(ctx: CoreContext, week: WeekAt): void {
  ctx.clock.t = week.monday;
  ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
  ctx.core.raid.runDue(HELSINKI);
  ctx.core.raid.currentWeek(HELSINKI);
  joinEveryone(ctx);
}

const partyNumbers = (ctx: CoreContext, weekId: string): number[] =>
  rows<{ party: number }>(
    ctx.sql,
    'SELECT party FROM raid_parties WHERE week_id = ? ORDER BY party',
    weekId,
  ).map((r) => r.party);

/**
 * Plays an open week to its end. Phases 1 and 2 resolve; then each party is left one hit from death
 * (`WIN`) or with a boss that cannot fall (`LOSS`), and the finale resolves at once (it runs too
 * late for anyone to watch).
 */
function playWeek(ctx: CoreContext, week: WeekAt, results: boolean[]): void {
  ctx.clock.t = week.afterPhase2;
  ctx.core.raid.runDue(HELSINKI);
  partyNumbers(ctx, week.id).forEach((party, i) => {
    if (results[i] === WIN) {
      ctx.sql.exec(
        'UPDATE raid_parties SET hp_current = 1 WHERE week_id = ? AND party = ?',
        week.id,
        party,
      );
    } else {
      ctx.sql.exec(
        'UPDATE raid_parties SET hp_max = 50000000, hp_current = 50000000 WHERE week_id = ? AND party = ?',
        week.id,
        party,
      );
    }
  });
  ctx.clock.t = week.afterFinale;
  ctx.core.raid.runDue(HELSINKI);
}

const seedMany = (ctx: CoreContext, n: number, level: number, first = 1): Seeded[] =>
  Array.from({ length: n }, (_, i) => seedPlayer(ctx, first + i, { level }));

interface WeekRowShape {
  rank: number | null;
  effective_rank: number | null;
  festival: number | null;
  season_index: number | null;
  festival_species: string | null;
  ladder_at: number | null;
  ladder_won: number | null;
  rank_after: number | null;
}

const weekRow = (ctx: CoreContext, weekId: string): WeekRowShape =>
  rows<WeekRowShape & Record<string, number | string | null>>(
    ctx.sql,
    `SELECT rank, effective_rank, festival, season_index, festival_species, ladder_at, ladder_won, rank_after
     FROM raid_weeks WHERE week_id = ?`,
    weekId,
  )[0] as WeekRowShape;

/** Sets the server's rank directly, as if earlier weeks had been played. */
const setRank = (ctx: CoreContext, rank: number): void => {
  ctx.sql.exec('UPDATE raid_ladder SET rank = ? WHERE id = 1', rank);
};

describe('placement', () => {
  it('places a new server once, at its first week, at the start rank whatever its roster brings', async () => {
    await runRaid(
      (ctx) => {
        const players = seedMany(ctx, 5, 12);
        expect(readLadder(ctx.sql)).toEqual({ rank: null, bestRank: null });
        openWeek(ctx, weekAt(0));
        const levels = players.flatMap(() => [12, 12, 12]);
        // Every new server starts at the same rank, however strong its creatures are.
        const expected = placementRank(levels);
        expect(expected).toBe(RULES.progression.placement.startRank);
        expect(readLadder(ctx.sql).rank).toBe(expected);
        expect(weekRow(ctx, W02.id)).toMatchObject({
          rank: expected,
          effective_rank: expected,
          festival: 0,
          season_index: raidWeekPlan(weekIndex(W02.id), 1).seasonIndex,
          festival_species: null,
          ladder_at: null,
        });

        // Once: the creatures grow to their level cap and a new week still takes the server's rank.
        ctx.sql.exec('UPDATE creatures SET level = 15');
        const next = weekAt(1);
        openWeek(ctx, next);
        // The ladder may have moved on its own (the first week ran and was won); it is never placed again.
        const ladderRank = readLadder(ctx.sql).rank;
        expect(ladderRank).toBeGreaterThanOrEqual(expected);
        expect(weekRow(ctx, next.id).rank).toBe(ladderRank);
        expect(placementRank(players.flatMap(() => [15, 15, 15]))).toBe(expected);
      },
      { start: W02.monday },
    );
  });

  it('puts a roster of level 1 creatures at rank 1', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 1);
        openWeek(ctx, weekAt(0));
        expect(readLadder(ctx.sql).rank).toBe(1);
        expect(weekRow(ctx, W02.id)).toMatchObject({ rank: 1, effective_rank: 1 });
      },
      { start: W02.monday },
    );
  });

  it('waits for the first player to place when the week opens, then places the server', async () => {
    await runRaid(
      (ctx) => {
        openWeek(ctx, weekAt(0));
        expect(count(ctx.sql, 'raid_party_members')).toBe(0);
        expect(readLadder(ctx.sql).rank).toBeNull();
        expect(weekRow(ctx, W02.id)).toMatchObject({
          rank: null,
          effective_rank: null,
          festival: 0,
        });

        // An active player who has not placed does not count: the server is still not placed.
        const [late] = seedMany(ctx, 1, 9) as [Seeded];
        ctx.core.raid.view(late.id, HELSINKI);
        expect(readLadder(ctx.sql).rank).toBeNull();

        // The first placement joins the week and places the server.
        joinRaid(ctx, late);
        const expected = placementRank([9, 9, 9]);
        expect(readLadder(ctx.sql).rank).toBe(expected);
        expect(weekRow(ctx, W02.id)).toMatchObject({ rank: expected, effective_rank: expected });
        // Other joiners do not place it again.
        joinRaid(ctx, seedMany(ctx, 3, 20, 10));
        expect(readLadder(ctx.sql).rank).toBe(expected);
      },
      { start: W02.monday },
    );
  });

  it('scales the boss with the week’s stored rank and the head count only', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 6, 12);
        openWeek(ctx, weekAt(0));
        const rank = readLadder(ctx.sql).rank as number;
        ctx.clock.t = weekAt(0).afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const [p1] = storedRuns(ctx.sql);
        const boss = content.bosses.find((b) => b.id === p1?.input.boss.id) as NonNullable<
          (typeof content.bosses)[number]
        >;
        const scaled = scaleBoss(boss, 6, rank);
        expect(p1?.input.bossHpPool.max).toBe(scaled.maxHp);
        expect(p1?.input.bossAtk).toBe(scaled.atk);
      },
      { start: W02.monday },
    );
  });
});

describe('the ladder update', () => {
  it('raises the rank by one after a won finale, records the best rank, and does it once', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 12);
        const week = weekAt(0);
        openWeek(ctx, week);
        const rank = readLadder(ctx.sql).rank as number;
        playWeek(ctx, week, [WIN]);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(true);
        expect(readLadder(ctx.sql)).toEqual({ rank: rank + 1, bestRank: rank });
        expect(weekRow(ctx, week.id)).toMatchObject({
          ladder_won: 1,
          rank_after: rank + 1,
        });
        expect(weekRow(ctx, week.id).ladder_at).not.toBeNull();

        // Idempotent: running everything again, or the update itself, changes nothing.
        const before = weekRow(ctx, week.id);
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.resolvePhase(
          ctx.core.raid.week(week.id) as NonNullable<ReturnType<typeof ctx.core.raid.week>>,
          'finale',
        );
        expect(updateLadder(ctx.sql, week.id, ctx.clock.t + 1000)).toBeNull();
        expect(weekRow(ctx, week.id)).toEqual(before);
        expect(readLadder(ctx.sql)).toEqual({ rank: rank + 1, bestRank: rank });
      },
      { start: W02.monday },
    );
  });

  it('keeps the rank after a lost finale, with no demotion', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 12);
        const week = weekAt(0);
        openWeek(ctx, week);
        setRank(ctx, 4);
        ctx.sql.exec('UPDATE raid_weeks SET rank = 4, effective_rank = 4');
        playWeek(ctx, week, [LOSS]);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(false);
        expect(readLadder(ctx.sql)).toEqual({ rank: 4, bestRank: null });
        expect(weekRow(ctx, week.id)).toMatchObject({ ladder_won: 0, rank_after: 4 });
        // The next week fights at the same rank.
        const next = weekAt(1);
        openWeek(ctx, next);
        expect(weekRow(ctx, next.id)).toMatchObject({ rank: 4, effective_rank: 4 });
      },
      { start: W02.monday },
    );
  });

  it('counts a server as won when at least half of its parties won (two parties, one each)', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 16, 10);
        const week = weekAt(0);
        openWeek(ctx, week);
        expect(partyNumbers(ctx, week.id)).toEqual([1, 2]);
        const rank = readLadder(ctx.sql).rank as number;
        // Party 1 wins and settles first; the ladder waits for party 2.
        playWeek(ctx, week, [WIN, LOSS]);
        expect(
          rows(ctx.sql, "SELECT party, phase FROM raid_results WHERE phase = 'finale'"),
        ).toHaveLength(2);
        expect(weekRow(ctx, week.id)).toMatchObject({ ladder_won: 1, rank_after: rank + 1 });
        expect(readLadder(ctx.sql)).toEqual({ rank: rank + 1, bestRank: rank });
      },
      { start: W02.monday },
    );
  });

  it('counts a server as lost when fewer than half of its parties won (one of three)', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 31, 10);
        const week = weekAt(0);
        openWeek(ctx, week);
        expect(partyNumbers(ctx, week.id)).toEqual([1, 2, 3]);
        const rank = readLadder(ctx.sql).rank as number;
        playWeek(ctx, week, [LOSS, WIN, LOSS]);
        expect(weekRow(ctx, week.id)).toMatchObject({ ladder_won: 0, rank_after: rank });
        expect(readLadder(ctx.sql)).toEqual({ rank, bestRank: null });
      },
      { start: W02.monday },
    );
  });

  it('waits until every party has finished, and the live finale moves it when the last party ends', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 16, 10);
        const week = weekAt(0);
        openWeek(ctx, week);
        const rank = readLadder(ctx.sql).rank as number;
        ctx.clock.t = week.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        ctx.sql.exec('UPDATE raid_parties SET hp_current = 1');
        // On time: the finale starts live for both parties; nothing has resolved yet.
        ctx.clock.t = Date.parse('2027-01-17T18:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_live', 'practice = 0')).toBe(2);
        expect(weekRow(ctx, week.id).ladder_at).toBeNull();
        // Resolve one party at a time, as the end of each live fight does: the ladder waits for the
        // other party, and moves when the last one has resolved.
        const end = Date.parse('2027-01-17T18:30:00Z');
        ctx.clock.t = end;
        const deps = { storage: ctx.storage, now: () => end, rng: createSeededRng('live-ladder') };
        expect(settleLive(deps, week.id, 1, end)).toBe(true);
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(1);
        expect(weekRow(ctx, week.id).ladder_at).toBeNull();
        expect(readLadder(ctx.sql).rank).toBe(rank);
        expect(settleLive(deps, week.id, 2, end)).toBe(true);
        expect(weekRow(ctx, week.id)).toMatchObject({ ladder_won: 1, rank_after: rank + 1 });
        expect(readLadder(ctx.sql).rank).toBe(rank + 1);
      },
      { start: W02.monday },
    );
  });

  it('does not move the rank for a week in which no finale was played', async () => {
    await runRaid(
      (ctx) => {
        // Someone is placed first; then a week where nobody takes part.
        seedMany(ctx, 3, 12);
        openWeek(ctx, weekAt(0));
        setRank(ctx, 5);
        ctx.sql.exec('UPDATE raid_weeks SET rank = 5, effective_rank = 5');
        playWeek(ctx, weekAt(0), [LOSS]);
        expect(readLadder(ctx.sql).rank).toBe(5);
        const empty = weekAt(1);
        // Nobody has been around for weeks: nobody is on this week's roster.
        ctx.clock.t = empty.monday;
        ctx.sql.exec('UPDATE players SET last_seen_at = 0');
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.currentWeek(HELSINKI);
        expect(count(ctx.sql, 'raid_party_members', `week_id = '${empty.id}'`)).toBe(0);
        ctx.clock.t = empty.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_results', `week_id = '${empty.id}'`)).toBe(0);
        expect(readLadder(ctx.sql).rank).toBe(5);
        expect(weekRow(ctx, empty.id).ladder_at).toBeNull();
        expect(weekRow(ctx, empty.id).rank).toBe(5);
      },
      { start: W02.monday },
    );
  });

  it('does not move the rank for a week in which players are active but nobody joined', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 3, 12);
        openWeek(ctx, weekAt(0));
        setRank(ctx, 5);
        ctx.sql.exec('UPDATE raid_weeks SET rank = 5, effective_rank = 5');
        playWeek(ctx, weekAt(0), [LOSS]);
        const idle = weekAt(1);
        // Everyone is around and the week opens, but nobody places a creature on the board.
        ctx.clock.t = idle.monday;
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.currentWeek(HELSINKI);
        expect(count(ctx.sql, 'raid_party_members', `week_id = '${idle.id}'`)).toBe(0);
        ctx.clock.t = idle.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        // No fight, no result, no loot, and a week that is simply over.
        expect(count(ctx.sql, 'raid_results', `week_id = '${idle.id}'`)).toBe(0);
        expect(
          rows(ctx.sql, 'SELECT week_id, status FROM raid_weeks WHERE week_id = ?', idle.id),
        ).toEqual([{ week_id: idle.id, status: 'finale' }]);
        expect(readLadder(ctx.sql).rank).toBe(5);
        expect(weekRow(ctx, idle.id).ladder_at).toBeNull();
      },
      { start: W02.monday },
    );
  });

  it('walks a season: wins raise the rank, the Festival fights lower and eases the rank afterwards', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 12);
        const first = weekAt(0);
        openWeek(ctx, first);
        const start = readLadder(ctx.sql).rank as number;
        // Weeks 1 to 4 (W02 to W05) are normal weeks: win, loss, win, win.
        const outcomes = [WIN, LOSS, WIN, WIN];
        let rank = start;
        let best: number | null = null;
        outcomes.forEach((won, i) => {
          const week = weekAt(i);
          if (i > 0) openWeek(ctx, week);
          expect(weekRow(ctx, week.id)).toMatchObject({ rank, effective_rank: rank, festival: 0 });
          playWeek(ctx, week, [won]);
          if (won) best = rank;
          rank = nextRank(rank, weekIndex(week.id), won);
          expect(readLadder(ctx.sql)).toEqual({ rank, bestRank: best });
        });
        expect(rank).toBe(start + 3);

        // W06 is the Festival: the boss fights 3 ranks lower, the card shows the server's rank.
        const festival = weekAt(4);
        openWeek(ctx, festival);
        const plan = raidWeekPlan(weekIndex(festival.id), rank);
        expect(plan.festival).toBe(true);
        expect(weekRow(ctx, festival.id)).toMatchObject({
          rank,
          effective_rank: Math.max(1, rank - RULES.progression.festivalEaseRanks),
          festival: 1,
        });
        playWeek(ctx, festival, [WIN]);
        // A Festival win does not raise the rank, and the season reset eases it by one. The best
        // rank is not touched by a Festival.
        expect(readLadder(ctx.sql)).toEqual({ rank: rank - 1, bestRank: best });
        expect(weekRow(ctx, festival.id)).toMatchObject({ ladder_won: 1, rank_after: rank - 1 });

        // The next season starts one rank lower.
        const next = weekAt(5);
        openWeek(ctx, next);
        expect(weekRow(ctx, next.id)).toMatchObject({ rank: rank - 1, festival: 0 });
      },
      { start: W02.monday },
    );
  });

  it('eases the rank after a lost Festival too, but never below 1', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 1);
        const week = weekAt(4);
        openWeek(ctx, week);
        expect(readLadder(ctx.sql).rank).toBe(1);
        playWeek(ctx, week, [LOSS]);
        expect(readLadder(ctx.sql)).toEqual({ rank: 1, bestRank: null });
        // At rank 3 a lost Festival still eases by one.
        const later = weekAt(9);
        openWeek(ctx, later);
        expect(weekRow(ctx, later.id).festival).toBe(1);
        setRank(ctx, 3);
        ctx.sql.exec(
          'UPDATE raid_weeks SET rank = 3, effective_rank = 1 WHERE week_id = ?',
          later.id,
        );
        playWeek(ctx, later, [LOSS]);
        expect(readLadder(ctx.sql).rank).toBe(2);
      },
      { start: W02.monday },
    );
  });
});

describe('rewards follow the rank', () => {
  it('pays Essence and the jackpot by the week’s rank, and a Festival on top, to the same numbers it shows', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 12);
        const week = weekAt(4); // the Festival of W06
        openWeek(ctx, week);
        setRank(ctx, 6);
        ctx.sql.exec('UPDATE raid_weeks SET rank = 6, effective_rank = 3');
        // Everyone hits the jackpot: pity is at its hard limit.
        for (const row of rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_party_members',
        )) {
          ctx.sql.exec('INSERT INTO jackpot_pity (user_id, counter) VALUES (?, 9)', row.user_id);
        }
        playWeek(ctx, week, [WIN]);
        const payout = { rank: 6, festival: true };
        const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
        expect(finale?.result.cleared).toBe(true);
        const ledger = raidLedger(ctx.sql);
        const jackpots = ledger.filter((l) => l.idempotency_key.endsWith(':jackpot'));
        expect(jackpots).toHaveLength(4);
        expect(jackpots.every((j) => j.amount === jackpotEssenceFor(payout))).toBe(true);
        expect(jackpotEssenceFor(payout)).toBeGreaterThan(RULES.raid.jackpotEssence);
        // The stage payouts: the contribution weights are the engine's, the rule is the game's.
        const paid = ledger.filter((l) => l.idempotency_key === `raid:${week.id}:1:finale`);
        const flat = scaleEssence(RULES.raid.essence.flat.finale, payout);
        expect(flat).toBeGreaterThan(RULES.raid.essence.flat.finale);
        expect(paid.every((p) => p.amount >= flat)).toBe(true);
        const members = finale?.summary.members.map((m) => m.alias) ?? [];
        const owed = essenceForStage(
          'finale',
          members,
          Object.fromEntries(
            members.map((a) => [a, finale?.result.perPlayer[a]?.contribution ?? 0]),
          ),
          payout,
        );
        expect(paid.reduce((t, p) => t + p.amount, 0)).toBe(
          Object.values(owed).reduce((a, b) => a + b, 0),
        );
        // What the reveal shows is what was paid: one combined figure, the jackpot included.
        const userId = finale?.summary.members[0]?.userId as string;
        const reveal = ctx.core.raid.view(userId, HELSINKI).you.reveal;
        expect(reveal?.essence).toBe(
          (paid.find((p) => p.user_id === userId)?.amount ?? 0) + jackpotEssenceFor(payout),
        );
        expect(Object.keys(reveal ?? {})).not.toContain('jackpot');
      },
      { start: W02.monday },
    );
  });
});

describe('Festival weeks and the Festival creature', () => {
  const festivalWeek = weekAt(4);
  const species = festivalCreatureFor(weekIndex(festivalWeek.id));

  it('is the creature the season index picks, stored with the week', async () => {
    expect(species).not.toBeNull();
    expect(species?.catchable).toBe(false);
    await runRaid(
      (ctx) => {
        seedMany(ctx, 3, 5);
        openWeek(ctx, festivalWeek);
        expect(weekRow(ctx, festivalWeek.id).festival_species).toBe(species?.id);
        const view = ctx.core.raid.view(
          rows<{ user_id: string }>(ctx.sql, 'SELECT user_id FROM raid_party_members')[0]
            ?.user_id as string,
          HELSINKI,
        );
        expect(view).toMatchObject({ festival: true, festivalCreature: species?.id });
        expect(view.rank).toBeGreaterThanOrEqual(1);
        expect(view.effectiveRank).toBe(Math.max(1, (view.rank as number) - 3));
        expect(view.season).toEqual({
          index: raidWeekPlan(weekIndex(festivalWeek.id), 1).seasonIndex,
          week: 5,
        });
      },
      { start: festivalWeek.monday },
    );
  });

  it('gives a new Festival creature a quirk from the quirk RNG, and leaves the quirk of a fused one alone', async () => {
    const speciesId = (species as NonNullable<typeof species>).id;
    const line = (species as NonNullable<typeof species>).line;
    await runRaid(
      (ctx) => {
        const [fresh, owner, maxed] = seedMany(ctx, 3, 8) as [Seeded, Seeded, Seeded];
        const give = (p: Seeded, fusion: number) =>
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, origin, caught_at, quirk_id)
             VALUES (?, ?, ?, ?, 3, ?, 'test', ?, 'hums-quietly')`,
            crypto.randomUUID(),
            p.id,
            line,
            speciesId,
            fusion,
            ctx.clock.t,
          );
        give(owner, 2);
        give(maxed, RULES.fusion.maxFusions);
        openWeek(ctx, festivalWeek);
        playWeek(ctx, festivalWeek, [WIN]);
        const quirkOf = (p: Seeded) =>
          rows<{ quirk_id: string | null }>(
            ctx.sql,
            'SELECT quirk_id FROM creatures WHERE user_id = ? AND line = ?',
            p.id,
            line,
          ).map((r) => r.quirk_id);
        // Only the new creature drew a quirk, so it is the first pick of the quirk RNG.
        expect(quirkOf(fresh)).toEqual([pickQuirk(speciesId, createSeededRng('festival-quirk'))]);
        expect(quirkOf(owner)).toEqual(['hums-quietly']);
        expect(quirkOf(maxed)).toEqual(['hums-quietly']);
      },
      { start: festivalWeek.monday, core: { quirkRng: createSeededRng('festival-quirk') } },
    );
  });

  it('grants a new level 1 creature with a talent, or a duplicate card to choose from, to each member of a winning party, once', async () => {
    await runRaid(
      (ctx) => {
        const line = (species as NonNullable<typeof species>).line;
        const [fresh, owner, maxed, loser] = [
          seedPlayer(ctx, 1, { level: 8 }),
          seedPlayer(ctx, 2, { level: 8 }),
          seedPlayer(ctx, 3, { level: 8 }),
          seedPlayer(ctx, 4, { level: 8 }),
        ] as [Seeded, Seeded, Seeded, Seeded];
        const give = (p: Seeded, fusion: number) =>
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, origin, caught_at)
             VALUES (?, ?, ?, ?, 3, ?, 'test', ?)`,
            crypto.randomUUID(),
            p.id,
            line,
            (species as NonNullable<typeof species>).id,
            fusion,
            ctx.clock.t,
          );
        give(owner, 2);
        give(maxed, RULES.fusion.maxFusions);
        openWeek(ctx, festivalWeek);
        playWeek(ctx, festivalWeek, [WIN]);
        const speciesId = (species as NonNullable<typeof species>).id;
        const ofLine = (p: Seeded) =>
          rows<{ id: string; level: number; fusion_count: number; shiny: number; origin: string }>(
            ctx.sql,
            'SELECT id, level, fusion_count, shiny, origin FROM creatures WHERE user_id = ? AND line = ?',
            p.id,
            line,
          );
        // New: a level 1 creature, never shiny.
        expect(ofLine(fresh)).toMatchObject([
          { level: 1, fusion_count: 0, shiny: 0, origin: 'festival' },
        ]);
        // A duplicate does not fuse by itself: the creature the player has is untouched, and the grant
        // waits as a pending card, whatever the creature's fusions (and never turns into Bait).
        // (Its level moved: the raid stages paid it experience, which is not the grant's doing.)
        expect(ofLine(owner)).toMatchObject([{ fusion_count: 2, origin: 'test' }]);
        expect(ofLine(owner)).toHaveLength(1);
        expect(ofLine(maxed)).toMatchObject([{ fusion_count: RULES.fusion.maxFusions }]);
        expect(count(ctx.sql, 'ledger', "currency = 'bait'")).toBe(0);
        const pendingOf = (p: Seeded) =>
          rows<{ species: string; source: string; source_id: string }>(
            ctx.sql,
            'SELECT species, source, source_id FROM pending_catches WHERE user_id = ?',
            p.id,
          );
        for (const p of [owner, maxed]) {
          expect(pendingOf(p)).toEqual([
            { species: speciesId, source: 'festival', source_id: festivalWeek.id },
          ]);
        }
        expect(pendingOf(fresh)).toEqual([]);
        // The new creature has its first talent in slot 1.
        expect(
          rows<{ slot: number }>(
            ctx.sql,
            `SELECT t.slot FROM creature_talents t JOIN creatures c ON c.id = t.creature_id
             WHERE c.user_id = ? AND c.line = ?`,
            fresh.id,
            line,
          ),
        ).toEqual([{ slot: 1 }]);
        // Every member got a grant row; the grants say what happened.
        expect(
          rows<{ user_id: string; outcome: string }>(
            ctx.sql,
            'SELECT user_id, outcome FROM raid_festival_grants ORDER BY user_id',
          ),
        ).toHaveLength(4);
        expect(ofLine(loser)).toHaveLength(1);
        const grantOf = (p: Seeded) => ctx.core.raid.view(p.id, HELSINKI).you.reveal?.festivalGrant;
        expect(grantOf(fresh)).toMatchObject({ species: speciesId, outcome: 'new' });
        expect(grantOf(owner)).toMatchObject({ outcome: 'duplicate' });
        expect(grantOf(maxed)).toMatchObject({ outcome: 'duplicate' });
        expect(grantOf(owner)?.talent?.name).toBeTypeOf('string');
        expect(grantOf(owner)?.pendingId).toBe(
          rows<{ id: string }>(
            ctx.sql,
            'SELECT id FROM pending_catches WHERE user_id = ?',
            owner.id,
          )[0]?.id,
        );
        // The first Festival win on the server is a shared record of kind festival.
        const firsts = rows<{ user_id: string; kind: string; species: string }>(
          ctx.sql,
          "SELECT user_id, kind, species FROM server_firsts WHERE kind = 'festival'",
        );
        expect(firsts.map((f) => f.species)).toEqual(Array(4).fill(speciesId));
        expect(grantOf(fresh)?.firstOnServer).toBe(true);

        // Idempotent: nothing changes if the same grant is asked for again, by the rules or by hand.
        const creaturesBefore = rows(ctx.sql, 'SELECT * FROM creatures ORDER BY id');
        const ledgerBefore = rows(ctx.sql, 'SELECT * FROM ledger ORDER BY id');
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.resolvePhase(
          ctx.core.raid.week(festivalWeek.id) as NonNullable<ReturnType<typeof ctx.core.raid.week>>,
          'finale',
        );
        for (const p of [fresh, owner, maxed]) {
          expect(ctx.core.raid.view(p.id, HELSINKI).you.reveal?.festivalGrant === undefined).toBe(
            false,
          );
          expect(
            grantFestivalCreature(
              ctx.storage,
              { quirk: createSeededRng('festival-again'), talent: createSeededRng('again-talent') },
              festivalWeek.id,
              p.id,
              speciesId,
              ctx.clock.t + 1,
            ),
          ).toBeNull();
        }
        expect(rows(ctx.sql, 'SELECT * FROM creatures ORDER BY id')).toEqual(creaturesBefore);
        expect(rows(ctx.sql, 'SELECT * FROM ledger ORDER BY id')).toEqual(ledgerBefore);
        expect(count(ctx.sql, 'raid_festival_grants')).toBe(4);
      },
      { start: festivalWeek.monday },
    );
  });

  it('grants nothing after a lost Festival, and nothing to the members of a party that lost', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 16, 10);
        openWeek(ctx, festivalWeek);
        playWeek(ctx, festivalWeek, [LOSS, LOSS]);
        expect(count(ctx.sql, 'raid_festival_grants')).toBe(0);
        expect(count(ctx.sql, 'server_firsts', "kind = 'festival'")).toBe(0);
        expect(
          count(ctx.sql, 'creatures', `species = '${(species as NonNullable<typeof species>).id}'`),
        ).toBe(0);
      },
      { start: festivalWeek.monday },
    );
    await runRaid(
      (ctx) => {
        seedMany(ctx, 16, 10);
        openWeek(ctx, festivalWeek);
        playWeek(ctx, festivalWeek, [WIN, LOSS]);
        const winners = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_party_members WHERE party = 1',
        ).map((r) => r.user_id);
        const granted = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_festival_grants',
        ).map((r) => r.user_id);
        expect(granted.sort()).toEqual(winners.sort());
        expect(winners.length).toBeGreaterThan(0);
      },
      { start: festivalWeek.monday },
    );
  });

  it('never grants a creature in a normal week', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 12);
        const week = weekAt(0);
        openWeek(ctx, week);
        playWeek(ctx, week, [WIN]);
        expect(count(ctx.sql, 'raid_festival_grants')).toBe(0);
        expect(count(ctx.sql, 'creatures', "origin = 'festival'")).toBe(0);
      },
      { start: W02.monday },
    );
  });
});

describe('a week that was open before the ladder existed', () => {
  /** Turns the (only) week back into one that was created before migration 12. */
  function makeLegacy(ctx: CoreContext): void {
    ctx.sql.exec(
      `UPDATE raid_weeks SET rank = NULL, effective_rank = NULL, festival = NULL, season_index = NULL,
         festival_species = NULL, ladder_at = NULL, ladder_won = NULL, rank_after = NULL`,
    );
    ctx.sql.exec('UPDATE raid_ladder SET rank = NULL, best_rank = NULL');
  }

  it('is ranked at its Phase 1 when it has no pool yet: the server is placed then and the boss scales from the stored plan', async () => {
    await runRaid(
      (ctx) => {
        const players = seedMany(ctx, 4, 12);
        openWeek(ctx, weekAt(0));
        makeLegacy(ctx);
        const viewer = players[0] as Seeded;
        // Until Phase 1 the week has no rank (and no band: there is no boss to forecast).
        const open = ctx.core.raid.view(viewer.id, HELSINKI);
        expect(open).toMatchObject({
          rank: null,
          effectiveRank: null,
          festival: false,
          festivalCreature: null,
          season: null,
        });
        expect(open.party?.readiness).toBeNull();
        ctx.core.raid.view(viewer.id, HELSINKI);
        expect(weekRow(ctx, W02.id).rank).toBeNull();
        expect(readLadder(ctx.sql).rank).toBeNull();

        ctx.clock.t = weekAt(0).afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        // Placed from the roster, stored on the server and on the week, with the week's plan.
        const expected = placementRank(players.flatMap(() => [12, 12, 12]));
        expect(expected).toBe(RULES.progression.placement.startRank);
        const plan = raidWeekPlan(weekIndex(W02.id), expected);
        expect(readLadder(ctx.sql).rank).toBe(expected);
        expect(weekRow(ctx, W02.id)).toMatchObject({
          rank: expected,
          effective_rank: plan.effectiveRank,
          festival: plan.festival ? 1 : 0,
          season_index: plan.seasonIndex,
        });
        const [p1, p2] = storedRuns(ctx.sql);
        const boss = content.bosses.find((b) => b.id === p1?.input.boss.id) as NonNullable<
          (typeof content.bosses)[number]
        >;
        // Scaled from the plan (the start rank), and carried to phase 2.
        const scaled = scaleBoss(boss, 4, plan.effectiveRank);
        expect(scaled).toEqual(scaleBoss(boss, 4, RULES.progression.placement.startRank));
        expect(p1?.input.bossHpPool.max).toBe(scaled.maxHp);
        expect(p2?.input.bossHpPool.max).toBe(scaled.maxHp);
        expect(p1?.input.bossAtk).toBe(scaled.atk);

        // From here on it is a normal ranked week: rank payouts and the ladder moves.
        ctx.sql.exec('UPDATE raid_parties SET hp_current = 1');
        ctx.clock.t = weekAt(0).afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(true);
        expect(readLadder(ctx.sql)).toEqual({ rank: expected + 1, bestRank: expected });
        expect(ctx.core.raid.view(viewer.id, HELSINKI).rank).toBe(expected);
        const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
        const paid = raidLedger(ctx.sql).filter(
          (l) => l.idempotency_key === `raid:${W02.id}:1:finale`,
        );
        const flat = scaleEssence(RULES.raid.essence.flat.finale, {
          rank: expected,
          festival: false,
        });
        // Rank 1 pays the flat amount; the multiplier starts above it.
        expect(flat).toBeGreaterThanOrEqual(RULES.raid.essence.flat.finale);
        expect(paid.every((x) => x.amount >= flat)).toBe(true);
        expect(finale?.summary.essence).toEqual(
          Object.fromEntries(paid.map((x) => [x.user_id, x.amount])),
        );
      },
      { start: W02.monday },
    );
  });

  it('uses the server’s rank at Phase 1 if it already has one, without placing it again', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 4, 12);
        openWeek(ctx, weekAt(0));
        makeLegacy(ctx);
        setRank(ctx, 7);
        ctx.clock.t = weekAt(0).afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        expect(readLadder(ctx.sql).rank).toBe(7);
        expect(weekRow(ctx, W02.id)).toMatchObject({ rank: 7, effective_rank: 7 });
      },
      { start: W02.monday },
    );
  });

  it('keeps its old rules when its pool was already stored: base Essence, no Festival, and a finale that does not move the ladder', async () => {
    await runRaid(
      (ctx) => {
        const players = seedMany(ctx, 4, 12);
        openWeek(ctx, weekAt(0));
        ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        // The deploy lands after Phase 1: the pool is stored from the old rules.
        makeLegacy(ctx);
        const viewer = players[0] as Seeded;
        const stored = rows<{ hp_max: number }>(ctx.sql, 'SELECT hp_max FROM raid_parties')[0];
        ctx.clock.t = weekAt(0).afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const [p1, p2] = storedRuns(ctx.sql);
        expect(p2?.input.bossHpPool.max).toBe(stored?.hp_max);
        expect(p1?.input.bossHpPool.max).toBe(stored?.hp_max);
        expect(weekRow(ctx, W02.id).rank).toBeNull();
        // Base Essence: no rank bonus.
        const flat = RULES.raid.essence.flat.phase2;
        const paid = raidLedger(ctx.sql).filter(
          (l) => l.idempotency_key === `raid:${W02.id}:1:phase2`,
        );
        if (p2?.result.cleared === true) {
          const members = p2.summary.members.map((m) => m.alias);
          const weights = Object.fromEntries(
            members.map((a) => [a, p2.result.perPlayer[a]?.contribution ?? 0]),
          );
          expect(paid.length).toBeGreaterThan(0);
          expect(paid.every((x) => x.amount >= flat)).toBe(true);
          expect(
            Object.values(essenceForStage('phase2', members, weights)).reduce((a, b) => a + b, 0),
          ).toBe(paid.reduce((a, b) => a + b.amount, 0));
        }

        // A finale on a legacy week neither moves the ladder nor grants anything.
        ctx.sql.exec('UPDATE raid_parties SET hp_current = 1');
        ctx.clock.t = weekAt(0).afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(true);
        expect(readLadder(ctx.sql)).toEqual({ rank: null, bestRank: null });
        expect(weekRow(ctx, W02.id).ladder_at).toBeNull();
        expect(ctx.core.raid.view(viewer.id, HELSINKI).you.reveal?.rankChange).toBeNull();
        expect(jackpotEssenceFor({ rank: 1, festival: false })).toBe(RULES.raid.jackpotEssence);
        expect(count(ctx.sql, 'raid_festival_grants')).toBe(0);

        // The next week is the first with a rank: the server is placed from its roster then.
        const next = weekAt(1);
        openWeek(ctx, next);
        const expected = placementRank(players.flatMap(() => [12, 12, 12]));
        expect(readLadder(ctx.sql).rank).toBe(expected);
        expect(weekRow(ctx, next.id)).toMatchObject({ rank: expected, effective_rank: expected });
      },
      { start: W02.monday },
    );
  });

  it('keeps a pool that was already stored at phase 1, whatever rank the server gets later', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 5, 12);
        openWeek(ctx, weekAt(0));
        ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        // The deploy happens now: the week has its pool from the old rules.
        makeLegacy(ctx);
        const stored = rows<{ hp_max: number; hp_current: number; boss_atk: number }>(
          ctx.sql,
          'SELECT hp_max, hp_current, boss_atk FROM raid_parties',
        );
        ctx.sql.exec('UPDATE creatures SET level = 15');
        ctx.clock.t = weekAt(0).afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const [p1, p2] = storedRuns(ctx.sql);
        expect(p2?.input.bossHpPool.max).toBe(stored[0]?.hp_max);
        expect(p2?.input.bossAtk).toBe(stored[0]?.boss_atk);
        expect(p2?.input.bossHpPool.current).toBe(p1?.result.bossHpEnd);
        expect(weekRow(ctx, W02.id).rank).toBeNull();
        expect(readLadder(ctx.sql).rank).toBeNull();
      },
      { start: W02.monday },
    );
  });
});

describe('crits', () => {
  it('copies the luck rules into every stored input: phases, the live start and the late path', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 6, 12);
        const week = weekAt(0);
        openWeek(ctx, week);
        ctx.clock.t = week.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        ctx.sql.exec('UPDATE raid_parties SET hp_current = 1');
        // The finale starts live, on time.
        ctx.clock.t = Date.parse('2027-01-17T18:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        const live = rows<{ input: string }>(ctx.sql, 'SELECT input FROM raid_live');
        expect(live).toHaveLength(1);
        expect((JSON.parse(live[0]?.input ?? '{}') as { luck?: unknown }).luck).toEqual(
          RULES.combat.luck,
        );
        ctx.clock.t = Date.parse('2027-01-17T19:30:00Z');
        ctx.core.raid.settleDueLive();
        const runs = storedRuns(ctx.sql);
        expect(runs.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
        for (const run of runs) expect(run.input.luck).toEqual(RULES.combat.luck);
        expect(RULES.combat.luck.critChanceBp).toBeGreaterThan(0);
      },
      { start: W02.monday },
    );
    // The instant late path.
    await runRaid(
      (ctx) => {
        seedMany(ctx, 6, 12);
        const week = weekAt(0);
        openWeek(ctx, week);
        ctx.clock.t = week.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const runs = storedRuns(ctx.sql);
        expect(runs).toHaveLength(3);
        for (const run of runs) expect(run.input.luck).toEqual(RULES.combat.luck);
      },
      { start: W02.monday },
    );
  });

  it('shows critical hits in the stored events, and replays them exactly', async () => {
    await runRaid(
      (ctx) => {
        seedMany(ctx, 10, 12);
        const week = weekAt(0);
        openWeek(ctx, week);
        ctx.clock.t = week.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const hits = storedRuns(ctx.sql).flatMap((r) =>
          r.result.events.filter((e) => e.t === 'hit'),
        );
        expect(hits.length).toBeGreaterThan(100);
        expect(
          hits.some((h) => 'luckBp' in h && typeof h.luckBp === 'number' && h.luckBp > 0),
        ).toBe(true);
      },
      { start: W02.monday },
    );
  });
});
