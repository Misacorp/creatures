/**
 * The boss rules as a report section (`report -- --rules`, and under `--gate`): every rule the boss tests used to assert
 * (`bossRank`, `bossMargin`, `bossAnswers` and the rank tool tests: the prepared team at each rank, the casual server, the answers and
 * their tools, the margin, cost, widths, the tool gap at ten players, the mixed server) measured by `ruleMeasures` (`raidRules.ts`, the
 * tests' own seeds and weekends) and set against `RULE_TARGETS` (`targets.ts`). They fight a few thousand weekends, so they are a
 * measurement, not a unit test: the suite keeps the structure checks (legal answer lines, named tools) and the check below on made-up
 * numbers; a rule that misses is listed here with its value and bound.
 */
import { RAID_BOSS_IDS, raidBossOf } from './bosses';
import type { JobResults, JobSpec, Plan } from './jobs';
import { ruleMeasures, type RuleValues } from './raidRules';
import {
  RULE_TARGETS,
  TARGET_RANKS,
  isMeasured,
  metBy,
  type RaidTarget,
  type TargetRank,
} from './targets';

export interface RuleJobArgs {
  readonly boss: string;
  readonly rank: TargetRank;
  /** The share of the tests' weekends fought (1: exactly the tests'). */
  readonly scale: number;
}

export interface RuleJobResult {
  readonly boss: string;
  readonly rank: TargetRank;
  readonly values: RuleValues;
  readonly weekends: number;
}

/** The scale of the quick run: a quarter of the tests' weekends (a borderline rule can miss by noise there). */
export const RULE_QUICK_SCALE = 0.25;

const jobId = (boss: string, rank: TargetRank): string => `rules:${boss}:${rank}`;
const otherRank = (rank: TargetRank): TargetRank | undefined =>
  rank === 'low' ? 'high' : rank === 'high' ? 'low' : undefined;

/** Fights one boss at one rank (with the boss at the other end of the cross-rank rules). */
export function runRuleJob(args: RuleJobArgs): RuleJobResult {
  const other = otherRank(args.rank);
  const r = ruleMeasures(
    args.boss,
    args.rank,
    raidBossOf(args.boss, { rank: args.rank }),
    args.scale,
    other ? { rank: other, boss: raidBossOf(args.boss, { rank: other }) } : undefined,
  );
  return { boss: args.boss, rank: args.rank, values: r.values, weekends: r.weekends };
}

export interface RuleMiss {
  readonly boss: string;
  readonly rank: TargetRank;
  readonly measure: string;
  readonly value: number;
  readonly bound: string;
  readonly why: string;
}

const boundOf = (t: RaidTarget): string =>
  [
    t.min !== undefined ? `${t.strictMin ? '>' : '>='} ${String(t.min)}` : '',
    t.max !== undefined ? `<= ${String(t.max)}` : '',
  ]
    .filter(Boolean)
    .join(' and ');

/** The rules the measured values miss (a rule whose measure was not taken is not checked). Pure: the unit test feeds it made-up values. */
export function ruleMisses(results: readonly RuleJobResult[]): {
  checked: number;
  misses: RuleMiss[];
} {
  let checked = 0;
  const misses: RuleMiss[] = [];
  for (const r of results)
    for (const t of RULE_TARGETS[r.rank]) {
      if (t.bosses && !t.bosses.includes(r.boss)) continue;
      const value = r.values[t.measure];
      if (value === undefined || !isMeasured(value)) continue;
      checked++;
      if (!metBy(t, value))
        misses.push({
          boss: r.boss,
          rank: r.rank,
          measure: t.measure,
          value,
          bound: boundOf(t),
          why: t.why,
        });
    }
  return { checked, misses };
}

export function ruleMarkdown(results: readonly RuleJobResult[], quick: boolean): string[] {
  const { checked, misses } = ruleMisses(results);
  const out = [
    `### Boss rules${quick ? ' (quick: a quarter of the weekends, a borderline rule can miss by noise)' : ''}`,
    '',
    `The rules the boss tests used to assert, measured with the tests' own seeds: ${String(checked)} checked over ${String(RAID_BOSS_IDS.length)} bosses at ${TARGET_RANKS.join(', ')}; ${misses.length === 0 ? 'all met' : `${String(misses.length)} missed`}.`,
    '',
  ];
  for (const m of misses)
    out.push(
      `- MISS ${m.boss} (${m.rank}) \`${m.measure}\`: ${String(Math.round(m.value * 1000) / 1000)}, needs ${m.bound}. ${m.why}`,
    );
  if (misses.length > 0) out.push('');
  return out;
}

export function planRules(opts: { quick: boolean }): Plan<{ md: string[]; misses: RuleMiss[] }> {
  const scale = opts.quick ? RULE_QUICK_SCALE : 1;
  const cells = RAID_BOSS_IDS.flatMap((boss) => TARGET_RANKS.map((rank) => ({ boss, rank })));
  const jobs: JobSpec[] = cells.map((c) => ({
    id: jobId(c.boss, c.rank),
    section: 'Boss rules',
    kind: 'rules',
    args: { ...c, scale } satisfies RuleJobArgs,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results: JobResults) => {
      const all = cells.map((c) => results.get(jobId(c.boss, c.rank)) as RuleJobResult);
      return { md: ruleMarkdown(all, opts.quick), misses: ruleMisses(all).misses };
    },
  };
}
