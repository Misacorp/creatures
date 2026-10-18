import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  runWeatherStudy,
  weatherMarkdown,
  type WeatherStudy,
  type WeatherStudySettings,
} from './weather-study';

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

const USAGE = `Usage: pnpm sim:weather [--seed <string>] [--servers N] [--rank N] [--strength-rank N] [--curve-servers N] [--curve-weeks N] [--out <file.md>] [--json <file.json>]
Plays raid weeks under every live Boon and Omen, one at a time, against the same weeks with no weather, and the default journey server with and without weather (docs/balance/log.md B-017).`;

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

export interface WeatherCliOptions {
  study: WeatherStudySettings;
  out: string | undefined;
  json: string | undefined;
}

/** Parses CLI arguments; throws an Error with a readable message on bad input. */
export function parseWeatherCli(argv: readonly string[]): WeatherCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'string' },
      servers: { type: 'string' },
      rank: { type: 'string' },
      'strength-rank': { type: 'string' },
      'curve-servers': { type: 'string' },
      'curve-weeks': { type: 'string' },
      out: { type: 'string' },
      json: { type: 'string' },
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
  const seed = str('seed') ?? 'weather';
  if (seed.length < 1 || seed.length > 100) {
    throw new Error('--seed must be a string of 1 to 100 characters');
  }
  return {
    study: {
      seed,
      servers: whole(str('servers'), '--servers', 1, 200, 6),
      rank: whole(str('rank'), '--rank', 1, 50, 3),
      ...(str('strength-rank') === undefined
        ? {}
        : { strengthRank: whole(str('strength-rank'), '--strength-rank', 1, 50, 1) }),
      curveServers: whole(str('curve-servers'), '--curve-servers', 0, 500, 20),
      curveWeeks: whole(str('curve-weeks'), '--curve-weeks', 1, 104, 30),
    },
    out: str('out'),
    json: str('json'),
  };
}

function write(path: string, text: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), text);
}

/** Runs the study, prints or writes its Markdown (and JSON). Returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  const started = performance.now();
  let options: WeatherCliOptions;
  try {
    options = parseWeatherCli(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const study: WeatherStudy = runWeatherStudy(options.study);
  const markdown = weatherMarkdown(study);
  if (options.out === undefined) io.out(markdown);
  else {
    write(options.out, markdown);
    io.out(`Written to ${resolve(options.out)}`);
  }
  if (options.json !== undefined) {
    write(options.json, `${JSON.stringify(study)}\n`);
    io.out(`JSON written to ${resolve(options.json)}`);
  }
  io.out(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  return 0;
}
