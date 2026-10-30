import { writeFileSync } from 'node:fs';
import { RULES } from './rules';
import rulesSource from './rules.ts?raw';
import { DEFAULT_SEEDS, runAll } from './scenarios';
import { buildReportData, renderReport } from './report';
import { rosterProfile } from './roster';

/**
 * `pnpm --filter @creatures/econ report [-- --seeds N] [--out <dir>]`: runs every scenario and writes the report, its numbers
 * and the roster profile for combat v2 into docs/design/valley/economy (never edited by hand).
 */
export function main(args: readonly string[]): number {
  const s = args.indexOf('--seeds');
  const seeds = s >= 0 ? Number(args[s + 1]) : DEFAULT_SEEDS;
  const o = args.indexOf('--out');
  const dir = o >= 0 ? (args[o + 1] ?? '') : '../../docs/design/valley/economy';
  const t = Date.now();
  const results = runAll(seeds, RULES);
  const data = buildReportData(results, seeds, RULES);
  writeFileSync(`${dir}/report.md`, renderReport(data, RULES, rulesSource) + '\n');
  writeFileSync(`${dir}/report-data.json`, JSON.stringify(data, null, 1) + '\n');
  writeFileSync(
    `${dir}/roster-profile.json`,
    JSON.stringify(rosterProfile(results), null, 1) + '\n',
  );
  console.log(`economy report written to ${dir} in ${Math.round((Date.now() - t) / 100) / 10} s`);
  return 0;
}
