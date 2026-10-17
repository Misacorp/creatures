import type { Element, Rarity } from '../content/schema';
import type { ExpeditionLength } from '../content/expedition-schema';
import { RULES } from './config';
import { shardOf, type PartsBundle } from './gear';
import type { RaidStage } from './loot';

/*
 * Creature experience, treats and ribbons (docs/design/gear-and-creatures-v2.md section 9). Pure
 * functions; the Worker and the journey simulator call these same ones.
 */

const E = RULES.experience;

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be an integer >= 1, got ${String(level)}`);
  }
}

function assertWhole(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole number >= 0, got ${String(value)}`);
  }
}

/** Experience needed to go from `level` to `level + 1`: 25 x L + 2 x L x L. */
export function expToNext(level: number): number {
  assertLevel(level);
  return E.perLevel * level + E.perLevelSquared * level * level;
}

/** Total experience from level 1 to `level` (0 at level 1). */
export function expToReach(level: number): number {
  assertLevel(level);
  let total = 0;
  for (let l = 1; l < level; l++) total += expToNext(l);
  return total;
}

// --- Ribbons ---

export type RibbonId = (typeof E.ribbons)[number]['id'];

/** How many ribbons a creature can hold: 1 Bronze, 2 Silver, 3 Gold. */
export const MAX_RIBBONS = E.ribbons.length + 1;

export interface RibbonDef {
  id: RibbonId;
  /** The level the creature waits at until it has the ribbon. */
  level: number;
  scrap: number;
  shards: number;
  glimmer: number;
  /** Finished trips of the creature itself. */
  trips: number;
}

/** The ribbon a creature at `level` holding `ribbons` ribbons is waiting for, or null (not at a gate). */
export function ribbonNeeded(level: number, ribbons: number): RibbonDef | null {
  const next = E.ribbons[ribbons];
  if (next === undefined || level !== next.level) return null;
  return next;
}

/** The level a creature holding `ribbons` ribbons cannot pass (the level of the next ribbon), or the top. */
export function ribbonCeiling(ribbons: number): number {
  return E.ribbons[ribbons]?.level ?? E.maxLevel;
}

/** What a ribbon costs in parts for a creature of `element` (shards of its own element). */
export function ribbonParts(ribbon: RibbonDef, element: Element): PartsBundle {
  const parts: PartsBundle = {};
  if (ribbon.scrap > 0) parts.scrap = ribbon.scrap;
  if (ribbon.shards > 0) parts[shardOf(element)] = ribbon.shards;
  if (ribbon.glimmer > 0) parts.glimmer = ribbon.glimmer;
  return parts;
}

/**
 * The ribbons a creature of an existing player gets free when the system starts (spec 12): Bronze when
 * it is past level 10, Silver when it is past level 20, Gold at level 30.
 */
export function ribbonsForLevel(level: number): number {
  assertLevel(level);
  if (level >= E.maxLevel) return MAX_RIBBONS;
  return E.ribbons.filter((ribbon) => level > ribbon.level).length;
}

// --- Gaining experience ---

export interface ExpState {
  level: number;
  /** Experience banked towards the next level. */
  exp: number;
  /** Ribbons held: 0 none, 1 Bronze, 2 Silver, 3 Gold. */
  ribbons: number;
  /** The species' level cap (a first stage waits for its evolution at 15). */
  levelCap: number;
}

export interface ExpGain extends ExpState {
  levelsGained: number;
  /** True when the creature waits at a level it may not leave yet and holds the experience for the next one. */
  waiting: boolean;
  /** The Gold Ribbon was awarded by this gain (the creature reached the top level). */
  gold: boolean;
}

/**
 * Adds experience to a creature. It levels up while it has the experience and the way is open: the
 * species' level cap and the next ribbon's level are the ceiling. At the ceiling the experience banks, at
 * most the next level's need (a ribbon, or an evolution, then spends it: call again with 0). Reaching
 * `maxLevel` awards the Gold Ribbon and keeps no experience. Whole numbers only.
 */
export function addExperience(state: ExpState, gained: number): ExpGain {
  assertLevel(state.level);
  assertWhole(state.exp, 'exp');
  assertWhole(gained, 'gained');
  let { level, exp, ribbons } = state;
  exp += gained;
  const ceiling = Math.min(state.levelCap, E.maxLevel, ribbonCeiling(ribbons));
  const start = level;
  while (level < ceiling) {
    const need = expToNext(level);
    if (exp < need) break;
    exp -= need;
    level += 1;
  }
  let gold = false;
  let waiting = false;
  if (level >= E.maxLevel) {
    // The top: nothing to bank. The Gold Ribbon is the reward.
    exp = 0;
    if (ribbons < MAX_RIBBONS) {
      ribbons = MAX_RIBBONS;
      gold = true;
    }
  } else if (level >= ceiling) {
    const need = expToNext(level);
    waiting = exp >= need;
    exp = Math.min(exp, need);
  }
  return {
    level,
    exp,
    ribbons,
    levelCap: state.levelCap,
    levelsGained: level - start,
    waiting,
    gold,
  };
}

// --- What each activity gives ---

/**
 * The day's effect on experience (a Boon or Omen: `rules/weather.ts`): basis points on top, and the number
 * a treat multiplies by when the day changes it (Hearty Breakfast triples instead of doubling). Absent:
 * none. Applied last, after the treat, and rounded down.
 */
export interface ExpWeather {
  bp: number;
  treatMultiplier: number | null;
}

/** `base` experience, with the treat's multiplier and then the day's effect. Whole numbers only. */
function withDay(base: number, treat: boolean, weather: ExpWeather | undefined): number {
  const times = treat ? (weather?.treatMultiplier ?? E.treat.multiplier) : 1;
  const gained = base * times;
  return weather === undefined || weather.bp === 0
    ? gained
    : Math.max(0, Math.floor((gained * (10_000 + weather.bp)) / 10_000));
}

/** Experience a finished trip gives its explorer (a recall or a failed trip gives none: do not call). */
export function tripExperience(
  length: ExpeditionLength,
  treat: boolean,
  weather?: ExpWeather,
): number {
  return withDay(E.trip[length], treat, weather);
}

/** Experience each creature of the dungeon team gets: per room cleared, and a full clear on top. */
export function dungeonExperience(
  roomsCleared: number,
  cleared: boolean,
  treat: boolean,
  weather?: ExpWeather,
): number {
  assertWhole(roomsCleared, 'roomsCleared');
  const base = E.dungeon.perRoom * roomsCleared + (cleared ? E.dungeon.fullClear : 0);
  return withDay(base, treat, weather);
}

/** Experience each creature that fought a raid stage gets: the stage's, times 1.5 when it was cleared. No treats. */
export function raidExperience(stage: RaidStage, cleared: boolean, weather?: ExpWeather): number {
  const base = E.raid[stage];
  return withDay(cleared ? Math.floor((base * E.raid.clearedBp) / 10_000) : base, false, weather);
}

/** Experience a Workshop job gives its worker: `workshopPerHour` per hour of nominal work, rounded down. */
export function workshopExperience(
  workMinutes: number,
  treat: boolean,
  weather?: ExpWeather,
): number {
  assertWhole(workMinutes, 'workMinutes');
  return withDay(Math.floor((workMinutes * E.workshopPerHour) / 60), treat, weather);
}

/** The Bait a treat costs for a creature of `level`: 3 + half the level, rounded up. */
export function treatCost(level: number): number {
  assertLevel(level);
  return E.treat.baitBase + Math.ceil(level / 2);
}

// --- The unlock ladder ---

export interface Unlock {
  level: number;
  /** A short player-facing name: "Scarf", "Bronze Ribbon". */
  name: string;
}

/**
 * What a creature's level brings (the ladder of spec 9.3a) in level order, for a species of `rarity`
 * that evolves at `evolveLevel` (omit for one that does not). Slot levels, the ability level and the
 * talent slots come from the rules, so a change there moves the ladder.
 */
export function unlockLadder(rarity: Rarity, evolveLevel?: number): Unlock[] {
  const slots = RULES.gear.slotUnlockLevel;
  const bronze = E.ribbons[0]?.level ?? 10;
  const silver = E.ribbons[1]?.level ?? 20;
  const ladder: Unlock[] = [
    { level: slots.scarf, name: 'Scarf' },
    { level: bronze, name: 'Bronze Ribbon' },
    { level: slots.charm, name: 'Charm' },
    { level: silver, name: 'Silver Ribbon' },
    { level: E.maxLevel, name: 'Gold Ribbon' },
  ];
  // The ability and the talent slots are part of the ladder too, at their own levels.
  if (RULES.abilities.unlockLevel !== bronze) {
    ladder.push({ level: RULES.abilities.unlockLevel, name: 'Ability' });
  }
  if (evolveLevel !== undefined) ladder.push({ level: evolveLevel, name: 'Evolution' });
  const slotLevels = RULES.talents.slotLevels;
  const slotCount = RULES.talents.slotsByRarity[rarity];
  const second = slotLevels[1];
  if (second !== undefined && slotCount >= 2) ladder.push({ level: second, name: 'Second talent' });
  const third = slotLevels[2];
  if (third !== undefined && slotCount >= 3) ladder.push({ level: third, name: 'Third talent' });
  return ladder.sort((a, b) => a.level - b.level);
}

/** The next unlock above `level` (a ribbon that is not earned yet still shows at its level), or null at the top. */
export function nextUnlock(level: number, rarity: Rarity, evolveLevel?: number): Unlock | null {
  assertLevel(level);
  return unlockLadder(rarity, evolveLevel).find((u) => u.level > level) ?? null;
}
