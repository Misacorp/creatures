/**
 * The boss tuner: the targets as data, the search on a synthetic loss with a known optimum, conflict detection, the ladder, and
 * the orchestration end to end with a fake executor (the real measures are the report's own functions, tested where they live).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOSS_ANSWERS,
  GATE_BOSSES,
  GATE_DROP,
  MARGIN_TARGET,
  RAID_BOSS_IDS,
  RAID_SPECS,
  ROBUST_SHARE,
  ROBUST_TARGET,
  TOOL_DROP_MIN,
  TOOL_SHARE_MIN,
  answerLine,
  raidBossOf,
  robustnessOf,
  toolCost,
} from '../src';
import { main } from '../src/cli';
import type { Executor } from '../src/jobs';
import {
  BEAT2_MIN,
  BOSS_ARMOUR_MIN,
  CLASSIC_POTENTIAL_AIM,
  CLASSIC_POTENTIAL_MAX,
  CLASSIC_POTENTIAL_MIN,
  INFO_MEASURES,
  LADDER,
  PREPARED_POTENTIAL_AIM,
  PREPARED_POTENTIAL_MIN,
  RAID_MEASURES,
  RAID_TARGETS,
  REPORTED_MEASURES,
  RULE_TARGETS,
  TARGET_RANKS,
  beatWithin,
  comfortOf,
  isCrossMeasure,
  lossOf,
  metBy,
  missOf,
  skippedCross,
  targetsFor,
  weeksText,
  weeksToBeat,
  type RaidMeasures,
  type RaidTarget,
} from '../src/targets';
import {
  absoluteOf,
  describeTarget,
  evalCandidate,
  findConflicts,
  fitsBetter,
  ladderBox,
  nativeOf,
  randomTalentMeasure,
  rebaseOn,
  searchPoints,
  todayAbsolute,
  tuneBoss,
  tuneRank,
  type Axis,
  type Level,
  meetsEveryTarget,
  summaryOf,
  type Point,
  type Numbers,
  type Scored,
  type TuneEvalArgs,
} from '../src/tuner';
import { drawsAt, ruleMeasures, weekendsAt } from '../src/raidRules';
import * as T from '../src/targets';

/** Measures that meet every target. */
const GOOD: RaidMeasures = {
  'prepared.share': 0.9,
  'prepared.kill': 0.3,
  'prepared.written': 0.6,
  'prepared.beat2': 0.84,
  'tool.share': 0.15,
  'tool.written': 0.15,
  'classic.share': 0.9,
  'classic.kill': 0,
  'mixed.share': 0.75,
  'mixed.kill': 0.2,
  'prepared.potential': 1.3,
  'classic.potential': 0.8,
  'prepared.potentialRandom': 1.2,
  'tool.potential': 0.15,
  'mixed.potential': 0.9,
  // The lab tests' rules (`RULE_TARGETS`), each inside its bounds.
  'answers.classicKill': 0,
  'answers.classicShare': 0.5,
  'answers.share': 0.95,
  'answers.t2': 0.9,
  'answers.firstKill': 0.9,
  'answers.beatClassic': 10,
  'answers.toolShare': 0.2,
  'answers.toolKill': 0.4,
  'robust.share': 0.9,
  'robust.gap': 0.05,
  'margin.base': 0.97,
  'margin.atk10': 0.9,
  'margin.hp10': 0.9,
  'cost.share': 0.97,
  'cost.pays': 1,
  'cost.hpLeft': 0.5,
  'width.classicKill': 0,
  'width.classicShare': 0.5,
  'width.bestShare': 0.95,
  gap10: 2,
  'server.kill': 0.3,
  'server.share': 0.7,
  'server.knockouts': 5,
  'content.knockouts': 6,
  'content.classicKill': 0,
  'rank.preparedKill': 0.9,
  'rank.preparedShare': 0.97,
  'rank.classicKill': 0,
  'rank.toolShare': 0.15,
  'casual.share': 0.6,
  'casual.kill': 0,
  'cross.classicLadder': 0.1,
  'cross.toolGap': 0.2,
};

describe('targets: the numbers the tests used before, in one place', () => {
  it('pins the thresholds that moved here', () => {
    expect(TOOL_DROP_MIN).toBe(20);
    expect(TOOL_SHARE_MIN).toBe(0.1);
    expect(GATE_DROP).toBe(50);
    expect(GATE_BOSSES).toBe(3);
    expect(ROBUST_SHARE).toBe(0.8);
    expect(ROBUST_TARGET).toBe(0.6);
    expect(MARGIN_TARGET).toBe(0.6);
  });

  it('pins Misa’s targets of 2026-10-30 at every rank and the ladder', () => {
    expect(BEAT2_MIN).toBe(0.75);
    for (const rank of TARGET_RANKS) {
      const t = (m: string) => RAID_TARGETS[rank].find((x) => x.measure === m);
      expect(t('prepared.share')?.min).toBe(ROBUST_SHARE);
      expect(t('prepared.beat2')?.min).toBe(BEAT2_MIN);
      expect(t('tool.share')?.min).toBe(TOOL_SHARE_MIN);
      expect(t('tool.written')?.min).toBe(TOOL_SHARE_MIN);
      expect(t('classic.kill')?.max).toBe(0.05);
      // Damage potential (Misa, 2026-10-30): the prepared line with its written talents 125% or more, the classic party 70% to 90%.
      expect(t('prepared.potential')?.min).toBe(PREPARED_POTENTIAL_MIN);
      expect(PREPARED_POTENTIAL_MIN).toBe(1.25);
      expect(t('classic.potential')?.min).toBe(CLASSIC_POTENTIAL_MIN);
      expect(t('classic.potential')?.max).toBe(CLASSIC_POTENTIAL_MAX);
      expect([CLASSIC_POTENTIAL_MIN, CLASSIC_POTENTIAL_MAX]).toEqual([0.7, 0.9]);
      // No target: the random-talent kill rate and potential, the classic party's HP removed, the tool's potential, the mixed server.
      for (const m of [
        'prepared.kill',
        'prepared.written',
        'prepared.potentialRandom',
        'tool.potential',
        'classic.share',
        'mixed.share',
        'mixed.kill',
        'mixed.potential',
      ])
        expect(t(m), `${rank} ${m}`).toBeUndefined();
      expect(RAID_TARGETS[rank]).toHaveLength(7);
    }
    expect(LADDER).toEqual({ lowOfHigh: 0.9, midOfHigh: 0.95 });
  });
});

describe('weeks to beat', () => {
  it('beat2 is the chance of a kill in at most two weekends, 1 - (1 - p)^2', () => {
    expect(beatWithin(0, 2)).toBe(0);
    expect(beatWithin(1, 2)).toBe(1);
    expect(beatWithin(0.5, 2)).toBeCloseTo(0.75, 12);
    expect(beatWithin(0.3, 3)).toBeCloseTo(1 - 0.7 ** 3, 12);
    // The target of 75% is a kill rate of one half.
    expect(beatWithin(0.5, 2)).toBeGreaterThanOrEqual(BEAT2_MIN);
    expect(beatWithin(0.49, 2)).toBeLessThan(BEAT2_MIN);
  });

  it('is 1 / p weekends, "never" at p 0 and "20+" beyond twenty', () => {
    expect(weeksToBeat(0.5)).toBe(2);
    expect(weeksToBeat(1)).toBe(1);
    expect(weeksToBeat(0)).toBe(Number.POSITIVE_INFINITY);
    expect(weeksText(0)).toBe('never');
    expect(weeksText(1)).toBe('1.0');
    expect(weeksText(0.4)).toBe('2.5');
    expect(weeksText(0.05)).toBe('20.0');
    expect(weeksText(0.04)).toBe('20+');
    expect(weeksText(0.001)).toBe('20+');
  });

  it('every measure the tuner reads is listed once', () => {
    expect(new Set(RAID_MEASURES).size).toBe(RAID_MEASURES.length);
    expect(Object.keys(GOOD).sort()).toEqual([...RAID_MEASURES].sort());
  });
});

describe('the loss', () => {
  const targets = RAID_TARGETS.high;
  const set = (over: Partial<Record<keyof RaidMeasures, number>>): RaidMeasures => ({
    ...GOOD,
    ...over,
  });

  it('is 0 exactly when every target is met, edges included', () => {
    expect(lossOf(targets, GOOD)).toBe(0);
    const edges = set({
      'prepared.share': 0.8,
      'prepared.beat2': 0.75,
      'tool.share': 0.1,
      'tool.written': 0.1,
      'classic.kill': 0.05,
      'prepared.potential': 1.25,
      'classic.potential': 0.7,
    });
    expect(lossOf(targets, edges)).toBe(0);
    expect(lossOf(targets, set({ 'classic.potential': 0.9 }))).toBe(0);
    // No target: the classic party's HP removed, the mixed server, the random-talent kill rate.
    expect(
      lossOf(
        targets,
        set({
          'classic.share': 1,
          'mixed.share': 0,
          'mixed.kill': 1,
          'prepared.kill': 0,
          'prepared.written': 0.5,
        }),
      ),
    ).toBe(0);
    // One step outside any bound is a loss.
    for (const [m, v] of [
      ['prepared.share', 0.79],
      ['prepared.beat2', 0.74],
      ['tool.share', 0.09],
      ['tool.written', 0.09],
      ['classic.kill', 0.06],
      ['prepared.potential', 1.24],
      ['classic.potential', 0.69],
      ['classic.potential', 0.91],
    ] as const)
      expect(lossOf(targets, set({ [m]: v })), `${m} ${String(v)}`).toBeGreaterThan(0);
  });

  it('is the weighted distance to the bound, summed', () => {
    const t = (m: string) => targets.find((x) => x.measure === m) as RaidTarget;
    expect(missOf(t('classic.kill'), 0.25)).toBeCloseTo(0.2, 12);
    const loss = lossOf(targets, set({ 'prepared.share': 0.7, 'classic.kill': 0.25 }));
    expect(loss).toBeCloseTo(t('prepared.share').weight * 0.1 + t('classic.kill').weight * 0.2, 12);
    expect(metBy(t('prepared.beat2'), 0.75)).toBe(true);
  });

  it('the potential targets: 125% or more for the prepared line, 70% to 90% for the classic party', () => {
    const t = (m: string) => targets.find((x) => x.measure === m) as RaidTarget;
    expect(missOf(t('prepared.potential'), 1.05)).toBeCloseTo(0.2, 12);
    expect(missOf(t('classic.potential'), 1.0)).toBeCloseTo(0.1, 12);
    expect(missOf(t('classic.potential'), 0.6)).toBeCloseTo(0.1, 12);
    expect(metBy(t('classic.potential'), 0.8)).toBe(true);
    expect(PREPARED_POTENTIAL_AIM).toBeGreaterThanOrEqual(PREPARED_POTENTIAL_MIN);
    expect(CLASSIC_POTENTIAL_AIM).toBeGreaterThanOrEqual(CLASSIC_POTENTIAL_MIN);
    expect(CLASSIC_POTENTIAL_AIM).toBeLessThanOrEqual(CLASSIC_POTENTIAL_MAX);
  });

  it('comfort tells apart two candidates of loss 0: more room inside the bounds is better', () => {
    const roomy = set({ 'prepared.share': 0.95 });
    expect(lossOf(targets, roomy)).toBe(0);
    expect(comfortOf(targets, roomy)).toBeGreaterThan(
      comfortOf(targets, set({ 'prepared.share': 0.81 })),
    );
    expect(
      fitsBetter({ loss: 0, comfort: 0.1, data: 0 }, { loss: 0, comfort: 0.05, data: 0 }),
    ).toBe(true);
    expect(fitsBetter({ loss: 0.1, comfort: 9, data: 0 }, { loss: 0, comfort: 0, data: 0 })).toBe(
      false,
    );
  });
});

const one = (): Axis[] => [{ name: 'x', lo: 0, hi: 100, quantum: 1 }];

describe('the search', () => {
  const axes: Axis[] = [
    { name: 'a', lo: 0, hi: 100, quantum: 1 },
    { name: 'b', lo: 0, hi: 100, quantum: 1 },
    { name: 'c', lo: 0, hi: 1_000, quantum: 10 },
  ];
  const optimum: Point = [37, 71, 420];
  const plan = { gridPoints: 5, rounds: 4, keep: 3, checks: 10, finalists: 4 };
  const bowl = (p: Point): number =>
    Math.abs((p[0] as number) - 37) / 100 +
    Math.abs((p[1] as number) - 71) / 100 +
    Math.abs((p[2] as number) - 420) / 1_000;
  const evaluator =
    (seen: { points: Point[]; levels: string[] } = { points: [], levels: [] }) =>
    // eslint-disable-next-line @typescript-eslint/require-await
    async (points: readonly Point[], level: Level): Promise<Scored<null>[]> => {
      seen.points.push(...points);
      seen.levels.push(level);
      return points.map((p) => ({ loss: bowl(p), comfort: 0, data: null }));
    };

  it('finds a known optimum within a step of its smallest grid', async () => {
    const r = await searchPoints(axes, () => true, [10, 10, 100], plan, evaluator());
    expect(r.best).toBeDefined();
    const best = r.best?.point ?? [];
    expect(Math.abs((best[0] ?? 0) - (optimum[0] as number))).toBeLessThanOrEqual(7);
    expect(Math.abs((best[1] ?? 0) - (optimum[1] as number))).toBeLessThanOrEqual(7);
    expect(Math.abs((best[2] ?? 0) - (optimum[2] as number))).toBeLessThanOrEqual(70);
    // Far better than the start, and not worse than the best grid point alone.
    expect(r.best?.loss ?? 1).toBeLessThan(0.05);
    expect(r.start.loss).toBeCloseTo(bowl([10, 10, 100]), 12);
    expect(r.best?.level).toBe('final');
  });

  it('is exact where the grid holds the optimum', async () => {
    const r = await searchPoints(
      [
        { name: 'a', lo: 0, hi: 80, quantum: 1 },
        { name: 'b', lo: 0, hi: 80, quantum: 1 },
        { name: 'c', lo: 0, hi: 840, quantum: 10 },
      ],
      () => true,
      [0, 0, 0],
      { gridPoints: 5, rounds: 1, keep: 2, checks: 10, finalists: 2 },
      async (points) =>
        Promise.resolve(
          points.map((p) => ({
            loss:
              Math.abs((p[0] as number) - 40) +
              Math.abs((p[1] as number) - 80) +
              Math.abs((p[2] as number) - 420),
            comfort: 0,
            data: null,
          })),
        ),
    );
    expect(r.best?.point).toEqual([40, 80, 420]);
    expect(r.best?.loss).toBe(0);
  });

  it('never measures a point the ladder forbids, and measures the start whether or not it is allowed', async () => {
    const seen = { points: [] as Point[], levels: [] as string[] };
    const feasible = (p: Point) => (p[0] as number) <= 50;
    const r = await searchPoints(axes, feasible, [90, 10, 100], plan, evaluator(seen));
    const others = seen.points.filter((p) => p !== r.start.point && p[0] !== 90);
    expect(others.every((p) => feasible(p))).toBe(true);
    expect(seen.points.some((p) => p[0] === 90 && p[1] === 10 && p[2] === 100)).toBe(true);
    expect(r.best?.point[0] ?? 99).toBeLessThanOrEqual(50);
  });

  it('measures the cheap passes first and the finalists once more in full; the full number decides', async () => {
    const seen = { points: [] as Point[], levels: [] as string[] };
    // A point that looks perfect on the cheap pass (a lucky draw) but is bad in full.
    const lucky: Point = [0, 0, 0];
    const r = await searchPoints(
      axes,
      () => true,
      lucky,
      { gridPoints: 3, rounds: 1, keep: 2, checks: 10, finalists: 3 },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (points, level) => {
        seen.levels.push(level);
        return points.map((p) => ({
          loss: level === 'search' && p === lucky ? -1 : bowl(p),
          comfort: 0,
          data: null,
        }));
      },
    );
    expect(seen.levels[0]).toBe('search');
    expect(seen.levels.at(-1)).toBe('final');
    expect(seen.levels.filter((l) => l === 'final')).toHaveLength(1);
    expect(r.best?.level).toBe('final');
    // The lucky start is a finalist too, and loses on the full measurement.
    expect(r.best?.point).not.toEqual(lucky);
    expect(r.start.level).toBe('final');
  });

  it('keeps the start when no other point is clearly better, and moves off it when one is', async () => {
    const flat = (loss: (x: number) => number) => async (points: readonly Point[]) =>
      Promise.resolve(points.map((p) => ({ loss: loss(p[0] as number), comfort: 0, data: null })));
    const one: Axis[] = [{ name: 'x', lo: 0, hi: 100, quantum: 1 }];
    const plan1 = { gridPoints: 5, rounds: 1, keep: 2, checks: 10, finalists: 3 };
    // The start (30) is 0.001 worse than the best (50): within the noise of a measurement, so the start stays.
    const near = await searchPoints(
      one,
      () => true,
      [30],
      plan1,
      flat((x) => (x === 50 ? 0 : x === 30 ? 0.001 : 0.5)),
    );
    expect(near.best?.point).toEqual([30]);
    // A start that misses a target moves for a smaller gain than one that meets them all would need (`MIN_GAIN.missed`), so that a
    // boss that misses can move step by step (the ranks pull on each other: one rank's step opens the next rank's).
    const step = await searchPoints(
      one,
      () => true,
      [30],
      plan1,
      flat((x) => (x === 50 ? 0.1 : x === 30 ? 0.105 : 0.5)),
    );
    expect(step.best?.point).toEqual([50]);
    const tiny = await searchPoints(
      one,
      () => true,
      [30],
      plan1,
      flat((x) => (x === 50 ? 0.1 : x === 30 ? 0.101 : 0.5)),
    );
    expect(tiny.best?.point).toEqual([30]);
    // 0.2 worse is a reason to move.
    const far = await searchPoints(
      one,
      () => true,
      [30],
      plan1,
      flat((x) => (x === 50 ? 0 : x === 30 ? 0.2 : 0.5)),
    );
    expect(far.best?.point).toEqual([50]);
  });

  it('proposes nothing when the ladder leaves no point', async () => {
    const r = await searchPoints(
      one(),
      () => false,
      [30],
      { gridPoints: 3, rounds: 1, keep: 1, checks: 10, finalists: 1 },
      async (points) => Promise.resolve(points.map(() => ({ loss: 0, comfort: 0, data: null }))),
    );
    expect(r.best).toBeUndefined();
  });

  it('with several points of loss 0, takes the one with the most room', async () => {
    const r = await searchPoints(
      [{ name: 'x', lo: 0, hi: 100, quantum: 1 }],
      () => true,
      [0],
      { gridPoints: 5, rounds: 1, keep: 3, checks: 10, finalists: 5 },
      // A plateau of loss 0 from 20 to 80, the roomiest point in its middle.
      async (points) =>
        Promise.resolve(
          points.map((p) => {
            const x = p[0] as number;
            const inside = x >= 20 && x <= 80;
            return {
              loss: inside ? 0 : Math.min(Math.abs(x - 20), Math.abs(x - 80)) / 100,
              comfort: inside ? Math.min(x - 20, 80 - x) / 100 : 0,
              data: null,
            };
          }),
        ),
    );
    expect(r.best?.loss).toBe(0);
    expect(Math.abs((r.best?.point[0] ?? 0) - 50)).toBeLessThanOrEqual(13);
  });
});

describe('conflicts', () => {
  const a: RaidTarget = { measure: 'prepared.share', min: 0.8, weight: 1, why: '' };
  const b: RaidTarget = { measure: 'classic.share', max: 0.5, weight: 1, why: '' };
  const c: RaidTarget = { measure: 'mixed.kill', max: 0.5, weight: 1, why: '' };
  const m = (over: Partial<Record<keyof RaidMeasures, number>>): RaidMeasures => ({
    ...GOOD,
    ...over,
  });

  it('finds a pair that is each met somewhere but never together', () => {
    // Where the prepared team does well the classic party does too, and the other way round.
    const measured = [
      m({ 'prepared.share': 0.9, 'classic.share': 0.7 }),
      m({ 'prepared.share': 0.95, 'classic.share': 0.8 }),
      m({ 'prepared.share': 0.6, 'classic.share': 0.3 }),
      m({ 'prepared.share': 0.7, 'classic.share': 0.4 }),
    ];
    const r = findConflicts([a, b, c], measured);
    expect(r.conflicts.map((k) => [k.a.measure, k.b.measure])).toEqual([
      ['prepared.share', 'classic.share'],
    ]);
    expect(r.conflicts[0]).toMatchObject({ metA: 2, metB: 2, both: 0, of: 4 });
    expect(r.unreachable).toEqual([]);
    expect(r.allMet).toBe(0);
  });

  it('is no conflict when some point meets both, and counts the points that meet everything', () => {
    const r = findConflicts(
      [a, b, c],
      [
        m({ 'prepared.share': 0.9, 'classic.share': 0.7 }),
        m({ 'prepared.share': 0.9, 'classic.share': 0.4 }),
      ],
    );
    expect(r.conflicts).toEqual([]);
    expect(r.allMet).toBe(1);
  });

  it('lists a target that nothing meets apart from the conflicts', () => {
    const r = findConflicts(
      [a, b],
      [
        m({ 'classic.share': 0.3, 'prepared.share': 0.5 }),
        m({ 'classic.share': 0.4, 'prepared.share': 0.6 }),
      ],
    );
    expect(r.unreachable.map((t) => t.measure)).toEqual(['prepared.share']);
    expect(r.conflicts).toEqual([]);
  });

  it('describes a target in a few words', () => {
    expect(describeTarget(a)).toBe('prepared.share ≥ 80%');
    expect(describeTarget(b)).toBe('classic.share ≤ 50%');
    expect(describeTarget({ measure: 'mixed.share', min: 0.6, max: 0.9, weight: 1, why: '' })).toBe(
      'mixed.share 60% to 90%',
    );
  });
});

describe('the boss and its ladder', () => {
  it.each(RAID_BOSS_IDS)(
    '%s: the numbers as the spec holds them rebuild the boss exactly, at every rank',
    (id) => {
      for (const rank of TARGET_RANKS) {
        const abs = absoluteOf(id, rank, nativeOf(id, rank));
        expect(raidBossOf(id, { rank, ...abs }), `${id} ${rank}`).toEqual(raidBossOf(id, { rank }));
      }
    },
  );

  it('the ladder box holds today’s numbers, and a rank is boxed by the ranks around it', () => {
    for (const spec of RAID_SPECS) {
      const today = todayAbsolute(spec.id);
      for (const rank of TARGET_RANKS) {
        const others = { ...today } as Partial<typeof today>;
        delete others[rank];
        const box = ladderBox(spec.id, rank, others);
        for (const k of ['hp', 'atk', 'armour'] as const)
          expect(
            today[rank][k] >= box[k][0] && today[rank][k] <= box[k][1],
            `${spec.id} ${rank} ${k}`,
          ).toBe(true);
      }
    }
    const high = { hp: 20_000, atk: 100, armour: 40 };
    const lowBox = ladderBox('tidal-colossus', 'low', {
      mid: { hp: 17_000, atk: 90, armour: 36 },
      high,
    });
    expect(lowBox.hp[1]).toBe(16_999);
    expect(lowBox.atk[1]).toBe(89);
    expect(lowBox.armour[1]).toBe(36);
    const midBox = ladderBox('tidal-colossus', 'mid', {
      low: { hp: 12_000, atk: 80, armour: 30 },
      high,
    });
    expect(midBox.hp).toEqual([12_001, 19_000]);
    const highBox = ladderBox('tidal-colossus', 'high', {
      mid: { hp: 18_050, atk: 90, armour: 36 },
    });
    expect(highBox.hp[0]).toBe(19_000);
    expect(highBox.armour[0]).toBe(36);
  });
});

describe('lower ranks against a new high rank', () => {
  const rebuilt = (bp: Numbers, high: Numbers): Numbers => ({
    hp: Math.round((high.hp * bp.hp) / 10_000),
    atk: Math.round((high.atk * bp.atk) / 10_000),
    armour: Math.round((high.armour * bp.armour) / 10_000),
  });

  it('gives bp that rebuild the measured absolute numbers, tidy where it can', () => {
    // A synthetic case: the high rank moves from 11,000 / 99 / 170 to 9,500 / 89 / 209; the mid rank was measured at 7,260 / 79 / 182.
    const high = { hp: 9_500, atk: 89, armour: 209 };
    const mid = { hp: 7_260, atk: 79, armour: 182 };
    const bp = rebaseOn(mid, high);
    expect(rebuilt(bp, high)).toEqual(mid);
    // 7,260 / 9,500 is 7,642 bp: no multiple of 100 or 10 rebuilds it (7,640 gives 7,258), so the whole bp is used.
    expect(bp.hp).toBe(7_642);
    expect(bp.armour).toBe(8_700);
    // A small high rank (armour 6) still rebuilds exactly.
    const small = { hp: 14_100, atk: 70, armour: 6 };
    const low = { hp: 12_325, atk: 63, armour: 5 };
    expect(rebuilt(rebaseOn(low, small), small)).toEqual(low);
    expect(rebaseOn(low, small).armour).toBe(8_300);
  });

  it('rebuilds every number in a sweep, and an unchanged high rank gives back the same bp', () => {
    for (let hi = 3; hi < 400; hi += 7)
      for (let abs = 1; abs <= hi + 5; abs++) {
        const n = rebaseOn({ hp: 1, atk: abs, armour: abs }, { hp: 1_000, atk: hi, armour: hi });
        expect(
          rebuilt(n, { hp: 1_000, atk: hi, armour: hi }).atk,
          `${String(abs)} of ${String(hi)}`,
        ).toBe(abs);
      }
    const high = { hp: 20_200, atk: 116, armour: 34 };
    expect(rebaseOn({ hp: 18_180, atk: 107, armour: 28 }, high)).toEqual({
      hp: 9_000,
      atk: 9_200,
      armour: 8_200,
    });
  });

  it('the tuner’s paste for the lower ranks is a share of the proposed high rank when it moves', async () => {
    const results = await tuneBoss('tidal-colossus', TARGET_RANKS, true, { exec: fake, slots: 4 });
    const high = results[0]?.best?.absolute;
    expect(high).toBeDefined();
    expect(high?.hp).not.toBe(19_100);
    for (const r of results.slice(1)) {
      expect(r.rebasedOn).toEqual(high);
      const bp = rebaseOn(r.best?.absolute as Numbers, high as Numbers);
      // A bp of the high rank is exact for numbers below 10,000; above that one bp is more than one HP, so the rebuilt HP is within 1.
      const back = rebuilt(bp, high as Numbers);
      const want = r.best?.absolute as Numbers;
      expect(back).toMatchObject({ atk: want.atk, armour: want.armour });
      expect(Math.abs(back.hp - want.hp)).toBeLessThanOrEqual(1);
      const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
      expect(r.paste).toContain(
        `ranks.${r.rank}): [${grouped(bp.hp)}, ${grouped(bp.atk)}, ${grouped(bp.armour)}]`,
      );
    }
    expect(results[0]?.rebasedOn).toBeUndefined();
  });
});

describe('the measure', () => {
  it('the tool gap with written talents is the answer test’s own (toolCost), and the kill rate the same line’s', () => {
    const id = 'storm-sovereign';
    const answer = BOSS_ANSWERS[id]?.[0];
    if (!answer) throw new Error('no answer');
    const numbers = absoluteOf(id, 'high', nativeOf(id, 'high'));
    const r = evalCandidate({
      boss: id,
      rank: 'high',
      numbers,
      fidelity: { weekends: 6, draws: 3, classicWeekends: 2, mixedDraws: 1, mixedWeekends: 1 },
      salt: 'tuner:tool',
    });
    const cost = toolCost(
      raidBossOf(id, { rank: 'high', ...numbers }),
      answer,
      answerLine(answer.line),
      6,
      'tuner:tool:w',
    );
    expect(r.measures['tool.written']).toBeCloseTo(cost.shareDrop / 100, 12);
    expect(r.measures['prepared.written']).toBe(cost.withStats.tiers.kill);
    expect(r.measures['prepared.beat2']).toBeCloseTo(1 - (1 - cost.withStats.tiers.kill) ** 2, 12);
  });

  it('random talents give the numbers robustnessOf gives for them, without the measures the tuner does not read', () => {
    const id = 'tidal-colossus';
    const boss = raidBossOf(id, { rank: 'low' });
    const line = answerLine(BOSS_ANSWERS[id]?.[0]?.line ?? '');
    const mine = randomTalentMeasure(boss, line, 6, 3, 'tuner:test');
    const theirs = robustnessOf(boss, line, 6, 3, 'tuner:test').random;
    expect(mine.share).toBe(theirs.damageShare);
    expect(mine.kill).toBe(theirs.tiers.kill);
  });
});

/**
 * A fake executor: a boss that gets easier as its HP falls. Every target is met at an HP of about 97.5% of today's high rank's or
 * less (today's just misses), and the ladder holds the high rank above 18,405 (its low rank), so the tuner's orchestration runs without a fight.
 */
const fake: Executor = (job) => {
  const a = job.args as TuneEvalArgs;
  const r = a.numbers.hp / 19_100;
  const measures: RaidMeasures = {
    ...GOOD,
    'prepared.share': 1.1 - 0.3077 * r,
    'classic.share': 0.9 * r - 0.45,
  };
  return Promise.resolve({ result: { measures, weekends: 10 }, seconds: 0.5 });
};

describe('the orchestration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tunes one rank under the ladder and proposes numbers that meet every target', async () => {
    const r = await tuneRank('tidal-colossus', 'high', todayAbsolute('tidal-colossus'), true, {
      exec: fake,
      slots: 4,
    });
    expect(r.best).toBeDefined();
    expect(r.best?.loss).toBe(0);
    // The ladder: the mid rank's HP of 16,766 must stay at most 0.95 of the high rank's.
    expect(r.best?.numbers.hp ?? 0).toBeGreaterThanOrEqual(Math.ceil(16_766 / 0.95));
    expect(r.today.numbers).toEqual({ hp: 19_100, atk: 114, armour: 34 });
    expect(r.conflicts.allMet).toBeGreaterThan(0);
    expect(r.paste).toContain('tidal-colossus');
    expect(r.paste).toContain(`atk: ${String(r.best?.numbers.atk)}`);
    expect(r.atEdge.join(' ')).toContain('hp at its lower limit, set by the ladder');
    expect(r.weekends).toBeGreaterThanOrEqual(10 * r.candidates);
    expect(r.seconds).toBeGreaterThan(0);
  });

  it('tunes the ranks together from the highest down, each below the one above', async () => {
    const results = await tuneBoss('thornmother', TARGET_RANKS, true, { exec: fake, slots: 4 });
    expect(results.map((r) => r.rank)).toEqual(['high', 'mid', 'low']);
    const [high, mid, low] = results.map((r) => r.best?.absolute) as [
      NonNullable<(typeof results)[0]['best']>['absolute'],
      NonNullable<(typeof results)[0]['best']>['absolute'],
      NonNullable<(typeof results)[0]['best']>['absolute'],
    ];
    expect(mid.hp).toBeLessThanOrEqual(high.hp * 0.95);
    expect(low.hp).toBeLessThanOrEqual(high.hp * 0.9);
    expect(low.hp).toBeLessThan(mid.hp);
    expect(low.atk).toBeLessThan(mid.atk);
    expect(mid.atk).toBeLessThanOrEqual(high.atk * 0.95);
    expect(low.armour).toBeLessThanOrEqual(mid.armour);
    expect(mid.armour).toBeLessThanOrEqual(high.armour);
    // The proposals of the lower ranks are shares of the high rank's numbers.
    expect(results[1]?.paste).toContain('ranks.mid');
  });

  it('does not fight the same candidate twice: the second pass of the ranks reuses the first’s measurements', async () => {
    const calls = new Map<string, number>();
    const counting: Executor = (job, deps) => {
      const a = job.args as TuneEvalArgs;
      // The same candidate against another rank's numbers is another measurement (the cross-rank rules read them).
      const o = a.other ? ` vs ${a.other.rank} ${JSON.stringify(a.other.numbers)}` : '';
      const k = `${a.rank} ${a.salt} ${a.numbers.hp},${a.numbers.atk},${a.numbers.armour}${o}`;
      calls.set(k, (calls.get(k) ?? 0) + 1);
      return fake(job, deps);
    };
    const results = await tuneBoss('old-bogback', TARGET_RANKS, true, { exec: counting, slots: 4 });
    expect([...calls.values()].every((n) => n === 1)).toBe(true);
    // A candidate counts once however many passes saw it.
    for (const r of results) expect(r.candidates).toBe(r.searched.length);
    expect(results.reduce((n, r) => n + r.candidates, 0)).toBeLessThanOrEqual(calls.size);
  });

  it('reports a clash of targets as a content problem, not a numbers problem', async () => {
    // Every candidate: the prepared team does well exactly when the classic party kills.
    const clash: Executor = (job) => {
      const r = (job.args as TuneEvalArgs).numbers.hp / 19_100;
      return Promise.resolve({
        result: {
          measures: {
            ...GOOD,
            'prepared.share': r > 0.97 ? 0.9 : 0.5,
            'classic.kill': r > 0.97 ? 0.3 : 0,
          },
          weekends: 1,
        },
        seconds: 0,
      });
    };
    const r = await tuneRank('tidal-colossus', 'high', todayAbsolute('tidal-colossus'), true, {
      exec: clash,
      slots: 2,
    });
    expect(r.conflicts.conflicts.map((k) => `${k.a.measure}+${k.b.measure}`)).toEqual([
      'prepared.share+classic.kill',
    ]);
    expect(r.best?.loss).toBeGreaterThan(0);
  });

  it('the CLI refuses an unknown boss or rank, and prints the summary without writing anything', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = { exec: fake, slots: 2 };
    expect(await main(['--tune', '--boss', 'nobody'], run)).toBe(1);
    expect(await main(['--tune', '--rank', 'top'], run)).toBe(1);
    expect(error).toHaveBeenCalledTimes(2);
    expect(await main(['--tune', '--quick', '--boss', 'cinder-wyrm', '--rank', 'all'], run)).toBe(
      0,
    );
    const text = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(text).toContain('### Cinder Wyrm, high rank');
    expect(text).toContain('### Cinder Wyrm, low rank');
    expect(text).toContain('Proposals only');
  });
});

describe('the lab tests’ rules are targets of the tuner', () => {
  const measuresOf = (list: readonly RaidTarget[]) => new Set(list.map((t) => t.measure));

  it('every measure beyond the reported twelve and the information ones is read by a rule, and no target reads a measure twice at one rank', () => {
    const rules = new Set(TARGET_RANKS.flatMap((r) => [...measuresOf(RULE_TARGETS[r])]));
    const extra = RAID_MEASURES.filter(
      (m) => !REPORTED_MEASURES.includes(m) && !INFO_MEASURES.includes(m),
    );
    expect([...rules].sort()).toEqual([...extra].sort());
    for (const rank of TARGET_RANKS) {
      const list = [...RAID_TARGETS[rank], ...RULE_TARGETS[rank]];
      expect(new Set(list.map((t) => t.measure)).size, rank).toBe(list.length);
    }
  });

  it('the rules of each rank: every rank, the casual server at the low rank, the heavy rules and the cross-rank ones at the ends', () => {
    const at = (rank: (typeof TARGET_RANKS)[number]) => measuresOf(RULE_TARGETS[rank]);
    for (const rank of TARGET_RANKS) expect(at(rank).has('rank.toolShare'), rank).toBe(true);
    expect(at('low').has('casual.share')).toBe(true);
    expect(at('mid').has('casual.share')).toBe(false);
    expect(at('mid').size).toBe(4);
    expect(at('high').has('server.share')).toBe(true);
    expect(at('low').has('server.share')).toBe(false);
    for (const rank of ['low', 'high'] as const)
      expect(at(rank).has('cross.classicLadder')).toBe(true);
    expect(at('mid').has('cross.classicLadder')).toBe(false);
    // Each rank's own threshold for the tool.
    const tool = (rank: (typeof TARGET_RANKS)[number]) =>
      RULE_TARGETS[rank].find((t) => t.measure === 'rank.toolShare')?.min;
    expect([tool('high'), tool('mid'), tool('low')]).toEqual([0.1, 0.08, 0.06]);
  });

  it('a rule weighs ten times its own weight: a test failure is not traded for the softer targets', () => {
    expect(RULE_TARGETS.high.find((t) => t.measure === 'margin.base')?.weight).toBe(10);
    expect(RULE_TARGETS.high.find((t) => t.measure === 'gap10')?.weight).toBe(5);
  });

  it('cross-rank rules are only in the targets when asked for, and Thornmother’s tool gap only for her', () => {
    const plain = targetsFor('thornmother', 'low');
    expect(plain.some((t) => isCrossMeasure(t.measure))).toBe(false);
    const cross = targetsFor('thornmother', 'low', true);
    expect(cross.map((t) => t.measure)).toContain('cross.toolGap');
    expect(cross.map((t) => t.measure)).toContain('cross.classicLadder');
    expect(targetsFor('tidal-colossus', 'low', true).map((t) => t.measure)).not.toContain(
      'cross.toolGap',
    );
    expect(skippedCross('tidal-colossus', 'high').map((t) => t.measure)).toEqual([
      'cross.classicLadder',
    ]);
    expect(skippedCross('thornmother', 'mid')).toEqual([]);
    // Misa's targets come first and unchanged.
    expect(plain.slice(0, 7)).toEqual(RAID_TARGETS.low);
  });

  it('an exclusive bound counts a value on it as outside; a measure that was not taken is neither met nor missed', () => {
    const strict: RaidTarget = {
      measure: 'cross.toolGap',
      min: 0.1,
      strictMin: true,
      weight: 1,
      why: '',
    };
    expect(metBy(strict, 0.1)).toBe(false);
    expect(missOf(strict, 0.1)).toBeGreaterThan(0);
    expect(missOf(strict, 0.1)).toBeLessThan(1e-6);
    expect(metBy(strict, 0.1001)).toBe(true);
    expect(missOf(strict, 0.09)).toBeCloseTo(0.01, 12);
    expect(describeTarget(strict)).toBe('cross.toolGap > 10%');
    const untaken = { ...GOOD, 'prepared.share': Number.NaN };
    const prepared = RAID_TARGETS.high.find((t) => t.measure === 'prepared.share') as RaidTarget;
    expect(metBy(prepared, Number.NaN)).toBe(false);
    expect(missOf(prepared, Number.NaN)).toBe(0);
    expect(lossOf(RAID_TARGETS.high, untaken)).toBe(0);
    // The comfort counts the targets that were measured only.
    expect(Number.isNaN(comfortOf(RAID_TARGETS.high, untaken))).toBe(false);
    expect(comfortOf([prepared], untaken)).toBe(0);
  });

  it('a conflict is judged on the candidates that have both measures', () => {
    const a = RAID_TARGETS.high.find((t) => t.measure === 'prepared.share') as RaidTarget;
    const b = RAID_TARGETS.high.find((t) => t.measure === 'classic.kill') as RaidTarget;
    const m = (o: Partial<Record<keyof RaidMeasures, number>>): RaidMeasures => ({
      ...GOOD,
      ...o,
    });
    const r = findConflicts(
      [a, b],
      [
        // Cheap passes: one measure each, never both (not a clash).
        m({ 'prepared.share': 0.9, 'classic.kill': Number.NaN }),
        m({ 'prepared.share': 0.5, 'classic.kill': Number.NaN }),
        m({ 'prepared.share': Number.NaN, 'classic.kill': 0 }),
        // Full passes: the two never together.
        m({ 'prepared.share': 0.9, 'classic.kill': 0.3 }),
        m({ 'prepared.share': 0.5, 'classic.kill': 0 }),
      ],
    );
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]?.of).toBe(2);
    expect(r.allMet).toBe(0);
    // A target nobody measured is not "met nowhere".
    const none = findConflicts([a], [m({ 'prepared.share': Number.NaN })]);
    expect(none.unreachable).toEqual([]);
    expect(none.allMet).toBe(0);
  });

  it('the ladder keeps Cinder Wyrm’s armour at the floor the content test sets, at the high rank only', () => {
    const floor = BOSS_ARMOUR_MIN['cinder-wyrm'] as number;
    expect(floor).toBe(50);
    expect(ladderBox('cinder-wyrm', 'high', {}).armour[0]).toBeGreaterThanOrEqual(floor);
    expect(ladderBox('cinder-wyrm', 'mid', {}).armour[0]).toBeLessThan(floor);
    expect(ladderBox('tidal-colossus', 'high', {}).armour[0]).toBeLessThan(floor);
  });
});

describe('the rule measures', () => {
  it('fight exactly the tests’ weekends at scale 1, and a prefix of them below', () => {
    expect(weekendsAt(16, 1)).toBe(16);
    expect(weekendsAt(40, 1)).toBe(40);
    expect(weekendsAt(16, 0.25)).toBe(4);
    expect(weekendsAt(3, 0.1)).toBe(1);
    expect(drawsAt(48, 8, 1)).toEqual([48, 8]);
    expect(drawsAt(40, 8, 1)).toEqual([40, 8]);
    expect(drawsAt(60, 20, 1)).toEqual([60, 20]);
    // Fewer draws, the same weekends per draw.
    expect(drawsAt(40, 8, 0.5)).toEqual([20, 4]);
  });

  it('the rule measures of one boss and rank: the light ones always, the heavy ones at the high rank only, the cross-rank ones with the other rank', () => {
    const id = 'tidal-colossus';
    const boss = (rank: 'low' | 'mid' | 'high') => raidBossOf(id, { rank });
    const light = ruleMeasures(id, 'high', boss('high'), 0.05, undefined, false);
    expect(Object.keys(light.values).sort()).toEqual(
      ['rank.classicKill', 'rank.preparedKill', 'rank.preparedShare', 'rank.toolShare'].sort(),
    );
    const heavy = ruleMeasures(id, 'high', boss('high'), 0.05, {
      rank: 'low',
      boss: boss('low'),
    });
    const keys = Object.keys(heavy.values);
    expect(keys).toContain('server.share');
    expect(keys).toContain('cross.classicLadder');
    expect(keys).not.toContain('cross.toolGap');
    expect(keys).not.toContain('casual.share');
    expect(heavy.weekends).toBeGreaterThan(light.weekends);
    const low = ruleMeasures(id, 'low', boss('low'), 0.05, undefined, true);
    expect(Object.keys(low.values)).toContain('casual.share');
    expect(Object.keys(low.values)).not.toContain('answers.share');
    expect(Object.keys(low.values)).not.toContain('cross.classicLadder');
    // Thornmother's tool gap needs both her ranks.
    const thorn = (rank: 'low' | 'high') => raidBossOf('thornmother', { rank });
    expect(
      Object.keys(
        ruleMeasures('thornmother', 'low', thorn('low'), 0.05, {
          rank: 'high',
          boss: thorn('high'),
        }).values,
      ),
    ).toContain('cross.toolGap');
  });

  it('a candidate measured without the rules has no rule measures; with them the cheap pass leaves out the heavy ones', () => {
    const id = 'tidal-colossus';
    const numbers = absoluteOf(id, 'high', nativeOf(id, 'high'));
    const f = { weekends: 2, draws: 1, classicWeekends: 1, mixedDraws: 1, mixedWeekends: 1 };
    const bare = evalCandidate({ boss: id, rank: 'high', numbers, fidelity: f, salt: 't' });
    for (const m of RAID_MEASURES.filter((x) => !REPORTED_MEASURES.includes(x)))
      expect(bare.measures[m], m).toBeNaN();
    // The potentials of the two main targets are taken in every pass; the information ones only with `info`.
    expect(bare.measures['prepared.potential']).toBeGreaterThan(0);
    expect(bare.measures['classic.potential']).toBeGreaterThan(0);
    const info = evalCandidate({
      boss: id,
      rank: 'high',
      numbers,
      fidelity: { ...f, info: true },
      salt: 't',
    });
    for (const m of INFO_MEASURES.filter((x) => x !== 'mixed.potential'))
      expect(info.measures[m], m).not.toBeNaN();
    expect(info.measures['mixed.potential']).toBeNaN();
    for (const m of REPORTED_MEASURES) expect(bare.measures[m], m).not.toBeNaN();
    const cheap = evalCandidate({
      boss: id,
      rank: 'high',
      numbers,
      fidelity: { ...f, rules: 0.05, heavyRules: false },
      salt: 't',
    });
    expect(cheap.measures['rank.preparedShare']).not.toBeNaN();
    expect(cheap.measures['server.share']).toBeNaN();
    const full = evalCandidate({
      boss: id,
      rank: 'high',
      numbers,
      fidelity: { ...f, rules: 0.05 },
      salt: 't',
      other: { rank: 'low', numbers: absoluteOf(id, 'low', nativeOf(id, 'low')) },
    });
    expect(full.measures['server.share']).not.toBeNaN();
    expect(full.measures['cross.classicLadder']).not.toBeNaN();
    expect(full.weekends).toBeGreaterThan(cheap.weekends);
  });

  it('one rank on its own lists the cross-rank rules as not checked; all the ranks check them', async () => {
    const run = { exec: fake, slots: 2 };
    const alone = await tuneBoss('tidal-colossus', ['high'], true, run);
    expect(alone[0]?.skipped.map((t) => t.measure)).toEqual(['cross.classicLadder']);
    expect(alone[0]?.targets.some((t) => isCrossMeasure(t.measure))).toBe(false);
    const text = summaryOf(alone[0] as NonNullable<(typeof alone)[0]>).join('\n');
    expect(text).toContain('| cross.classicLadder ≥ -5% | needs --rank all | needs --rank all |');
    const all = await tuneBoss('tidal-colossus', TARGET_RANKS, true, run);
    for (const r of all) expect(r.skipped, r.rank).toEqual([]);
    expect(all.find((r) => r.rank === 'high')?.targets.map((t) => t.measure)).toContain(
      'cross.classicLadder',
    );
    expect(all.find((r) => r.rank === 'mid')?.targets.map((t) => t.measure)).not.toContain(
      'cross.classicLadder',
    );
  });
});

describe('the thresholds that moved here from the lab tests keep their values', () => {
  it('pins them, with the test each came from', () => {
    // bossAnswers.test.ts
    expect([T.ANSWER_SHARE_MIN, T.ANSWER_T2_MIN, T.ANSWER_FIRST_KILL_MIN]).toEqual([0.9, 0.6, 0.6]);
    expect([T.ANSWER_CLASSIC_KILL_MAX, T.ANSWER_CLASSIC_SHARE_MAX, T.ROBUST_GAP_MAX]).toEqual([
      0, 0.8, 0.2,
    ]);
    // bossRank.test.ts, bossRankTool.test.ts
    expect([T.RANK_PREPARED_KILL_MIN, T.RANK_PREPARED_SHARE_MIN, T.RANK_CLASSIC_KILL_MAX]).toEqual([
      0.6, 0.93, 0,
    ]);
    expect([T.RANK_CLASSIC_LADDER_SLACK, T.THORN_TOOL_GAP_POINTS]).toEqual([0.05, 10]);
    expect([T.CASUAL_SHARE_MIN, T.CASUAL_SHARE_MAX, T.CASUAL_KILL_MAX]).toEqual([0.3, 0.9, 0.3]);
    expect(T.RANK_TOOL_SHARE_MIN).toEqual({ high: 0.1, mid: 0.08, low: 0.06 });
    // bossMargin.test.ts
    expect([T.MARGIN_BASE_MIN, T.MARGIN_PLUS10_MIN]).toEqual([0.93, 0.8]);
    expect([
      T.COST_SHARE_MIN,
      T.COST_KNOCKOUTS_MIN,
      T.COST_HP_LEFT_LOW,
      T.COST_HP_LEFT_MAX,
    ]).toEqual([0.93, 0.5, 0.6, 0.8]);
    expect([T.WIDTH_CLASSIC_KILL_MAX, T.WIDTH_CLASSIC_SHARE_MAX, T.WIDTH_BEST_SHARE_MIN]).toEqual([
      0.1, 0.9, 0.85,
    ]);
    expect([T.GAP10_SHARE_UNIT, T.GAP10_KILL_UNIT, T.GAP10_MIN]).toEqual([0.05, 0.2, 1]);
    expect([
      T.SERVER_KILL_MAX,
      T.SERVER_SHARE_MIN,
      T.SERVER_SHARE_MAX,
      T.SERVER_KNOCKOUT_FACTOR,
    ]).toEqual([0.9, 0.4, 0.97, 3]);
    // bossContent.test.ts
    expect([T.CONTENT_KNOCKOUTS_MIN, T.CONTENT_CLASSIC_KILL_MAX]).toEqual([3, 0.5]);
    expect(T.BOSS_ARMOUR_MIN).toEqual({ 'cinder-wyrm': 50 });
  });
});

describe('what was not measured is not reported as met', () => {
  const a = RAID_TARGETS.high.find((t) => t.measure === 'prepared.share') as RaidTarget;
  const m = (o: Partial<Record<keyof RaidMeasures, number>>): RaidMeasures => ({ ...GOOD, ...o });

  it('counts only the candidates measured in full as meeting every target, and says how many there were', () => {
    const rows = [m({}), m({}), m({ 'prepared.share': 0.5 })];
    // Without levels every candidate counts; with them only the final level does.
    expect(findConflicts([a], rows).allMet).toBe(2);
    const r = findConflicts([a], rows, [false, true, true]);
    expect(r.allMet).toBe(1);
    expect(r.fullOf).toBe(2);
    expect(r.of).toBe(3);
  });

  it('a target whose measure is NaN is "not measured" in the summary and the loss line, and the row does not meet every target', async () => {
    const nan: Executor = (job, deps) =>
      fake(job, deps).then((out) => ({
        ...out,
        result: {
          ...(out.result as { measures: RaidMeasures; weekends: number }),
          measures: {
            ...(out.result as { measures: RaidMeasures }).measures,
            'rank.toolShare': Number.NaN,
          },
        },
      }));
    const r = await tuneRank('tidal-colossus', 'high', todayAbsolute('tidal-colossus'), true, {
      exec: nan,
      slots: 2,
    });
    // The loss does not count the unmeasured target, so it can be 0 while the row is not "every target met".
    expect(r.best?.loss).toBe(0);
    expect(r.best?.unmeasured).toBe(1);
    expect(meetsEveryTarget(r.best)).toBe(false);
    expect(r.conflicts.allMet).toBe(0);
    const text = summaryOf(r).join('\n');
    expect(text).toContain('| rank.toolShare ≥ 10% | not measured | not measured |');
    expect(text).toContain('1 targets not measured for best found');
    expect(text).not.toMatch(/\| rank\.toolShare[^|]*\| [^|]*met /);
    // Measured in full, the same row meets every target.
    const ok = await tuneRank('tidal-colossus', 'high', todayAbsolute('tidal-colossus'), true, {
      exec: fake,
      slots: 2,
    });
    expect(meetsEveryTarget(ok.best)).toBe(true);
    expect(summaryOf(ok).join('\n')).not.toContain('not measured');
    expect(meetsEveryTarget(undefined)).toBe(false);
  });
});
