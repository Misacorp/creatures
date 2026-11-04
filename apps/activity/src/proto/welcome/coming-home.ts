/**
 * "Coming home" (`systems/return.md`, V-RET-4a, Misa's answer Q56): closing the Gazette in any way plays a short
 * moment in which what the visit brought in flies into the HUD's purse as large numbers that count up as they
 * land. Everything is already in the purse before it plays, so skipping it loses nothing. This module is the
 * pure part: which currencies a visit brought, the count-up steps, the timing and the dev param.
 */
import type { Visit } from './journey';

/** A currency the visit brought in, as a resource-library id (`bait` is the library's Acorns) and a whole amount. */
export interface HomeGain {
  resource: string;
  amount: number;
}

/**
 * What the visit brought into the purse. Only the purse's own currencies fly (the library's `currency` kind:
 * the lab's Acorns are the library's Bait); scrap and shards are materials that wait in the bag. The lab's
 * averages are fractional: they are rounded, and a visit that brought none gives an empty list.
 */
export function homeGains(visit: Visit): HomeGain[] {
  const acorns = Math.round(visit.cameHome.acorns);
  return acorns > 0 ? [{ resource: 'bait', amount: acorns }] : [];
}

/** How many numbers the count-up passes through, and how long the whole flight takes (ms). */
export const COUNT_STEPS = 10;
export const FLIGHT_MS = 1100;
/** How long the purse's bump lasts after the numbers land, and how long "+N" stays beside it under reduced motion. */
export const BUMP_MS = 400;
export const NOTE_MS = 1600;

/**
 * The count-up as a list of whole numbers, slow to start and quick at the end (the numbers rush in as they
 * land), never falling and ending exactly on `amount`. `steps` values; the first is at least 1 when `amount` is.
 */
export function countSteps(amount: number, steps: number = COUNT_STEPS): number[] {
  const total = Math.max(0, Math.floor(amount));
  const n = Math.max(1, Math.floor(steps));
  const out: number[] = [];
  for (let i = 1; i <= n; i += 1) {
    const eased = Math.round(total * (i / n) ** 2);
    out.push(i === n ? total : Math.min(total, Math.max(eased, Math.min(total, 1))));
  }
  return out;
}

/** The number shown at step `step` (0-based; clamped to the list), as "+180". */
export function stepText(amount: number, step: number): string {
  const values = countSteps(amount);
  const at = Math.min(Math.max(0, Math.floor(step)), values.length - 1);
  return `+${String(values[at] ?? 0)}`;
}

/** How the moment plays: `play` (flies), `still` (reduced motion or a screenshot: no flight), `mid` (dev: frozen mid-flight). */
export type FlyMode = 'play' | 'still' | 'mid';

/** `&fly=mid` in the address freezes the numbers mid-flight, for screenshots. */
export function flyParam(hash: string): 'mid' | null {
  return /[?&]fly=mid(?:&|$)/.test(hash) ? 'mid' : null;
}

/** The mode: the dev param first, else no flight under reduced motion or in a screenshot. */
export function flyMode(args: { reduced: boolean; still: boolean; param: 'mid' | null }): FlyMode {
  if (args.param === 'mid') return 'mid';
  return args.reduced || args.still ? 'still' : 'play';
}

/** A point on the screen in CSS px. */
export interface Point {
  x: number;
  y: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the numbers start: the paper's middle, a little above its centre (the headline), rounded. */
export function originOf(rect: Box): Point {
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height * 0.4),
  };
}

/** Where the numbers land: the middle of the purse. */
export function targetOf(rect: Box): Point {
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
}
