import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { INCOME_MODELS, parseIncomeModel, type IncomeModelId } from './income';
import { defaultProfiles, type JourneySettings } from './journey-run';
import { journeyMarkdown } from './journey-markdown';
import { runJourneys } from './journey-report';
import {
  DEFAULT_JOURNEY_MIX,
  SERVER_MIXES,
  parseMix,
  parseProfiles,
  type PlayerProfile,
  type ProfileMix,
} from './profiles';

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

const USAGE = `Usage: pnpm sim:journey [--profiles <names or file.json>] [--weeks N] [--seed <string>] [--servers N]
  [--income ${INCOME_MODELS.join('|')}] [--mix name=count,...] [--server-mix ${Object.keys(SERVER_MIXES).join('|')}]
  [--noise] [--no-weather] [--out <dir>]`;

export interface JourneyCliOptions {
  settings: JourneySettings;
  out: string;
}

function wholeNumber(raw: string, flag: string, lo: number, hi: number): number {
  if (!/^[0-9]{1,4}$/.test(raw)) throw new Error(`${flag} must be a whole number`);
  const n = Number(raw);
  if (n < lo || n > hi) throw new Error(`${flag} must be from ${String(lo)} to ${String(hi)}`);
  return n;
}

/** Parses CLI arguments; throws an Error with a readable message on bad input. */
export function parseJourneyCli(argv: readonly string[]): JourneyCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      profiles: { type: 'string' },
      weeks: { type: 'string' },
      seed: { type: 'string' },
      servers: { type: 'string' },
      income: { type: 'string' },
      mix: { type: 'string' },
      'server-mix': { type: 'string' },
      noise: { type: 'boolean' },
      'no-weather': { type: 'boolean' },
      out: { type: 'string' },
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
  const str = (k: string): string | undefined => {
    const v = values[k];
    return typeof v === 'string' ? v : undefined;
  };
  const weeks =
    str('weeks') === undefined ? 12 : wholeNumber(str('weeks') as string, '--weeks', 1, 104);
  const servers =
    str('servers') === undefined ? 50 : wholeNumber(str('servers') as string, '--servers', 1, 2000);
  const income: IncomeModelId =
    str('income') === undefined ? 'allowance' : parseIncomeModel(str('income') as string);

  // Profiles: the four presets, a comma list of names to keep, or a JSON file of profiles.
  let profiles: PlayerProfile[] = defaultProfiles();
  const profilesArg = str('profiles');
  if (profilesArg !== undefined) {
    if (profilesArg.endsWith('.json')) {
      profiles = parseProfiles(JSON.parse(readFileSync(resolve(profilesArg), 'utf8')) as unknown);
    } else {
      const names = profilesArg.split(',').map((n) => n.trim());
      const picked = names.map((n) => profiles.find((p) => p.id === n));
      const missing = names.filter((_, i) => picked[i] === undefined);
      if (missing.length > 0)
        throw new Error(`--profiles: unknown profile "${missing.join('", "')}"`);
      profiles = picked as PlayerProfile[];
    }
  }
  const known = profiles.map((p) => p.id);

  // The mix: --mix wins over --server-mix; without either, the default mix for the profiles in use.
  let mix: ProfileMix;
  let mixName: string;
  if (str('mix') !== undefined) {
    mix = parseMix(str('mix') as string, known);
    mixName = 'custom';
  } else {
    const name = str('server-mix') ?? 'default';
    const named = SERVER_MIXES[name];
    if (named === undefined) {
      throw new Error(`--server-mix must be one of ${Object.keys(SERVER_MIXES).join(', ')}`);
    }
    mix = Object.fromEntries(Object.entries(named).filter(([k]) => known.includes(k)));
    mixName = name;
    if (profilesArg !== undefined && profilesArg.endsWith('.json')) {
      // A file's profiles are not in the named mixes: one player of each.
      mix = Object.fromEntries(known.map((k) => [k, DEFAULT_JOURNEY_MIX[k] ?? 1]));
      mixName = 'file';
    }
    if (Object.values(mix).reduce((a, b) => a + b, 0) < 1) {
      throw new Error('the chosen profiles leave the server mix empty (use --mix)');
    }
  }
  return {
    settings: {
      seed: seed ?? 'journey',
      weeks,
      servers,
      income,
      profiles,
      mix,
      mixName,
      noise: values['noise'] === true,
      ...(values['no-weather'] === true ? { weather: false } : {}),
    },
    out: str('out') !== undefined && str('out') !== '' ? (str('out') as string) : 'journey-out',
  };
}

/** Runs the journey simulator, writes `report-journey.json` and `report-journey.md`. Returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  const started = performance.now();
  let options: JourneyCliOptions;
  try {
    options = parseJourneyCli(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const report = runJourneys(options.settings);
  const dir = resolve(options.out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report-journey.json'), `${JSON.stringify(report, null, 1)}\n`);
  writeFileSync(join(dir, 'report-journey.md'), journeyMarkdown(report));
  const s = options.settings;
  io.out(
    `Journey sim (${s.income} income, ${s.mixName} mix, ${String(s.servers)} servers, ${String(s.weeks)} weeks, seed "${s.seed}")`,
  );
  io.out(
    `Report written to ${join(dir, 'report-journey.json')} and ${join(dir, 'report-journey.md')}`,
  );
  io.out(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  return 0;
}
