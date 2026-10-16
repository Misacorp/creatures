import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CURVE_MIXES,
  curveMarkdown,
  namedCurveMixes,
  runCurveStudy,
  type CurveSettings,
} from './curve-study';
import { INCOME_MODELS, parseIncomeModel, type IncomeModelId } from './income';
import { PRESET_IDS, SERVER_MIXES, parseMix } from './profiles';
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

const USAGE = `Usage: pnpm sim:curve [--server-mix ${[...CURVE_MIXES, 'all'].join('|')}] [--mix name=count,...] [--weeks N] [--servers N] [--seed <string>]
  [--income ${INCOME_MODELS.join('|')}] [--set raid.curve.ranks.2.hpBp=15000,...] [--out <dir>]
Plays whole servers of the journey profiles week by week and reports the raid by week and by Boss Rank (docs/balance/log.md B-010).`;

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

export interface CurveCliOptions {
  settings: CurveSettings;
  out: string;
  set: string;
}

/** Parses CLI arguments; throws an Error with a readable message on bad input. */
export function parseCurveCli(argv: readonly string[]): CurveCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      'server-mix': { type: 'string' },
      mix: { type: 'string' },
      weeks: { type: 'string' },
      servers: { type: 'string' },
      seed: { type: 'string' },
      income: { type: 'string' },
      set: { type: 'string' },
      out: { type: 'string' },
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
  const seed = str('seed') ?? 'curve';
  if (seed.length < 1 || seed.length > 100) throw new Error('--seed must be 1 to 100 characters');
  const income: IncomeModelId =
    str('income') === undefined ? 'allowance' : parseIncomeModel(str('income') as string);
  let mixes = namedCurveMixes();
  if (str('mix') !== undefined) {
    mixes = [{ id: 'custom', mix: parseMix(str('mix') as string, PRESET_IDS) }];
  } else if (str('server-mix') !== undefined && str('server-mix') !== 'all') {
    const name = str('server-mix') as string;
    const named = SERVER_MIXES[name];
    if (named === undefined) {
      throw new Error(`--server-mix must be one of ${Object.keys(SERVER_MIXES).join(', ')}, all`);
    }
    mixes = [{ id: name, mix: named }];
  }
  return {
    settings: {
      seed,
      weeks: whole(str('weeks'), '--weeks', 1, 52, 12),
      servers: whole(str('servers'), '--servers', 1, 2000, 60),
      income,
      mixes,
    },
    out: str('out') !== undefined && str('out') !== '' ? (str('out') as string) : 'curve-out',
    set: str('set') ?? '',
  };
}

/** Runs the curve study and writes `report-curve.json` and `report-curve.md`. Returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  const started = performance.now();
  let options: CurveCliOptions;
  try {
    options = parseCurveCli(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
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
    const { settings } = options;
    io.out(
      `Curve study (${settings.income} income, ${settings.mixes.map((m) => m.id).join(', ')}; ${String(settings.servers)} servers, ${String(settings.weeks)} weeks, seed "${settings.seed}")`,
    );
    const result = runCurveStudy(settings);
    const dir = resolve(options.out);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'report-curve.json'), `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(join(dir, 'report-curve.md'), `${curveMarkdown(result)}\n`);
    io.out(
      `Report written to ${join(dir, 'report-curve.json')} and ${join(dir, 'report-curve.md')}`,
    );
    io.out(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
    return 0;
  } finally {
    restore();
  }
}
