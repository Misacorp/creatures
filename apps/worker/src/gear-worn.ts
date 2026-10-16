/**
 * What a creature's worn gear does, for every place that builds a creature's numbers: the raid and
 * dungeon fight inputs, the collection view, trips and the Workshop. One function folds the worn items
 * (`applyGear` of `@creatures/game`) so live play and the simulator stay in step.
 */
import {
  applyGear,
  effectiveStats,
  type CritBonus,
  type GearItem,
  type GearMods,
  type GearRules,
  type Stats,
} from '@creatures/game';
import { wearerOf, wornItems, type GearRow, type WornBySlot } from './gear-store';
import { speciesOf } from './species';

/** A creature's numbers with its worn gear folded in. */
export interface GearFolded {
  /** Effective stats (level, fusion) with the gear's Attack and HP. */
  stats: Stats;
  /** The species' crit bonus plus the gear's; absent when neither has one. */
  crit: CritBonus | undefined;
  /** The modifier sheet for `FightSlot.mods`; absent when the gear fills nothing. */
  mods: GearMods | undefined;
  /** Trip, Workshop and dungeon lines. */
  rules: GearRules;
  items: GearItem[];
}

/** Folds a creature's worn items into its fight numbers. Without items the plain stats come back. */
export function foldCreature(
  creature: { species: string; level: number; fusion_count: number },
  worn: WornBySlot | undefined,
): GearFolded {
  const species = speciesOf(creature.species);
  const items = wornItems(worn);
  const folded = applyGear(
    effectiveStats(species, creature.level, creature.fusion_count),
    species.crit,
    wearerOf(species),
    items,
  );
  return { ...folded, items };
}

/** The gear rules (trips, Workshop, dungeon rest) of one creature, read from the database. */
export function gearRulesOf(sql: SqlStorage, creature: { id: string; species: string }): GearRules {
  const worn: WornBySlot = {};
  for (const row of sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE equipped_on = ?', creature.id)
    .toArray()) {
    worn[row.slot] = row;
  }
  return foldCreature({ species: creature.species, level: 1, fusion_count: 0 }, worn).rules;
}

/** `value` times (10000 + `bp`) over 10000, floored. */
export function plusBp(value: number, bp: number): number {
  return Math.floor((value * (10_000 + bp)) / 10_000);
}

/** `value` times (10000 - `bp`) over 10000, floored (a reduction, at least 1 when `value` is). */
export function minusBp(value: number, bp: number): number {
  return Math.max(value > 0 ? 1 : 0, Math.floor((value * (10_000 - bp)) / 10_000));
}
