import { runSimulation, type RunOutput, type RunSettings } from '../src/run';

/**
 * Small settings that still exercise every part of the pipeline. The fixed horizons (pity, long-run,
 * slot-opening sims and the gear and creatures studies) are cut to 6 weeks: left at 20 to 60 weeks
 * they were 80% of the run. The metrics that read later weeks come out "not measured" here, which
 * is fine for tests of the pipeline and never for a balance run.
 */
export const TINY: RunSettings = {
  seed: 'test',
  mode: 'custom',
  weeks: 5,
  runsPerCell: 2,
  economySims: 1,
  pitySims: 1,
  longRunSims: 1,
  tripLongSims: 1,
  curveServers: 1,
  suppliesServers: 1,
  gearServers: 0,
  creaturesServers: 0,
  counts: [1, 5],
  pityWeeks: 6,
  longRunWeeks: 6,
  tripLongWeeks: 6,
  studyWeeks: 6,
};

export function tinyRun(overrides: Partial<RunSettings> = {}) {
  return runSimulation({ ...TINY, ...overrides });
}

/**
 * The default `tinyRun()`, run once per test file and shared: the run is deterministic for its seed,
 * so tests that only read the output can all use this one. Tests that need a run of their own (a
 * different seed or length, or the determinism check, which builds two independent runs) call
 * `tinyRun` directly.
 */
let cached: RunOutput | undefined;
export function sharedTinyRun(): RunOutput {
  cached ??= tinyRun();
  return cached;
}
