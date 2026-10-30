import { writeFileSync } from 'node:fs';
import { ledgerOf, measuresOf, serverOf } from './analysis';
import { BUDGET, budgetLine } from './budget';
import { inProcess, runScenarios, type Executor } from './jobs';
import { buildReportData, renderReport, type Timings } from './report';
import { rosterProfile } from './roster';
import { RULES } from './rules';
import rulesSource from './rules.ts?raw';
import { DEFAULT_SEEDS, runScenario, type Results } from './scenarios';
import { ALL_SERVERS } from './servers';
import { TARGETS, boundsText, judge } from './targets';
import { playersOf } from './scenarios';

/** The worker pool of `scripts/report.mjs` (when there is one): the executor and how many jobs it runs at once. */
export interface Pool {
  readonly exec: Executor;
  readonly slots: number;
}

const flag = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const num = (x: number, digits = 1): string => String(Math.round(x * 10 ** digits) / 10 ** digits);

/**
 * A quick look at one server (`--scenario <id> [--seeds n] [--weeks n]`): the targets it can judge and a short ledger, in a
 * second or two, with no files written. Targets whose scenario or week this run does not have are skipped, not failed.
 */
export function quickRun(args: readonly string[]): number {
  const id = flag(args, '--scenario') ?? 'mixed8';
  const config = ALL_SERVERS.find((s) => s.id === id);
  if (!config) {
    console.error(`unknown scenario ${id}; known: ${ALL_SERVERS.map((s) => s.id).join(', ')}`);
    return 1;
  }
  const seeds = Number(flag(args, '--seeds') ?? 5);
  const weeks = Number(flag(args, '--weeks') ?? config.weeks);
  if (!Number.isInteger(seeds) || seeds < 1 || !Number.isInteger(weeks) || weeks < 1) {
    console.error('--seeds and --weeks need whole numbers of at least 1');
    return 1;
  }
  const t = Date.now();
  const result = runScenario({ ...config, weeks }, seeds, RULES);
  // The targets read the mixed server of 8 (and its optimiser variant): a run of another server stands in for it.
  const results: Results = { mixed8: result, [id]: result };
  const judged = judge(TARGETS, measuresOf(results));
  console.log(`${config.label}: ${seeds} seeds, ${weeks} weeks, ${num((Date.now() - t) / 1000)} s`);
  console.log('');
  for (const j of judged) {
    const status = j.met === null ? 'skipped' : j.met ? 'PASS' : 'FAIL';
    const value = j.value === undefined ? `needs ${j.target.needs.join(', ')}` : num(j.value, 2);
    console.log(
      `  ${status.padEnd(7)} ${j.target.id.padEnd(6)} ${value} (${boundsText(j.target)}): ${j.target.label}`,
    );
  }
  const profile = config.players.some((p) => p.profile === 'daily')
    ? 'daily'
    : config.players[0]?.profile;
  const players = profile ? playersOf(result, profile) : [];
  if (players.length > 0) {
    console.log('');
    console.log(
      `  Ledger of a ${profile} player (median): in and out a week at the last week, stock at weeks 4, 12 and the last`,
    );
    for (const l of ledgerOf(players)) {
      const last = l.stock.length - 1;
      const at = (w: number): string => num(l.stock[Math.min(w - 1, last)]?.median ?? 0, 0);
      console.log(
        `    ${l.resource.padEnd(8)} in ${num(l.inn[last] ?? 0, 0).padStart(6)}  out ${num(l.out[last] ?? 0, 0).padStart(6)}  stock ${at(4)} / ${at(12)} / ${at(last + 1)}${l.dead !== null ? `  DEAD from week ${l.dead}` : ''}${l.starved ? '  STARVED' : ''}`,
      );
    }
  }
  const server = serverOf(results, id);
  if (server) {
    const lv = server.levels[Math.min(11, server.levels.length - 1)] ?? [];
    console.log('');
    console.log(
      `  Place levels at week ${Math.min(12, server.levels.length)}: ${lv.join('/')}, fire ${server.fire[Math.min(11, server.fire.length - 1)] ?? 0}`,
    );
  }
  return 0;
}

/**
 * `pnpm --filter @creatures/econ report [-- --seeds N] [--out <dir>] [--jobs N]`: runs every scenario and writes the report, its
 * numbers and the roster profile for combat v2 into docs/design/valley/economy (never edited by hand), and prints how long each
 * part took. With `--scenario <id> [--seeds n] [--weeks n]` it is a quick look at one server instead (nothing is written).
 */
export async function main(args: readonly string[], pool?: Pool): Promise<number> {
  if (args.includes('--scenario')) return quickRun(args);
  const seeds = Number(flag(args, '--seeds') ?? DEFAULT_SEEDS);
  const dir = flag(args, '--out') ?? '../../docs/design/valley/economy';
  const t0 = Date.now();
  const { results, seconds } = await runScenarios(seeds, pool?.exec ?? inProcess, pool?.slots ?? 1);
  const simulated = (Date.now() - t0) / 1000;
  const timings: Timings = {};
  const t1 = Date.now();
  const data = buildReportData(results, seeds, RULES, timings);
  const built = (Date.now() - t1) / 1000;
  const t2 = Date.now();
  const markdown = renderReport(data, RULES, rulesSource);
  const rendered = (Date.now() - t2) / 1000;
  const t3 = Date.now();
  writeFileSync(`${dir}/report.md`, markdown + '\n');
  writeFileSync(`${dir}/report-data.json`, JSON.stringify(data, null, 1) + '\n');
  writeFileSync(
    `${dir}/roster-profile.json`,
    JSON.stringify(rosterProfile(results), null, 1) + '\n',
  );
  const written = (Date.now() - t3) / 1000;
  const total = (Date.now() - t0) / 1000;
  console.log(`economy report written to ${dir}`);
  console.log(
    `  simulation ${num(simulated)} s (${pool ? `${pool.slots} at a time` : 'in this process'}; the busiest: ${Object.entries(
      seconds,
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, s]) => `${id} ${num(s)} s`)
      .join(
        ', ',
      )}; all scenarios added up ${num(Object.values(seconds).reduce((a, b) => a + b, 0))} s)`,
  );
  console.log(
    `  analysis ${num(built)} s (${Object.entries(timings)
      .map(([k, v]) => `${k} ${num(v, 2)}`)
      .join(', ')})`,
  );
  console.log(`  markdown ${num(rendered, 2)} s, files ${num(written, 2)} s`);
  console.log(budgetLine('full report', total, BUDGET.reportSeconds));
  return 0;
}
