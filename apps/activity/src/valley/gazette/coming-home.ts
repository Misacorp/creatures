/**
 * "Coming home" (`systems/return.md`, V-RET-4a, Misa's answer Q56): closing the Gazette in any way plays a short
 * moment in which what the visit brought in flies into the HUD's purse as large numbers that count up as they
 * land. Everything is already in the purse before it plays, so skipping it loses nothing. This module is the
 * pure part: the count-up steps, the timing, the mode and the places the numbers fly between. Which currencies
 * the visit brought is `paperGains` (`stories.ts`): the amounts the paper shows.
 */
import { resourceName } from '@creatures/game';

/** How many numbers the count-up passes through, and how long the whole flight takes (ms). */
export const COUNT_STEPS = 10;
export const FLIGHT_MS = 1100;
/**
 * How long the purse's bump lasts after the numbers land, and how long "+N" stays beside the purse under reduced
 * motion: at least 5 s (or until a tap), long enough to read; the gains are also said in a status region
 * (`gainsText`), so a screen reader never depends on this note.
 */
export const BUMP_MS = 400;
export const NOTE_MS = 5000;

/** What the status region says when the moment starts: "Home: +52 Bait, +15 Essence" (the same amounts that fly). */
export function gainsText(gains: readonly { resource: string; amount: number }[]): string {
  if (gains.length === 0) return '';
  return `Home: ${gains.map((g) => `+${String(g.amount)} ${resourceName(g.resource)}`).join(', ')}`;
}

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

/** How the moment plays: `play` (it flies) or `still` (reduced motion or a screenshot: no flight, "+N" beside the purse). */
export type FlyMode = 'play' | 'still';

/** The mode: no flight under reduced motion or in a screenshot (`&bare=1`). */
export function flyMode(args: { reduced: boolean; still: boolean }): FlyMode {
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

/** The most coins that fly, and the fewest for any gain. */
export const MIN_COINS = 6;
export const MAX_COINS = 16;

/** How many coins fly for a gain: 6 for a small one, one more for every 15, at most 16; none for no gain. */
export function coinCount(amount: number): number {
  const total = Math.max(0, Math.floor(amount));
  if (total === 0) return 0;
  return Math.min(MAX_COINS, MIN_COINS + Math.floor(total / 15));
}

/**
 * Where coin `i` of `n` bursts to, in px from the paper's point: a fixed golden-angle spiral (a sunflower),
 * so the same gain always bursts the same way and the coins never overlap. Mostly up and sideways.
 */
export function coinOffset(i: number, n: number): Point {
  const angle = i * 2.399963229728653 - Math.PI / 2;
  const radius = 28 + 76 * Math.sqrt((i + 0.5) / Math.max(1, n));
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius * 0.7 - 24),
  };
}

/** The delay of coin `i` of `n` (ms): they leave one after another over the first 40% of the flight. */
export function coinDelay(i: number, n: number): number {
  return Math.round((i * FLIGHT_MS * 0.4) / Math.max(1, n));
}

/**
 * What the purse shows while the moment plays: the total less what has not landed yet, so it counts up to the
 * total by the end (display only: the server's total was in already). `counted` is how much has landed.
 */
export function purseDisplay(total: number, gain: number, counted: number): number {
  return total - gain + Math.min(Math.max(0, counted), gain);
}
