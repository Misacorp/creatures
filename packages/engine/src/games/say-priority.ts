/**
 * How much each commentary line matters, so a show always says the important things: who is out and
 * who won first, then the twists (Steam, a ghost round, a zap, a save), then the filler (a gulp, a burp,
 * "does not budge") only where there is room.
 */
import type { GamesSayKey } from '@creatures/game';

export const FILLER = 1;
export const TWIST = 2;
export const IMPORTANT = 3;
export const MUST = 4;
/** A filler line is used at most this many times in one show. */
export const FILLER_REPEATS = 2;

/** Elimination lines, and the line that names two creatures leaving at once. */
export const PAIR_LINES: ReadonlyMap<string, GamesSayKey> = new Map<string, GamesSayKey>([
  ['endure.out', 'endure.out2'],
  ['chase.squash', 'chase.squash2'],
  ['feast.burst', 'feast.burst2'],
  ['swim.out', 'swim.out2'],
  ['shove.splash', 'shove.splash2'],
]);

/** Eliminations and the race for the win. */
const IMPORTANT_LINES: ReadonlySet<string> = new Set([
  'endure.out',
  'endure.out2',
  'endure.duel',
  'chase.squash',
  'chase.squash2',
  'chase.last',
  'chase.smash',
  'feast.burst',
  'feast.burst2',
  'feast.duel',
  'swim.out',
  'swim.out2',
  'swim.finish',
  'shove.splash',
  'shove.splash2',
  'shove.duel',
]);

/** Reactions and twists. */
const TWIST_LINES: ReadonlySet<string> = new Set([
  'endure.steam',
  'endure.splash',
  'endure.overload',
  'endure.wildfire',
  'endure.stubborn',
  'endure.half',
  'chase.duck',
  'chase.finish',
  'chase.stubborn',
  'chase.faster',
  'swim.tag',
  'feast.ghost',
  'feast.encore',
  'feast.scorch',
  'feast.stubborn',
  'swim.zap',
  'swim.shark',
  'swim.stubborn',
  'swim.lap',
  'shove.teeter',
  'shove.melt',
  'shove.shrink',
]);

/** The priority of a line: the start, the win and the draw must be said; the rest by kind of moment. */
export function sayPriority(line: GamesSayKey): number {
  if (line.endsWith('.start') || line.endsWith('.win') || line.endsWith('.draw')) return MUST;
  if (IMPORTANT_LINES.has(line)) return IMPORTANT;
  if (TWIST_LINES.has(line)) return TWIST;
  return FILLER;
}
