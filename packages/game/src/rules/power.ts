import type { Stats } from '../content/schema';
import { RULES } from './config';

/**
 * A creature's dodge chance in basis points as the power score sees it: its Speed times
 * `RULES.combat.dodge.perSpeedBp` plus the flat dodge of its gear and talents (`SlotMods.dodgeBp`), capped
 * at `maxBp`. 0 while dodge is off (`RULES.combat.dodge.enabled`), so nothing about power changes until the switch flips.
 */
export function dodgeChanceBp(spd: number, flatBp = 0): number {
  const d = RULES.combat.dodge;
  if (!d.enabled) return 0;
  return Math.min(d.maxBp, Math.floor(Math.max(0, spd) * d.perSpeedBp) + Math.max(0, flatBp));
}

/**
 * A creature's power: effective Attack + floor(HP / 10), from `effectiveStats` (fusion included).
 * Integers only. Used for auto teams, the party snake draft and the balance simulator, so the game
 * and the simulator rank creatures the same way.
 *
 * With dodge on, a creature's HP counts as effective HP: `HP / (1 - dodge)` (30% dodge is a third more
 * HP), where the dodge is its Speed's share plus `flatDodgeBp` (Light-footed and talents; the caller
 * passes the sheet's `dodgeBp`, 0 when it does not know it). With dodge off the score is exactly Attack + HP / 10.
 */
export function creaturePower(
  stats: Pick<Stats, 'atk' | 'hp'> & { spd?: number },
  flatDodgeBp = 0,
): number {
  const dodge = dodgeChanceBp(stats.spd ?? 0, flatDodgeBp);
  const hp = dodge === 0 ? stats.hp : Math.floor((stats.hp * 10_000) / (10_000 - dodge));
  return stats.atk + Math.floor(hp / 10);
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
