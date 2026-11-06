/**
 * Marks on the week timeline: a resolved phase shows a tick (cleared) or a cross (not cleared) on
 * its step, and a tap opens a one-line result. The full after-action card waits until the finale
 * is over. Pure.
 */
import { essenceAmount, type Say } from './resource-count';
import type { PhaseResultView, RaidEventId, RaidPhaseId } from './raid-api';
import { phaseName, stageOutcomeNote, stageOutcomeText } from './raid-text';

interface StepMark {
  phase: RaidPhaseId;
  cleared: boolean;
  /** The glyph on the step. Shape, not colour, tells the two apart. */
  glyph: string;
  /** What assistive technology says for the mark button, for example "Phase 1: cleared. Show result." */
  label: string;
  /** The short result: "Phase 1: cleared. You got" and the Essence icon with 12. */
  summary: Say;
}

export const CLEARED_GLYPH = '✓';
export const MISSED_GLYPH = '✗';

export function stepMark(result: PhaseResultView, rules?: 2): StepMark {
  const name = phaseName(result.phase, rules);
  const word = result.cleared ? 'cleared' : 'not cleared';
  return {
    phase: result.phase,
    cleared: result.cleared,
    glyph: result.cleared ? CLEARED_GLYPH : MISSED_GLYPH,
    label: `${name}: ${word}. Show result.`,
    // A retreat or an enrage says so ("Phase 1 cleared: the boss retreated."); the plain case is as it was.
    summary:
      stageOutcomeNote(result) === null
        ? [`${name}: ${word}. You got `, essenceAmount(result.essence), '.']
        : [`${stageOutcomeText(result)} You got `, essenceAmount(result.essence), '.'],
  };
}

/** The marks of the resolved phases, keyed by the timeline step they belong to. */
export function stepMarks(
  results: readonly PhaseResultView[],
  rules?: 2,
): Partial<Record<RaidEventId, StepMark>> {
  const marks: Partial<Record<RaidEventId, StepMark>> = {};
  for (const result of results) marks[result.phase] = stepMark(result, rules);
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

/**
 * The stage that killed the boss on a combat v2 week before the finale ('phase1' or 'phase2'), or null: the party has no stage
 * left to play (`nextStage` 4), its last result is a stage and the finale has no result. A week that went the distance gives null.
 */
export function earlyKillStage(view: {
  rules?: 2;
  v2?: { nextStage?: number } | undefined;
  party?: { results: readonly PhaseResultView[] } | null;
}): 'phase1' | 'phase2' | null {
  if (view.rules !== 2 || view.v2 === undefined || (view.v2.nextStage ?? 0) < 4) return null;
  const results = view.party?.results ?? [];
  if (results.some((r) => r.phase === 'finale')) return null;
  const last = results.at(-1)?.phase;
  return last === 'phase1' || last === 'phase2' ? last : null;
}
