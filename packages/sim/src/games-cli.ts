import { parseArgs } from 'node:util';
import { createSeededRng, gamesEventDef, type GamesEventDef } from '@creatures/game';
import { runGamesEvent } from '@creatures/engine';
import {
  DEFAULT_GAMES_SETTINGS,
  GAMES_POLICIES,
  assignEntries,
  candidatesOf,
  gamesReport,
  gamesRosters,
  gamesChecks,
  runGamesStudy,
  showScript,
  type GamesPolicy,
  type GamesStudySettings,
} from './games-study';

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

const USAGE = `Usage: pnpm sim:games [--seed <string>] [--days N] [--sizes 8,15] [--weeks 1,4,12,30] [--strict]
       pnpm sim:games --show <seed> [--event <id>] [--players N] [--week N] [--policy best|aptitude|random] [--moves]
Plays Valley Games days on economy-sim rosters and prints each event's numbers against the targets
(docs/design/valley-games.md). --show prints one event as a script. --strict exits 1 when a target fails.`;

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

function list(
  raw: string | undefined,
  flag: string,
  lo: number,
  hi: number,
  dflt: readonly number[],
): number[] {
  if (raw === undefined) return [...dflt];
  const parts = raw.split(',');
  if (parts.length < 1 || parts.length > 8) throw new Error(`${flag} takes 1 to 8 numbers`);
  return parts.map((p) => whole(p.trim(), flag, lo, hi, 0));
}

export type GamesCliOptions =
  | { mode: 'study'; study: GamesStudySettings; strict: boolean }
  | {
      mode: 'show';
      seed: string;
      event: GamesEventDef;
      players: number;
      week: number;
      policy: GamesPolicy;
      moves: boolean;
    };

/** Parses CLI arguments; throws an Error with a readable message on bad input. */
export function parseGamesCli(argv: readonly string[]): GamesCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'string' },
      days: { type: 'string' },
      sizes: { type: 'string' },
      weeks: { type: 'string' },
      strict: { type: 'boolean' },
      show: { type: 'string' },
      event: { type: 'string' },
      players: { type: 'string' },
      week: { type: 'string' },
      policy: { type: 'string' },
      moves: { type: 'boolean' },
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
  const seedOk = (s: string, flag: string): string => {
    if (s.length < 1 || s.length > 100)
      throw new Error(`${flag} must be a string of 1 to 100 characters`);
    return s;
  };
  const show = str('show');
  if (show !== undefined) {
    const id = str('event') ?? 'sauna-showdown';
    const event = gamesEventDef(id);
    if (event === undefined) throw new Error(`--event: unknown event "${id}"`);
    const policy = str('policy') ?? 'best';
    if (!(GAMES_POLICIES as readonly string[]).includes(policy)) {
      throw new Error(`--policy must be one of ${GAMES_POLICIES.join(', ')}`);
    }
    return {
      mode: 'show',
      seed: seedOk(show, '--show'),
      event,
      players: whole(str('players'), '--players', 1, 24, 15),
      week: whole(str('week'), '--week', 1, 60, 12),
      policy: policy as GamesPolicy,
      moves: values['moves'] === true,
    };
  }
  return {
    mode: 'study',
    strict: values['strict'] === true,
    study: {
      seed: seedOk(str('seed') ?? DEFAULT_GAMES_SETTINGS.seed, '--seed'),
      days: whole(str('days'), '--days', 1, 1_000, DEFAULT_GAMES_SETTINGS.days),
      sizes: list(str('sizes'), '--sizes', 1, 24, DEFAULT_GAMES_SETTINGS.sizes),
      weeks: list(str('weeks'), '--weeks', 1, 60, DEFAULT_GAMES_SETTINGS.weeks),
    },
  };
}

export function main(argv: readonly string[], io: Io = defaultIo): number {
  const started = performance.now();
  let options: GamesCliOptions;
  try {
    options = parseGamesCli(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (options.mode === 'show') {
    const [roster] = gamesRosters({
      seed: 'games',
      sizes: [options.players],
      weeks: [options.week],
      days: 1,
    });
    if (roster === undefined || roster.players.length === 0) {
      io.err('no players at that week');
      return 1;
    }
    const rng = createSeededRng(`show:${options.seed}`);
    const def = options.event;
    const entrants = roster.players.flatMap((p) =>
      (assignEntries([def], candidatesOf(p), options.policy, rng)[0] ?? []).map((c) => c.entrant),
    );
    io.out(showScript(def, runGamesEvent(def, entrants, rng), options.moves));
    return 0;
  }
  const study = runGamesStudy(options.study);
  io.out(gamesReport(study));
  io.out(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  if (options.strict && gamesChecks(study).includes(false)) return 1;
  return 0;
}
