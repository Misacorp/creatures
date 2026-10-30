/** The track tuner: the lap rule (on the kill rate), the loop's stop (with fake measures), the table over `slotBoss`, the ranks untouched, and a slot's weekend. */
import { describe, expect, it } from 'vitest';
import { RAID_BOSS_IDS, RAID_RANKS, RAID_SPECS, raidBossOf } from '../src/bosses';
import { DEDICATED, serverWeekend } from '../src/path';
import { ROSTER_WEEKS, type RosterProfile, type RosterWeek } from '../src/roster';
import {
  BEAT2_MIN,
  CLASSIC_POTENTIAL_AIM,
  CLASSIC_POTENTIAL_MAX,
  CLASSIC_POTENTIAL_MIN,
  PREPARED_POTENTIAL_AIM,
  PREPARED_POTENTIAL_MIN,
  RANK_TOOL_SHARE_MIN,
  RAID_TARGETS,
  beatWithin,
  slotTargetsFor,
  toolPotentialMinAt,
  toolShareMinAt,
} from '../src/targets';
import type { Executor } from '../src/jobs';
import {
  MAX_ROUNDS,
  LOSS_STEP,
  NEAR_WEIGHT,
  SLOT_FIDELITY,
  aimComfort,
  arrivalWeeks,
  dedicatedTeam,
  cliffWidth,
  distanceOf,
  killByHp,
  lapKillViolations,
  LAP_KILL_NOISE,
  evalSlot,
  pasteOf,
  quantised,
  slotTargets,
  slotAxes,
  tuneSlot,
  type SlotEvalArgs,
  type SlotEvalResult,
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
  it('has no numeric floor: a later lap’s numbers may be below the lap before’s when its cards make up for it', () => {
    const table: SlotTable = {
      1: { hp: 30_000, atk: 200, armour: 90 },
      [1 + N]: { hp: 1_000, atk: 1, armour: 1 },
    };
    expect(slotNumbers(1 + N, table)).toEqual({ hp: 1_000, atk: 1, armour: 1 });
    expect(slotBoss(1 + N, { table }).hp).toBe(1_000);
    expect(slotBoss(1, { table }).hp).toBe(30_000);
  });

  it('keeps the cards of a later lap at least as strong as the lap before’s', () => {
    for (let s = N + 1; s <= 6 * N; s++)
      expect(trackSlot(s).strengthBp).toBeGreaterThanOrEqual(trackSlot(s - N).strengthBp);
  });

  it('flags a later lap whose first-weekend kill rate is above the lap before’s by more than noise', () => {
    const kills = new Map<number, number>([
      [1, 0.6],
      [1 + N, 0.62],
      [1 + 2 * N, 0.75],
      [2, 0.5],
      [2 + N, 0.3],
      [3, 0.9],
      [3 + N, 0.9 + LAP_KILL_NOISE + 0.01],
    ]);
    expect(lapKillViolations(kills, N)).toEqual(
      [
        { slot: 3 + N, kill: 0.9 + LAP_KILL_NOISE + 0.01, before: 0.9 },
        { slot: 1 + 2 * N, kill: 0.75, before: 0.62 },
      ].sort((a, b) => a.slot - b.slot),
    );
    // Lap 1 has no lap before.
    expect(lapKillViolations(new Map([[1, 1]]), N)).toEqual([]);
  });

  it('fills slots 1 to 15 of the shipped table', () => {
    for (let s = 1; s <= 3 * N; s++) {
      const own = SLOT_NUMBERS[s];
      expect(own?.hp).toBeGreaterThan(0);
      expect(own?.atk).toBeGreaterThan(0);
      expect(own?.armour).toBeGreaterThan(0);
    }
  });

  it('searches a wide range of numbers, armour never below the boss’s hide', () => {
    for (let slot = 1; slot <= 2 * N; slot++)
      for (const a of slotAxes(slot)) expect(a.lo).toBeLessThanOrEqual(a.hi);
    const first = slotAxes(2);
    const spec = RAID_SPECS.find((s) => s.id === trackSlot(2).bossId);
    expect(first[2]?.lo).toBe(Math.round((spec?.armour ?? 0) / 2));
    expect(first[0]?.lo).toBeLessThan(spec?.hp ?? 0);
    expect(first[0]?.hi).toBeGreaterThan(spec?.hp ?? 0);
    // The same range on every lap.
    expect(slotAxes(2 + N)).toEqual(first);
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
      fidelity: tiny,
      salt: 'test',
    };
    const a = evalSlot(args);
    expect(evalSlot(args)).toEqual(a);
    for (const t of slotTargets(2)) expect(a.measures[t.measure]).toBeGreaterThanOrEqual(0);
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

  it('takes the damage potentials: the targets (prepared, classic, the tool’s worth) always, the information ones only when asked', () => {
    const tiny = { weekends: 4, draws: 2, classicWeekends: 2, mixedDraws: 0, mixedWeekends: 1 };
    const args = {
      slot: 5,
      week: 8,
      speed: 'expected' as const,
      numbers: { hp: 20_000, atk: 100, armour: 35 },
      fidelity: tiny,
      salt: 'pot',
    };
    const a = evalSlot(args);
    expect(a.measures['prepared.potential']).toBeGreaterThan(0);
    expect(a.measures['classic.potential']).toBeGreaterThan(0);
    expect(a.measures['tool.potential']).not.toBeNaN();
    for (const m of ['prepared.potentialRandom', 'mixed.potential'] as const)
      expect(a.measures[m], m).toBeNaN();
    const b = evalSlot({ ...args, fidelity: { ...tiny, info: true, mixedDraws: 1 } });
    for (const m of ['prepared.potentialRandom', 'tool.potential', 'mixed.potential'] as const)
      expect(b.measures[m], m).not.toBeNaN();
    // The target measures do not depend on the information ones: same weekends, same seeds.
    expect(b.measures['prepared.potential']).toBe(a.measures['prepared.potential']);
    expect(b.measures['classic.potential']).toBe(a.measures['classic.potential']);
    expect(b.measures['tool.potential']).toBe(a.measures['tool.potential']);
    // A huge boss: potential is a small share; a boss of nothing: many times the HP.
    const wall = evalSlot({ ...args, numbers: { hp: 10_000_000, atk: 100, armour: 35 } });
    expect(wall.measures['prepared.potential']).toBeLessThan(0.05);
    const soft = evalSlot({ ...args, numbers: { hp: 500, atk: 1, armour: 1 } });
    expect(soft.measures['prepared.potential']).toBeGreaterThan(5);
  });

  it('the tutorial slot is measured against a boss with no rule cards', () => {
    const tiny = { weekends: 2, draws: 1, classicWeekends: 1, mixedDraws: 0, mixedWeekends: 1 };
    const r = evalSlot({
      slot: 1,
      week: 1,
      speed: 'expected',
      numbers: { hp: 13_000, atk: 80, armour: 30 },
      fidelity: tiny,
      salt: 'tutorial',
    });
    expect(r.measures['prepared.potential']).toBeGreaterThan(0);
    expect(slotBoss(1).cards).toEqual([]);
  });

  it('is judged on Misa’s targets, with the tool’s worth by the cards’ strength and no classic limit on the welcome boss, and the search leans to the ranks’ line only a little', () => {
    const measures = (slot: number) => slotTargets(slot).map((t) => t.measure);
    expect(measures(2)).toEqual([
      'prepared.potential',
      'prepared.share',
      'prepared.beat2',
      'tool.potential',
      'classic.potential',
      'classic.kill',
    ]);
    // Slot 1, the tutorial (no rule cards): any decent team may win it, so no classic limit, and there is no card to ask a tool for.
    expect(measures(1)).toEqual(['prepared.potential', 'prepared.share', 'prepared.beat2']);
    // The rest of the bounds are Misa's.
    for (const m of [
      'prepared.potential',
      'prepared.share',
      'prepared.beat2',
      'classic.potential',
      'classic.kill',
    ] as const)
      expect(slotTargets(5).find((t) => t.measure === m)).toEqual(
        RAID_TARGETS.high.find((t) => t.measure === m),
      );
    // The tool's worth is in points of damage potential; the HP-share tool measures are information only on the track.
    expect(slotTargets(10).find((t) => t.measure === 'tool.potential')?.min).toBeCloseTo(
      toolPotentialMinAt(trackSlot(10).strengthBp),
    );
    for (const slot of [1, 2, 10])
      for (const m of ['tool.share', 'tool.written'])
        expect(
          slotTargets(slot).find((t) => t.measure === m),
          `slot ${slot} ${m}`,
        ).toBeUndefined();
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
      // The information measures (random-talent potential, the mixed server) only in the full measurement of the proposal.
      expect(f.search.info).toBeUndefined();
      expect(f.check.info).toBeUndefined();
      expect(f.final.info).toBe(true);
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
    for (const slot of [2, 5, 8]) {
      const tools = slotTargetsFor(slot, trackSlot(slot).strengthBp).filter((x) =>
        x.measure.startsWith('tool.'),
      );
      expect(tools.map((x) => x.measure)).toEqual(['tool.potential']);
      expect(tools[0]?.min).toBeCloseTo(toolPotentialMinAt(trackSlot(slot).strengthBp));
    }
  });
});

describe('the tool’s worth in points of potential by the strength of the cards', () => {
  it('is 0.05 at 0%, 0.10 at 30%, straight up to 0.35 at 100%, and flat above', () => {
    expect(toolPotentialMinAt(0)).toBeCloseTo(0.05);
    expect(toolPotentialMinAt(1_500)).toBeCloseTo(0.075);
    expect(toolPotentialMinAt(3_000)).toBeCloseTo(0.1);
    expect(toolPotentialMinAt(6_500)).toBeCloseTo(0.225);
    expect(toolPotentialMinAt(10_000)).toBeCloseTo(0.35);
    expect(toolPotentialMinAt(15_000)).toBeCloseTo(0.35);
    let before = 0;
    for (let b = 0; b <= 10_000; b += 250) {
      expect(toolPotentialMinAt(b)).toBeGreaterThanOrEqual(before);
      before = toolPotentialMinAt(b);
    }
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
      { slot, week: 8, speed: 'expected', numbers, fidelity: fid, salt: 'cmp' },
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

describe('the difficulty aim', () => {
  it('aims inside the potential bounds, at 130% for the prepared line and 80% for the classic party', () => {
    expect(PREPARED_POTENTIAL_AIM).toBe(1.3);
    expect(CLASSIC_POTENTIAL_AIM).toBe(0.8);
    expect(PREPARED_POTENTIAL_AIM).toBeGreaterThanOrEqual(PREPARED_POTENTIAL_MIN);
    expect(CLASSIC_POTENTIAL_AIM).toBeGreaterThanOrEqual(CLASSIC_POTENTIAL_MIN);
    expect(CLASSIC_POTENTIAL_AIM).toBeLessThanOrEqual(CLASSIC_POTENTIAL_MAX);
  });

  it('is a comfort of minus the distances of the two potentials to their aims', () => {
    const m = (prepared: number, classic = CLASSIC_POTENTIAL_AIM) =>
      ({ 'prepared.potential': prepared, 'classic.potential': classic }) as unknown as RaidMeasures;
    expect(aimComfort(m(PREPARED_POTENTIAL_AIM))).toBeCloseTo(0);
    expect(aimComfort(m(PREPARED_POTENTIAL_AIM + 0.3))).toBeCloseTo(-0.3);
    expect(aimComfort(m(PREPARED_POTENTIAL_AIM + 0.1))).toBeCloseTo(
      aimComfort(m(PREPARED_POTENTIAL_AIM - 0.1)),
    );
    expect(aimComfort(m(1.4))).toBeGreaterThan(aimComfort(m(1.9)));
    // The classic party counts the same way, and not at all on the tutorial slot.
    expect(aimComfort(m(PREPARED_POTENTIAL_AIM, 0.9))).toBeCloseTo(-0.1);
    expect(aimComfort(m(PREPARED_POTENTIAL_AIM, 0.9), false)).toBeCloseTo(0);
    // Within a step of an aim the measure is noise.
    expect(aimComfort(m(PREPARED_POTENTIAL_AIM + 0.01))).toBe(
      aimComfort(m(PREPARED_POTENTIAL_AIM - 0.01)),
    );
    expect(aimComfort({ ...m(1.3), 'prepared.potential': Number.NaN })).toBeCloseTo(0);
  });

  it('compares losses in steps, so that noise below a step does not decide', () => {
    expect(quantised(0)).toBe(quantised(LOSS_STEP * 0.4));
    expect(quantised(LOSS_STEP * 2.2)).not.toBe(quantised(0));
    expect(NEAR_WEIGHT).toBeLessThan(0.2);
  });

  /**
   * A world where the prepared potential falls with HP (2.0 at 8_000 HP, 1.0 at 16_000), the kill rate with it, and every other target
   * is met (the classic potential sits at its aim): only the aim tells HPs apart.
   */
  const fakeWorld =
    (seen: SlotEvalArgs[]): Executor =>
    (job) => {
      const a = job.args as SlotEvalArgs;
      seen.push(a);
      const potential = 2 - (a.numbers.hp - 8_000) / 8_000;
      const kill = Math.min(1, Math.max(0, (potential - 0.8) / 0.6));
      const measures = {
        'prepared.potential': potential,
        'classic.potential': CLASSIC_POTENTIAL_AIM,
        'prepared.share': 0.95,
        'prepared.kill': kill,
        'prepared.written': kill,
        'prepared.beat2': beatWithin(kill, 2),
        'tool.share': 0.3,
        'tool.written': 0.3,
        'classic.share': 0.5,
        'classic.kill': 0,
        'mixed.share': Number.NaN,
        'mixed.kill': Number.NaN,
      } as unknown as RaidMeasures;
      const result: SlotEvalResult = { measures, weekends: 1 };
      return Promise.resolve({ result, seconds: 0 });
    };

  it('picks the boss whose prepared potential is nearest the aim among those that meet every target', async () => {
    const seen: SlotEvalArgs[] = [];
    const r = await tuneSlot({
      slot: 2,
      week: 4,
      table: {},
      quick: false,
      run: { exec: fakeWorld(seen), slots: 1 },
      cache: new Map(),
    });
    // The softest boss (potential 2.0) and the hardest that still reaches 125% both meet every target.
    expect(r.best.loss).toBe(0);
    expect(Math.abs(r.best.measures['prepared.potential'] - PREPARED_POTENTIAL_AIM)).toBeLessThan(
      0.12,
    );
    expect(r.best.measures['prepared.beat2']).toBeGreaterThanOrEqual(BEAT2_MIN);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('how sharply the kill rate falls with the HP', () => {
  it('reads the cliff off a curve: the HP at 90% and 10% kill, and the width as a share of the HP at 50%', () => {
    const curve = [
      { factor: 0.8, hp: 8_000, kill: 1 },
      { factor: 0.9, hp: 9_000, kill: 0.95 },
      { factor: 1, hp: 10_000, kill: 0.7 },
      { factor: 1.1, hp: 11_000, kill: 0.3 },
      { factor: 1.2, hp: 12_000, kill: 0 },
    ];
    const c = cliffWidth(curve);
    expect(c?.hpHigh).toBeCloseTo(9_200);
    expect(c?.hpHalf).toBeCloseTo(10_500);
    expect(c?.hpLow).toBeCloseTo(11_000 + (0.2 / 0.3) * 1_000);
    expect(c?.widthShare).toBeCloseTo((11_000 + (0.2 / 0.3) * 1_000 - 9_200) / 10_500);
    // A curve that never falls below the level has no cliff.
    expect(cliffWidth(curve.map((x) => ({ ...x, kill: 1 })))).toBeUndefined();
  });

  it('measures a slot’s kill rate over the HP: a soft boss is always beaten, a huge one never', () => {
    const numbers = { hp: 12_000, atk: 100, armour: 30 };
    const curve = killByHp(2, 6, numbers, { from: 0.05, to: 20, step: 19.95, weekends: 4 });
    expect(curve).toHaveLength(2);
    expect(curve[0]?.kill).toBe(1);
    expect(curve[1]?.kill).toBe(0);
    expect(curve[0]?.hp).toBeLessThan(curve[1]?.hp ?? 0);
  });
});
