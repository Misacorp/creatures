import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { compareReport, formatComparison, LiveReportSchema } from './compare';
import { DEFAULT_SEEDS, playersOf, runScenario } from './scenarios';
import { ALL_SERVERS } from './servers';
import { RULES } from './rules';

/**
 * `pnpm --filter @creatures/econ compare <live-report.json> [--seeds n]`: reads the live report the `valley-report` dev route returned (the
 * shape is `LiveReportSchema`), runs the lab on the report's scenario over `--seeds` seeds (default 20) and prints agree or disagree per
 * metric (see `compare.ts` for the margin). Exit code 0 when nothing disagrees, 1 when something does, 2 when the input is unusable.
 */
export function main(args: readonly string[]): number {
  const seedsAt = args.indexOf('--seeds');
  const seeds = seedsAt >= 0 ? Number(args[seedsAt + 1]) : DEFAULT_SEEDS;
  const file = args.find((a, i) => !a.startsWith('--') && (seedsAt < 0 || i !== seedsAt + 1));
  if (file === undefined || !Number.isInteger(seeds) || seeds < 1) {
    console.error('usage: compare <live-report.json> [--seeds n]');
    return 2;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.error(`cannot read ${file} as JSON`);
    return 2;
  }
  const parsed = v.safeParse(LiveReportSchema, raw);
  if (!parsed.success) {
    console.error(`${file} is not a live report: ${parsed.issues[0]?.message ?? 'invalid'}`);
    return 2;
  }
  const report = parsed.output;
  const config = ALL_SERVERS.find((s) => s.id === report.scenario);
  if (!config) {
    console.error(
      `unknown scenario ${report.scenario}; known: ${ALL_SERVERS.map((s) => s.id).join(', ')}`,
    );
    return 2;
  }
  const weeks = Math.max(
    1,
    ...Object.values(report.profiles).flatMap((p) => p.days.map((d) => Math.ceil(d.day / 7))),
    ...(report.server?.days ?? []).map((d) => Math.ceil(d.day / 7)),
  );
  console.log(`${config.label}: lab over ${seeds} seeds, ${weeks} weeks`);
  const result = runScenario({ ...config, weeks: Math.max(weeks, 1) }, seeds, RULES);
  const { lines, ok } = formatComparison(
    compareReport(report, (profile) => playersOf(result, profile), result.runs),
  );
  for (const line of lines) console.log(line);
  return ok ? 0 : 1;
}
