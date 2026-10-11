import { parseArgs } from 'node:util';
import { buildReadinessCases, defaultReadinessSettings, formatReadinessReport } from './readiness';

// The test tsconfig has no Node types; both globals exist in Node.
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

const USAGE = `Usage: node packages/sim/scripts/readiness.mjs [--quick] [--seed <string>] [--cases N] [--json]`;

/** Runs the readiness calibration and prints the table. Returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        quick: { type: 'boolean' },
        seed: { type: 'string' },
        cases: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values['help'] === true) throw new Error(USAGE);
    const settings = defaultReadinessSettings(values['quick'] === true ? 'quick' : 'full');
    if (typeof values['seed'] === 'string') settings.seed = values['seed'];
    if (typeof values['cases'] === 'string') {
      if (!/^[0-9]{1,4}$/.test(values['cases'])) throw new Error('--cases must be a whole number');
      settings.maxCases = Number(values['cases']);
    }
    const cases = buildReadinessCases(settings);
    io.out(values['json'] === true ? JSON.stringify(cases) : formatReadinessReport(cases));
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
