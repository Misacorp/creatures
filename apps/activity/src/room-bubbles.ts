/**
 * Speech bubbles of the living room: the short lines creatures say, and when and who. Local flavour
 * only (each viewer sees their own, nothing is sent). Randomness comes from an injected `Rng`; the
 * room passes a crypto-backed one (`Math.random` is banned). Text only.
 */
import { int, type Rng } from '@creatures/game';

/** Emotes and short cozy lines. Keep them short: a bubble is only a few characters wide. */
export const BUBBLE_LINES: readonly string[] = [
  '♪',
  '♪ ♫',
  'zzz',
  '!',
  '...',
  'hehe',
  '?',
  '♥',
  'cozy',
  'warm here',
  'nice rug',
  'so snug',
  'snooze',
  'tea time',
  'good fire',
];

export const BUBBLE_MIN_GAP_S = 8;
export const BUBBLE_MAX_GAP_S = 20;
/** How long a bubble stays up. */
export const BUBBLE_SHOW_MS = 3000;

/** The wait before the next bubble, in ms: a whole number of seconds from 8 to 20. */
export function bubbleGap(rng: Rng): number {
  return (BUBBLE_MIN_GAP_S + int(rng, BUBBLE_MAX_GAP_S - BUBBLE_MIN_GAP_S + 1)) * 1000;
}

/** One line at random. */
export function bubbleLine(rng: Rng): string {
  return BUBBLE_LINES[int(rng, BUBBLE_LINES.length)] ?? '...';
}

/** One of `count` creatures at random (an index), or null when nobody is there. */
export function bubbleSpeaker(rng: Rng, count: number): number | null {
  return count > 0 ? int(rng, count) : null;
}
