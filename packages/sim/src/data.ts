import {
  applyGear,
  content,
  creaturePower as statsPower,
  effectiveStats,
  type CreatureSpecies,
  type CritBonus,
  type GearItem,
  type Stats,
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

/** A gear item a player owns. `uid` is stable for the player; `improves` counts finished improve jobs. */
export interface SimItem extends GearItem {
  uid: number;
  improves: number;
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
  /** The gear item it wears (one slot); absent or null: none. */
  item?: SimItem | null;
  /**
   * The creature's modifier sheet (`FightSlot.mods`: gear lines, talents and weather folded into
   * numbers). Nothing in the game fills it yet; fights and the fight-scored power pass it on.
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

/**
 * The numbers a fight uses: the effective stats with the worn item folded in (`applyGear`, the same
 * call the worker makes), and the crit bonus. Without an item these are the plain stats.
 */
export function foldedCreature(c: OwnedCreature): { stats: Stats; crit: CritBonus | undefined } {
  const species = speciesOf(c.speciesId);
  return applyGear(creatureStats(c), species.crit, species.role, species.element, c.item ?? null);
}

/** A creature's power without its gear: Attack + floor(HP / 10), the shared rule from `@creatures/game`. */
export function basePower(c: Pick<OwnedCreature, 'speciesId' | 'level' | 'fusionCount'>): number {
  return statsPower(creatureStats(c));
}

/** A creature's power as the raid sees it: gear included, like the worker's `power`. */
export function creaturePower(c: OwnedCreature): number {
  return c.item === undefined || c.item === null
    ? statsPower(creatureStats(c))
    : statsPower(foldedCreature(c).stats);
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
