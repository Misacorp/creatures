import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { INCOME_MODELS, parseIncomeModel, type IncomeModelId } from './income';
import { buildReportJson, buildReportMarkdown, statusCounts } from './report';
import { defaultSettings, runSimulation, type RunSettings } from './run';
import { formatValue, describeRequirement } from './targets';

// The test tsconfig has no Node types; both globals exist in Node.
declare const console: { log(text: string): void; error(text: string): void };
declare const performance: { now(): number };

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const defaultIo: Io = {
  out: (text) => {
    console.log(text);
  },
  err: (text) => {
    console.error(text);
  },
};

const USAGE = `Usage: pnpm sim [--seed <string>] [--quick] [--weeks N] [--out <dir>] [--income ${INCOME_MODELS.join('|')}] [--no-weather] [--fail-on-violations]`;

export interface CliOptions {
  settings: RunSettings;
  out: string;
  failOnViolations: boolean;
}

/** Parses CLI arguments; throws an Error with a readable message on bad input. */
export function parseCli(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'string' },
      quick: { type: 'boolean' },
      weeks: { type: 'string' },
      out: { type: 'string' },
      income: { type: 'string' },
      'no-weather': { type: 'boolean' },
      'fail-on-violations': { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values['help'] === true) throw new Error(USAGE);
  const seed = values['seed'];
  if (seed !== undefined && (typeof seed !== 'string' || seed.length < 1 || seed.length > 100)) {
    throw new Error('--seed must be a string of 1 to 100 characters');
  }
  let weeks: number | undefined;
  const rawWeeks = values['weeks'];
  if (typeof rawWeeks === 'string') {
    if (!/^[0-9]{1,3}$/.test(rawWeeks)) throw new Error('--weeks must be a whole number');
    weeks = Number(rawWeeks);
    if (weeks < 1 || weeks > 104) throw new Error('--weeks must be from 1 to 104');
  }
  const overrides: { seed?: string; weeks?: number; income?: IncomeModelId } = {};
  const income = values['income'];
  if (typeof income === 'string') overrides.income = parseIncomeModel(income);
  if (typeof seed === 'string') overrides.seed = seed;
  if (weeks !== undefined) overrides.weeks = weeks;
  const out = values['out'];
  const settings = defaultSettings(values['quick'] === true ? 'quick' : 'full', overrides);
  return {
    settings: values['no-weather'] === true ? { ...settings, weather: false } : settings,
    out: typeof out === 'string' && out !== '' ? out : 'sim-out',
    failOnViolations: values['fail-on-violations'] === true,
  };
}

/**
 * Runs the simulator, writes `report.md` and `report.json`, prints a summary. Returns the exit code.
 * `adjust` lets tests shrink the run (for example skip the 30-week studies); the command line never
 * passes it.
 */
export function main(
  argv: readonly string[],
  io: Io = defaultIo,
  adjust: (settings: RunSettings) => RunSettings = (settings) => settings,
): number {
  const started = performance.now();
  let options: CliOptions;
  try {
    options = parseCli(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const result = runSimulation(adjust(options.settings));
  const dir = resolve(options.out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.md'), `${buildReportMarkdown(result)}\n`);
  writeFileSync(join(dir, 'report.json'), buildReportJson(result));

  const counts = statusCounts(result.evaluation);
  io.out(
    `Balance sim (${options.settings.mode}, seed "${options.settings.seed}"): ${counts.pass} passed, ${counts.fail} failed, ${counts.notMeasured} not measured.`,
  );
  for (const t of result.evaluation) {
    if (t.status !== 'fail') continue;
    io.out(
      `  FAIL ${t.id}: ${t.measured === null ? 'n/a' : formatValue(t.measured, t.unit)} (needs ${describeRequirement(t)})`,
    );
  }
  io.out(`Report written to ${join(dir, 'report.md')} and ${join(dir, 'report.json')}`);
  io.out(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  return options.failOnViolations && counts.fail > 0 ? 1 : 0;
}
