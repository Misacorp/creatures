/**
 * What a creature's worn gear does, for every place that builds a creature's numbers: the raid and
 * dungeon fight inputs, the collection view, trips and the Workshop. One function folds the worn items
 * (`applyGear` of `@creatures/game`) so live play and the simulator stay in step.
 */
import {
  applyGear,
  effectiveStats,
  type CritBonus,
  type FoldTalent,
  type GearItem,
  type GearMods,
  type GearRules,
  type Stats,
} from '@creatures/game';
import { wearerOf, wornItems, type GearRow, type WornBySlot } from './gear-store';
import { speciesOf } from './species';
import { activeTalentsOf } from './talent-store';

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

/**
 * Folds a creature's worn items and its active talents (`talents`: its signature and the talents in its
 * open slots) into its fight numbers, with the same function. Without either the plain stats come back.
 */
export function foldCreature(
  creature: { species: string; level: number; fusion_count: number },
  worn: WornBySlot | undefined,
  talents: readonly FoldTalent[] = [],
): GearFolded {
  const species = speciesOf(creature.species);
  const items = wornItems(worn);
  const folded = applyGear(
    effectiveStats(species, creature.level, creature.fusion_count),
    species.crit,
    wearerOf(species),
    items,
    talents,
  );
  return { ...folded, items };
}

/**
 * The rules of one creature outside the fight (trips, Workshop, dungeon rest), from its worn gear and its
 * active talents, read from the database. The level matters for talents (a slot opens at a level), so
 * callers pass the creature's own.
 */
export function gearRulesOf(
  sql: SqlStorage,
  creature: { id: string; species: string; level: number },
): GearRules {
  const worn: WornBySlot = {};
  for (const row of sql
    .exec<GearRow>('SELECT * FROM gear_items WHERE equipped_on = ?', creature.id)
    .toArray()) {
    worn[row.slot] = row;
  }
  return foldCreature(
    { species: creature.species, level: 1, fusion_count: 0 },
    worn,
    activeTalentsOf(sql, creature),
  ).rules;
}

/**
 * The flat dodge (basis points) a creature's worn gear and talents add on top of its Speed part: the
 * modifier sheet's `dodgeBp`, 0 when the sheet is absent or has none. The creature page shows
 * `min(maxBp, Speed x perSpeedBp + this)`, the number the fight uses (`creatureDodgeBp` in the engine).
 */
export function flatDodgeBp(mods: GearMods | undefined): number {
  const value = mods?.dodgeBp ?? 0;
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/** `value` times (10000 - `bp`) over 10000, floored (a reduction, at least 1 when `value` is). */
export function minusBp(value: number, bp: number): number {
  return Math.max(value > 0 ? 1 : 0, Math.floor((value * (10_000 - bp)) / 10_000));
}
