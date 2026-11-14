/**
 * The timing of a boss move's animation, in one place. A move is a few phases in a row, each with a weight; the weights share the
 * move's time (`BOSS_MOVE_MS` at 1x, which is also how long a boss beat stays on screen in `playback-v2.ts`; 2x and a round's budget
 * squeeze it like any other beat). Every number of a boss animation (the playback's, the workbench's) comes from here.
 *
 * - `windup`: the weapon appears in the boss's hand.
 * - `aim`: the down-pointing marker shows the cells the move will hit; the weapon waits.
 * - `throw`: the weapon leaves the screen upwards.
 * - `strike`: it comes through the marked cells.
 * - `impact`: the burst on each creature hit. The beat lands (HP, damage numbers, callouts) as this phase begins, so the playback holds
 *   the beat back for the first four phases (`leadMs`) and the board is never ahead of the picture.
 */

/** How long a boss move takes from the weapon appearing to the end of the impact, at 1x. Roughly 1.2 to 2 seconds reads deliberate. */
export const BOSS_MOVE_MS = 1700;

export const PHASES = [
  { id: 'windup', weight: 3 },
  { id: 'aim', weight: 3 },
  { id: 'throw', weight: 2 },
  { id: 'strike', weight: 2 },
  { id: 'impact', weight: 3 },
] as const;

export type PhaseId = (typeof PHASES)[number]['id'];

export interface PhaseSpan {
  id: PhaseId;
  /** Milliseconds from the start of the move. */
  start: number;
  end: number;
}

const TOTAL_WEIGHT = PHASES.reduce((sum, p) => sum + p.weight, 0);

/** The span of each phase when the move takes `totalMs`; the spans tile `0..totalMs` with no gap. */
export function phaseSpans(totalMs: number): PhaseSpan[] {
  let used = 0;
  let start = 0;
  return PHASES.map((p) => {
    used += p.weight;
    const end = Math.round((totalMs * used) / TOTAL_WEIGHT);
    const span = { id: p.id, start, end };
    start = end;
    return span;
  });
}

/** How long the picture runs before the beat lands: every phase up to the impact. */
export function leadMs(totalMs: number): number {
  return phaseSpans(totalMs).find((s) => s.id === 'impact')?.start ?? 0;
}

/** The phase `t` falls in and how far through it (0 to 1). Past the end it is the end of the impact. */
export function phaseAt(totalMs: number, t: number): { id: PhaseId; u: number } {
  const spans = phaseSpans(totalMs);
  const last = spans[spans.length - 1] as PhaseSpan;
  if (t >= last.end) return { id: last.id, u: 1 };
  const span = spans.find((s) => t < s.end) ?? last;
  const length = Math.max(1, span.end - span.start);
  return { id: span.id, u: Math.min(1, Math.max(0, (t - span.start) / length)) };
}

/** How far through each phase a screenshot of it is taken: where the phase is easiest to read (a fall is quick at its end). */
export const SHOT_AT: Readonly<Record<PhaseId, number>> = {
  windup: 0.8,
  aim: 0.6,
  throw: 0.5,
  strike: 0.85,
  impact: 0.3,
};

/** The time of a screenshot of a phase (`SHOT_AT` of the way through it). */
export function phaseShot(totalMs: number, id: PhaseId): number {
  const span = phaseSpans(totalMs).find((s) => s.id === id);
  return span === undefined ? 0 : Math.round(span.start + (span.end - span.start) * SHOT_AT[id]);
}
