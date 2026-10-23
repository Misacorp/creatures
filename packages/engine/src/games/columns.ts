/**
 * The team columns of the at-once team events (Bucket Brigade, Crate Tower, Kite Flight): every team
 * has its own spot side by side across the fixed 192 px scene, up to 16 of them (11 px apart), in a
 * shuffled order so nobody is always at the edge. The camera never moves.
 */
import type { Rng } from '@creatures/game';
import { shuffle } from './math';

/** The scene's middle and the span the columns share (scene px). */
const MIDDLE = 96;
const SPAN = 176;
/** Columns at most this far apart (a small field stays together in the middle). */
const MAX_STEP = 40;

/** The x of each column, left to right, for `count` columns. */
export function columnXs(count: number): number[] {
  const n = Math.max(1, count);
  const step = Math.min(MAX_STEP, Math.floor(SPAN / n));
  const start = Math.floor(MIDDLE - (step * (n - 1)) / 2);
  return Array.from({ length: n }, (_, i) => start + i * step);
}

/** The gap between two columns for `count` columns (px). */
export function columnStep(count: number): number {
  return Math.min(MAX_STEP, Math.floor(SPAN / Math.max(1, count)));
}

/** Each team's column (team index to column index), shuffled. */
export function columnOrder(rng: Rng, teams: number): number[] {
  return shuffle(
    rng,
    Array.from({ length: teams }, (_, i) => i),
  );
}

/** The members of each team (actor indices), in order of appearance. */
export function membersOf(teamOf: readonly number[], teams: number): number[][] {
  const out = Array.from({ length: teams }, (): number[] => []);
  teamOf.forEach((t, a) => out[t]?.push(a));
  return out;
}

/** How far apart a team's members stand side by side in a column (px). */
export function memberSpread(count: number): number {
  return Math.max(2, Math.min(6, Math.floor(columnStep(count) / 4)));
}
