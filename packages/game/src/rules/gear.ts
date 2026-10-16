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
import { ELEMENTS, type Element } from '../content/schema';
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
export const JOB_KINDS = ['craft', 'supply', 'dismantle'] as const;
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

/** An inclusive range of whole numbers. */
export interface Range {
  min: number;
  max: number;
}

/** What a dismantle job can return, as the screen shows it before the job starts. */
export interface DismantleRange {
  scrap: Range;
  /** Shards; `element` is the shard's kind when the item has an element, null for a random kind (or no shards). */
  shards: Range & { element: Element | null };
  glimmer: Range;
  essence: Range;
}

/** What dismantling needs to know about an item. */
export type DismantleItem = Pick<GearItem, 'baseId' | 'rarity'> & { itemLevel?: number };

function itemBase(item: DismantleItem): GearBase {
  const base = gearBase(item.baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${item.baseId}"`);
  return base;
}

/**
 * The scrap a craft of this base costs at this item level: the base's own cost (an element base's, or the
 * plain one of every other base, role-locked and Festival pieces included) plus 1 for every
 * `scrapPerItemLevels` item levels. Dropped items use the same table, so a piece is worth the same
 * whoever made it.
 */
export function craftScrapCost(baseId: string, itemLevel: number): number {
  const base = gearBase(baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${baseId}"`);
  const own = tagElement(base.tag) === null ? RULES.gear.craft.plainScrap : RULES.gear.craft.scrap;
  return own + Math.floor(Math.max(0, itemLevel) / RULES.gear.craft.scrapPerItemLevels);
}

/** One item's ranges: its rarity's, with the scrap a share (under half) of its craft scrap cost. */
function itemRange(item: DismantleItem): {
  scrap: readonly [number, number];
  shard: readonly [number, number];
  glimmer: readonly [number, number];
  essence: readonly [number, number];
} {
  const table = RULES.gear.dismantle;
  const r = table.ranges[item.rarity];
  const cost = craftScrapCost(item.baseId, item.itemLevel ?? 1);
  const [lo, hi] = table.scrapShareBp[item.rarity];
  const min = Math.max(1, Math.floor((cost * lo) / 10_000));
  return {
    scrap: [min, Math.max(min, Math.floor((cost * hi) / 10_000))],
    shard: r.shard,
    glimmer: r.glimmer,
    essence: r.essence,
  };
}

/**
 * The refund range of a dismantle job over `items` (the sum of each item's range). It does not depend
 * on who works: the dismantler's Crafting level changes nothing here. Shards are of the item's element
 * when it has one (a single item); neutral, explorer and role pieces give a random kind.
 */
export function dismantleRange(items: readonly DismantleItem[]): DismantleRange {
  const out: DismantleRange = {
    scrap: { min: 0, max: 0 },
    shards: { min: 0, max: 0, element: null },
    glimmer: { min: 0, max: 0 },
    essence: { min: 0, max: 0 },
  };
  for (const item of items) {
    const r = itemRange(item);
    out.scrap.min += r.scrap[0];
    out.scrap.max += r.scrap[1];
    out.shards.min += r.shard[0];
    out.shards.max += r.shard[1];
    out.glimmer.min += r.glimmer[0];
    out.glimmer.max += r.glimmer[1];
    out.essence.min += r.essence[0];
    out.essence.max += r.essence[1];
  }
  const only = items.length === 1 && items[0] !== undefined ? items[0] : undefined;
  if (only !== undefined) out.shards.element = tagElement(itemBase(only).tag);
  return out;
}

/**
 * What an item returns when it cannot be rolled (a drop that does not fit a full bag): the bottom of
 * its range, with a shard only for an element piece and no Essence.
 */
export function dismantleYield(item: DismantleItem): PartsBundle {
  const element = tagElement(itemBase(item).tag);
  const r = itemRange(item);
  const out: PartsBundle = {};
  addPart(out, 'scrap', r.scrap[0]);
  if (element !== null) addPart(out, shardOf(element), r.shard[0]);
  addPart(out, 'glimmer', r.glimmer[0]);
  return out;
}

/**
 * What the day's Boon changes in the Workshop (Market Day, `decisions.md` 2026-10-16: it boosts only the
 * day's first craft and first 2 dismantle jobs, so hoarding until it rolls pays nothing). The Workshop
 * asks `Gear.workshopMods` for these when a job is priced and when it is rolled; nothing sets them yet,
 * the Boons step does. Both are optional and change nothing when absent.
 */
export interface WorkshopMods {
  /** Added to a craft's one-step-up chance, in basis points (Market Day: 500). */
  stepUpBonusBp?: number;
  /** A dismantle refund rolls the top of every range. */
  dismantleTopOfRange?: boolean;
}

/** The result of a dismantle claim: parts, and Essence (which goes to the ledger, not to the parts). */
export interface DismantleRoll {
  parts: PartsBundle;
  essence: number;
}

function between(rng: Rng, lo: number, hi: number, top = false): number {
  return top || hi <= lo ? hi : lo + int(rng, hi - lo + 1);
}

/**
 * Rolls the refund of every item with the injected (live) RNG, item by item: scrap, shards (each of the
 * item's element, or of a random one for pieces without), glimmer, Essence. The draws follow the items
 * in order, so a fixed seed always gives the same refund. Nothing about the dismantler goes in.
 */
export function rollDismantle(
  rng: Rng,
  items: readonly DismantleItem[],
  mods: WorkshopMods = {},
): DismantleRoll {
  const top = mods.dismantleTopOfRange === true;
  const parts: PartsBundle = {};
  let essence = 0;
  for (const item of items) {
    const r = itemRange(item);
    const element = tagElement(itemBase(item).tag);
    addPart(parts, 'scrap', between(rng, r.scrap[0], r.scrap[1], top));
    const shards = between(rng, r.shard[0], r.shard[1], top);
    for (let i = 0; i < shards; i++) {
      const kind = element ?? (ELEMENTS[int(rng, ELEMENTS.length)] as Element);
      addPart(parts, shardOf(kind), 1);
    }
    addPart(parts, 'glimmer', between(rng, r.glimmer[0], r.glimmer[1], top));
    essence += between(rng, r.essence[0], r.essence[1], top);
  }
  return { parts, essence };
}

/** Why a set of items cannot go in one dismantle job, or null: Commons bundle up to 5, anything else goes alone. */
export function dismantleBundleError(
  rarities: readonly GearRarity[],
): 'empty' | 'too_many' | 'mixed' | null {
  if (rarities.length === 0) return 'empty';
  if (rarities.length > RULES.gear.dismantle.bundleMax) return 'too_many';
  if (rarities.length > 1 && rarities.some((r) => r !== 'common')) return 'mixed';
  return null;
}

/** The nominal hours of a dismantle job for items of this rarity (a bundle of Commons is one job). */
export function dismantleHours(rarity: GearRarity): number {
  return RULES.gear.dismantle.minutes[rarity] / 60;
}

/** Crafting XP of a dismantle job: its nominal hours at `xpPerHour`, at least `minXp`, more by `extraBp` (Apprentice). */
export function dismantleXp(rarity: GearRarity, extraBp = 0): number {
  const base = Math.max(
    RULES.gear.dismantle.minXp,
    Math.floor(dismantleHours(rarity) * RULES.gear.skill.xpPerHour),
  );
  return Math.floor((base * (10_000 + extraBp)) / 10_000);
}

/**
 * The chance (basis points) that each blueprintable item of a dismantle job teaches its blueprint (or,
 * for one already known, adds a well-thumbed mark): 6% and 1 point for each Crafting level of the worker.
 */
export function dismantleLearnBp(craftingLevel: number): number {
  const level = Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.trunc(craftingLevel)));
  const t = RULES.gear.dismantle;
  return Math.min(10_000, t.learnBp + t.learnBpPerLevel * level);
}

/**
 * The parts a plain craft of an item level costs: an element base takes scrap and one shard of its
 * element; every other base takes more scrap and no shard. The scrap grows with the item level
 * (`craftScrapCost`).
 */
export function craftCost(baseId: string, itemLevel: number): PartsBundle {
  const base = gearBase(baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${baseId}"`);
  const out: PartsBundle = {};
  addPart(out, 'scrap', craftScrapCost(baseId, itemLevel));
  const element = tagElement(base.tag);
  if (element !== null) addPart(out, shardOf(element), RULES.gear.craft.shard);
  return out;
}

/** What a craft is aimed at: a plain craft (always a Common), or a Reach for a Rare or an Epic. */
export const REACH_IDS = ['none', 'rare', 'epic'] as const;
export type ReachId = (typeof REACH_IDS)[number];

/** The rules of a Reach (everything but `none`). */
function reachRules(
  reach: Exclude<ReachId, 'none'>,
): (typeof RULES.gear.craft.reach)[typeof reach] {
  return RULES.gear.craft.reach[reach];
}

/** The Crafting level a Reach asks for (1 for a plain craft). */
export function reachMinLevel(reach: ReachId): number {
  return reach === 'none' ? 1 : reachRules(reach).minLevel;
}

/** The nominal hours of a craft job: 3 for a plain craft, longer for a Reach. */
export function craftHours(reach: ReachId): number {
  return reach === 'none' ? RULES.gear.craft.hours : reachRules(reach).hours;
}

/**
 * Shards of any kind, taken from the biggest piles first (ties in element order). Used where a base has
 * no element of its own. When the player holds fewer than `count`, the whole amount is put on the
 * biggest pile, so the payment fails there and the screen shows what is missing.
 */
export function anyShards(held: PartsBundle, count: number): PartsBundle {
  const out: PartsBundle = {};
  if (count <= 0) return out;
  const piles = ELEMENTS.map((e) => ({ kind: shardOf(e), have: held[shardOf(e)] ?? 0 })).sort(
    (a, b) => b.have - a.have,
  );
  const total = piles.reduce((n, p) => n + p.have, 0);
  const first = piles[0];
  if (first === undefined) return out;
  if (total < count) {
    addPart(out, first.kind, count);
    return out;
  }
  let left = count;
  for (const pile of piles) {
    const take = Math.min(left, pile.have);
    addPart(out, pile.kind, take);
    left -= take;
  }
  return out;
}

/**
 * What a craft costs: parts (the plain craft's, plus a Reach's shards and glimmer; the shards of a
 * base without an element come from `held`, see `anyShards`) and Essence. Amounts are exact: this is
 * what the server takes.
 */
export function craftCostFor(
  baseId: string,
  reach: ReachId,
  held: PartsBundle,
  itemLevel: number,
): { parts: PartsBundle; essence: number } {
  const parts = craftCost(baseId, itemLevel);
  if (reach === 'none') return { parts, essence: 0 };
  const rules = reachRules(reach);
  const element = tagElement(gearBase(baseId)?.tag ?? 'neutral');
  if (element !== null) {
    addPart(parts, shardOf(element), rules.shard);
  } else {
    // Any shard: the pile choice sees what is left once the plain cost is counted (it has no shards).
    for (const [kind, n] of Object.entries(anyShards(held, rules.shard)) as [PartKind, number][]) {
      addPart(parts, kind, n);
    }
  }
  addPart(parts, 'glimmer', rules.glimmer);
  return { parts, essence: rules.essence };
}

/** Rarity odds in basis points (they add up to 10,000). */
export interface CraftOdds {
  common: number;
  rare: number;
  epic: number;
}

/**
 * The one-step-up chance of a craft in basis points: 1 point per Crafting level above 1 (as
 * `rarityUpBpPerLevel`) and 1 point per well-thumbed mark (at most `marks.max`), plus the day's bonus
 * (`WorkshopMods`), at most 100%.
 */
export function stepUpBp(craftingLevel: number, marks: number, mods: WorkshopMods = {}): number {
  const above = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.trunc(craftingLevel)) - 1);
  const m = Math.max(0, Math.min(RULES.gear.craft.marks.max, Math.trunc(marks)));
  return Math.min(
    10_000,
    RULES.gear.skill.rarityUpBpPerLevel * above +
      RULES.gear.craft.marks.upBp * m +
      Math.max(0, Math.trunc(mods.stepUpBonusBp ?? 0)),
  );
}

/**
 * The exact odds a craft comes out Common, Rare or Epic: the Reach's odds, then the one-step-up chance
 * (Common to Rare, Rare to Epic). The server sends these numbers; the screen never works them out. They
 * are exact in basis points because every input is a whole percent (checked by a test).
 */
export function craftOdds(
  reach: ReachId,
  craftingLevel: number,
  marks: number,
  mods: WorkshopMods = {},
): CraftOdds {
  const base: CraftOdds =
    reach === 'none' ? { common: 10_000, rare: 0, epic: 0 } : { ...reachRules(reach).oddsBp };
  const up = stepUpBp(craftingLevel, marks, mods);
  const common = Math.floor((base.common * (10_000 - up)) / 10_000);
  const rare =
    Math.floor((base.common * up) / 10_000) + Math.floor((base.rare * (10_000 - up)) / 10_000);
  const epic = base.epic + Math.floor((base.rare * up) / 10_000);
  return { common, rare, epic: epic + (10_000 - common - rare - epic) };
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
 * How long a job takes in milliseconds: its hours (a plain craft's by default), less
 * `timeReductionBpPerLevel` for each skill level above 1 and less `extraBp` (the Busy paws lines the
 * creature wears), at least a tenth of the hours.
 */
export function jobDuration(level: number, extraBp = 0, hours = jobHours()): number {
  const above = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.trunc(level)) - 1);
  const keepBp = Math.max(
    1_000,
    10_000 - RULES.gear.skill.timeReductionBpPerLevel * above - extraBp,
  );
  return Math.floor((hours * HOUR_MS * keepBp) / 10_000);
}

/** XP a finished job gives: its nominal hours times `xpPerHour`, more by `extraBp` (Apprentice). The skill does not change it. */
export function jobXp(extraBp = 0, hours = jobHours()): number {
  return Math.floor((hours * RULES.gear.skill.xpPerHour * (10_000 + extraBp)) / 10_000);
}

const NEXT_RARITY: Record<GearRarity, GearRarity> = {
  common: 'rare',
  rare: 'epic',
  epic: 'epic',
  festival: 'festival',
};

/**
 * The rarity of a craft and whether the one-step-up chance raised it: the Reach's odds draw the rarity
 * (a plain craft: Common), then a second draw gives the chance to come out one rarity higher. Two draws
 * always. The distribution is exactly `craftOdds`.
 */
export function rollCraftRarity(
  rng: Rng,
  reach: ReachId,
  craftingLevel: number,
  marks: number,
  mods: WorkshopMods = {},
): { rarity: GearRarity; upgraded: boolean } {
  const base: CraftOdds =
    reach === 'none' ? { common: 10_000, rare: 0, epic: 0 } : { ...reachRules(reach).oddsBp };
  const r = int(rng, 10_000);
  const drawn: GearRarity =
    r < base.common ? 'common' : r < base.common + base.rare ? 'rare' : 'epic';
  const up = chance(rng, stepUpBp(craftingLevel, marks, mods), 10_000);
  const rarity = up ? NEXT_RARITY[drawn] : drawn;
  return { rarity, upgraded: rarity !== drawn };
}

/** The rarity a plain craft comes out as (no Reach, no marks): Common, or one higher by the Crafting level. */
export function craftRarity(rng: Rng, level: number): GearRarity {
  return rollCraftRarity(rng, 'none', level, 0).rarity;
}

const RARITY_ORDER: readonly GearRarity[] = ['common', 'rare', 'epic'];

/** What a craft was aimed at: the Reach, the blueprint's marks, and the least rarity (crafts started before v2). */
export interface CraftOptions {
  reach?: ReachId;
  marks?: number;
  /** The least rarity it may come out as (a craft started before gear v2 was sized by its blueprint's rarity; a Festival floor counts as Epic). */
  floor?: GearRarity;
  /** The day's Workshop modifiers (the Boons step). */
  mods?: WorkshopMods;
}

/**
 * Crafts an item of a blueprint's base: its rarity (`rollCraftRarity`), item level (2 x Crafting level)
 * and rolled lines. Returns the item and whether the one-step-up chance raised it.
 */
export function rollCraftItem(
  rng: Rng,
  baseId: string,
  craftingLevel: number,
  options: CraftOptions = {},
): { item: GearItem; upgraded: boolean } {
  const drawn = rollCraftRarity(
    rng,
    options.reach ?? 'none',
    craftingLevel,
    options.marks ?? 0,
    options.mods,
  );
  const floor: GearRarity = options.floor === 'festival' ? 'epic' : (options.floor ?? 'common');
  const raised = RARITY_ORDER.indexOf(floor) > RARITY_ORDER.indexOf(drawn.rarity);
  const rarity = raised ? floor : drawn.rarity;
  return {
    item: rollItem(rng, { baseId, rarity, itemLevel: craftItemLevel(craftingLevel) }),
    upgraded: raised ? false : drawn.upgraded,
  };
}

/** `rollCraftItem`'s item alone. */
export function rollCraft(
  rng: Rng,
  baseId: string,
  craftingLevel: number,
  options: CraftOptions = {},
): GearItem {
  return rollCraftItem(rng, baseId, craftingLevel, options).item;
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
