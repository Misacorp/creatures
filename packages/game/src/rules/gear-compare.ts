/**
 * What swapping one worn item for another would change for one creature (the item picker's compare
 * block): the creature's stats and crit with the swap against now, and the set bonuses gained or lost.
 * Both sides go through `applyGear` and `setCounts`, the functions the server folds a creature with, so
 * the numbers match what the server will compute. Pure; it does not check the wear rule (`wearBlock`).
 */
import type { CritBonus, Stats } from '../content/schema';
import { applyGear, setCounts, type FoldTalent, type GearItem, type Wearer } from './gear-items';

/** A stat the swap changes, with the change (Attack, HP and Speed in points; crit in basis points). */
export interface StatChange {
  stat: 'hp' | 'atk' | 'spd' | 'critChance' | 'critDamage';
  delta: number;
}

/** A set whose bonus changes: pieces worn now and with the swap (0 to 3). */
export interface SetChange {
  setId: string;
  before: number;
  after: number;
}

export interface GearComparison {
  /** Only the stats that change, in the order HP, Attack, Speed, crit chance, crit damage. */
  stats: StatChange[];
  /** Only the sets whose bonus changes (a count of 2 gives the first bonus, 3 both). */
  sets: SetChange[];
}

/** The set bonuses a count gives: 0, 1 (two pieces) or 2 (three pieces). */
function bonusesOf(count: number): number {
  return count >= 3 ? 2 : count >= 2 ? 1 : 0;
}

/**
 * Compares wearing `next` (in its own slot) with what the creature wears now. `stats` and `crit` are
 * the creature's effective stats and species crit bonus before gear; `worn` is everything it wears now
 * (with its rolled lines) and `talents` its active talents, as the server folds them.
 */
export function compareGear(input: {
  stats: Stats;
  crit: CritBonus | undefined;
  wearer: Wearer;
  worn: readonly GearItem[];
  next: GearItem;
  talents?: readonly FoldTalent[];
}): GearComparison {
  const { stats, crit, wearer, worn, next } = input;
  const talents = input.talents ?? [];
  const after = [...worn.filter((w) => w.slot !== next.slot), next];
  const was = applyGear(stats, crit, wearer, worn, talents);
  const now = applyGear(stats, crit, wearer, after, talents);
  const changes: StatChange[] = [
    { stat: 'hp', delta: now.stats.hp - was.stats.hp },
    { stat: 'atk', delta: now.stats.atk - was.stats.atk },
    { stat: 'spd', delta: now.stats.spd - was.stats.spd },
    { stat: 'critChance', delta: (now.crit?.chanceBp ?? 0) - (was.crit?.chanceBp ?? 0) },
    { stat: 'critDamage', delta: (now.crit?.damageBp ?? 0) - (was.crit?.damageBp ?? 0) },
  ];
  const before = setCounts(worn);
  const later = setCounts(after);
  const sets: SetChange[] = [];
  for (const setId of new Set([...before.keys(), ...later.keys()])) {
    const b = before.get(setId) ?? 0;
    const a = later.get(setId) ?? 0;
    if (bonusesOf(a) !== bonusesOf(b)) sets.push({ setId, before: b, after: a });
  }
  return { stats: changes.filter((c) => c.delta !== 0), sets };
}
