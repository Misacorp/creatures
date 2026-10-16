/**
 * Gear, parts and crafting rules (docs/design/gear-and-creatures-v2.md): pure functions over
 * `RULES.gear` and the gear content. The item model, its rolls and the fold of worn items into a
 * fight are in `gear-items.ts`; this file holds what an item costs, yields and takes to craft, the
 * Crafting skill, and every way an item drops. Randomness is injected (`Rng`).
 */
import { int, chance, pickWeighted, type Rng } from '../rng';
import { baseFor, gearBase, gearContent } from '../content/gear';
import {
  GEAR_SLOTS,
  tagElement,
  tagRole,
  type GearBase,
  type GearRarity,
} from '../content/gear-schema';
import type { Element } from '../content/schema';
import { RULES, type DurationId } from './config';
import {
  craftItemLevel,
  dropBase,
  dungeonItemLevel,
  expeditionItemLevel,
  festivalItemLevel,
  finaleItemLevel,
  rollItem,
  type GearItem,
} from './gear-items';

export * from './gear-items';

export const PART_KINDS = [
  'scrap',
  'tide-shard',
  'ember-shard',
  'grove-shard',
  'spark-shard',
  'glimmer',
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** Parts by kind; kinds that are absent count as 0. */
export type PartsBundle = Partial<Record<PartKind, number>>;

/** The jobs a player can start. Improve and enchant are gone; jobs started before v2 still finish. */
export const JOB_KINDS = ['craft', 'supply'] as const;
export type JobKind = (typeof JOB_KINDS)[number];
/** Job kinds a stored job may have: the current ones and the two removed in v2. */
export type StoredJobKind = JobKind | 'improve' | 'enchant';

/** The shard of an element. */
export function shardOf(element: Element): PartKind {
  return `${element}-shard`;
}

function addPart(bundle: PartsBundle, kind: PartKind, amount: number): void {
  if (amount > 0) bundle[kind] = (bundle[kind] ?? 0) + amount;
}

// --- Costs and yields ---

/** What dismantling an item returns: scrap, a shard of its element tag (neutral, explorer and role pieces give none), glimmer. */
export function dismantleYield(item: Pick<GearItem, 'baseId' | 'rarity'>): PartsBundle {
  const base = gearBase(item.baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${item.baseId}"`);
  const out: PartsBundle = {};
  addPart(out, 'scrap', RULES.gear.dismantle.scrap[item.rarity]);
  const element = tagElement(base.tag);
  if (element !== null) addPart(out, shardOf(element), RULES.gear.dismantle.shard[item.rarity]);
  addPart(out, 'glimmer', RULES.gear.dismantle.glimmer[item.rarity]);
  return out;
}

/**
 * The parts a craft costs: an element base takes scrap and one shard of its element; every other base
 * takes more scrap and no shard (choosing a shard for neutral pieces comes with the crafting loop).
 */
export function craftCost(baseId: string): PartsBundle {
  const base = gearBase(baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${baseId}"`);
  const out: PartsBundle = {};
  const element = tagElement(base.tag);
  if (element === null) {
    addPart(out, 'scrap', RULES.gear.craft.plainScrap);
  } else {
    addPart(out, 'scrap', RULES.gear.craft.scrap);
    addPart(out, shardOf(element), RULES.gear.craft.shard);
  }
  return out;
}

/** True if a base can be made from a blueprint: not a Festival piece and not role-locked. */
export function craftable(base: Pick<GearBase, 'festival' | 'tag'>): boolean {
  return base.festival !== true && tagRole(base.tag) === null;
}

/** The bases that can be learned as blueprints (everything craftable). */
export function blueprintBases(): GearBase[] {
  return gearContent.bases.filter(craftable);
}

/** The bases that can drop as gear: every plain base (role-locked Charms only through their own chance). */
export function droppableBases(): GearBase[] {
  return gearContent.bases.filter((b) => b.festival !== true);
}

// --- Jobs and the crafting skill ---

const HOUR_MS = 3_600_000;

/** A job's nominal length in hours, before the skill. */
export function jobHours(): number {
  return RULES.gear.craft.hours;
}

/** A skill level from total XP: 1 to the number of levels in `RULES.gear.skill.xpForLevel`. */
export function skillLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  const table = RULES.gear.skill.xpForLevel;
  let level = 1;
  for (let i = 0; i < table.length; i++) {
    if (xp >= (table[i] as number)) level = i + 1;
  }
  return level;
}

/** XP needed for the next level, or null at the top. */
export function nextSkillXp(level: number): number | null {
  return RULES.gear.skill.xpForLevel[level] ?? null;
}

export const MAX_SKILL_LEVEL = RULES.gear.skill.xpForLevel.length;

/**
 * How long a job takes in milliseconds: its hours, less `timeReductionBpPerLevel` for each skill level
 * above 1 and less `extraBp` (the Busy paws lines the creature wears), at least a tenth of the hours.
 */
export function jobDuration(level: number, extraBp = 0): number {
  const above = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.trunc(level)) - 1);
  const keepBp = Math.max(
    1_000,
    10_000 - RULES.gear.skill.timeReductionBpPerLevel * above - extraBp,
  );
  return Math.floor((jobHours() * HOUR_MS * keepBp) / 10_000);
}

/** XP a finished job gives: its nominal hours times `xpPerHour`, more by `extraBp` (Apprentice). The skill does not change it. */
export function jobXp(extraBp = 0): number {
  return Math.floor((jobHours() * RULES.gear.skill.xpPerHour * (10_000 + extraBp)) / 10_000);
}

const NEXT_RARITY: Record<GearRarity, GearRarity> = {
  common: 'rare',
  rare: 'epic',
  epic: 'epic',
  festival: 'festival',
};

/**
 * The rarity a craft comes out as: Common, or one higher with a chance of `rarityUpBpPerLevel` for
 * each skill level above 1. Always draws once.
 */
export function craftRarity(rng: Rng, level: number): GearRarity {
  const above = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.trunc(level)) - 1);
  const up = chance(rng, RULES.gear.skill.rarityUpBpPerLevel * above, 10_000);
  return up ? NEXT_RARITY.common : 'common';
}

const RARITY_ORDER: readonly GearRarity[] = ['common', 'rare', 'epic'];

/**
 * Crafts an item of a blueprint's base: its rarity (`craftRarity`), item level (2 x Crafting level) and
 * rolled lines. `floor` is the least rarity it may come out as (a craft started before gear v2 was
 * sized by its blueprint's rarity and keeps that promise; a Festival floor counts as Epic).
 */
export function rollCraft(
  rng: Rng,
  baseId: string,
  craftingLevel: number,
  floor?: GearRarity,
): GearItem {
  const drawn = craftRarity(rng, craftingLevel);
  const min: GearRarity = floor === 'festival' ? 'epic' : (floor ?? 'common');
  const rarity = RARITY_ORDER.indexOf(min) > RARITY_ORDER.indexOf(drawn) ? min : drawn;
  return rollItem(rng, { baseId, rarity, itemLevel: craftItemLevel(craftingLevel) });
}

// --- Drops ---

type DropRarity = 'common' | 'rare' | 'epic';

/** Finale gear odds in basis points at a Boss Rank; the rest is common. */
export function finaleDropOddsBp(rank: number): { rare: number; epic: number; common: number } {
  const { baseBp, perRankBp, maxBp } = RULES.gear.drops.finale;
  const above = Math.max(0, Math.trunc(rank) - 1);
  const rare = Math.min(maxBp.rare, baseBp.rare + perRankBp.rare * above);
  const epic = Math.min(maxBp.epic, baseBp.epic + perRankBp.epic * above);
  return { rare, epic, common: 10_000 - rare - epic };
}

function rollFinaleRarity(rng: Rng, rank: number): DropRarity {
  const odds = finaleDropOddsBp(rank);
  return pickWeighted<{ rarity: DropRarity; weight: number }>(rng, [
    { rarity: 'common', weight: odds.common },
    { rarity: 'rare', weight: odds.rare },
    { rarity: 'epic', weight: odds.epic },
  ]).rarity;
}

/**
 * A raid finale piece: the rarity by the Boss Rank's odds, the slot evenly, the boss's element as
 * its tag (1 Charm in 20 is role-locked instead), item level `3 + Boss Rank`, then its lines.
 */
export function rollFinaleItem(rng: Rng, rank: number, element: Element): GearItem {
  const rarity = rollFinaleRarity(rng, rank);
  const base = dropBase(rng, element, { roleCharm: true });
  return rollItem(rng, { baseId: base.id, rarity, itemLevel: finaleItemLevel(rank) });
}

/** What a won finale gives each participant: one gear piece or one blueprint. */
export type FinaleReward = { kind: 'gear'; item: GearItem } | { kind: 'blueprint'; baseId: string };

/**
 * The finale's reward slot. One draw decides gear or blueprint (`blueprintBp`). A blueprint is a base
 * the player does not know yet (`owned` holds the base ids they know), drawn evenly. When they know
 * them all, the reward is gear instead. Always exactly one gear piece or one blueprint.
 */
export function rollFinaleReward(
  rng: Rng,
  rank: number,
  element: Element,
  owned: ReadonlySet<string>,
): FinaleReward {
  if (chance(rng, RULES.gear.drops.finale.blueprintBp, 10_000)) {
    const unowned = blueprintBases().filter((b) => !owned.has(b.id));
    const base = unowned[int(rng, Math.max(1, unowned.length))];
    if (base !== undefined) return { kind: 'blueprint', baseId: base.id };
  }
  return { kind: 'gear', item: rollFinaleItem(rng, rank, element) };
}

/** The Festival piece for a Festival creature's element: the Festival base of that tag, else the first one. */
export function festivalBaseFor(element: Element): GearBase {
  const festival = gearContent.bases.filter((b) => b.festival === true);
  const base = festival.find((b) => b.tag === element) ?? festival[0];
  if (base === undefined) throw new Error('no festival gear');
  return base;
}

/** Rolls the Festival piece for an element: Festival rarity, item level `5 + Boss Rank` (at most 20). */
export function rollFestivalItem(rng: Rng, element: Element, rank: number): GearItem {
  const base = festivalBaseFor(element);
  return rollItem(rng, { baseId: base.id, rarity: 'festival', itemLevel: festivalItemLevel(rank) });
}

/** A dungeon piece: the room boss's element as its tag, item level by depth, then its lines. */
export function rollDungeonItem(
  rng: Rng,
  rarity: DropRarity,
  depth: number,
  landmark: boolean,
  element: Element,
): GearItem {
  const base = dropBase(rng, element);
  return rollItem(rng, { baseId: base.id, rarity, itemLevel: dungeonItemLevel(depth, landmark) });
}

/** Rolls a blueprint's base evenly among the bases that can be crafted. */
export function rollBlueprint(rng: Rng): string {
  const bases = blueprintBases();
  const base = bases[int(rng, bases.length)];
  if (base === undefined) throw new Error('no craftable bases');
  return base.id;
}

/**
 * A gear find of a trip's push-on goal: the place's element is the tag (the Old Crossroads gives the
 * explorer's Compass, a place without an element a neutral piece), item level twice the explorer's rank.
 */
export function rollExpeditionItem(
  rng: Rng,
  rarity: DropRarity,
  place: { element: Element | null; crossroads: boolean },
  explorerRank: number,
): GearItem {
  const itemLevel = expeditionItemLevel(explorerRank);
  if (place.crossroads) {
    const compass = gearContent.bases.find((b) => b.tag === 'explorer');
    if (compass === undefined) throw new Error('no explorer base');
    return rollItem(rng, { baseId: compass.id, rarity, itemLevel });
  }
  const base = dropBase(rng, place.element);
  return rollItem(rng, { baseId: base.id, rarity, itemLevel });
}

/** What an expedition claim drops besides the catches. */
export interface ExpeditionLoot {
  parts: PartsBundle;
  /** A blueprint base id, if one dropped (it may turn out to be a duplicate: the server decides). */
  blueprint: string | null;
}

/**
 * Loot of a claimed expedition (the first version of trips). Scrap follows the duration; a recalled
 * trip pays the share of it that was brought back (`caught` of `rolls`) and nothing else. A completed
 * trip also rolls a shard of the explorer's element, a glimmer and a blueprint at the duration's
 * odds. Draws in a fixed order, always the same number of draws for a completed trip.
 */
export function expeditionLoot(
  rng: Rng,
  duration: DurationId,
  explorerElement: Element,
  trip: { completed: boolean; caught: number; rolls: number },
): ExpeditionLoot {
  const table = RULES.gear.drops.expedition;
  const parts: PartsBundle = {};
  const full = table.scrap[duration];
  const scrap = trip.completed
    ? full
    : trip.rolls > 0
      ? Math.floor((full * Math.max(0, trip.caught)) / trip.rolls)
      : 0;
  addPart(parts, 'scrap', scrap);
  if (!trip.completed) return { parts, blueprint: null };
  if (chance(rng, table.shardBp[duration], 10_000)) addPart(parts, shardOf(explorerElement), 1);
  if (chance(rng, table.glimmerBp[duration], 10_000)) addPart(parts, 'glimmer', 1);
  const blueprint = chance(rng, table.blueprintBp[duration], 10_000) ? rollBlueprint(rng) : null;
  return { parts, blueprint };
}

/**
 * The welcome kit's rolls: a Common Hat at item level 1 (the neutral Trail Cap) and the blueprint of a
 * neutral piece (a Hat, a Scarf or a Charm, evenly), which costs scrap only, so the welcome scrap pays
 * for the first craft on day 1 (an element piece also needs a shard, which a new player does not have).
 */
export function rollWelcomeKit(rng: Rng): { item: GearItem; blueprint: string } {
  const hat = baseFor('hat', 'neutral');
  if (hat === undefined) throw new Error('no neutral hat');
  const item = rollItem(rng, {
    baseId: hat.id,
    rarity: 'common',
    itemLevel: RULES.gear.itemLevel.welcome,
  });
  const neutral = GEAR_SLOTS.flatMap((slot) => {
    const base = baseFor(slot, 'neutral');
    return base === undefined ? [] : [base];
  });
  const pick = neutral[int(rng, neutral.length)];
  if (pick === undefined) throw new Error('no neutral bases');
  return { item, blueprint: pick.id };
}

/** Adds two bundles (a new bundle is returned). */
export function addParts(a: PartsBundle, b: PartsBundle): PartsBundle {
  const out: PartsBundle = { ...a };
  for (const kind of PART_KINDS) addPart(out, kind, b[kind] ?? 0);
  return out;
}

// --- The conversion of old gear (one time) ---

/** What an old item cost to upgrade to its level: the Essence and scrap its upgrades took (refunded in full). */
export function legacyUpgradeSpent(
  rarity: GearRarity,
  level: number,
): { essence: number; scrap: number } {
  const t = RULES.gear.legacy.upgrade;
  const mult = t.multiplierBp[rarity];
  let essence = 0;
  let scrap = 0;
  for (let i = 0; i < Math.min(level, t.essence.length); i++) {
    essence += Math.max(1, Math.floor(((t.essence[i] as number) * mult) / 10_000));
    scrap += Math.max(1, Math.floor(((t.scrap[i] as number) * mult) / 10_000));
  }
  return { essence, scrap };
}

/** What dismantling an old item returned (the rules before v2), with the shard of its tint. */
export function legacyDismantleYield(rarity: GearRarity, tint: Element | null): PartsBundle {
  const t = RULES.gear.legacy.dismantle;
  const out: PartsBundle = {};
  addPart(out, 'scrap', t.scrap[rarity]);
  if (tint !== null) addPart(out, shardOf(tint), t.shard[rarity]);
  addPart(out, 'glimmer', t.glimmer[rarity]);
  return out;
}

/** The parts an old enchant cost: glimmer and shards of the enchant's element (refunded). */
export function legacyEnchantSpent(shard: Element): PartsBundle {
  const out: PartsBundle = {};
  addPart(out, 'glimmer', RULES.gear.legacy.enchant.glimmer);
  addPart(out, shardOf(shard), RULES.gear.legacy.enchant.shard);
  return out;
}
