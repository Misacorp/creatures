import type { Stats } from '../content/schema';

/**
 * A creature's power: effective Attack + floor(HP / 10), from `effectiveStats` (fusion included).
 * Integers only. Used for auto teams, the party snake draft and the balance simulator, so the game
 * and the simulator rank creatures the same way.
 */
export function creaturePower(stats: Pick<Stats, 'atk' | 'hp'>): number {
  return stats.atk + Math.floor(stats.hp / 10);
}
