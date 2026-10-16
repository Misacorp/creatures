import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  runCreaturesStudy,
  creaturesMarkdown,
  type StudySettings,
  type CreaturesRun,
} from './creatures-study';
import { applyOverrides } from './tune';

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

const USAGE = `Usage: pnpm sim:creatures [--label <name>] [--set path=integer,...] [--seeds N] [--servers N] [--weeks N] [--seed <string>] --out <file.json>
       pnpm sim:creatures --compare <a.json,b.json,...> [--out <file.md>]
Plays the journey servers and reports what catching brings: creatures, duplicates and their answers, the catalogue, the Bait split and the talents' share of power (docs/balance/log.md B-014).
Run one process per variant (each with its own --set), then --compare the JSON files.`;

function whole(
  raw: string | undefined,
  flag: string,
  lo: number,
  hi: number,
  dflt: number,
): number {
  if (raw === undefined) return dflt;
  if (!/^[0-9]{1,4}$/.test(raw)) throw new Error(`${flag} must be a whole number`);
  const n = Number(raw);
  if (n < lo || n > hi) throw new Error(`${flag} must be from ${String(lo)} to ${String(hi)}`);
  return n;
}

export interface CreaturesCliOptions {
  label: string;
  set: string;
  study: StudySettings;
  out: string | undefined;
  compare: string[];
}

/** Parses CLI arguments; throws an Error with a readable message on bad input. */
export function parseCreaturesCli(argv: readonly string[]): CreaturesCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      label: { type: 'string' },
      set: { type: 'string' },
      seeds: { type: 'string' },
      servers: { type: 'string' },
      weeks: { type: 'string' },
      seed: { type: 'string' },
      out: { type: 'string' },
      compare: { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values['help'] === true) throw new Error(USAGE);
  const str = (k: string): string | undefined => {
    const v = values[k];
    return typeof v === 'string' ? v : undefined;
  };
  const seed = str('seed') ?? 'creatures';
  if (seed.length < 1 || seed.length > 100) {
    throw new Error('--seed must be a string of 1 to 100 characters');
  }
  const label = str('label') ?? 'shipped';
  if (!/^[A-Za-z0-9 ._+-]{1,60}$/.test(label)) throw new Error('--label has odd characters');
  return {
    label,
    set: str('set') ?? '',
    study: {
      seed,
      seeds: whole(str('seeds'), '--seeds', 1, 20, 3),
      servers: whole(str('servers'), '--servers', 1, 500, 20),
      weeks: whole(str('weeks'), '--weeks', 1, 104, 30),
    },
    out: str('out'),
    compare: (str('compare') ?? '').split(',').filter((x) => x !== ''),
  };
}

/** Runs one variant (writes its JSON) or compares variants (writes or prints Markdown). Returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  const started = performance.now();
  let options: CreaturesCliOptions;
  try {
    options = parseCreaturesCli(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (options.compare.length > 0) {
    const runs = options.compare.map(
      (file) => JSON.parse(readFileSync(resolve(file), 'utf8')) as CreaturesRun,
    );
    const markdown = creaturesMarkdown(runs);
    if (options.out === undefined) io.out(markdown);
    else {
      mkdirSync(dirname(resolve(options.out)), { recursive: true });
      writeFileSync(resolve(options.out), markdown);
      io.out(`Written to ${resolve(options.out)}`);
    }
    return 0;
  }
  if (options.out === undefined) {
    io.err(USAGE);
    return 2;
  }
  let restore: () => void;
  try {
    restore = applyOverrides(options.set);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  try {
    const run = runCreaturesStudy(options.label, options.set, options.study);
    mkdirSync(dirname(resolve(options.out)), { recursive: true });
    writeFileSync(resolve(options.out), `${JSON.stringify(run)}\n`);
    io.out(`Variant "${options.label}" written to ${resolve(options.out)}`);
    io.out(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
    return 0;
  } finally {
    restore();
  }
}
