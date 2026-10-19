/**
 * The timing of the XP row's count-up (`ui/XpGain.tsx`): each bar the gain went through fills from its start
 * to its end in pixel steps, with a flash between bars (a level crossed). Pure: the row plays these steps
 * with timers, and a player who prefers reduced motion gets `countEnd` at once.
 */
import type { XpChange } from './xp-change';

/** Where the count is: which bar, and the XP into it, and whether the bar flashes (a level crossed). */
export interface CountState {
  leg: number;
  value: number;
  flash: boolean;
}

/** The wait before the count starts, so the eye has found the row. */
export const COUNT_DELAY_MS = 350;
const STEP_MS = 50;
/** Steps to fill one bar: a pixel-y fill in 12 jumps (0.6 s). */
const STEPS = 12;
const FLASH_MS = 300;

export function countEnd(change: XpChange): CountState {
  const last = change.legs.length - 1;
  return { leg: last, value: change.legs[last]?.to ?? 0, flash: false };
}

export function countStart(change: XpChange): CountState {
  return { leg: 0, value: change.legs[0]?.from ?? 0, flash: false };
}

/** The whole count as timed steps (pure: the hook below plays it). */
export function countSteps(change: XpChange): { at: number; state: CountState }[] {
  const out: { at: number; state: CountState }[] = [];
  let at = COUNT_DELAY_MS;
  change.legs.forEach((leg, i) => {
    for (let step = 1; step <= STEPS; step++) {
      out.push({
        at,
        state: {
          leg: i,
          value: Math.round(leg.from + ((leg.to - leg.from) * step) / STEPS),
          flash: false,
        },
      });
      at += STEP_MS;
    }
    if (i < change.legs.length - 1) {
      out.push({ at, state: { leg: i, value: leg.to, flash: true } });
      at += FLASH_MS;
    }
  });
  return out;
}
