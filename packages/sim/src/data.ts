import {
  GEAR_SLOTS,
  activeTalents,
  applyGear,
  content,
  creaturePower as statsPower,
  effectiveStats,
  type CreatureSpecies,
  type CritBonus,
  type FoldKit,
  type FoldTalent,
  type GearItem,
  type GearMods,
  type GearRules,
  type GearSlot,
  type HeldTalent,
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
  /** Fusion points gathered; absent: the points of its `fusionCount` (a creature a test made at a fusion level). */
  fusionPoints?: number;
  /**
   * Experience banked towards the next level, and the ribbons held (0 none, 1 Bronze, 2 Silver, 3 Gold).
   * Absent: nothing banked, and the ribbons its level is past (a creature a test made at a level).
   */
  exp?: number;
  ribbons?: number;
  /** The gear it wears, one item per slot; absent: none. */
  items?: Partial<Record<GearSlot, SimItem>>;
  /**
   * A modifier sheet given to the creature besides its gear's (tests, and later weather): when set it is
   * the sheet the fight uses, instead of the one its gear fills.
   */
  mods?: SlotMods;
  /**
   * Its Talent Book: every talent it has held, with the slot (1 to 3) it sits in now or null. Absent: none
   * (a creature made by a test; every creature the sim makes has its first talent).
   */
  talents?: { book: HeldTalent[] };
  /** A study switch: the creature fights with no talents at all, not even a signature. */
  noTalents?: true;
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

/** The talents that are active on a creature now: its signature and the talents in its open slots. */
export function activeTalentsOf(
  c: Pick<OwnedCreature, 'speciesId' | 'level' | 'talents' | 'noTalents'>,
): FoldTalent[] {
  if (c.noTalents === true) return [];
  const species = speciesOf(c.speciesId);
  return activeTalents(species.line, species.rarity, c.level, c.talents?.book ?? []);
}

/** The same creature with nothing worn (for the share of power its gear gives). */
export function withoutGear(c: OwnedCreature): OwnedCreature {
  const rest: OwnedCreature = { ...c };
  delete rest.items;
  return rest;
}

/** The same creature with its talents taken away (for the share of power its talents give). */
export function withoutTalents(c: OwnedCreature): OwnedCreature {
  const rest: OwnedCreature = { ...c, noTalents: true };
  delete rest.talents;
  return rest;
}

/** The same creature with its fusions taken away (for the share of power fusion gives). */
export function withoutFusion(c: OwnedCreature): OwnedCreature {
  return { ...c, fusionCount: 0 };
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
  return applyGear(
    creatureStats(c),
    species.crit,
    wearerOfCreature(c),
    wornOf(c),
    activeTalentsOf(c),
  );
}

/**
 * What a creature's gear fold needs to run again once its place in a row is known (the position lines and gear
 * sets of the row, `placeSlots` of the engine), as the worker's `TeamCreature.kit`. A creature with a modifier
 * sheet given to it (`mods`: a study or test override) has none, so that sheet stays what the fight uses.
 */
export function foldKitOf(c: OwnedCreature): FoldKit | undefined {
  if (c.mods !== undefined) return undefined;
  const species = speciesOf(c.speciesId);
  return {
    stats: creatureStats(c),
    crit: species.crit,
    wearer: wearerOfCreature(c),
    items: wornOf(c),
    talents: activeTalentsOf(c),
  };
}

/** The kits of creatures by fight slot id (`OwnedCreature.id`), without the ones that have none. */
export function foldKitsOf(creatures: readonly OwnedCreature[]): Map<string, FoldKit> {
  const out = new Map<string, FoldKit>();
  for (const c of creatures) {
    const kit = foldKitOf(c);
    if (kit !== undefined) out.set(c.id, kit);
  }
  return out;
}

/** True when something is folded into the creature's numbers: worn items or active talents. */
function isFolded(c: OwnedCreature): boolean {
  return c.items !== undefined || activeTalentsOf(c).length > 0;
}

/** A creature's power without its gear: Attack + floor(HP / 10), the shared rule from `@creatures/game`. */
export function basePower(c: Pick<OwnedCreature, 'speciesId' | 'level' | 'fusionCount'>): number {
  return statsPower(creatureStats(c));
}

/** A creature's power as the raid sees it: gear included, like the worker's `power`. */
export function creaturePower(c: OwnedCreature): number {
  if (!isFolded(c)) return statsPower(creatureStats(c));
  const folded = foldedCreature(c);
  // With dodge on the score counts effective HP: Speed's share and the sheet's flat dodge.
  return statsPower(folded.stats, folded.mods?.dodgeBp ?? 0);
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
