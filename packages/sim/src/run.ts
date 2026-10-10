import { content } from '@creatures/game';
import { analyse, type Analysis } from './analysis';
import {
  ARCHETYPES,
  ARCHETYPE_CONFIG,
  DEFAULT_MIX,
  DEFAULT_SERVER_SIZE,
  scaleMix,
} from './archetypes';
import { runEconomy, type EconomyResult } from './economy';
import { TARGETS, evaluateTargets, type TargetResult } from './targets';
import { runSweep, type ExampleFight } from './sweep';

/** Everything that decides a run's result (no clock, no git state). */
export interface RunSettings {
  seed: string;
  mode: 'full' | 'quick' | 'custom';
  /** Weeks each economy sim runs. */
  weeks: number;
  /** Simulated raid weeks per player count and boss. */
  runsPerCell: number;
  /** Economy sims per player count (each gives roster snapshots at weeks 4 and 8). */
  economySims: number;
  /** 20-week economy sims of the default server for the jackpot and pity targets. */
  pitySims: number;
  /** Player counts of the raid sweep. */
  counts: number[];
}

export const PITY_WEEKS = 20;
export const SWEEP_COUNTS = [1, 5, 10, 15];

export function defaultSettings(
  mode: 'full' | 'quick',
  overrides: { seed?: string; weeks?: number } = {},
): RunSettings {
  const quick = mode === 'quick';
  return {
    seed: overrides.seed ?? 'leet',
    mode,
    weeks: overrides.weeks ?? 12,
    runsPerCell: quick ? 20 : 200,
    economySims: quick ? 4 : 24,
    pitySims: quick ? 8 : 40,
    counts: [...SWEEP_COUNTS],
  };
}

export interface RunOutput {
  settings: RunSettings;
  analysis: Analysis;
  evaluation: TargetResult[];
  example: ExampleFight | null;
}

/** Weeks (1-based) at which rosters are snapshotted: 4 and 8, or the last week if the run is shorter. */
export function snapshotWeeks(weeks: number): number[] {
  const wanted = [4, 8].filter((w) => w <= weeks);
  return wanted.length > 0 ? wanted : [weeks];
}

export function runSimulation(settings: RunSettings): RunOutput {
  if (!Number.isInteger(settings.weeks) || settings.weeks < 1 || settings.weeks > 104) {
    throw new RangeError('weeks must be an integer from 1 to 104');
  }
  const snapshots = new Map<number, EconomyResult['snapshots']>();
  let defaultSims: EconomyResult[] = [];
  const countsToRun = [...new Set([...settings.counts, DEFAULT_SERVER_SIZE])].sort((a, b) => a - b);
  for (const count of countsToRun) {
    const mix = count === DEFAULT_SERVER_SIZE ? DEFAULT_MIX : scaleMix(count);
    const sims: EconomyResult[] = [];
    for (let k = 0; k < settings.economySims; k++) {
      sims.push(
        runEconomy({
          seed: `${settings.seed}:econ:${count}:${k}`,
          weeks: settings.weeks,
          mix,
          snapshotWeeks: snapshotWeeks(settings.weeks),
        }),
      );
    }
    snapshots.set(
      count,
      sims.flatMap((s) => s.snapshots),
    );
    if (count === DEFAULT_SERVER_SIZE) defaultSims = sims;
  }

  const pitySims: EconomyResult[] = [];
  for (let k = 0; k < settings.pitySims; k++) {
    pitySims.push(
      runEconomy({
        seed: `${settings.seed}:pity:${k}`,
        weeks: PITY_WEEKS,
        mix: DEFAULT_MIX,
        snapshotWeeks: [],
      }),
    );
  }

  const sweep = runSweep({
    seed: settings.seed,
    runs: settings.runsPerCell,
    counts: settings.counts,
    snapshots,
  });
  const analysis = analyse({ weeks: settings.weeks, defaultSims, pitySims, sweep });
  return {
    settings,
    analysis,
    evaluation: evaluateTargets(TARGETS, analysis.metrics),
    example: sweep.example,
  };
}

/** Short description of the server mix for report headers. */
export function describeMix(): string {
  return ARCHETYPES.map((a) => `${DEFAULT_MIX[a]} ${ARCHETYPE_CONFIG[a].label.toLowerCase()}`).join(
    ', ',
  );
}

export function bossName(id: string): string {
  return content.bosses.find((b) => b.id === id)?.name ?? id;
}
