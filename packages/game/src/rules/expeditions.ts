/**
 * Expedition rules v2 (docs/design/expeditions-v2.md): explorer rank, slots, familiarity, destination
 * access, supplies, the rolls of a trip (catches, loot, the end-of-trip choice, the journal) and the
 * account stats and milestones. Pure functions over `RULES.expeditions` and the expedition content.
 * Randomness is injected (`Rng`): the server passes its live crypto source, tests and the simulator a
 * seeded one. Integers only; probabilities are basis points.
 */
import {
  EXPEDITION_LENGTHS,
  JOURNAL_ANY_PLACE,
  SUPPLY_KINDS,
  type DestinationDef,
  type ExpeditionLength,
  type GoalRisk,
  type JournalEntryDef,
  type PartsSpec,
  type PushOnGoalDef,
  type RarityOdds,
  type SupplyDef,
  type TwistDef,
  type TwistEffect,
} from '../content/expedition-schema';
import { expeditionContent, supplyDef } from '../content';
import {
  RARITIES,
  type ContentPack,
  type CreatureSpecies,
  type Element,
  type Rarity,
  type Role,
} from '../content/schema';
import { chance, int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';
import {
  rollBlueprint,
  rollExpeditionItem,
  shardOf,
  type GearItem,
  type PartsBundle,
} from './gear';
import { seasonOf } from './progression';
import type { GearRarity } from '../content/gear-schema';

const BP = 10_000;

/** `value` times (10000 + `bp`) over 10000, floored. */
function scaleBp(value: number, bp: number): number {
  return Math.floor((value * (BP + bp)) / BP);
}

// --- Trip lengths, explorer rank and slots ---

export type LengthRules = (typeof RULES.expeditions.lengths)[ExpeditionLength];

export function lengthRules(length: ExpeditionLength): LengthRules {
  return RULES.expeditions.lengths[length];
}

/** The highest explorer rank. */
export const MAX_EXPLORER_RANK = RULES.expeditions.rank.xpForRank.length;

/** An explorer rank from total XP: 1 to `MAX_EXPLORER_RANK`. */
export function explorerRank(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  const table = RULES.expeditions.rank.xpForRank;
  let rank = 1;
  for (let i = 0; i < table.length; i++) {
    if (xp >= (table[i] as number)) rank = i + 1;
  }
  return rank;
}

/** Total XP of the next rank, or null at the top. */
export function nextRankXp(rank: number): number | null {
  return RULES.expeditions.rank.xpForRank[Math.max(1, Math.trunc(rank))] ?? null;
}

/** What a trip takes for an explorer of this rank: each rank above 1 saves `speedBpPerRank`. */
export function tripMs(length: ExpeditionLength, rank: number): number {
  const above = Math.max(0, Math.min(MAX_EXPLORER_RANK, Math.trunc(rank)) - 1);
  const keepBp = BP - RULES.expeditions.rank.speedBpPerRank * above;
  return Math.floor((lengthRules(length).ms * keepBp) / BP);
}

/** True if an explorer of this rank can take trips of this length. */
export function lengthOpen(length: ExpeditionLength, rank: number): boolean {
  return rank >= lengthRules(length).minRank;
}

/** The sum of the ranks above 1 of all of a player's creatures: what slots are unlocked by. */
export function rankSum(ranks: readonly number[]): number {
  let sum = 0;
  for (const r of ranks) sum += Math.max(0, Math.trunc(r) - 1);
  return sum;
}

/**
 * How many expedition slots a player has: one, a second after `secondAfterTrips` finished trips, and one
 * more for each rank-sum threshold reached (the sum of the ranks above 1 of all their creatures).
 */
export function slotsFor(sum: number, tripsFinished: number): number {
  const { secondAfterTrips, thresholds } = RULES.expeditions.slots;
  return (
    1 + (tripsFinished >= secondAfterTrips ? 1 : 0) + thresholds.filter((t) => sum >= t).length
  );
}

/** What opens the next slot: more finished trips (the second slot) or a higher rank sum; null when all are open. */
export function nextSlot(
  sum: number,
  tripsFinished: number,
): { kind: 'trips'; at: number } | { kind: 'rank_sum'; at: number } | null {
  const { secondAfterTrips, thresholds } = RULES.expeditions.slots;
  if (tripsFinished < secondAfterTrips) return { kind: 'trips', at: secondAfterTrips };
  const at = thresholds.find((t) => sum < t);
  return at === undefined ? null : { kind: 'rank_sum', at };
}

/** The one-time gift of reaching an explorer rank: Bait, parts and supplies (content ids). */
export interface RankGift {
  bait: number;
  /** Scrap and glimmer; zero amounts left out. */
  parts: PartsBundle;
  supplies: readonly string[];
}

/** The gift for reaching `rank` (2 to the top rank); null for rank 1 and for anything out of range. */
export function rankGift(rank: number): RankGift | null {
  const gift = RULES.expeditions.rank.gifts[Math.trunc(rank) - 2];
  if (gift === undefined) return null;
  const parts: PartsBundle = {};
  if (gift.scrap > 0) parts.scrap = gift.scrap;
  if (gift.glimmer > 0) parts.glimmer = gift.glimmer;
  return { bait: gift.bait, parts, supplies: [...gift.supplies] };
}

/**
 * The gifts of every rank passed when an explorer goes from `before` to `after` (a long trip can raise
 * the rank more than once), lowest first. Empty when the rank did not rise.
 */
export function rankGiftsBetween(
  before: number,
  after: number,
): { rank: number; gift: RankGift }[] {
  const out: { rank: number; gift: RankGift }[] = [];
  for (let rank = Math.trunc(before) + 1; rank <= Math.trunc(after); rank++) {
    const gift = rankGift(rank);
    if (gift !== null) out.push({ rank, gift });
  }
  return out;
}

/** What reaching a rank opens, from the content: places, push-on goals and a trip length. */
export interface RankUnlocks {
  destinations: DestinationDef[];
  goals: PushOnGoalDef[];
  lengths: ExpeditionLength[];
}

/**
 * Everything that opens at exactly `rank`: the places whose `minRank` it is, the push-on goals whose
 * `minRank` it is, and the trip lengths (`lengths.day.minRank`). Rank 1 is not an unlock: what is open
 * from the start is not listed.
 */
export function rankUnlocks(rank: number): RankUnlocks {
  const at = Math.trunc(rank);
  return {
    destinations:
      at <= 1 ? [] : expeditionContent.destinations.filter((d) => d.access.minRank === at),
    goals: at <= 1 ? [] : expeditionContent.goals.filter((g) => g.minRank === at),
    lengths: at <= 1 ? [] : EXPEDITION_LENGTHS.filter((l) => lengthRules(l).minRank === at),
  };
}

/** Bait a duplicate of a creature at its fusion limit turns into, when caught on an expedition. */
export function expeditionConvertBait(usualBait: number): number {
  return Math.max(1, Math.floor((usualBait * RULES.expeditions.convertBp) / BP));
}

// --- Familiarity ---

/** What a creature has done at one destination. */
export interface FamiliarityRecord {
  trips: number;
  /** Species ids it has caught there. */
  found: readonly string[];
  shiny: boolean;
}

/** Every species that lives at a destination, the deeper area included. */
export function allSpecies(dest: DestinationDef): string[] {
  return [...dest.species, ...dest.deep.species];
}

/**
 * The stars of a creature at a destination: one for `tripsForStar1` finished trips there, one for
 * having caught every species that lives there, one for a shiny found there (0 to 3).
 */
export function familiarityStars(dest: DestinationDef, record: FamiliarityRecord): number {
  const found = new Set(record.found);
  let stars = 0;
  if (record.trips >= RULES.expeditions.familiarity.tripsForStar1) stars++;
  if (allSpecies(dest).every((id) => found.has(id))) stars++;
  if (record.shiny) stars++;
  return stars;
}

/** The bonuses of a number of stars at a destination. */
export function familiarityBonus(stars: number): {
  deepChanceBp: number;
  rarityUpBp: number;
  partsBp: number;
} {
  const f = RULES.expeditions.familiarity;
  const i = Math.max(0, Math.min(3, Math.trunc(stars)));
  return {
    deepChanceBp: f.deepChanceBp[i] as number,
    rarityUpBp: f.rarityUpBp[i] as number,
    partsBp: f.partsBp[i] as number,
  };
}

// --- Destinations ---

export type ClosedReason = 'rank' | 'night' | 'festival';

/** True when the guild-local hour (0 to 23) is night. */
export function isNightHour(hour: number): boolean {
  const { fromHour, toHour } = RULES.expeditions.night;
  return fromHour > toHour ? hour >= fromHour || hour < toHour : hour >= fromHour && hour < toHour;
}

/**
 * Whether a creature can go to a destination now: the reasons it cannot (an empty list means open).
 * `localHour` is the guild-local hour of the moment of sending, `festivalWeek` whether it is a
 * Festival raid week.
 */
export function closedReasons(
  dest: DestinationDef,
  ctx: { rank: number; localHour: number; festivalWeek: boolean },
): ClosedReason[] {
  const out: ClosedReason[] = [];
  if (dest.access.festival === true && !ctx.festivalWeek) out.push('festival');
  if (dest.access.night === true && !isNightHour(ctx.localHour)) out.push('night');
  if (ctx.rank < dest.access.minRank) out.push('rank');
  return out;
}

// --- The weekly special ---

export interface WeeklySpecial {
  destination: string;
  twist: TwistDef;
  festival: boolean;
}

/**
 * The weekly special for a week index (the raid week's index, the number that rotates the bosses): the
 * destination follows the rotation and the twist rotates alongside it. A Festival week is always the
 * Festival Grounds with the festival twist.
 */
export function weeklySpecial(weekIndex: number): WeeklySpecial {
  const specials = expeditionContent.specials;
  const festival = seasonOf(weekIndex).festival;
  if (festival) {
    const twist = specials.twists.find((t) => t.id === specials.festival.twist) as TwistDef;
    return { destination: specials.festival.destination, twist, festival: true };
  }
  const normal = specials.twists.filter((t) => t.id !== specials.festival.twist);
  const destination = specials.rotation[weekIndex % specials.rotation.length] as string;
  const twist = normal[weekIndex % normal.length] as TwistDef;
  return { destination, twist, festival: false };
}

// --- Supplies ---

/** The supplies of a kit, as definitions. Throws for an unknown id. */
export function kitOf(ids: readonly string[]): SupplyDef[] {
  return ids.map((id) => {
    const def = supplyDef(id);
    if (def === undefined) throw new RangeError(`unknown supply "${id}"`);
    return def;
  });
}

/** Why a list of supply ids cannot go on a trip, or null when it can: unknown, repeated kind, too many. */
export function kitProblem(
  ids: readonly string[],
): 'unknown_supply' | 'too_many' | 'same_kind' | null {
  if (ids.length > RULES.expeditions.maxSupplies) return 'too_many';
  const kinds = new Set<string>();
  for (const id of ids) {
    const def = supplyDef(id);
    if (def === undefined) return 'unknown_supply';
    if (kinds.has(def.kind)) return 'same_kind';
    kinds.add(def.kind);
  }
  return null;
}

/** The catch rolls of a trip: the length's rolls, the map scrap's share (at least one), the twist's extra. */
export function tripRolls(
  length: ExpeditionLength,
  kit: readonly SupplyDef[],
  twist: TwistEffect | null,
): number {
  const base = lengthRules(length).rolls;
  let rolls = base;
  for (const s of kit) {
    if (s.kind === 'map-scrap') rolls += Math.max(1, Math.floor((base * s.rollsBp) / BP));
  }
  if (twist?.kind === 'rolls') rolls += twist.extra;
  return rolls;
}

/** The rarity odds shift of a kit's lures. */
export function lureShift(kit: readonly SupplyDef[]): { rareUpBp: number; epicUpBp: number } {
  let rareUpBp = 0;
  let epicUpBp = 0;
  for (const s of kit) {
    if (s.kind === 'lure') {
      rareUpBp += s.rareUpBp;
      epicUpBp += s.epicUpBp;
    }
  }
  return { rareUpBp, epicUpBp };
}

/** The extra chance, from a kit's lanterns, that a roll comes from the deeper area. */
export function kitDeepBp(kit: readonly SupplyDef[]): number {
  return kit.reduce((n, s) => n + (s.kind === 'lantern' ? s.deepBp : 0), 0);
}

/** The extra parts (basis points on top) and supply finds a kit's satchels give. */
export function satchelBonus(kit: readonly SupplyDef[]): { partsBp: number; supplyBp: number } {
  let partsBp = 0;
  let supplyBp = 0;
  for (const s of kit) {
    if (s.kind === 'satchel') {
      partsBp += s.partsBp;
      supplyBp += s.supplyBp;
    }
  }
  return { partsBp, supplyBp };
}

/** The tier of a supply found on a trip by an explorer of this rank. */
export function foundSupplyId(rng: Rng, rank: number): string {
  const { good, great } = RULES.expeditions.foundTier;
  const tier = rank >= great ? 'great' : rank >= good ? 'good' : 'basic';
  const kind = SUPPLY_KINDS[int(rng, SUPPLY_KINDS.length)] as string;
  return `${kind}-${tier}`;
}

/** The base odds of a destination: its own table, else the default. */
export function baseOdds(dest: DestinationDef): RarityOdds {
  return dest.odds ?? RULES.expeditions.defaultOddsBp;
}

/**
 * Moves `rareUpBp` of the odds from Common to Rare and `epicUpBp` from Common to Epic (never more than
 * Common has left). The three still add up to 10000.
 */
export function shiftOdds(odds: RarityOdds, rareUpBp: number, epicUpBp: number): RarityOdds {
  const rare = Math.min(Math.max(0, rareUpBp), odds.common);
  const epic = Math.min(Math.max(0, epicUpBp), odds.common - rare);
  return { common: odds.common - rare - epic, rare: odds.rare + rare, epic: odds.epic + epic };
}

/** A plain rarity bonus (familiarity, milestones): Rare by that much, Epic by a quarter of it. */
function rarityBonus(bp: number): { rareUpBp: number; epicUpBp: number } {
  return { rareUpBp: bp, epicUpBp: Math.floor(bp / 4) };
}

/**
 * The odds of one roll: the destination's, shifted by the trip length (longer trips go deeper), lures,
 * familiarity, milestones and the deeper area.
 */
export function rollOdds(args: {
  destination: DestinationDef;
  length: ExpeditionLength;
  kit: readonly SupplyDef[];
  stars: number;
  milestoneRarityBp: number;
  deep: boolean;
}): RarityOdds {
  const lure = lureShift(args.kit);
  const long = rarityBonus(lengthRules(args.length).rarityUpBp);
  const fam = rarityBonus(familiarityBonus(args.stars).rarityUpBp);
  const mile = rarityBonus(args.milestoneRarityBp);
  const deep = args.deep
    ? rarityBonus(args.destination.deep.rarityUpBp)
    : { rareUpBp: 0, epicUpBp: 0 };
  return shiftOdds(
    baseOdds(args.destination),
    lure.rareUpBp + long.rareUpBp + fam.rareUpBp + mile.rareUpBp + deep.rareUpBp,
    lure.epicUpBp + long.epicUpBp + fam.epicUpBp + mile.epicUpBp + deep.epicUpBp,
  );
}

// --- Catches ---

export interface TripCatchContext {
  content: ContentPack;
  destination: DestinationDef;
  length: ExpeditionLength;
  explorer: { element: Element; role: Role };
  kit: readonly SupplyDef[];
  /** The explorer's stars at this destination. */
  stars: number;
  /** The rarity bonus the account milestones give, in basis points. */
  milestoneRarityBp: number;
  /** The weekly twist, if the trip started at the special destination that week. */
  twist: TwistEffect | null;
  /** Line ids the player already owns. */
  ownedLines: ReadonlySet<string>;
  /** Duplicates caught in a row so far. */
  dupeStreak: number;
  /** True if this is the player's first claim that brings catches back (the first-expedition guarantee). */
  firstExpedition: boolean;
}

export interface TripCatch {
  species: CreatureSpecies;
  shiny: boolean;
  duplicate: boolean;
  /** The roll came from the deeper area. */
  deep: boolean;
}

/** True if the deeper area can be drawn from: stars, or a lantern, and something in it to draw. */
export function deepOpen(dest: DestinationDef, stars: number, kit: readonly SupplyDef[]): boolean {
  const hasContent = dest.deep.species.length > 0 || dest.deep.rarityUpBp > 0;
  return hasContent && (stars >= 1 || kitDeepBp(kit) > 0);
}

/** The chance (basis points) that a roll is drawn from the deeper area. */
export function deepChanceBp(
  dest: DestinationDef,
  stars: number,
  kit: readonly SupplyDef[],
): number {
  if (!deepOpen(dest, stars, kit)) return 0;
  return Math.min(BP, familiarityBonus(stars).deepChanceBp + kitDeepBp(kit));
}

const RARITY_FALLBACK: Record<Rarity, readonly Rarity[]> = {
  common: ['common', 'rare', 'epic'],
  rare: ['rare', 'common', 'epic'],
  epic: ['epic', 'rare', 'common'],
};

/**
 * Rolls one catch at a destination. Draw order on `rng`: the deeper-area chance (only when the deeper
 * area is open), the rarity, the species (skipped for the first-expedition guarantee), the shiny.
 *
 * 1. First-expedition guarantee: a zipmouse, wherever the trip went.
 * 2. Otherwise the rarity from the roll's odds, then a species of that rarity that lives there (the
 *    deeper area's too, on a deeper roll); a rarity nobody there has falls back to the nearest one that
 *    somebody has. Species of the explorer's element weigh 2 (a Setter: 3), the twist's featured
 *    species 2 to 9 times as much.
 * 3. Dupe shield: with a streak of 4 or more, only species the player does not own, if any.
 * 4. Shiny: 1 in 500.
 */
export function rollTripCatch(
  rng: Rng,
  ctx: TripCatchContext,
): { result: TripCatch; dupeStreak: number; guaranteed: boolean } {
  const { destination: dest } = ctx;
  const byId = new Map(ctx.content.creatures.map((c) => [c.id, c]));
  let species: CreatureSpecies | undefined;
  let deep = false;
  const guaranteed = ctx.firstExpedition && !ctx.ownedLines.has(RULES.catching.firstExpeditionLine);

  if (guaranteed) {
    species = ctx.content.creatures.find(
      (c) => c.catchable && c.stage === 1 && c.line === RULES.catching.firstExpeditionLine,
    );
    if (species === undefined) throw new Error('content has no catchable zipmouse line');
  } else {
    const deepBp = deepChanceBp(dest, ctx.stars, ctx.kit);
    deep = deepBp > 0 && chance(rng, deepBp, BP);
    // A roll in the deeper area is often the place's deep species itself (the rarest ones).
    const native = dest.deep.species
      .map((id) => byId.get(id))
      .filter((c): c is CreatureSpecies => c !== undefined);
    if (deep && native.length > 0 && chance(rng, RULES.expeditions.familiarity.deepFindBp, BP)) {
      species = native[int(rng, native.length)];
    }
  }
  if (species === undefined) {
    const odds = rollOdds({
      destination: dest,
      length: ctx.length,
      kit: ctx.kit,
      stars: ctx.stars,
      milestoneRarityBp: ctx.milestoneRarityBp,
      deep,
    });
    const rarity = pickWeighted(
      rng,
      RARITIES.map((r) => ({ rarity: r, weight: odds[r] })),
    ).rarity;
    const pool = (deep ? [...dest.species, ...dest.deep.species] : dest.species)
      .map((id) => byId.get(id))
      .filter((c): c is CreatureSpecies => c !== undefined);
    let candidates: CreatureSpecies[] = [];
    for (const r of RARITY_FALLBACK[rarity]) {
      candidates = pool.filter((c) => c.rarity === r);
      if (candidates.length > 0) break;
    }
    if (candidates.length === 0) throw new Error(`destination "${dest.id}" has nobody to catch`);
    if (ctx.dupeStreak >= RULES.catching.dupeShieldStreak) {
      const unowned = candidates.filter((c) => !ctx.ownedLines.has(c.line));
      if (unowned.length > 0) candidates = unowned;
    }
    const featured = featuredSpecies(dest, ctx.twist, byId);
    const affinity =
      ctx.explorer.role === 'setter'
        ? RULES.expeditions.roles.setterAffinityWeight
        : RULES.catching.explorerAffinityWeight;
    const weighted = candidates.map((c) => ({
      species: c,
      weight:
        (c.element === ctx.explorer.element ? affinity : 1) *
        (featured !== null && c.id === featured.species.id ? featured.weight : 1),
    }));
    species = pickWeighted(rng, weighted).species;
  }

  const { numerator, denominator } = RULES.catching.shiny;
  const shiny = chance(rng, numerator, denominator);
  const duplicate = ctx.ownedLines.has(species.line);
  return {
    result: { species, shiny, duplicate, deep },
    dupeStreak: duplicate ? ctx.dupeStreak + 1 : 0,
    guaranteed,
  };
}

/** The species a `featured` twist favours at a destination: the first of that rarity living there. */
export function featuredSpecies(
  dest: DestinationDef,
  twist: TwistEffect | null,
  byId: ReadonlyMap<string, CreatureSpecies>,
): { species: CreatureSpecies; weight: number } | null {
  if (twist?.kind !== 'featured') return null;
  for (const id of allSpecies(dest)) {
    const s = byId.get(id);
    if (s !== undefined && s.rarity === twist.rarity) return { species: s, weight: twist.weight };
  }
  return null;
}

/** All the catches of one claim in order, carrying owned lines and the dupe streak from roll to roll. */
export function rollTripCatches(
  rng: Rng,
  count: number,
  ctx: TripCatchContext,
): { results: TripCatch[]; dupeStreak: number } {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be an integer >= 0');
  const owned = new Set(ctx.ownedLines);
  let dupeStreak = ctx.dupeStreak;
  const results: TripCatch[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rollTripCatch(rng, {
      ...ctx,
      ownedLines: owned,
      dupeStreak,
      firstExpedition: i === 0 && ctx.firstExpedition,
    });
    results.push(roll.result);
    owned.add(roll.result.species.line);
    dupeStreak = roll.dupeStreak;
  }
  return { results, dupeStreak };
}

// --- Loot ---

export interface TripLootContext {
  length: ExpeditionLength;
  /** The element the shard is of: the destination's, else the explorer's. */
  shardElement: Element;
  role: Role;
  kit: readonly SupplyDef[];
  stars: number;
  milestonePartsBp: number;
  twist: TwistEffect | null;
  rank: number;
}

export interface TripLoot {
  parts: PartsBundle;
  /** A blueprint base id, if one dropped (it may turn out to be a duplicate: the server decides). */
  blueprint: string | null;
  /** Supplies found. */
  supplies: string[];
}

/** The parts bonus (basis points on top) a trip gets: role, satchels, stars, milestones and the twist. */
export function partsBonusBp(
  ctx: Omit<TripLootContext, 'length' | 'shardElement' | 'rank'>,
): number {
  return (
    (ctx.role === 'guard' ? RULES.expeditions.roles.guardPartsBp : 0) +
    satchelBonus(ctx.kit).partsBp +
    familiarityBonus(ctx.stars).partsBp +
    ctx.milestonePartsBp +
    (ctx.twist?.kind === 'parts' ? ctx.twist.bp : 0)
  );
}

function addPart(bundle: PartsBundle, kind: keyof PartsBundle, amount: number): void {
  if (amount > 0) bundle[kind] = (bundle[kind] ?? 0) + amount;
}

/**
 * The loot of a claimed trip besides the catches. Scrap follows the length (more with the parts
 * bonus); a recall pays the share of it that was brought back (`caught` of `rolls`) and nothing else. A
 * finished trip also rolls its shards, a glimmer, a blueprint and a found supply at the length's odds.
 * Draws in a fixed order, always the same number of draws for a finished trip.
 */
export function rollTripLoot(
  rng: Rng,
  ctx: TripLootContext,
  trip: { completed: boolean; caught: number; rolls: number },
): TripLoot {
  const table = lengthRules(ctx.length).loot;
  const bonusBp = partsBonusBp(ctx);
  const parts: PartsBundle = {};
  const full = scaleBp(table.scrap, bonusBp);
  const scrap = trip.completed
    ? full
    : trip.rolls > 0
      ? Math.floor((full * Math.max(0, trip.caught)) / trip.rolls)
      : 0;
  addPart(parts, 'scrap', scrap);
  if (!trip.completed) return { parts, blueprint: null, supplies: [] };

  const shardBp = scaleBp(table.shardBp, bonusBp);
  const shards = Math.floor(shardBp / BP) + (chance(rng, shardBp % BP, BP) ? 1 : 0);
  addPart(parts, shardOf(ctx.shardElement), shards);
  if (chance(rng, Math.min(BP, table.glimmerBp), BP)) addPart(parts, 'glimmer', 1);
  const blueprint = chance(rng, Math.min(BP, table.blueprintBp), BP) ? rollBlueprint(rng) : null;
  const supplyBp = Math.min(BP, table.supplyBp + satchelBonus(ctx.kit).supplyBp);
  const supplies = chance(rng, supplyBp, BP) ? [foundSupplyId(rng, ctx.rank)] : [];
  return { parts, blueprint, supplies };
}

/**
 * A gear drop of one rarity from a trip's push-on goal: the place's element is its tag and its item
 * level twice the explorer's rank (`rollExpeditionItem`).
 */
export function rollGearDrop(
  rng: Rng,
  rarity: Extract<GearRarity, 'common' | 'rare' | 'epic'>,
  place: { element: Element | null; crossroads: boolean },
  explorerRank: number,
): GearItem {
  return rollExpeditionItem(rng, rarity, place, explorerRank);
}

// --- Explorer XP ---

/** The XP a finished trip gives, with the bonuses (milestones, twist, goal) in basis points on top. */
export function tripXp(length: ExpeditionLength, bonusBp: number): number {
  return scaleBp(lengthRules(length).xp, bonusBp);
}

// --- The end-of-trip choice ---

/** The goals that can come up after a trip of this length for an explorer of this rank. */
export function eligibleGoals(
  goals: readonly PushOnGoalDef[],
  length: ExpeditionLength,
  rank: number,
): PushOnGoalDef[] {
  return goals.filter((g) => g.minRank <= rank && g.lengths[length] !== undefined);
}

/**
 * The chance (basis points) that a finished trip offers a choice: the base chance, rank and
 * milestones joined with each supply's own chance (1 minus the chance that none of them works).
 */
export function offerChanceBp(
  rank: number,
  kit: readonly SupplyDef[],
  milestoneOfferBp: number,
): number {
  const { baseOfferBp, perRankBp } = RULES.expeditions.pushOn;
  const own = Math.min(BP, baseOfferBp + perRankBp * Math.max(0, rank - 1) + milestoneOfferBp);
  let miss = BP - own;
  for (const s of kit) miss = Math.floor((miss * (BP - s.offerBp)) / BP);
  return BP - miss;
}

/**
 * Rolls the end-of-trip choice: nothing (an empty list), or up to two goals, a safe one and, when a
 * risky goal is open to the explorer, a risky one. Draws once for the chance; then one pick per goal.
 */
export function rollOffer(
  rng: Rng,
  args: {
    goals: readonly PushOnGoalDef[];
    length: ExpeditionLength;
    rank: number;
    kit: readonly SupplyDef[];
    milestoneOfferBp: number;
  },
): string[] {
  const offered = chance(rng, offerChanceBp(args.rank, args.kit, args.milestoneOfferBp), BP);
  if (!offered) return [];
  const open = eligibleGoals(args.goals, args.length, args.rank);
  const safe = open.filter((g) => g.risk === 'safe');
  const risky = open.filter((g) => g.risk === 'risky');
  const picks: PushOnGoalDef[] = [];
  const first = safe[int(rng, Math.max(1, safe.length))];
  if (first !== undefined) picks.push(first);
  if (risky.length > 0 && picks.length < RULES.expeditions.pushOn.maxGoals) {
    const second = risky[int(rng, risky.length)];
    if (second !== undefined) picks.push(second);
  }
  return picks.map((g) => g.id);
}

/** The exact chance (basis points) that a goal works out after a trip of this length; undefined if never offered there. */
export function goalOddsBp(goal: PushOnGoalDef, length: ExpeditionLength): number | undefined {
  return goal.lengths[length]?.oddsBp;
}

/**
 * True if a push-on works out, given the odds stored when the goal was chosen. A safe goal, or odds
 * of 10000, always works and draws nothing; otherwise it draws once.
 */
export function pushWorks(rng: Rng, risk: GoalRisk, oddsBp: number): boolean {
  if (risk === 'safe' || oddsBp >= BP) return true;
  return chance(rng, oddsBp, BP);
}

/** True if the goal works out. A safe goal always does and draws nothing; a risky one draws once. */
export function goalWorks(rng: Rng, goal: PushOnGoalDef, length: ExpeditionLength): boolean {
  const odds = goalOddsBp(goal, length);
  if (odds === undefined) throw new RangeError(`goal "${goal.id}" is not offered after ${length}`);
  return pushWorks(rng, goal.risk, odds);
}

// --- The journal ---

/**
 * The pages a trip can still turn up: the places's own pages the player has not found, and only when
 * they are all found, the pages of `any`. Empty when everything within reach is found.
 */
export function journalPool(
  entries: readonly JournalEntryDef[],
  place: string,
  found: ReadonlySet<string>,
): JournalEntryDef[] {
  const own = entries.filter((e) => e.place === place && !found.has(e.id));
  if (own.length > 0) return own;
  return entries.filter((e) => e.place === JOURNAL_ANY_PLACE && !found.has(e.id));
}

/** Picks a page the player does not have, or null when there is none left. Draws only when there is one. */
export function rollJournal(
  rng: Rng,
  entries: readonly JournalEntryDef[],
  place: string,
  found: ReadonlySet<string>,
): string | null {
  const pool = journalPool(entries, place, found);
  if (pool.length === 0) return null;
  const picked = pool[int(rng, pool.length)];
  return picked === undefined ? null : picked.id;
}

/** The chance (basis points) of a journal page on a finished trip of this length, with the twist. */
export function journalChanceBp(length: ExpeditionLength, twist: TwistEffect | null): number {
  const base = lengthRules(length).journalBp;
  return Math.min(BP, twist?.kind === 'journal' ? scaleBp(base, twist.bp) : base);
}

// --- Account stats and milestones ---

export const ACCOUNT_STATS = [
  'trips_finished',
  'trips_failed',
  'trip_hours',
  'species_found',
  'places_visited',
  'journal_pages',
  'journal_sets',
  'reactions_seen',
  'pushons_taken',
  'pushons_won',
  'supplies_used',
  'shinies_found',
] as const;
export type AccountStat = (typeof ACCOUNT_STATS)[number];

export type MilestoneRule = (typeof RULES.expeditions.milestones)[number];
export type BonusKind = MilestoneRule['bonus']['kind'];

/** The permanent bonuses the reached milestones give, in basis points. */
export interface MilestoneBonuses {
  rarityBp: number;
  partsBp: number;
  offerBp: number;
  xpBp: number;
}

export type AccountStats = Readonly<Partial<Record<AccountStat, number>>>;

/** Every milestone with the player's value and whether it is reached. */
export function milestoneProgress(stats: AccountStats): {
  id: string;
  stat: AccountStat;
  at: number;
  value: number;
  reached: boolean;
  bonus: MilestoneRule['bonus'];
}[] {
  return RULES.expeditions.milestones.map((m) => {
    const value = stats[m.stat] ?? 0;
    return { id: m.id, stat: m.stat, at: m.at, value, reached: value >= m.at, bonus: m.bonus };
  });
}

/** The sum of the bonuses of the reached milestones. */
export function milestoneBonuses(stats: AccountStats): MilestoneBonuses {
  const out: MilestoneBonuses = { rarityBp: 0, partsBp: 0, offerBp: 0, xpBp: 0 };
  for (const m of milestoneProgress(stats)) {
    if (!m.reached) continue;
    const key = `${m.bonus.kind}Bp` as const;
    out[key] += m.bonus.bp;
  }
  return out;
}

// --- Supply crafting ---

const HOUR_MS = 3_600_000;

/** How long crafting a supply takes for a creature of this Crafting level: its hours less the skill's share. */
export function supplyJobMs(def: SupplyDef, craftingLevel: number): number {
  const levels = RULES.gear.skill.xpForLevel.length;
  const above = Math.max(0, Math.min(levels, Math.trunc(craftingLevel)) - 1);
  const keepBp = BP - RULES.gear.skill.timeReductionBpPerLevel * above;
  return Math.floor((def.blueprint.hours * HOUR_MS * keepBp) / BP);
}

/** The Crafting XP a finished supply job gives: its hours times the usual XP per hour. */
export function supplyJobXp(def: SupplyDef): number {
  return def.blueprint.hours * RULES.gear.skill.xpPerHour;
}

// --- What things are worth (for the simulator's fairness checks) ---

function partsWorth(parts: PartsSpec | undefined): number {
  if (parts === undefined) return 0;
  const w = RULES.expeditions.worth;
  return (
    (parts.scrap ?? 0) * w.scrap +
    ((parts['tide-shard'] ?? 0) +
      (parts['ember-shard'] ?? 0) +
      (parts['grove-shard'] ?? 0) +
      (parts['spark-shard'] ?? 0)) *
      w.shard +
    (parts.glimmer ?? 0) * w.glimmer
  );
}

/** The worth of one catch roll at these odds, in Bait. */
export function rollWorth(odds: RarityOdds): number {
  const w = RULES.expeditions.worth.roll;
  return (odds.common * w.common + odds.rare * w.rare + odds.epic * w.epic) / BP;
}

/** The default odds shifted by a trip length's own bonus (what a roll is worth with no supplies and no stars). */
function shiftedDefaultOdds(length: ExpeditionLength): RarityOdds {
  const bonus = rarityBonus(lengthRules(length).rarityUpBp);
  return shiftOdds(RULES.expeditions.defaultOddsBp, bonus.rareUpBp, bonus.epicUpBp);
}

/** Parts from a content spec as a bundle (a bundle has no undefined amounts). */
export function partsOfSpec(spec: PartsSpec | undefined): PartsBundle {
  const out: PartsBundle = {};
  if (spec === undefined) return out;
  for (const kind of Object.keys(spec) as (keyof PartsSpec)[]) {
    const amount = spec[kind];
    if (amount !== undefined && amount > 0) out[kind] = amount;
  }
  return out;
}

/** The expected worth, in Bait, of a finished trip without supplies for an explorer of rank 1. */
export function expectedTripWorth(length: ExpeditionLength): number {
  const l = lengthRules(length);
  const w = RULES.expeditions.worth;
  return (
    l.rolls * rollWorth(shiftedDefaultOdds(length)) +
    l.loot.scrap * w.scrap +
    (l.loot.shardBp * w.shard) / BP +
    (l.loot.glimmerBp * w.glimmer) / BP +
    (l.loot.blueprintBp * w.blueprint) / BP +
    (l.loot.supplyBp * averageSupplyWorth()) / BP +
    (l.journalBp * w.journal) / BP +
    (l.xp * w.xpPer10) / 10
  );
}

/** The mean Bait worth of a basic supply (what a found supply is worth at low ranks). */
export function averageSupplyWorth(): number {
  const basics = expeditionContent.supplies.filter((s) => s.tier === 'basic');
  return basics.reduce((n, s) => n + s.worth, 0) / basics.length;
}

/** The expected worth of what a goal that works out adds. */
export function goalRewardWorth(goal: PushOnGoalDef, length: ExpeditionLength): number {
  const w = RULES.expeditions.worth;
  const r = goal.reward;
  return (
    (r.catchRolls ?? 0) * rollWorth(shiftedDefaultOdds(length)) +
    partsWorth(r.parts) +
    (r.supply === true ? averageSupplyWorth() : 0) +
    (r.gear === undefined ? 0 : w.gear[r.gear]) +
    (r.blueprint === true ? w.blueprint : 0) +
    (r.journal === true ? w.journal : 0) +
    ((r.xpBp ?? 0) * lengthRules(length).xp * w.xpPer10) / (BP * 10)
  );
}

/**
 * Expected worth of choosing a goal against coming home, as a ratio: (what the trip is worth when
 * it works out, plus the goal's reward) times the chance it works out, over what the trip is worth.
 * Above 1 the goal pays in expectation. A risky goal is meant to be about 1 (a fair gamble); a safe
 * goal is always at least 1.
 */
export function goalWorthRatio(goal: PushOnGoalDef, length: ExpeditionLength): number {
  const odds = goalOddsBp(goal, length);
  if (odds === undefined) throw new RangeError(`goal "${goal.id}" is not offered after ${length}`);
  const trip = expectedTripWorth(length);
  return ((odds / BP) * (trip + goalRewardWorth(goal, length))) / trip;
}
