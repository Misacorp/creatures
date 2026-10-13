import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FULL, QUICK, calibrate, type Calibration } from './live-calibrate';
import { parseCalibration, project, renderProjection } from './live-projection';
import { parseReport } from './live-report';
import { repoRoot } from './scalars-cli';

// The test tsconfig has no Node types; this global exists in Node.
declare const console: { log(text: string): void; error(text: string): void };

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

const USAGE = `Usage: pnpm sim:live <report.json> [--weeks 4,12,26] [--seed leet] [--age-weeks 0] [--quick] [--out docs/balance]
Fits the balance simulator to the ops report (aggregates only), runs it forward and writes <out>/live-YYYY-MM-DD.calibration.json and <out>/live-YYYY-MM-DD.projection.md (the date is the report's "to"). Seeded and reproducible. --quick uses a smaller server and fewer sims (for tests and a fast look). If an earlier calibration file is in <out>, the parameter changes are shown.`;

const DEFAULT_WEEKS = [4, 12, 26] as const;
const MAX_WEEKS = 104;

/** "4,12,26" as a sorted list of distinct weeks. */
export function parseWeeks(text: string): number[] {
  const parts = text.split(',').map((x) => x.trim());
  const weeks = parts.map(Number);
  if (parts.length > 8 || weeks.some((w) => !Number.isInteger(w) || w < 1 || w > MAX_WEEKS)) {
    throw new Error(
      `--weeks must be up to 8 whole numbers from 1 to ${String(MAX_WEEKS)}, like 4,12,26`,
    );
  }
  return [...new Set(weeks)].sort((a, b) => a - b);
}

/** The newest earlier calibration in `dir` (a date before `to`), or null. */
export function findPreviousCalibration(dir: string, to: string): Calibration | null {
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir)
    .map((name) => ({
      name,
      date: /^live-(\d{4}-\d{2}-\d{2})\.calibration\.json$/.exec(name)?.[1],
    }))
    .filter((f): f is { name: string; date: string } => f.date !== undefined && f.date < to)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const f of names) {
    const found = parseCalibration(readFileSync(resolve(dir, f.name), 'utf8'));
    if (found !== null) return found;
  }
  return null;
}

/** The output files of a run, as text. */
export function simLiveFiles(
  reportText: string,
  options: { seed: string; weeks: readonly number[]; ageWeeks: number; quick: boolean },
  previous: Calibration | null,
): { name: string; calibrationJson: string; projectionMd: string } {
  const report = parseReport(reportText);
  const fidelity = options.quick ? QUICK : FULL;
  const calibration = calibrate(report, {
    seed: options.seed,
    ageWeeks: options.ageWeeks,
    fidelity,
  });
  const projection = project(calibration, options.weeks, fidelity);
  return {
    name: `live-${report.to}`,
    calibrationJson: `${JSON.stringify(calibration, null, 2)}\n`,
    projectionMd: renderProjection(calibration, projection, previous),
  };
}

/** Runs the CLI; returns the exit code. */
export function main(
  argv: readonly string[],
  io: Io = defaultIo,
  root: string = repoRoot(),
): number {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        weeks: { type: 'string' },
        seed: { type: 'string' },
        'age-weeks': { type: 'string' },
        quick: { type: 'boolean' },
        out: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
    if (values['help'] === true) {
      io.out(USAGE);
      return 0;
    }
    if (positionals.length !== 1 || positionals[0] === undefined) throw new Error(USAGE);
    const weeks =
      typeof values['weeks'] === 'string' ? parseWeeks(values['weeks']) : [...DEFAULT_WEEKS];
    const seed = typeof values['seed'] === 'string' ? values['seed'] : 'leet';
    if (seed.length === 0 || seed.length > 64) throw new Error('--seed must be 1 to 64 characters');
    const ageWeeks = typeof values['age-weeks'] === 'string' ? Number(values['age-weeks']) : 0;
    if (!Number.isInteger(ageWeeks) || ageWeeks < 0 || ageWeeks > 52) {
      throw new Error('--age-weeks must be a whole number from 0 to 52');
    }
    const outDir = resolve(
      typeof values['out'] === 'string' ? values['out'] : resolve(root, 'docs/balance'),
    );
    const reportText = readFileSync(resolve(positionals[0]), 'utf8');
    // The date of the report decides the file names and which calibration counts as "previous".
    const to = parseReport(reportText).to;
    const files = simLiveFiles(
      reportText,
      { seed, weeks, ageWeeks, quick: values['quick'] === true },
      findPreviousCalibration(outDir, to),
    );
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `${files.name}.calibration.json`), files.calibrationJson);
    writeFileSync(resolve(outDir, `${files.name}.projection.md`), files.projectionMd);
    io.out(`wrote ${files.name}.calibration.json and ${files.name}.projection.md in ${outDir}`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
