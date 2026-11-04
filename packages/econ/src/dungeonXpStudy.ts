import { measuresOf } from './analysis';
import type { DungeonXp } from './dungeonXp';
import { RULES } from './rules';
import { playersOf, runScenario, type Results } from './scenarios';
import { ALL_SERVERS } from './servers';
import type { PlayerRun } from './sim';
import { TARGETS, judge, scenariosFor, THRESHOLDS } from './targets';
import { median } from './util';

/**
 * The dungeon-depth XP study (`docs/design/valley/economy/dungeon-depth-xp.md`): the mixed server of 8 with the flat dungeon XP, the
 * depth curve and the v1 curve, and the numbers per player profile. Nothing here changes the default model.
 * `pnpm --filter @creatures/econ report -- --dungeon-xp-study [--seeds n] [--levers]`.
 */
export const STUDY_PROFILES = [
  'daily',
  'active',
  'every-other-day',
  'weekend-off',
  'weekly',
  'new',
  'returner',
] as const;
export const STUDY_WEEKS = [4, 8, 12] as const;

export interface ProfileWeek {
  top: number;
  third: number;
  /** The median gap to the 3rd best of the creatures owned two weeks or more, and the worst gap. */
  gapMedian: number;
  gapWorst: number;
  /** The share of those within `THRESHOLDS.benchWithin` levels. */
  share: number;
  /** The median level of the bench (every creature below the top three). */
  benchLevel: number;
  /** Players with a record of this week. */
  n: number;
}

/** A profile's numbers at its `week`-th week of play (median over players and seeds); null when the run is not that long. */
export function profileWeek(players: readonly PlayerRun[], week: number): ProfileWeek | null {
  const rows = players.map((p) => p.weeks[week - 1]).filter((w) => w !== undefined);
  if (rows.length === 0) return null;
  const med = (f: (w: (typeof rows)[number]) => number | undefined): number => {
    const values = rows.map(f).filter((v): v is number => v !== undefined);
    return values.length ? median(values) : NaN;
  };
  return {
    top: med((w) => w.levels[0]),
    third: med((w) => w.levels[Math.min(2, w.levels.length - 1)]),
    gapMedian: med((w) => w.benchMedian),
    gapWorst: med((w) => w.benchWorst),
    share: med((w) => (w.benchCount > 0 ? w.benchWithin / w.benchCount : undefined)),
    benchLevel: med((w) => {
      const bench = w.levels.slice(3);
      return bench.length ? median(bench) : undefined;
    }),
    n: rows.length,
  };
}

/** Every scenario the targets need, run with the dungeon XP of `mode` (undefined: the flat default). */
export function runStudy(
  mode: DungeonXp | undefined,
  seeds: number,
  ids?: readonly string[],
): Results {
  const out: Record<string, ReturnType<typeof runScenario>> = {};
  for (const id of ids ?? scenariosFor(TARGETS)) {
    const config = ALL_SERVERS.find((s) => s.id === id);
    if (!config) throw new Error(`unknown scenario ${id}`);
    out[id] = runScenario(
      mode === undefined ? config : { ...config, dungeonXp: mode },
      seeds,
      RULES,
    );
  }
  return out;
}

const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '-');

/** A markdown table of a result set, one row per profile and week. */
export function profileTable(results: Results): string {
  const lines = [
    '| Profile | Week | Top | 3rd | Two-week-old gap to 3rd (median / worst) | Within 5 | Bench median level |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const profile of STUDY_PROFILES)
    for (const week of STUDY_WEEKS) {
      const r = profileWeek(playersOf(results['mixed8'], profile), week);
      lines.push(
        r
          ? `| ${profile} | ${week} | ${f1(r.top)} | ${f1(r.third)} | ${f1(r.gapMedian)} / ${f1(r.gapWorst)} | ${Math.round(r.share * 100)}% | ${f1(r.benchLevel)} |`
          : `| ${profile} | ${week} | - | - | - | - | - |`,
      );
    }
  return lines.join('\n');
}

/**
 * T-1a's bar for every profile, not only the daily player: at week 4 of its play at least 90% of the creatures owned two weeks or more
 * are within 5 levels of the 3rd best. (Weeks 8 and 12 are in the tables; the base already misses that bar there, so it is shown, not judged.)
 */
export function t1Passes(results: Results): { profile: string; share: number; pass: boolean }[] {
  return STUDY_PROFILES.map((profile) => {
    const r = profileWeek(playersOf(results['mixed8'], profile), 4);
    const share = r ? r.share : NaN;
    return { profile, share, pass: share >= 0.9 };
  });
}

/** The targets' status, by id: 'PASS', 'FAIL' or 'skipped'. */
export function targetStatus(results: Results): Record<string, string> {
  return Object.fromEntries(
    judge(TARGETS, measuresOf(results)).map((j) => [
      j.target.id,
      j.met === null ? 'skipped' : j.met ? 'PASS' : 'FAIL',
    ]),
  );
}

const MODES: [string, DungeonXp | undefined][] = [
  ['flat 120 (base)', undefined],
  ['depth curve', 'depth'],
  ['v1 curve', 'v1'],
  ['B25: flat 120 x (1 + 0.25% a depth)', { perDepthBp: 25, maxBp: Infinity, flatBase: true }],
  ['B50: flat 120 x (1 + 0.5% a depth)', { perDepthBp: 50, maxBp: Infinity, flatBase: true }],
  ['C: depth curve, half of the part above 120 to the bench', 'share'],
];

/** The day (since joining) a daily player's best creature first reaches the level cap: the median over the daily players that did, and how many did. */
export function dayAtCap(results: Results): string {
  const players = playersOf(results['mixed8'], 'daily');
  const days = players
    .map((p) => p.day30[0])
    .filter((d): d is number => d !== null && d !== undefined);
  if (days.length === 0) return 'never in the run';
  return `day ${median(days)} (week ${(median(days) / 7 + 1).toFixed(1)}), ${days.length} of ${players.length} daily players get there`;
}

/** The lever grid: what flat caps (maxBp) and per-depth rates (perDepthBp) T-1 still passes at, on the mixed server of 8 alone. */
export const LEVER_GRID: DungeonXp[] = [
  { perDepthBp: 100, maxBp: 10000 },
  { perDepthBp: 100, maxBp: 7500 },
  { perDepthBp: 100, maxBp: 5000 },
  { perDepthBp: 100, maxBp: 3000 },
  { perDepthBp: 100, maxBp: 2000 },
  { perDepthBp: 100, maxBp: 1500 },
  { perDepthBp: 100, maxBp: 1000 },
  { perDepthBp: 100, maxBp: 500 },
  { perDepthBp: 75, maxBp: 10000 },
  { perDepthBp: 50, maxBp: 10000 },
  { perDepthBp: 25, maxBp: 10000 },
  { perDepthBp: 0, maxBp: 0 },
];

export function studyReport(seeds: number, levers: boolean): string {
  const out: string[] = [];
  const all: Record<string, Results> = {};
  for (const [name, mode] of MODES) {
    all[name] = runStudy(mode, seeds);
    out.push(
      `## ${name}`,
      '',
      profileTable(all[name]),
      '',
      `A daily player's best creature reaches level 30: ${dayAtCap(all[name])}.`,
      '',
    );
    out.push(
      `T-1 per profile (share of two-week-old creatures within ${THRESHOLDS.benchWithin} levels at week 4, the bar is 90%): ` +
        t1Passes(all[name])
          .map((t) => `${t.profile} ${Math.round(t.share * 100)}% ${t.pass ? 'pass' : 'FAIL'}`)
          .join(', '),
      '',
    );
  }
  const base = targetStatus(all['flat 120 (base)']!);
  out.push('## Targets that change status against the base', '');
  for (const [name] of MODES.slice(1)) {
    const s = targetStatus(all[name]!);
    const changed = Object.keys(s).filter((id) => s[id] !== base[id]);
    out.push(
      `${name}: ${changed.length ? changed.map((id) => `${id} ${base[id]} -> ${s[id]}`).join(', ') : 'none'}`,
    );
  }
  out.push(
    '',
    `Base: ${Object.entries(base)
      .map(([id, st]) => `${id} ${st}`)
      .join(', ')}`,
    '',
  );
  if (levers) {
    out.push('## Lever grid (mixed server of 8)', '');
    out.push(
      'Cells: the share within 5 levels at week 4 (T-1a bar 90%), then at the end the daily player T-1b spread at week 8 (6th below 3rd, at most 5) and the daily median gap at weeks 8 and 12.',
      '',
      '| perDepthBp | maxBp | ' +
        STUDY_PROFILES.join(' | ') +
        ' | T-1b spread8 | daily gap wk 8 / 12 |',
      '|---|---|' + STUDY_PROFILES.map(() => '---').join('|') + '|---|---|',
    );
    for (const mode of LEVER_GRID) {
      if (typeof mode === 'string') continue;
      const r = runStudy(mode, seeds, ['mixed8']);
      const t = t1Passes(r);
      const daily = playersOf(r['mixed8'], 'daily');
      const spread = measuresOf(r).spread8;
      out.push(
        `| ${mode.perDepthBp} | ${mode.maxBp} | ${t.map((x) => `${Math.round(x.share * 100)}%${x.pass ? '' : ' FAIL'}`).join(' | ')} | ${f1(spread ?? NaN)} | ${f1(profileWeek(daily, 8)?.gapMedian ?? NaN)} / ${f1(profileWeek(daily, 12)?.gapMedian ?? NaN)} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}
