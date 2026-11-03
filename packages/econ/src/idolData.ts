import { lateScrapAll, ledgerOf, measuresOf, profileLabel } from './analysis';
import { RULES, type Rules } from './rules';
import { playersOf, type Results, type ScenarioResult } from './scenarios';
import { idolVariantId } from './servers';
import type { PlayerRun } from './sim';
import { TARGETS, boundsText, judge } from './targets';
import { median, sum } from './util';

/**
 * The numbers for the idol (`idol.ts`, `rules.idol`, a voluntary placeholder scrap sink): the mixed server of 8 with it and without it (the same random
 * draws: `mixed8` and its `-noidol` / `-idol` variant, the first runs of each so both have the same seeds). The targets are `targets.ts`,
 * unchanged, judged on both sides.
 */

export interface IdolRowPair {
  name: string;
  with: number;
  without: number;
}

export interface IdolProfileRow {
  profile: string;
  label: string;
  /** Scrap offered a week (median over players of the mean over the weeks played): weeks 1 to 12, weeks 13 to 24. */
  early: number;
  late: number;
  /** The scrap stock (median over players) at the end of weeks 12 and 24, with / without the idol. */
  stock12: [number, number];
  stock24: [number, number];
}

export interface IdolTargetRow {
  id: string;
  label: string;
  bounds: string;
  with: number | null;
  without: number | null;
  withMet: boolean | null;
  withoutMet: boolean | null;
  changed: boolean;
}

export interface IdolData {
  defaultOn: boolean;
  seeds: number;
  /** T-7b's measure (resources dead at some point of the run) and which ones, a daily player, with / without. */
  deadWith: number | null;
  deadWithout: number | null;
  deadNamesWith: string[];
  deadNamesWithout: string[];
  /** The per-player view (T-7b judges the median daily player, not each one): daily players whose own scrap is dead at some point, of all daily players, with / without. */
  pilingWith: { players: number; of: number };
  pilingWithout: { players: number; of: number };
  /** A daily player's scrap in weeks 13 to 24, a week: every source and sink with and without. */
  late: { in: IdolRowPair[]; out: IdolRowPair[] };
  /** A daily player's scrap stock at the end of these weeks (median), with / without. */
  stock: { week: number; with: number; without: number }[];
  /** How many weeks of its spending (the measure's own basis, the idol's offers included) a daily player's scrap pile is at the end, with / without. */
  pileWeeks: { with: number; without: number };
  profiles: IdolProfileRow[];
  targets: IdolTargetRow[];
}

const PROFILES = [
  'daily',
  'active',
  'every-other-day',
  'weekend-off',
  'weekly',
  'new',
  'returner',
] as const;

const firstRuns = (result: ScenarioResult | undefined, n: number): ScenarioResult | undefined =>
  result ? { config: result.config, runs: result.runs.slice(0, n) } : undefined;

const med = (xs: readonly number[]): number => (xs.length ? median([...xs]) : 0);

/** A player's week records for server weeks `from` to `to` (a player who joined in week 6 has its first record in that week). */
const between = (p: PlayerRun, from: number, to: number): PlayerRun['weeks'] =>
  p.weeks.slice(Math.max(0, from - p.joinWeek), Math.max(0, to - (p.joinWeek - 1)));

const perWeek = (p: PlayerRun, from: number, to: number): number => {
  const weeks = between(p, from, to);
  return weeks.length ? sum(weeks.map((w) => w.idolScrap)) / weeks.length : 0;
};

export function idolOf(results: Results, rules: Rules = RULES): IdolData | null {
  const defaultOn = rules.idol.on;
  const base = results.mixed8;
  const flip = results[idolVariantId('mixed8')];
  if (!base || !flip) return null;
  const seeds = Math.min(base.runs.length, flip.runs.length);
  const [on, off] = defaultOn ? [base, flip] : [flip, base];
  const withSide = firstRuns(on, seeds)!;
  const withoutSide = firstRuns(off, seeds)!;
  const baseAll = results['mixed8-all'];
  const flipAll = results[idolVariantId('mixed8-all')];
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
  const piling = (players: PlayerRun[]): { players: number; of: number } => ({
    players: players.filter((p) =>
      ledgerOf([p]).some((l) => l.resource === 'scrap' && l.dead !== null),
    ).length,
    of: players.length,
  });
  const deadNames = (players: PlayerRun[]): string[] =>
    ledgerOf(players)
      .filter((l) => l.dead !== null)
      .map((l) => `${l.resource} from week ${l.dead}`);

  const lateWith = lateScrapAll(dailyWith);
  const lateWithout = lateScrapAll(dailyWithout);
  const pair = (kind: 'in' | 'out'): IdolRowPair[] => {
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
  const scrapLedger = (players: PlayerRun[]) =>
    ledgerOf(players).find((l) => l.resource === 'scrap');

  const profiles = PROFILES.flatMap((id): IdolProfileRow[] => {
    const a = playersOf(withSide, id);
    const b = playersOf(withoutSide, id);
    if (!a.length || !b.length) return [];
    const stock = (week: number): [number, number] => [
      med(a.map((p) => p.weeks[week - p.joinWeek]?.stock[1] ?? 0)),
      med(b.map((p) => p.weeks[week - p.joinWeek]?.stock[1] ?? 0)),
    ];
    return [
      {
        profile: id,
        label: profileLabel(id),
        early: med(a.map((p) => perWeek(p, 1, 12))),
        late: med(a.map((p) => perWeek(p, 13, 24))),
        stock12: stock(12),
        stock24: stock(24),
      },
    ];
  });

  const judgedWith = judge(TARGETS, measuresWith);
  const judgedWithout = judge(TARGETS, measuresWithout);
  const targets = judgedWith.flatMap((j, i): IdolTargetRow[] => {
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

  return {
    defaultOn,
    seeds,
    deadWith: measuresWith.deadBefore24 ?? null,
    deadWithout: measuresWithout.deadBefore24 ?? null,
    pilingWith: piling(dailyWith),
    pilingWithout: piling(dailyWithout),
    deadNamesWith: deadNames(dailyWith),
    deadNamesWithout: deadNames(dailyWithout),
    late: { in: pair('in'), out: pair('out') },
    stock: [12, 24].map((week) => ({
      week,
      with: stockAt(dailyWith, week),
      without: stockAt(dailyWithout, week),
    })),
    pileWeeks: {
      with: scrapLedger(dailyWith)?.pileWeeks ?? 0,
      without: scrapLedger(dailyWithout)?.pileWeeks ?? 0,
    },
    profiles,
    targets,
  };
}
