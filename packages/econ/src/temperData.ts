import { lateScrapAll, ledgerOf, measuresOf } from './analysis';
import { profileLabel } from './analysis';
import { RULES, type Rules } from './rules';
import { playersOf, type Results, type ScenarioResult } from './scenarios';
import { temperingVariantId } from './servers';
import type { PlayerRun } from './sim';
import { TARGETS, boundsText, judge } from './targets';
import { temperPrice } from './tempering';
import { median, sum } from './util';

/**
 * The numbers for tempering at the Forge (`tempering.ts`, `rules.tempering`): the mixed server of 8 with it and without it (the same random
 * draws: `mixed8` and its `mixed8-temper` / `mixed8-notemper` variant, the first runs of each so both have the same seeds). Nothing here changes
 * a target's wording: the targets are `targets.ts`, judged on both, and a status that differs is listed with its target beside it.
 */

export interface TemperRowPair {
  name: string;
  with: number;
  without: number;
}

export interface TemperProfileRow {
  profile: string;
  label: string;
  /** Pieces tempered (median over players) by server week 12 and 24. */
  tempered12: number;
  tempered24: number;
  /** The share of tempered pieces that had been rerolled at the visitor (median over players, 0 when none were tempered). */
  rerolledShare: number;
  /** Scrap spent on it by week 24 (median). */
  scrap24: number;
  /** Pieces made, worn and dismantled by week 24, and slots below the fire at the end of weeks 12 and 24, with and without tempering. */
  made24: [number, number];
  worn24: [number, number];
  dismantled24: [number, number];
  weak12: [number, number];
  weak24: [number, number];
}

export interface TemperTargetRow {
  id: string;
  label: string;
  bounds: string;
  with: number | null;
  without: number | null;
  withMet: boolean | null;
  withoutMet: boolean | null;
  changed: boolean;
}

export interface TemperPriceRow {
  rarity: string;
  gap: number;
  to: number;
  acorns: number;
  scrap: number;
}

export interface TemperData {
  /** Whether tempering is on by default in the rules, and the seeds both sides were run with. */
  defaultOn: boolean;
  seeds: number;
  /** T-7b's measure (resources dead at some point of the run) and which ones, a daily player. */
  deadWith: number | null;
  deadWithout: number | null;
  deadNamesWith: string[];
  deadNamesWithout: string[];
  /** A daily player's scrap in weeks 13 to 24, a week: every source and sink with and without, and the scrap stock at the end of weeks 12 and 24. */
  late: { in: TemperRowPair[]; out: TemperRowPair[] };
  stock: { week: number; with: number; without: number }[];
  profiles: TemperProfileRow[];
  targets: TemperTargetRow[];
  prices: TemperPriceRow[];
}

const PROFILES = ['daily', 'active', 'weekly', 'new'] as const;

const firstRuns = (result: ScenarioResult | undefined, n: number): ScenarioResult | undefined =>
  result ? { config: result.config, runs: result.runs.slice(0, n) } : undefined;

/** A player's week records up to server week `week` (a player who joined in week 6 has its first record in that week). */
const upTo = (p: PlayerRun, week: number): PlayerRun['weeks'] =>
  p.weeks.slice(0, Math.max(0, week - (p.joinWeek - 1)));

const cumulative = (
  p: PlayerRun,
  week: number,
  pick: (w: PlayerRun['weeks'][number]) => number,
): number => sum(upTo(p, week).map(pick));

const atWeek = (
  p: PlayerRun,
  week: number,
  pick: (w: PlayerRun['weeks'][number]) => number,
): number => {
  const w = p.weeks[week - (p.joinWeek - 1) - 1];
  return w ? pick(w) : 0;
};

const med = (xs: readonly number[]): number => (xs.length ? median([...xs]) : 0);

export function temperOf(results: Results, rules: Rules = RULES): TemperData | null {
  const defaultOn = rules.tempering.on;
  const base = results.mixed8;
  const flip = results[temperingVariantId('mixed8')];
  if (!base || !flip) return null;
  const seeds = Math.min(base.runs.length, flip.runs.length);
  const [on, off] = defaultOn ? [base, flip] : [flip, base];
  const withSide = firstRuns(on, seeds)!;
  const withoutSide = firstRuns(off, seeds)!;
  const baseAll = results['mixed8-all'];
  const flipAll = results[temperingVariantId('mixed8-all')];
  const [allOn, allOff] = defaultOn ? [baseAll, flipAll] : [flipAll, baseAll];
  const sideResults = (side: ScenarioResult, all: ScenarioResult | undefined): Results => ({
    mixed8: side,
    ...(all ? { 'mixed8-all': firstRuns(all, seeds)! } : {}),
  });
  const resWith = sideResults(withSide, allOn);
  const resWithout = sideResults(withoutSide, allOff);

  const dailyWith = playersOf(withSide, 'daily');
  const dailyWithout = playersOf(withoutSide, 'daily');
  const measuresWith = measuresOf(resWith);
  const measuresWithout = measuresOf(resWithout);
  const deadNames = (players: PlayerRun[]): string[] =>
    ledgerOf(players)
      .filter((l) => l.dead !== null)
      .map((l) => `${l.resource} from week ${l.dead}`);

  const lateWith = lateScrapAll(dailyWith);
  const lateWithout = lateScrapAll(dailyWithout);
  const pair = (kind: 'in' | 'out'): TemperRowPair[] => {
    const names = new Set(
      [...lateWith, ...lateWithout].filter((r) => r.kind === kind).map((r) => r.name),
    );
    const value = (rows: typeof lateWith, name: string): number =>
      rows.find((r) => r.kind === kind && r.name === name)?.perWeek ?? 0;
    return [...names]
      .map((name) => ({ name, with: value(lateWith, name), without: value(lateWithout, name) }))
      .filter((r) => r.with >= 1 || r.without >= 1)
      .sort((a, b) => Math.max(b.with, b.without) - Math.max(a.with, a.without));
  };
  const stockAt = (players: PlayerRun[], week: number): number =>
    med(players.map((p) => p.weeks[week - 1]?.stock[1] ?? 0));

  const profiles = PROFILES.flatMap((id): TemperProfileRow[] => {
    const a = playersOf(withSide, id);
    const b = playersOf(withoutSide, id);
    if (!a.length || !b.length) return [];
    const both = (
      week: number,
      pick: (w: PlayerRun['weeks'][number]) => number,
    ): [number, number] => [
      med(a.map((p) => cumulative(p, week, pick))),
      med(b.map((p) => cumulative(p, week, pick))),
    ];
    const weak = (week: number): [number, number] => [
      med(a.map((p) => atWeek(p, week, (w) => w.weakSlots))),
      med(b.map((p) => atWeek(p, week, (w) => w.weakSlots))),
    ];
    return [
      {
        profile: id,
        label: profileLabel(id),
        tempered12: med(a.map((p) => cumulative(p, 12, (w) => w.tempered))),
        tempered24: med(a.map((p) => cumulative(p, 24, (w) => w.tempered))),
        rerolledShare: med(
          a.map((p) => {
            const n = cumulative(p, 24, (w) => w.tempered);
            return n > 0 ? cumulative(p, 24, (w) => w.temperedRerolled) / n : 0;
          }),
        ),
        scrap24: med(a.map((p) => cumulative(p, 24, (w) => w.temperScrap))),
        made24: both(24, (w) => w.piecesMade),
        worn24: both(24, (w) => w.piecesWorn),
        dismantled24: both(24, (w) => w.piecesDismantled),
        weak12: weak(12),
        weak24: weak(24),
      },
    ];
  });

  const judgedWith = judge(TARGETS, measuresWith);
  const judgedWithout = judge(TARGETS, measuresWithout);
  const targets = judgedWith.flatMap((j, i): TemperTargetRow[] => {
    const other = judgedWithout[i]!;
    if (j.met === null || other.met === null) return [];
    return [
      {
        id: j.target.id,
        label: j.target.label,
        bounds: boundsText(j.target),
        with: j.value ?? null,
        without: other.value ?? null,
        withMet: j.met,
        withoutMet: other.met,
        changed: j.met !== other.met,
      },
    ];
  });

  const prices: TemperPriceRow[] = [];
  for (const [rarity, r] of [
    ['rare', 1],
    ['epic', 2],
  ] as const)
    for (const [gap, to] of [
      [5, 30],
      [10, 40],
      [10, 50],
      [15, 60],
    ] as const) {
      const price = temperPrice(rules, r, to - gap, to);
      if (price) prices.push({ rarity, gap, to, acorns: price[0], scrap: price[1] });
    }

  return {
    defaultOn,
    seeds,
    deadWith: measuresWith.deadBefore24 ?? null,
    deadWithout: measuresWithout.deadBefore24 ?? null,
    deadNamesWith: deadNames(dailyWith),
    deadNamesWithout: deadNames(dailyWithout),
    late: { in: pair('in'), out: pair('out') },
    stock: [12, 24].map((week) => ({
      week,
      with: stockAt(dailyWith, week),
      without: stockAt(dailyWithout, week),
    })),
    profiles,
    targets,
    prices,
  };
}
