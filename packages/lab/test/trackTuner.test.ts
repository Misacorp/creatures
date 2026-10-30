/** The track tuner: the lap rule, the loop's stop (with fake measures), the table over `slotBoss`, the ranks untouched, and a slot's weekend. */
import { describe, expect, it } from 'vitest';
import { RAID_BOSS_IDS, RAID_RANKS, RAID_SPECS, raidBossOf } from '../src/bosses';
import { DEDICATED, serverWeekend } from '../src/path';
import { ROSTER_WEEKS, type RosterProfile, type RosterWeek } from '../src/roster';
import { RANK_TOOL_SHARE_MIN, RAID_TARGETS, slotTargetsFor, toolShareMinAt } from '../src/targets';
import {
  MAX_ROUNDS,
  NEAR_WEIGHT,
  SLOT_FIDELITY,
  arrivalWeeks,
  dedicatedTeam,
  distanceOf,
  earlierLaps,
  evalSlot,
  pasteOf,
  robustLoss,
  sideOf,
  slotTargets,
  slotAxes,
  tuneLoop,
  type LoopOps,
} from '../src/trackTuner';
import {
  SLOT_NUMBERS,
  TRACK_ORDER,
  rankNumbers,
  slotBoss,
  slotNumbers,
  trackSlot,
  type SlotTable,
} from '../src/track';
import type { RaidMeasures } from '../src/targets';
import { absoluteOf, evalCandidate, nativeOf, preparedOf } from '../src/tuner';

const N = TRACK_ORDER.length;

describe('the lap rule', () => {
  it('a later lap of a boss is never below the lap before, in any number, over the whole track', () => {
    // A table that tries to make lap 2 and 3 easier than lap 1.
    const hostile: SlotTable = {
      1: { hp: 30_000, atk: 200, armour: 90 },
      [1 + N]: { hp: 1_000, atk: 1, armour: 1 },
      [1 + 2 * N]: { hp: 2_000, atk: 2, armour: 2 },
    };
    for (const table of [SLOT_NUMBERS, hostile])
      for (let s = N + 1; s <= 6 * N; s++) {
        const now = slotNumbers(s, table);
        const before = slotNumbers(s - N, table);
        expect(now.hp).toBeGreaterThanOrEqual(before.hp);
        expect(now.atk).toBeGreaterThanOrEqual(before.atk);
        expect(now.armour).toBeGreaterThanOrEqual(before.armour);
      }
    expect(slotNumbers(1 + N, hostile)).toEqual({ hp: 30_000, atk: 200, armour: 90 });
    expect(slotNumbers(1 + 2 * N, hostile)).toEqual({ hp: 30_000, atk: 200, armour: 90 });
  });

  it('the boss of a slot has those numbers', () => {
    const hostile: SlotTable = { 1: { hp: 30_000 }, [1 + N]: { hp: 1_000 } };
    expect(slotBoss(1 + N, { table: hostile }).hp).toBe(30_000);
    expect(slotBoss(1, { table: hostile }).hp).toBe(30_000);
  });

  it('the shipped table fills slots 1 to 15 and holds the rule in its own entries', () => {
    for (let s = 1; s <= 3 * N; s++) {
      const own = SLOT_NUMBERS[s];
      expect(own?.hp).toBeGreaterThan(0);
      expect(own?.atk).toBeGreaterThan(0);
      expect(own?.armour).toBeGreaterThan(0);
      if (s > N) {
        const before = SLOT_NUMBERS[s - N] as Required<NonNullable<(typeof SLOT_NUMBERS)[number]>>;
        expect(own?.hp).toBeGreaterThanOrEqual(before.hp);
        expect(own?.atk).toBeGreaterThanOrEqual(before.atk);
        expect(own?.armour).toBeGreaterThanOrEqual(before.armour);
      }
    }
  });

  it('the search of a slot never goes below the lap before, and armour never below the hide', () => {
    const table: SlotTable = { 1: { hp: 18_000, atk: 100, armour: 30 } };
    const axes = slotAxes(1 + N, table);
    expect(axes.map((a) => a.lo)).toEqual(expect.arrayContaining([18_000, 100, 30]));
    for (const a of axes) expect(a.lo).toBeLessThanOrEqual(a.hi);
    // Lap 1: wide, armour from the boss's hide (half of its high-rank armour).
    const first = slotAxes(2, {});
    const spec = RAID_SPECS.find((s) => s.id === trackSlot(2).bossId);
    expect(first[2]?.lo).toBe(Math.round((spec?.armour ?? 0) / 2));
    expect(first[0]?.lo).toBeLessThan(spec?.hp ?? 0);
    expect(first[0]?.hi).toBeGreaterThan(spec?.hp ?? 0);
    // The earlier laps are handed to the measurement as table entries.
    expect(Object.keys(earlierLaps(1 + 2 * N, table))).toEqual(['1', String(1 + N)]);
  });
});

describe('the loop of path and tuner', () => {
  /** A fake world: slot k's arrival week is its number plus how many times the table was tuned, up to a limit (then it stops moving). */
  const fake = (settleAfter: number) => {
    const calls = { arrivals: 0, tune: 0, weeks: [] as (readonly number[])[] };
    const ops: LoopOps = {
      arrivals: (table) => {
        calls.arrivals++;
        const tuned = Math.min(settleAfter, Object.keys(table).length);
        return Promise.resolve([1, 2 + tuned, 3 + tuned]);
      },
      tune: (weeks, table) => {
        calls.tune++;
        calls.weeks.push(weeks);
        return Promise.resolve({ table: { ...table, [100 + calls.tune]: { hp: 1 } }, weeks });
      },
    };
    return { ops, calls };
  };

  it('stops once no arrival week moves between two paths, and checks the final table with the last path', async () => {
    const { ops, calls } = fake(2);
    const r = await tuneLoop(ops, {});
    expect(r.converged).toBe(true);
    // Path, tune, path, tune, path, tune, path (nothing moved): three tunings, four paths.
    expect(calls.tune).toBe(3);
    expect(calls.arrivals).toBe(4);
    expect(r.rounds.map((x) => x.tuned)).toEqual([true, true, true, false]);
    expect(r.rounds[0]?.moved).toEqual([1, 2, 3]);
    expect(r.rounds[0]?.tunedFor).toEqual([1, 2, 3]);
    expect(r.rounds[1]?.moved).toEqual([2, 3]);
    expect(r.rounds[3]?.moved).toEqual([]);
    // The last tuning was for the weeks the path still reports.
    expect(r.weeks).toEqual(r.rounds[3]?.arrivals);
    expect(Object.keys(r.table)).toHaveLength(3);
  });

  it('a world that never moves is tuned once', async () => {
    const { ops, calls } = fake(0);
    const r = await tuneLoop(ops, {});
    expect(r.converged).toBe(true);
    expect(calls.tune).toBe(1);
    expect(calls.arrivals).toBe(2);
  });

  it('gives up after the most tunings when the weeks keep moving', async () => {
    const { ops, calls } = fake(1000);
    const r = await tuneLoop(ops, {});
    expect(r.converged).toBe(false);
    expect(calls.tune).toBe(MAX_ROUNDS);
    expect(calls.arrivals).toBe(MAX_ROUNDS + 1);
    expect(r.rounds[r.rounds.length - 1]?.tuned).toBe(false);
    const two = fake(1000);
    expect((await tuneLoop(two.ops, {}, 2)).rounds).toHaveLength(3);
    expect(two.calls.tune).toBe(2);
  });

  it('is settled by one tuning when the tuning reports the weeks the next path gives (a sweep up the track)', async () => {
    // The tuning tunes slot k for the week the path gives once the slots before it are tuned: [1, 5, 6], not the [1, 2, 3] it was handed.
    const ops: LoopOps = {
      arrivals: (table) => Promise.resolve(Object.keys(table).length ? [1, 5, 6] : [1, 2, 3]),
      tune: (_weeks, table) =>
        Promise.resolve({ table: { ...table, 1: { hp: 1 } }, weeks: [1, 5, 6] }),
    };
    const r = await tuneLoop(ops, {});
    expect(r.converged).toBe(true);
    expect(r.rounds.map((x) => x.tuned)).toEqual([true, false]);
    expect(r.rounds[0]?.arrivals).toEqual([1, 2, 3]);
    expect(r.rounds[0]?.tunedFor).toEqual([1, 5, 6]);
    expect(r.weeks).toEqual([1, 5, 6]);
  });

  it('hands each tuning the weeks of the path before it', async () => {
    const { ops, calls } = fake(1);
    const r = await tuneLoop(ops, {});
    expect(calls.weeks[0]).toEqual(r.rounds[0]?.arrivals);
    expect(calls.weeks[1]).toEqual(r.rounds[1]?.arrivals);
  });

  it('reads arrival weeks off a path summary (a slot nobody reached waits for the last week)', () => {
    const slots = [
      { slot: 1, reachedShare: 1, week: { median: 1 } },
      { slot: 2, reachedShare: 0.5, week: { median: 4 } },
      { slot: 3, reachedShare: 0, week: { median: 0 } },
    ];
    expect(arrivalWeeks(slots, 1, 4)).toEqual([1, 4, ROSTER_WEEKS, ROSTER_WEEKS]);
    expect(arrivalWeeks(slots, 2, 3)).toEqual([4, ROSTER_WEEKS]);
  });
});

describe('the table and the three ranks', () => {
  it('a table entry replaces the ranks’ numbers for its slot only, and the table argument replaces SLOT_NUMBERS', () => {
    const table: SlotTable = { 3: { hp: 12_345, atk: 67, armour: 8 } };
    const boss = slotBoss(3, { table });
    expect(boss).toMatchObject({ hp: 12_345, atk: 67, armour: 8 });
    expect(boss.strengthBp).toBe(trackSlot(3).strengthBp);
    // A slot without an entry takes the ranks' line for the numbers the entry leaves out.
    expect(slotBoss(2, { table }).hp).toBe(rankNumbers(trackSlot(2).bossId, 2).hp);
    expect(slotBoss(3, { table: { 3: { hp: 5_000 } } }).atk).toBe(
      rankNumbers(trackSlot(3).bossId, 3).atk,
    );
  });

  it('the low, mid and high rank bosses do not depend on the slot table', () => {
    const numbers = SLOT_NUMBERS as Record<number, unknown>;
    const kept = { ...numbers };
    const before = RAID_BOSS_IDS.flatMap((id) =>
      RAID_RANKS.map((r) => raidBossOf(id, { rank: r.id })),
    );
    try {
      for (let s = 1; s <= 30; s++) numbers[s] = { hp: 7, atk: 7, armour: 7 };
      const after = RAID_BOSS_IDS.flatMap((id) =>
        RAID_RANKS.map((r) => raidBossOf(id, { rank: r.id })),
      );
      expect(after).toEqual(before);
    } finally {
      for (let s = 1; s <= 30; s++) {
        if (s in kept) numbers[s] = kept[s];
        else delete numbers[s];
      }
    }
    // And they are the numbers of the specs, as the tuner reads them.
    for (const id of RAID_BOSS_IDS)
      for (const r of RAID_RANKS) {
        const abs = absoluteOf(id, r.id, nativeOf(id, r.id));
        expect(raidBossOf(id, { rank: r.id })).toMatchObject(abs);
      }
  });
});

describe('a slot’s weekend', () => {
  it('puts the dedicated server at the roster levels of the week, with the line as written (the path’s columns)', () => {
    for (const [slot, week] of [
      [3, 8],
      [4, 2],
      [12, 20],
    ] as const) {
      const w = serverWeekend(DEDICATED, slot, week, 'expected', 'x');
      const { line } = preparedOf(w.boss.id);
      const mine = dedicatedTeam(w.boss, line, week, 'expected');
      expect(mine.placements).toEqual(w.placements);
      expect(mine.bench).toEqual(w.bench);
    }
  });

  it('is measured the same every time, with the mixed server only when asked', () => {
    const table: SlotTable = { 2: { hp: 14_000, atk: 100, armour: 35 } };
    const tiny = {
      weekends: 4,
      draws: 2,
      classicWeekends: 2,
      mixedDraws: 0,
      mixedWeekends: 1,
    };
    const args = {
      slot: 2,
      week: 6,
      speed: 'expected' as const,
      numbers: table[2] as { hp: number; atk: number; armour: number },
      earlier: {},
      fidelity: tiny,
      salt: 'test',
    };
    const a = evalSlot(args);
    expect(evalSlot(args)).toEqual(a);
    for (const t of slotTargets(2)) expect(a.measures[t.measure]).toBeGreaterThanOrEqual(0);
    expect(a.slow).toBeUndefined();
    expect(a.measures['mixed.kill']).toBeNaN();
    const b = evalSlot({ ...args, fidelity: { ...tiny, mixedDraws: 1 } });
    expect(b.measures['mixed.kill']).toBeGreaterThanOrEqual(0);
    expect(b.measures['mixed.share']).toBeLessThanOrEqual(1);
    // A boss that cannot hurt is beaten, with or without a tool; one with enormous HP is never.
    const soft = evalSlot({ ...args, numbers: { hp: 500, atk: 1, armour: 1 } });
    expect(soft.measures['prepared.share']).toBe(1);
    expect(soft.measures['classic.kill']).toBe(1);
    const wall = evalSlot({ ...args, numbers: { hp: 10_000_000, atk: 100, armour: 35 } });
    expect(wall.measures['prepared.written']).toBe(0);
    expect(wall.measures['classic.kill']).toBe(0);
  });

  it('measures the slow and the fast roster too when asked, and the loss counts them at half weight', () => {
    const tiny = { weekends: 4, draws: 2, classicWeekends: 2, mixedDraws: 0, mixedWeekends: 1 };
    const r = evalSlot({
      slot: 2,
      week: 6,
      speed: 'expected',
      numbers: { hp: 14_000, atk: 100, armour: 35 },
      earlier: {},
      fidelity: tiny,
      side: sideOf(tiny),
      salt: 'side',
    });
    expect(r.slow?.['prepared.share']).toBeGreaterThanOrEqual(0);
    expect(r.fast?.['prepared.share']).toBeGreaterThanOrEqual(0);
    expect(sideOf(tiny).mixedDraws).toBe(0);
    const t = slotTargets(2);
    const own = robustLoss(t, { measures: r.measures, weekends: 0 });
    expect(robustLoss(t, r)).toBeCloseTo(
      own +
        0.5 *
          (robustLoss(t, { measures: r.slow as RaidMeasures, weekends: 0 }) +
            robustLoss(t, { measures: r.fast as RaidMeasures, weekends: 0 })),
    );
  });

  it('is judged on Misa’s targets, with the tool’s worth by the cards’ strength and no classic limit on the welcome boss, and the search leans to the ranks’ line only a little', () => {
    const measures = (slot: number) => slotTargets(slot).map((t) => t.measure);
    expect(measures(2)).toEqual([
      'prepared.share',
      'prepared.beat2',
      'tool.share',
      'tool.written',
      'classic.kill',
    ]);
    // Slot 1: any decent team may win it.
    expect(measures(1)).toEqual(['prepared.share', 'prepared.beat2', 'tool.share', 'tool.written']);
    // The rest of the bounds are Misa's.
    for (const m of ['prepared.share', 'prepared.beat2', 'classic.kill'] as const)
      expect(slotTargets(5).find((t) => t.measure === m)).toEqual(
        RAID_TARGETS.high.find((t) => t.measure === m),
      );
    expect(slotTargets(10).find((t) => t.measure === 'tool.share')?.min).toBeCloseTo(0.1);
    expect(slotTargets(2).find((t) => t.measure === 'tool.written')?.min).toBeCloseTo(0.06);
    expect(slotTargets(1).find((t) => t.measure === 'tool.share')?.min).toBeLessThan(0.06);
    const ref = { hp: 10_000, atk: 100, armour: 20 };
    expect(distanceOf(ref, ref)).toBe(0);
    expect(distanceOf({ hp: 20_000, atk: 100, armour: 20 }, ref)).toBeCloseTo(Math.log(2) / 3);
    expect(NEAR_WEIGHT).toBeGreaterThan(0);
    expect(NEAR_WEIGHT).toBeLessThan(0.2);
  });

  it('keeps the quick and the full searches on the same measures, without the lab tests’ rules', () => {
    for (const quick of [true, false]) {
      const f = SLOT_FIDELITY(quick);
      for (const level of [f.search, f.check, f.final]) {
        expect(level.rules).toBeUndefined();
        expect(level.weekends).toBeGreaterThan(0);
      }
      expect(f.search.mixedDraws).toBe(0);
      expect(f.final.mixedDraws).toBeGreaterThan(0);
    }
  });

  it('prints a table to paste', () => {
    const lines = pasteOf({ 1: { hp: 12_345, atk: 9, armour: 4 } }, 1, 2);
    expect(lines).toEqual([
      'export const SLOT_NUMBERS: SlotTable = {',
      `  1: { hp: 12_345, atk: 9, armour: 4 }, // ${trackSlot(1).bossId}`,
      '};',
    ]);
  });
});

describe('the tool’s worth by the strength of the cards', () => {
  it('is the tests’ line through 30%, 65% and 100%, flat above, and falls to half at 0%', () => {
    expect(toolShareMinAt(3_000)).toBeCloseTo(RANK_TOOL_SHARE_MIN.low);
    expect(toolShareMinAt(6_500)).toBeCloseTo(RANK_TOOL_SHARE_MIN.mid);
    expect(toolShareMinAt(10_000)).toBeCloseTo(RANK_TOOL_SHARE_MIN.high);
    expect(toolShareMinAt(15_000)).toBeCloseTo(RANK_TOOL_SHARE_MIN.high);
    expect(toolShareMinAt(0)).toBeCloseTo(0.03);
    expect(toolShareMinAt(1_500)).toBeCloseTo(0.045);
    expect(toolShareMinAt(4_750)).toBeCloseTo(0.07);
    let before = 0;
    for (let b = 0; b <= 10_000; b += 250) {
      expect(toolShareMinAt(b)).toBeGreaterThanOrEqual(before);
      before = toolShareMinAt(b);
    }
  });

  it('gives a slot its cards’ strength, from the track', () => {
    for (const slot of [2, 5, 8])
      for (const t of slotTargetsFor(slot, trackSlot(slot).strengthBp).filter((x) =>
        x.measure.startsWith('tool.'),
      ))
        expect(t.min).toBeCloseTo(toolShareMinAt(trackSlot(slot).strengthBp));
  });
});

// ---------- the slot measure against the rank measure ----------

/** A roster whose every player has `level` for all their creatures, 3 talent slots, every week. */
const flatRoster = (level: number): RosterProfile => {
  const week = (w: number): RosterWeek => ({
    week: w,
    first: level,
    third: level,
    tenth: level,
    twentieth: level,
    size: 36,
    forms: 'all',
    talentSlots: 3,
    talentsPicked: false,
    gear: 0,
  });
  const weeks = Array.from({ length: ROSTER_WEEKS }, (_, i) => week(i + 1));
  return { daily: weeks, weekly: weeks, newPlayer: weeks };
};

describe('the slot measure at the high rank’s own setting', () => {
  // A level 25 roster, full cards (slots 10 and up) and the high rank's numbers must give what the rank measure gives, for every boss:
  // the same seeds, so only a difference in how the weekend is set up (columns, levels, bench, talents) shows. (Found 2026-10-30: the
  // path put the dedicated server's columns in tool-column order, and the prepared line, tuned that way, looked 15 points weaker.)
  it.each(
    RAID_BOSS_IDS.map((id) => [id, TRACK_ORDER.indexOf(id) + 1 + 2 * TRACK_ORDER.length] as const),
  )('%s', (id, slot) => {
    expect(trackSlot(slot).bossId).toBe(id);
    expect(trackSlot(slot).strengthBp).toBe(10_000);
    const numbers = absoluteOf(id, 'high', nativeOf(id, 'high'));
    const fid = { weekends: 40, draws: 8, classicWeekends: 20, mixedDraws: 1, mixedWeekends: 1 };
    const rank = evalCandidate({ boss: id, rank: 'high', numbers, fidelity: fid, salt: 'cmp' });
    const slotMeasure = evalSlot(
      { slot, week: 8, speed: 'expected', numbers, earlier: {}, fidelity: fid, salt: 'cmp' },
      flatRoster(25),
    );
    const tolerance = {
      'prepared.share': 0.06,
      'prepared.beat2': 0.1,
      'tool.share': 0.06,
      'tool.written': 0.08,
      'classic.kill': 0.1,
    } as const;
    for (const [m, tol] of Object.entries(tolerance) as [keyof typeof tolerance, number][])
      expect(
        Math.abs(slotMeasure.measures[m] - rank.measures[m]),
        `${id} ${m}`,
      ).toBeLessThanOrEqual(tol);
  });
});
