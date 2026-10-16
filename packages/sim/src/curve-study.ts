import { runEconomy, type EconomyResult } from './economy';
import type { IncomeModelId } from './income';
import {
  PRESETS,
  PRESET_IDS,
  SERVER_MIXES,
  rosterProfiles,
  type PlayerProfile,
  type ProfileMix,
} from './profiles';
import { mean, round } from './util';

/**
 * The raid curve study (docs/balance/log.md B-010): whole servers of the journey simulator's player
 * profiles play weeks 1 to N with the real rules, the Boss Rank ladder and Festivals, and every raid
 * week is recorded: the rank, whether Friday's and Saturday's phases were cleared, the finale, the
 * knock-outs and whether it went to overtime. The results are grouped by week and by Boss Rank, and
 * a few numbers go to the targets (`curve.<mix>.<band>.<measure>`, see `curveMetrics`).
 */

/** The server mixes the curve targets are written for (`SERVER_MIXES`). */
export const CURVE_MIXES = ['casual-heavy', 'default', 'committed'] as const;
export type CurveMixId = (typeof CURVE_MIXES)[number];

/** Rank bands of the targets: rank 1, ranks 2 to 5, rank 6 and up. Normal weeks only (a Festival is eased). */
export const CURVE_BANDS = [
  { id: 'r1', label: 'rank 1', from: 1, to: 1 },
  { id: 'r2to5', label: 'ranks 2 to 5', from: 2, to: 5 },
  { id: 'r6up', label: 'rank 6 and up', from: 6, to: 999 },
] as const;
export type CurveBandId = (typeof CURVE_BANDS)[number]['id'];

/** A rank with fewer raid weeks than this is left out of the "worst rank" metric (too noisy). */
export const MIN_RANK_SAMPLE = 40;

export interface CurveSettings {
  seed: string;
  /** Weeks each server plays. */
  weeks: number;
  /** Servers per mix. */
  servers: number;
  income: IncomeModelId;
  /** The mixes to play: names of `SERVER_MIXES`, or a custom one. */
  mixes: readonly { id: string; mix: ProfileMix }[];
  profiles?: readonly PlayerProfile[];
}

/** One raid week of one server, flattened for counting. */
export interface CurveRaid {
  week: number;
  rank: number;
  effectiveRank: number;
  festival: boolean;
  signedUp: number;
  phase1: boolean;
  phase2: boolean;
  finaleWon: boolean;
  /** Share of the finale's creatures that were knocked out, 0 to 1. */
  koShare: number;
  overtime: boolean;
  /** Share of the boss's HP left when the finale began. */
  startShare: number;
}

/** Counts and rates of a group of raid weeks. Rates are 0 to 1, null for an empty group. */
export interface CurveStats {
  raids: number;
  phase1: number | null;
  phase2: number | null;
  finale: number | null;
  /** Mean share of the finale's creatures knocked out. */
  ko: number | null;
  /** Share of finales that reached overtime (enrage). */
  overtime: number | null;
  /** Share of all finales won inside overtime. */
  overtimeWon: number | null;
  /** Mean share of the boss's HP left when the finale began. */
  startShare: number | null;
}

export interface CurveMixResult {
  id: string;
  servers: number;
  players: number;
  /** Per week (index 0 is week 1): stats of every server's raid that week, and the mean rank it fought at. */
  weeks: (CurveStats & { week: number; meanRank: number | null; festivals: number })[];
  /** Per rank (normal weeks): stats of the weeks fought at that rank, ranks that occurred only. */
  ranks: (CurveStats & { rank: number })[];
  /** Per band (normal weeks). */
  bands: Record<CurveBandId, CurveStats>;
  /** Every normal week of every rank together. */
  normal: CurveStats;
  /** Week 1 only (a new server's first raid, always rank 1). */
  week1: CurveStats;
  /** Median and highest rank servers had after the last week. */
  finalRankMean: number | null;
  /** Lowest finale win rate among ranks with at least `MIN_RANK_SAMPLE` normal weeks, and which rank. */
  worstRank: { rank: number; finale: number } | null;
}

export interface CurveResult {
  settings: { seed: string; weeks: number; servers: number; income: IncomeModelId };
  mixes: CurveMixResult[];
  metrics: Record<string, number | null>;
}

export function flattenRaids(sim: EconomyResult): CurveRaid[] {
  return sim.raids.map((r) => ({
    week: r.week,
    rank: r.ladder.rank,
    effectiveRank: r.ladder.effectiveRank,
    festival: r.ladder.festival,
    signedUp: r.summary.signedUp,
    phase1: r.summary.phase1Cleared,
    phase2: r.summary.phase2Cleared,
    finaleWon: r.summary.finaleWon,
    koShare:
      r.summary.finale.creatures === 0
        ? 0
        : r.summary.finale.knockedOut / r.summary.finale.creatures,
    overtime: r.summary.finale.enraged,
    startShare: r.summary.finale.startShare,
  }));
}

const share = (raids: readonly CurveRaid[], f: (r: CurveRaid) => boolean): number | null =>
  raids.length === 0 ? null : raids.filter(f).length / raids.length;

export function statsOf(raids: readonly CurveRaid[]): CurveStats {
  return {
    raids: raids.length,
    phase1: share(raids, (r) => r.phase1),
    phase2: share(raids, (r) => r.phase2),
    finale: share(raids, (r) => r.finaleWon),
    ko: mean(raids.map((r) => r.koShare)),
    overtime: share(raids, (r) => r.overtime),
    overtimeWon: share(raids, (r) => r.overtime && r.finaleWon),
    startShare: mean(raids.map((r) => r.startShare)),
  };
}

function roundStats<T extends CurveStats>(s: T): T {
  const out: Record<string, unknown> = { ...(s as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'number' && k !== 'raids') out[k] = round(v, 4);
  }
  return out as T;
}

/** The profiles of one mix, in order. */
export function mixProfiles(
  mix: ProfileMix,
  profiles: readonly PlayerProfile[] = PRESET_IDS.map((id) => PRESETS[id]),
): PlayerProfile[] {
  return rosterProfiles(mix, profiles);
}

/** Plays `servers` servers of one mix and groups their raid weeks. */
export function runCurveMix(
  settings: Pick<CurveSettings, 'seed' | 'weeks' | 'servers' | 'income' | 'profiles'>,
  id: string,
  mix: ProfileMix,
): CurveMixResult {
  const roster = mixProfiles(mix, settings.profiles);
  if (roster.length === 0) throw new Error(`the mix "${id}" has no players`);
  const raids: CurveRaid[] = [];
  const finals: number[] = [];
  for (let k = 0; k < settings.servers; k++) {
    const sim = runEconomy({
      seed: `${settings.seed}:curve:${id}:${String(k)}`,
      weeks: settings.weeks,
      roster: roster.map((profile) => ({ profile })),
      income: settings.income,
      snapshotWeeks: [],
    });
    raids.push(...flattenRaids(sim));
    const last = sim.raids[sim.raids.length - 1];
    if (last !== undefined) finals.push(last.ladder.nextRank);
  }
  const normal = raids.filter((r) => !r.festival);
  const weeks = Array.from({ length: settings.weeks }, (_, i) => {
    const here = raids.filter((r) => r.week === i + 1);
    return {
      week: i + 1,
      ...roundStats(statsOf(here)),
      meanRank: here.length === 0 ? null : round(mean(here.map((r) => r.rank)) ?? 0, 2),
      festivals: here.filter((r) => r.festival).length,
    };
  });
  const rankIds = [...new Set(normal.map((r) => r.rank))].sort((a, b) => a - b);
  const ranks = rankIds.map((rank) => ({
    rank,
    ...roundStats(statsOf(normal.filter((r) => r.rank === rank))),
  }));
  const bands = Object.fromEntries(
    CURVE_BANDS.map((b) => [
      b.id,
      roundStats(statsOf(normal.filter((r) => r.rank >= b.from && r.rank <= b.to))),
    ]),
  ) as Record<CurveBandId, CurveStats>;
  let worst: CurveMixResult['worstRank'] = null;
  for (const r of ranks) {
    if (r.raids < MIN_RANK_SAMPLE || r.finale === null) continue;
    if (worst === null || r.finale < worst.finale) worst = { rank: r.rank, finale: r.finale };
  }
  return {
    id,
    servers: settings.servers,
    players: roster.length,
    weeks,
    ranks,
    bands,
    normal: roundStats(statsOf(normal)),
    week1: roundStats(statsOf(raids.filter((r) => r.week === 1))),
    finalRankMean: finals.length === 0 ? null : round(mean(finals) ?? 0, 2),
    worstRank: worst,
  };
}

/** The numbers the targets read: `curve.<mix>.<band>.<measure>`, `curve.<mix>.week1.<measure>` and the worst rank. */
export function curveMetrics(mixes: readonly CurveMixResult[]): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};
  for (const m of mixes) {
    const put = (group: string, s: CurveStats): void => {
      metrics[`curve.${m.id}.${group}.finaleWinRate`] = s.finale;
      metrics[`curve.${m.id}.${group}.phase1ClearRate`] = s.phase1;
      metrics[`curve.${m.id}.${group}.phase2ClearRate`] = s.phase2;
      metrics[`curve.${m.id}.${group}.koShare`] = s.ko;
      metrics[`curve.${m.id}.${group}.overtimeShare`] = s.overtime;
    };
    put('week1', m.week1);
    put('normal', m.normal);
    for (const b of CURVE_BANDS) put(b.id, m.bands[b.id]);
    metrics[`curve.${m.id}.worstRankWinRate`] = m.worstRank?.finale ?? null;
  }
  return metrics;
}

/** Plays every mix of the settings. */
export function runCurveStudy(settings: CurveSettings): CurveResult {
  const mixes = settings.mixes.map((m) => runCurveMix(settings, m.id, m.mix));
  return {
    settings: {
      seed: settings.seed,
      weeks: settings.weeks,
      servers: settings.servers,
      income: settings.income,
    },
    mixes,
    metrics: curveMetrics(mixes),
  };
}

/** The named mixes of the targets, in order. */
export function namedCurveMixes(): { id: string; mix: ProfileMix }[] {
  return CURVE_MIXES.map((id) => ({ id, mix: SERVER_MIXES[id] as ProfileMix }));
}

const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

/** A Markdown summary: per mix, per week and per rank. */
export function curveMarkdown(result: CurveResult): string {
  const lines: string[] = [
    '# Raid curve by Boss Rank (journey servers)',
    '',
    `Seed "${result.settings.seed}", ${String(result.settings.weeks)} weeks, ${String(result.settings.servers)} servers per mix, ${result.settings.income} income. Festival weeks fight an eased boss; the rank tables count normal weeks only.`,
    '',
  ];
  for (const m of result.mixes) {
    lines.push(`## ${m.id} (${String(m.players)} players)`, '');
    lines.push(
      'Per week (all servers; rank is the mean rank at the start of the week):',
      '',
      '| Week | Raids | Rank | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Festivals |',
      '| ---- | ----- | ---- | ------- | ------- | ---------- | ----------- | -------- | --------------- | --------- |',
    );
    for (const w of m.weeks) {
      lines.push(
        `| ${String(w.week)} | ${String(w.raids)} | ${w.meanRank === null ? 'n/a' : w.meanRank.toFixed(1)} | ${pct(w.phase1)} | ${pct(w.phase2)} | ${pct(w.finale)} | ${pct(w.ko)} | ${pct(w.overtime)} | ${pct(w.overtimeWon)} | ${String(w.festivals)} |`,
      );
    }
    lines.push(
      '',
      'Per Boss Rank (normal weeks):',
      '',
      '| Rank | Raids | Phase 1 | Phase 2 | Finale won | Knocked out | Overtime | Won in overtime | Boss HP left at the finale |',
      '| ---- | ----- | ------- | ------- | ---------- | ----------- | -------- | --------------- | -------------------------- |',
    );
    for (const r of m.ranks) {
      lines.push(
        `| ${String(r.rank)} | ${String(r.raids)} | ${pct(r.phase1)} | ${pct(r.phase2)} | ${pct(r.finale)} | ${pct(r.ko)} | ${pct(r.overtime)} | ${pct(r.overtimeWon)} | ${pct(r.startShare)} |`,
      );
    }
    lines.push(
      '',
      `Week 1 (rank 1): finale ${pct(m.week1.finale)} (Phase 1 ${pct(m.week1.phase1)}, Phase 2 ${pct(m.week1.phase2)}). All normal weeks: Phase 1 ${pct(m.normal.phase1)}, Phase 2 ${pct(m.normal.phase2)}, finale ${pct(m.normal.finale)}, knocked out ${pct(m.normal.ko)}, won in overtime ${pct(m.normal.overtimeWon)}. Mean rank after the last week: ${String(m.finalRankMean ?? 'n/a')}.`,
      '',
    );
  }
  return lines.join('\n');
}
