import { runSimulation, type RunSettings } from '../src/run';

/** Small settings that still exercise every part of the pipeline (about a second). */
export const TINY: RunSettings = {
  seed: 'test',
  mode: 'custom',
  weeks: 5,
  runsPerCell: 2,
  economySims: 1,
  pitySims: 1,
  counts: [1, 5],
};

export function tinyRun(overrides: Partial<RunSettings> = {}) {
  return runSimulation({ ...TINY, ...overrides });
}
