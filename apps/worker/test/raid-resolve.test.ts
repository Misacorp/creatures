import { RULES, createSeededRng, jackpotEssenceFor, scaleEssence } from '@creatures/game';
import { scaleBoss, simulateFight } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { effectiveStats } from '@creatures/game';
import { content } from '@creatures/game';
import {
  DAY,
  HELSINKI,
  W02,
  count,
  forcePool,
  membersOf,
  raidLedger,
  rows,
  runRaid,
  scriptedThenSeeded,
  seedPlayer,
  storedRuns,
} from './raid-helpers';

const SATURDAY = Date.parse('2027-01-16T12:00:00Z');
const SUNDAY = W02.afterFinale;

/** Seeds `n` players and opens the week. */
function openWeek(ctx: Parameters<Parameters<typeof runRaid>[0]>[0], n: number, level?: number) {
  const players = Array.from({ length: n }, (_, i) =>
    seedPlayer(ctx, i + 1, level === undefined ? {} : { level }),
  );
  ctx.core.raid.currentWeek(HELSINKI);
  return players;
}

describe('resolving a week', () => {
  it('pays Essence for cleared stages only, to members only, exactly once', async () => {
    await runRaid((ctx) => {
      const players = openWeek(ctx, 5, 15);
      const outsider = seedPlayer(ctx, 90, { lastSeenAt: ctx.clock.t - 30 * DAY });
      // A pool small enough that every stage clears with these creatures.
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);

      const runs = storedRuns(ctx.sql);
      expect(runs.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
      const ledger = raidLedger(ctx.sql);
      expect(ledger.length).toBeGreaterThan(0);
      for (const run of runs) {
        const paid = ledger.filter((l) => l.idempotency_key === `raid:2027-W02:1:${run.phase}`);
        if (!run.result.cleared) {
          expect(paid).toEqual([]);
          continue;
        }
        // The week's rank (placed from this roster) scales the payout; this is not a Festival week.
        const week = rows<{ rank: number; festival: number }>(
          ctx.sql,
          'SELECT rank, festival FROM raid_weeks',
        )[0] as { rank: number; festival: number };
        const flat = scaleEssence(RULES.raid.essence.flat[run.phase], {
          rank: week.rank,
          festival: week.festival === 1,
        });
        expect(paid).toHaveLength(5);
        expect(paid.every((p) => p.amount >= flat)).toBe(true);
        // The contribution pool is paid out exactly.
        const pool = Math.floor((flat * 5 * RULES.raid.essence.poolBp) / 10_000);
        expect(paid.reduce((t, p) => t + p.amount, 0)).toBe(flat * 5 + pool);
        expect(run.summary.essence).toEqual(
          Object.fromEntries(paid.map((p) => [p.user_id, p.amount])),
        );
      }
      expect(runs.some((r) => r.result.cleared)).toBe(true);
      const payees = new Set(ledger.map((l) => l.user_id));
      expect([...payees].every((id) => players.some((p) => p.id === id))).toBe(true);
      expect(payees.has(outsider.id)).toBe(false);

      // Resolving again (a duplicate alarm, a retry) pays nothing more.
      const balances = players.map((p) => ctx.core.balances(p.id).essence);
      const week = ctx.core.raid.week(W02.id);
      for (const phase of ['phase1', 'phase2', 'finale'] as const) {
        ctx.core.raid.resolvePhase(week as NonNullable<typeof week>, phase);
      }
      ctx.core.raid.runDue(HELSINKI);
      expect(raidLedger(ctx.sql)).toEqual(ledger);
      expect(players.map((p) => ctx.core.balances(p.id).essence)).toEqual(balances);
      expect(count(ctx.sql, 'raid_results')).toBe(3);
    });
  });

  it('pays nothing for stages that were not cleared', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 3, 3);
      forcePool(ctx.sql, 50_000_000);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      expect(storedRuns(ctx.sql).every((r) => !r.result.cleared)).toBe(true);
      expect(raidLedger(ctx.sql)).toEqual([]);
    });
  });

  it('scales the boss once at phase 1 and carries the HP pool across phases', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 6, 12);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const [p1, p2, fin] = storedRuns(ctx.sql);
      if (p1 === undefined || p2 === undefined || fin === undefined)
        throw new Error('missing runs');
      const boss = content.bosses.find((b) => b.id === p1.input.boss.id);
      if (boss === undefined) throw new Error('boss');
      // The week's stored effective rank, placed from this roster (level 12 creatures).
      const stored = rows<{ effective_rank: number }>(
        ctx.sql,
        'SELECT effective_rank FROM raid_weeks',
      )[0] as { effective_rank: number };
      expect(stored.effective_rank).toBeGreaterThan(1);
      const scaled = scaleBoss(boss, 6, stored.effective_rank);
      expect(p1.input.bossHpPool).toEqual({ max: scaled.maxHp, current: scaled.maxHp });
      expect(p1.input.bossAtk).toBe(scaled.atk);
      // Each phase starts where the one before ended.
      expect(p2.input.bossHpPool).toEqual({ max: scaled.maxHp, current: p1.result.bossHpEnd });
      expect(fin.input.bossHpPool).toEqual({ max: scaled.maxHp, current: p2.result.bossHpEnd });
      expect(p2.result.bossHpStart).toBe(p1.result.bossHpEnd);
      expect(fin.result.bossHpStart).toBe(p2.result.bossHpEnd);
      expect(p2.input.bossAtk).toBe(scaled.atk);
      expect(rows(ctx.sql, 'SELECT hp_max, hp_current FROM raid_parties')).toEqual([
        { hp_max: scaled.maxHp, hp_current: fin.result.bossHpEnd },
      ]);
    });
  });

  it('applies the adaptation chosen after phase 1 in phase 2 and the finale', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 4, 12);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      ctx.core.raid.runDue(HELSINKI);
      const [p1] = storedRuns(ctx.sql);
      const suggestion = p1?.result.adaptationSuggestion;
      expect(suggestion?.target).not.toBeNull();
      expect(p1?.input.adaptation).toBeNull();
      // The counter-move is visible to players before phase 2.
      const viewer = membersOf(ctx.sql)[0] as string;
      const view = ctx.core.raid.view(viewer, HELSINKI);
      expect(view.party?.adaptation?.description).toBe(suggestion?.description);

      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const [, p2, fin] = storedRuns(ctx.sql);
      const expected = { rule: suggestion?.rule, target: suggestion?.target };
      expect(p2?.input.adaptation).toEqual(expected);
      expect(fin?.input.adaptation).toEqual(expected);
      expect(p2?.result.events.some((e) => e.t === 'adaptation' && e.status === 'active')).toBe(
        true,
      );
    });
  });

  it('uses stats at resolve time, so training between phases counts', async () => {
    await runRaid((ctx) => {
      const [a] = openWeek(ctx, 3, 5);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      ctx.core.raid.runDue(HELSINKI);
      ctx.sql.exec('UPDATE creatures SET level = 9 WHERE user_id = ?', (a as { id: string }).id);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const [p1, p2] = storedRuns(ctx.sql);
      const mine = (run: typeof p1) =>
        run?.input.row.filter((s) => (a as { creatureIds: string[] }).creatureIds.includes(s.id));
      expect(mine(p1)?.map((s) => s.level)).toEqual(Array(3).fill(5));
      expect(mine(p2)?.map((s) => s.level)).toEqual(Array(3).fill(9));
      const s = mine(p2)?.[0];
      const species = content.creatures.find((c) => c.id === s?.speciesId);
      expect(s?.stats).toEqual(effectiveStats(species as NonNullable<typeof species>, 9, 0));
    });
  });
});

describe('the row', () => {
  it('respects placements, auto-places the rest, and fills with guests below three players', async () => {
    await runRaid((ctx) => {
      const [a, b] = openWeek(ctx, 2, 8);
      const A = a as { id: string; creatureIds: string[] };
      const B = b as { id: string; creatureIds: string[] };
      expect(ctx.core.raid.view(A.id, HELSINKI).party?.rowLength).toBe(9);
      const team = ctx.core.raid.view(A.id, HELSINKI).you.team?.creatures ?? [];
      const first = team[0]?.creatureId as string;
      const last = team[1]?.creatureId as string;
      expect(ctx.core.raid.place(A.id, HELSINKI, first, 0).ok).toBe(true);
      expect(ctx.core.raid.place(A.id, HELSINKI, last, 8).ok).toBe(true);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      ctx.core.raid.runDue(HELSINKI);
      const [run] = storedRuns(ctx.sql);
      const row = run?.input.row ?? [];
      expect(row).toHaveLength(9);
      expect(row[0]?.id).toBe(first);
      expect(row[8]?.id).toBe(last);
      expect(row.filter((s) => s.ownerId === null)).toHaveLength(3); // 9 slots, 6 creatures
      expect(run?.input.players).toEqual(['m1', 'm2']);
      // The stored input carries engine aliases, never user ids.
      expect(JSON.stringify(run?.input)).not.toContain(A.id);
      expect(JSON.stringify(run?.input)).not.toContain(B.id);
      expect(new Set(row.map((s) => s.ownerId))).toEqual(new Set(['m1', 'm2', null]));
    });
  });

  it('fights with the chosen team, and away creatures still fight', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 3, 6);
      const mage = seedPlayer(ctx, 20, {
        creatures: 4,
        level: 10,
        species: ['splashet', 'sproutle', 'stormray', 'gaiadrake'],
      });
      // Sproutle (a guard) has the lowest power of the four.
      const [, weak, strongA, strongB] = mage.creatureIds as [string, string, string, string];
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.core.raid.syncRoster(W02.id);
      // The automatic team is the three strongest, and an away creature is not excluded.
      ctx.sql.exec("UPDATE creatures SET away_expedition_id = 'trip' WHERE id = ?", strongB);
      const auto = ctx.core.raid.view(mage.id, HELSINKI).you.team;
      expect(auto?.mode).toBe('auto');
      expect(auto?.creatures.map((c) => c.creatureId)).toContain(strongB);
      expect(auto?.creatures.map((c) => c.creatureId)).not.toContain(weak);

      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      ctx.core.raid.runDue(HELSINKI);
      const first = storedRuns(ctx.sql)[0];
      const ids = (first?.input.row ?? []).map((s) => s.id);
      expect(ids).toContain(strongB);
      expect(ids).not.toContain(weak);

      // Between phases the player picks their own three, including the weak one.
      ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
      expect(ctx.core.raid.setTeam(mage.id, HELSINKI, [weak, strongA, strongB]).ok).toBe(true);
      ctx.clock.t = SATURDAY;
      ctx.core.raid.runDue(HELSINKI);
      const second = storedRuns(ctx.sql)[1];
      const mineIn = (second?.input.row ?? [])
        .map((s) => s.id)
        .filter((id) => mage.creatureIds.includes(id));
      expect(new Set(mineIn)).toEqual(new Set([weak, strongA, strongB]));
    });
  });
});

describe('the finale jackpot', () => {
  /** Opens a two-player week and resolves everything up to the finale, which is left for the test. */
  function toFinale(ctx: Parameters<Parameters<typeof runRaid>[0]>[0], n = 2) {
    openWeek(ctx, n, 12);
    ctx.clock.t = SATURDAY;
    ctx.core.raid.runDue(HELSINKI);
    expect(storedRuns(ctx.sql).map((r) => r.phase)).toEqual(['phase1', 'phase2']);
    // Leave the boss one hit from death, so the finale is a win.
    ctx.sql.exec('UPDATE raid_parties SET hp_current = 1');
    ctx.clock.t = SUNDAY;
  }

  const seeds = [1, 2, 3, 4];

  it('rolls against each member pity counter, pays a hit and records a shared server first', async () => {
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds, 0, 0]); // both hit
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const [m1, m2] = membersOf(ctx.sql) as [string, string];
        ctx.core.raid.runDue(HELSINKI);
        const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
        expect(finale?.result.cleared).toBe(true);
        expect(finale?.summary.jackpot.sort()).toEqual([m1, m2].sort());
        const jackpots = raidLedger(ctx.sql).filter((l) => l.idempotency_key.endsWith(':jackpot'));
        const week = rows<{ rank: number; festival: number }>(
          ctx.sql,
          'SELECT rank, festival FROM raid_weeks',
        )[0] as { rank: number; festival: number };
        const payout = { rank: week.rank, festival: week.festival === 1 };
        expect(jackpots.map((j) => j.amount)).toEqual([
          jackpotEssenceFor(payout),
          jackpotEssenceFor(payout),
        ]);
        expect(rows(ctx.sql, 'SELECT user_id, counter FROM jackpot_pity ORDER BY user_id')).toEqual(
          [m1, m2].sort().map((user_id) => ({ user_id, counter: 0 })),
        );
        // Both share the record: they hit in the same finale.
        expect(
          rows<{ user_id: string }>(
            ctx.sql,
            "SELECT user_id FROM server_firsts WHERE kind = 'jackpot' ORDER BY user_id",
          ).map((r) => r.user_id),
        ).toEqual([m1, m2].sort());
        expect(
          rows(ctx.sql, "SELECT DISTINCT drop_id FROM server_firsts WHERE kind = 'jackpot'"),
        ).toHaveLength(1);
      },
      { core: { raidRng: rng } },
    );
  });

  it('advances the counter on a miss and keeps the first for a later hit only in the same finale', async () => {
    // Order of draws: 4 seed words per resolved party, then one roll per member in the finale.
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds, 0, 9_999]);
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const [m1, m2] = membersOf(ctx.sql) as [string, string];
        ctx.core.raid.runDue(HELSINKI);
        const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
        expect(finale?.summary.jackpot).toEqual([m1]);
        const pity = Object.fromEntries(
          rows<{ user_id: string; counter: number }>(
            ctx.sql,
            'SELECT user_id, counter FROM jackpot_pity',
          ).map((r) => [r.user_id, r.counter]),
        );
        expect(pity).toEqual({ [m1]: 0, [m2]: 1 });
        expect(
          rows<{ user_id: string }>(
            ctx.sql,
            "SELECT user_id FROM server_firsts WHERE kind = 'jackpot'",
          ),
        ).toEqual([{ user_id: m1 }]);

        // Next week m2 hits: it is not the first jackpot on the server any more.
        ctx.clock.t = Date.parse('2027-01-23T12:00:00Z');
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.sql.exec("UPDATE raid_parties SET hp_current = 1 WHERE week_id = '2027-W03'");
        ctx.clock.t = Date.parse('2027-01-24T19:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        const week3 = storedRuns(ctx.sql, '2027-W03');
        expect(week3.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
        expect(
          rows(ctx.sql, "SELECT user_id FROM server_firsts WHERE kind = 'jackpot'"),
        ).toHaveLength(1);
      },
      { core: { raidRng: rng } },
    );
  });

  it('guarantees a jackpot at the hard pity counter and raises the chance from the soft pity', async () => {
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds, 9_999, 1_399]);
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const [m1, m2] = membersOf(ctx.sql) as [string, string];
        // m1 has missed nine wins (the next one is certain); m2 four (the 5th: chance 600 + 800 bp).
        ctx.sql.exec('INSERT INTO jackpot_pity (user_id, counter) VALUES (?, 9), (?, 4)', m1, m2);
        ctx.core.raid.runDue(HELSINKI);
        const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
        expect(finale?.summary.jackpot.sort()).toEqual([m1, m2].sort());
      },
      { core: { raidRng: rng } },
    );
  });

  it('leaves the counter alone after a lost finale, without rolling or paying a jackpot', async () => {
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds]);
    await runRaid(
      (ctx) => {
        openWeek(ctx, 2, 2);
        forcePool(ctx.sql, 50_000_000);
        const [m1, m2] = membersOf(ctx.sql) as [string, string];
        // Pity counts finale wins only: a lost finale changes nothing, for a member with a
        // counter or without one (no row is written for them).
        ctx.sql.exec('INSERT INTO jackpot_pity (user_id, counter) VALUES (?, 3)', m1);
        ctx.clock.t = SUNDAY;
        const before = rng.drawn();
        ctx.core.raid.runDue(HELSINKI);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(false);
        // Exactly three seeds were drawn: no jackpot rolls.
        expect(rng.drawn() - before).toBe(12);
        expect(rows(ctx.sql, 'SELECT user_id, counter FROM jackpot_pity')).toEqual([
          { user_id: m1, counter: 3 },
        ]);
        expect(m2).toBeTruthy();
        expect(raidLedger(ctx.sql).filter((l) => l.idempotency_key.endsWith(':jackpot'))).toEqual(
          [],
        );
        expect(count(ctx.sql, 'server_firsts', "kind = 'jackpot'")).toBe(0);
      },
      { core: { raidRng: rng } },
    );
  });
});

describe('replays', () => {
  it('draws a 128-bit seed from the live rng and stores it as hex with the input', async () => {
    const rng = scriptedThenSeeded([1, 2, 3, 4]);
    await runRaid(
      (ctx) => {
        openWeek(ctx, 3, 8);
        ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
        ctx.core.raid.runDue(HELSINKI);
        const [run] = storedRuns(ctx.sql);
        expect(run?.seed).toBe('00000001000000020000000300000004');
        expect(run?.seed).toMatch(/^[0-9a-f]{32}$/);
        // A different phase draws a different seed.
        ctx.clock.t = SUNDAY;
        ctx.core.raid.runDue(HELSINKI);
        const seeds = new Set(storedRuns(ctx.sql).map((r) => r.seed));
        expect(seeds.size).toBe(3);
      },
      { core: { raidRng: rng } },
    );
  });

  it('reproduces every stored result from the stored input and seed', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 7, 10);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const runs = storedRuns(ctx.sql);
      expect(runs).toHaveLength(3);
      for (const run of runs) {
        const again = simulateFight(run.input, createSeededRng(run.seed));
        expect(again).toEqual(run.result);
      }
    });
  });
});

describe('timing', () => {
  it('resolves a 15-member party and a 45-member three-party week', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 45, 10);
      expect(rows(ctx.sql, 'SELECT COUNT(*) AS n FROM raid_parties')).toEqual([{ n: 3 }]);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const runs = storedRuns(ctx.sql);
      expect(runs).toHaveLength(9);
      expect(runs.every((r) => r.input.row.length === 45)).toBe(true);
      expect(new Set(runs.map((r) => r.party))).toEqual(new Set([1, 2, 3]));
      // Engine time: each fight, re-run from its stored input. (Workers clocks only move on I/O,
      // so the hard timing bound is in packages/engine/test/perf.test.ts.)
      for (const run of runs) {
        const start = Date.now();
        simulateFight(run.input, createSeededRng(run.seed));
        expect(Date.now() - start).toBeLessThan(50);
      }
    });
  });
});
