import type { Stats } from '../content/schema';

/**
 * A creature's power: effective Attack + floor(HP / 10), from `effectiveStats` (fusion included).
 * Integers only. Used for auto teams, the party snake draft and the balance simulator, so the game
 * and the simulator rank creatures the same way.
 */
export function creaturePower(stats: Pick<Stats, 'atk' | 'hp'>): number {
  return stats.atk + Math.floor(stats.hp / 10);
}

/** What ranking creatures by strength needs: the creature's power, when it was caught, and its id. */
export interface Rankable {
  id: string;
  /** `creaturePower` of the stats a fight uses (fusion and gear included). */
  power: number;
  /** When it was caught, in epoch ms. */
  caughtAt: number;
}

/**
 * The order of strength: the higher power first, then the older creature, then the smaller id, so
 * the order never depends on how the creatures were listed. The server's automatic team
 * (`autoTeam`) and the client's "Recommended" tag both rank with this one comparator.
 */
export function compareStrength(a: Rankable, b: Rankable): number {
  return b.power - a.power || a.caughtAt - b.caughtAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The `count` strongest of `creatures`, strongest first (`compareStrength`). */
export function strongest<T extends Rankable>(creatures: readonly T[], count: number): T[] {
  return [...creatures].sort(compareStrength).slice(0, count);
}
