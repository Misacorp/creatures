/**
 * Marks on the week timeline: a resolved phase shows a tick (cleared) or a cross (not cleared) on
 * its step, and a tap opens a one-line result. The full after-action card waits until the finale
 * is over. Pure.
 */
import type { PhaseResultView, RaidEventId, RaidPhaseId } from './raid-api';
import { phaseName } from './raid-text';

export interface StepMark {
  phase: RaidPhaseId;
  cleared: boolean;
  /** The glyph on the step. Shape, not colour, tells the two apart. */
  glyph: string;
  /** What assistive technology says for the mark button, for example "Phase 1: cleared. Show result." */
  label: string;
  /** The short result: "Phase 1: cleared. You got 12 Essence." */
  summary: string;
}

export const CLEARED_GLYPH = '✓';
export const MISSED_GLYPH = '✗';

export function stepMark(result: PhaseResultView): StepMark {
  const name = phaseName(result.phase);
  const word = result.cleared ? 'cleared' : 'not cleared';
  return {
    phase: result.phase,
    cleared: result.cleared,
    glyph: result.cleared ? CLEARED_GLYPH : MISSED_GLYPH,
    label: `${name}: ${word}. Show result.`,
    summary: `${name}: ${word}. You got ${String(result.essence)} Essence.`,
  };
}

/** The marks of the resolved phases, keyed by the timeline step they belong to. */
export function stepMarks(
  results: readonly PhaseResultView[],
): Partial<Record<RaidEventId, StepMark>> {
  const marks: Partial<Record<RaidEventId, StepMark>> = {};
  for (const result of results) marks[result.phase] = stepMark(result);
  return marks;
}

/** The full after-action cards appear only once the finale has a result. */
export function showFullResults(results: readonly PhaseResultView[]): boolean {
  return results.some((r) => r.phase === 'finale');
}

/** A tap on a mark opens its result; a second tap on the same mark closes it. */
export function toggleMark(open: RaidPhaseId | null, tapped: RaidPhaseId): RaidPhaseId | null {
  return open === tapped ? null : tapped;
}
