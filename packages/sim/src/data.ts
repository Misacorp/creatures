import {
  GEAR_SLOTS,
  applyGear,
  content,
  creaturePower as statsPower,
  effectiveStats,
  type CreatureSpecies,
  type CritBonus,
  type GearItem,
  type GearMods,
  type GearRules,
  type GearSlot,
  type Stats,
  type Wearer,
} from '@creatures/game';
import type { SlotMods } from '@creatures/engine';

const byId = new Map<string, CreatureSpecies>(content.creatures.map((c) => [c.id, c]));

export function speciesOf(id: string): CreatureSpecies {
  const s = byId.get(id);
  if (s === undefined) throw new Error(`unknown species "${id}"`);
  return s;
}

/** Stage-1 species a player can catch. */
export const CATCHABLE: readonly CreatureSpecies[] = content.creatures.filter(
  (c) => c.catchable && c.stage === 1,
);

export const STARTERS: readonly CreatureSpecies[] = content.creatures.filter((c) => c.starter);

/** A gear item a player owns. `uid` is stable for the player. */
export interface SimItem extends GearItem {
  uid: number;
}

/** One creature a player owns (one per line; fusion adds to `fusionCount`). */
export interface OwnedCreature {
  /** `<playerId>/<line>`: stable across evolution. */
  id: string;
  line: string;
  /** Current species: the stage-1 species, or the evolved one after evolving. */
  speciesId: string;
  level: number;
  fusionCount: number;
  /** The gear it wears, one item per slot; absent: none. */
  items?: Partial<Record<GearSlot, SimItem>>;
  /**
   * A modifier sheet given to the creature besides its gear's (tests, and later talents and weather):
   * when set it is the sheet the fight uses, instead of the one its gear fills.
   */
  mods?: SlotMods;
}

const statCache = new Map<string, Stats>();

export function creatureStats(
  c: Pick<OwnedCreature, 'speciesId' | 'level' | 'fusionCount'>,
): Stats {
  const key = `${c.speciesId}:${c.level}:${c.fusionCount}`;
  let stats = statCache.get(key);
  if (stats === undefined) {
    stats = effectiveStats(speciesOf(c.speciesId), c.level, c.fusionCount);
    statCache.set(key, stats);
  }
  return stats;
}

/** The gear a creature wears, in slot order. */
export function wornOf(c: Pick<OwnedCreature, 'items'>): SimItem[] {
  if (c.items === undefined) return [];
  return GEAR_SLOTS.flatMap((slot) => {
    const item = c.items?.[slot];
    return item === undefined ? [] : [item];
  });
}

/** The facts about a creature the gear rules need. */
export function wearerOfCreature(c: Pick<OwnedCreature, 'speciesId'>): Wearer {
  const species = speciesOf(c.speciesId);
  return { role: species.role, element: species.element };
}

/** The same creature with nothing worn (for the share of power its gear gives). */
export function withoutGear(c: OwnedCreature): OwnedCreature {
  const rest: OwnedCreature = { ...c };
  delete rest.items;
  return rest;
}

/**
 * The numbers a fight uses: the effective stats with the worn items folded in (`applyGear`, the same
 * call the worker makes), the crit bonus, the modifier sheet its gear fills and the trip, Workshop and
 * dungeon rules. Without items these are the plain stats.
 */
export function foldedCreature(c: OwnedCreature): {
  stats: Stats;
  crit: CritBonus | undefined;
  mods: GearMods | undefined;
  rules: GearRules;
} {
  const species = speciesOf(c.speciesId);
  return applyGear(creatureStats(c), species.crit, wearerOfCreature(c), wornOf(c));
}

/** A creature's power without its gear: Attack + floor(HP / 10), the shared rule from `@creatures/game`. */
export function basePower(c: Pick<OwnedCreature, 'speciesId' | 'level' | 'fusionCount'>): number {
  return statsPower(creatureStats(c));
}

/** A creature's power as the raid sees it: gear included, like the worker's `power`. */
export function creaturePower(c: OwnedCreature): number {
  return c.items === undefined ? statsPower(creatureStats(c)) : statsPower(foldedCreature(c).stats);
}

/** Strongest first; ties by line id so the order is deterministic. */
export function byPowerDesc(creatures: readonly OwnedCreature[]): OwnedCreature[] {
  const power = new Map(creatures.map((c) => [c, creaturePower(c)]));
  return [...creatures].sort(
    (a, b) =>
      (power.get(b) as number) - (power.get(a) as number) ||
      (a.line < b.line ? -1 : a.line > b.line ? 1 : 0),
  );
}

export const TEAM_SIZE = 3;

/** The creatures a player brings to a raid: their 3 highest-power creatures. */
export function pickTeam(creatures: readonly OwnedCreature[]): OwnedCreature[] {
  return byPowerDesc(creatures).slice(0, TEAM_SIZE);
}

/** Team power = sum of `creaturePower` over the top 3 (fusion and gear included). */
export function teamPower(creatures: readonly OwnedCreature[]): number {
  return pickTeam(creatures).reduce((total, c) => total + creaturePower(c), 0);
}
