import { parseArgs } from 'node:util';
import {
  defaultLuckSettings,
  formatLuckReport,
  parseLuck,
  runLuckStudy,
  type LuckSetting,
  type LuckStudySettings,
} from './luck';

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

const USAGE = `Usage: node packages/sim/scripts/luck.mjs [--quick] [--seed <string>] [--seeds N] [--search N] [--passes N] [--cases N] [--stages finale|all] [--luck "critChanceBp=1500,critBp=5000;spreadBp=2000"]`;

/** Runs the luck study and prints the report. Returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  let settings: LuckStudySettings;
  let luck: LuckSetting[] = [];
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        quick: { type: 'boolean' },
        seed: { type: 'string' },
        seeds: { type: 'string' },
        search: { type: 'string' },
        passes: { type: 'string' },
        cases: { type: 'string' },
        stages: { type: 'string' },
        luck: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values['help'] === true) throw new Error(USAGE);
    settings = defaultLuckSettings(values['quick'] === true ? 'quick' : 'full');
    const seed = values['seed'];
    if (typeof seed === 'string') {
      if (seed.length < 1 || seed.length > 100) {
        throw new Error('--seed must be 1 to 100 characters');
      }
      settings.seed = seed;
    }
    const whole = (name: string, min: number, max: number): number | undefined => {
      const text = values[name];
      if (typeof text !== 'string') return undefined;
      if (!/^[0-9]{1,4}$/.test(text) || Number(text) < min || Number(text) > max) {
        throw new Error(`--${name} must be a whole number from ${min} to ${max}`);
      }
      return Number(text);
    };
    settings.seeds = whole('seeds', 1, 5000) ?? settings.seeds;
    settings.searchSeeds = whole('search', 1, 500) ?? settings.searchSeeds;
    settings.passes = whole('passes', 0, 5) ?? settings.passes;
    settings.maxCases = whole('cases', 0, 5000) ?? settings.maxCases;
    const stages = values['stages'];
    if (stages === 'finale') settings.luckStages = ['finale'];
    else if (stages !== undefined && stages !== 'all')
      throw new Error('--stages must be finale or all');
    const luckText = values['luck'];
    if (typeof luckText === 'string') luck = luckText.split(';').map(parseLuck);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  io.out(formatLuckReport(runLuckStudy(settings, luck)));
  return 0;
}
