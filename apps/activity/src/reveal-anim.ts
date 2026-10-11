/**
 * The loot reveal's timeline as data: an orb shakes, it opens, the Essence counts up, and the
 * result shows. Pure, so it is unit-tested; `Reveal.tsx` plays the frames with timers (or jumps to
 * the last one for a player who prefers reduced motion). The numbers shown are the server's; this
 * only decides how they appear.
 */

export type RevealPhase = 'shake' | 'open' | 'count' | 'done';

export interface RevealFrame {
  /** Milliseconds from the start. */
  at: number;
  phase: RevealPhase;
  /** The Essence shown at this frame. */
  count: number;
}

/** The orb shakes for this long, then opens; the count-up follows in this many steps. */
export const SHAKE_MS = 600;
export const OPEN_MS = 300;
export const COUNT_STEPS = 10;
export const COUNT_STEP_MS = 60;

/**
 * The numbers of a count-up from 0 to `target`: `steps + 1` whole numbers that never go down, start at 0
 * and end at exactly `target`. Fast at first and slower at the end (integer maths only).
 */
export function countRamp(target: number, steps: number = COUNT_STEPS): number[] {
  const goal = Number.isFinite(target) ? Math.max(0, Math.trunc(target)) : 0;
  const n = Math.max(1, Math.trunc(steps));
  return Array.from({ length: n + 1 }, (_, k) =>
    k === n ? goal : Math.floor((goal * (n * n - (n - k) * (n - k))) / (n * n)),
  );
}

/** Every frame of the reveal, in order. No two frames are more than `SHAKE_MS` apart. */
export function revealFrames(essence: number): RevealFrame[] {
  const ramp = countRamp(essence);
  const frames: RevealFrame[] = [
    { at: 0, phase: 'shake', count: 0 },
    { at: SHAKE_MS, phase: 'open', count: 0 },
  ];
  const countStart = SHAKE_MS + OPEN_MS;
  for (let k = 1; k <= COUNT_STEPS; k++) {
    frames.push({
      at: countStart + k * COUNT_STEP_MS,
      phase: k === COUNT_STEPS ? 'done' : 'count',
      count: ramp[k] ?? 0,
    });
  }
  return frames;
}

/** The end state: what a player who prefers reduced motion sees straight away. */
export function finalFrame(essence: number): RevealFrame {
  const frames = revealFrames(essence);
  return frames[frames.length - 1] as RevealFrame;
}
