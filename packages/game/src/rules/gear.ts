/**
 * Gear and crafting rules (docs/design/gear.md): pure functions over `RULES.gear` and the gear
 * content. Randomness is injected (`Rng`), so the server passes its live crypto source and tests pass
 * a seeded one. Nothing here touches the engine: `applyGear` folds an item into a creature's stats
 * and crit bonus before a fight.
 */
import { int, chance, pickWeighted, type Rng } from '../rng';
import { enchantDef, gearBase, gearContent } from '../content/gear';
import {
  GEAR_STATS,
  type EnchantDef,
  type GearBase,
  type GearRarity,
  type GearStat,
} from '../content/gear-schema';
import type { CritBonus, Element, Role, Stats } from '../content/schema';
import { RULES, type DurationId } from './config';

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

export const JOB_KINDS = ['craft', 'improve', 'enchant', 'supply'] as const;
export type JobKind = (typeof JOB_KINDS)[number];
/** The jobs that work on gear (a supply job has its own hours, from the supply's blueprint). */
export type GearJobKind = Exclude<JobKind, 'supply'>;

/** The shard of an element. */
export function shardOf(element: Element): PartKind {
  return `${element}-shard`;
}

/** The rolled numbers of an item: its primary amount and its secondaries (basis points). */
export interface GearRolls {
  /** The primary stat's roll at level 0 (the rarity multiplier is already in it). */
  primary: number;
  secondary: readonly { stat: GearStat; bp: number }[];
}

/** An item as the rules see it. */
export interface GearItem {
  baseId: string;
  rarity: GearRarity;
  /** Upgrade level, 0 to `RULES.gear.maxLevel`. */
  level: number;
  rolls: GearRolls;
  enchantId: string | null;
}

/** A bonus per stat in basis points. */
export type GearBonus = Record<GearStat, number>;

const zeroBonus = (): GearBonus => ({ atk: 0, hp: 0, spd: 0, critChance: 0, critDamage: 0 });

function baseOrThrow(baseId: string): GearBase {
  const base = gearBase(baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${baseId}"`);
  return base;
}

/** True if `rarity` is a rarity this base can have: festival bases only festival, others never. */
export function rarityFitsBase(base: Pick<GearBase, 'blueprint'>, rarity: GearRarity): boolean {
  return (base.blueprint === 'festival') === (rarity === 'festival');
}

function rollRange(rng: Rng, range: { min: number; max: number }): number {
  return range.min + int(rng, range.max - range.min + 1);
}

/** The stats a secondary of this base may be: everything but the primary. */
export function secondaryChoices(base: Pick<GearBase, 'primary'>): GearStat[] {
  return GEAR_STATS.filter((s) => s !== base.primary);
}

/**
 * Rolls a new item's numbers: the primary within its range times the rarity multiplier, then as many
 * distinct secondary stats (never the primary) as the rarity has, each within its range. Draws in a
 * fixed order. Throws RangeError for an unknown base or a rarity the base cannot have.
 */
export function rollGear(rng: Rng, baseId: string, rarity: GearRarity): GearRolls {
  const base = baseOrThrow(baseId);
  if (!rarityFitsBase(base, rarity)) {
    throw new RangeError(`base "${baseId}" cannot be ${rarity}`);
  }
  const { primaryBp, secondaries } = RULES.gear.rarity[rarity];
  const raw = rollRange(rng, RULES.gear.rolls.primary[base.primary]);
  const primary = Math.floor((raw * primaryBp) / 10_000);
  const left = secondaryChoices(base);
  const secondary: { stat: GearStat; bp: number }[] = [];
  for (let i = 0; i < secondaries; i++) {
    const [stat] = left.splice(int(rng, left.length), 1);
    if (stat === undefined) throw new Error('no secondary stat left to roll');
    secondary.push({ stat, bp: rollRange(rng, RULES.gear.rolls.secondary[stat]) });
  }
  return { primary, secondary };
}

/**
 * Improve: re-rolls the secondary at `index`. The new stat is drawn from those the item does not use
 * (not the primary, not the other secondaries; the old one may come back), the value within its range.
 * Returns the new rolls; throws RangeError if the item has no secondary at `index`.
 */
export function rerollSecondary(
  rng: Rng,
  baseId: string,
  rolls: GearRolls,
  index: number,
): GearRolls {
  const base = baseOrThrow(baseId);
  if (!Number.isInteger(index) || index < 0 || index >= rolls.secondary.length) {
    throw new RangeError('no secondary at that index');
  }
  const taken = new Set(rolls.secondary.filter((_, i) => i !== index).map((s) => s.stat));
  const choices = secondaryChoices(base).filter((s) => !taken.has(s));
  const stat = choices[int(rng, choices.length)];
  if (stat === undefined) throw new Error('no secondary stat left to roll');
  const secondary = rolls.secondary.map((s, i) =>
    i === index ? { stat, bp: rollRange(rng, RULES.gear.rolls.secondary[stat]) } : s,
  );
  return { primary: rolls.primary, secondary };
}

/** True if an enchant gives its bonus to a creature of this role and element. */
export function enchantActive(enchant: EnchantDef, role: Role, element: Element): boolean {
  const when = enchant.when;
  if (when === undefined) return true;
  return 'role' in when ? when.role === role : when.element === element;
}

/** Whether an item's enchant works for the wearer; false without an enchant. */
export function itemEnchantActive(item: GearItem, role: Role, element: Element): boolean {
  if (item.enchantId === null) return false;
  const enchant = enchantDef(item.enchantId);
  return enchant !== undefined && enchantActive(enchant, role, element);
}

/**
 * What an item gives before the caps: the primary (roll plus the level steps), the secondaries and,
 * when it works for this wearer, the enchant. Basis points per stat.
 */
export function gearBonus(item: GearItem, role: Role, element: Element): GearBonus {
  const base = baseOrThrow(item.baseId);
  const level = Math.max(0, Math.min(RULES.gear.maxLevel, Math.trunc(item.level)));
  const bonus = zeroBonus();
  bonus[base.primary] += item.rolls.primary + RULES.gear.upgradeStepBp[base.primary] * level;
  for (const s of item.rolls.secondary) bonus[s.stat] += s.bp;
  if (item.enchantId !== null) {
    const enchant = enchantDef(item.enchantId);
    if (enchant !== undefined && enchantActive(enchant, role, element)) {
      bonus[enchant.stat] += enchant.bp;
    }
  }
  return bonus;
}

/** The bonus after the per-creature caps (`RULES.gear.caps`). */
export function cappedBonus(bonus: GearBonus): GearBonus {
  const out = zeroBonus();
  for (const stat of GEAR_STATS) {
    out[stat] = Math.max(0, Math.min(bonus[stat], RULES.gear.caps[stat]));
  }
  return out;
}

/**
 * Folds an item into a creature's fight numbers. `stats` are the effective stats (level, fusion) and
 * `crit` the species' crit bonus; the result has the item's Attack, HP and speed added as percentages,
 * and its crit chance and crit damage added to the crit bonus, all capped (`RULES.gear.caps`). The
 * engine adds the crit bonus to the baseline and applies its own caps, so the bonus never takes the
 * creature past them. Without an item the inputs come back unchanged. Integers only; stats never fall.
 */
export function applyGear(
  stats: Stats,
  crit: CritBonus | undefined,
  role: Role,
  element: Element,
  item: GearItem | null,
): { stats: Stats; crit: CritBonus | undefined } {
  if (item === null) return { stats, crit };
  const capped = cappedBonus(gearBonus(item, role, element));
  const scale = (value: number, bp: number): number => Math.floor((value * (10_000 + bp)) / 10_000);
  const folded: Stats = {
    hp: scale(stats.hp, capped.hp),
    atk: scale(stats.atk, capped.atk),
    spd: scale(stats.spd, capped.spd),
  };
  if (crit === undefined && capped.critChance === 0 && capped.critDamage === 0) {
    return { stats: folded, crit: undefined };
  }
  const luck = RULES.combat.luck;
  const ownChance = crit?.chanceBp ?? 0;
  const ownDamage = crit?.damageBp ?? 0;
  // The engine caps the total; keep the bonus inside the room that is left (never below the species' own).
  const chanceRoom = Math.max(0, luck.critMaxChanceBp - luck.critChanceBp);
  const damageRoom = Math.max(0, luck.critMaxBp - luck.critBp);
  return {
    stats: folded,
    crit: {
      chanceBp: Math.max(ownChance, Math.min(ownChance + capped.critChance, chanceRoom)),
      damageBp: Math.max(ownDamage, Math.min(ownDamage + capped.critDamage, damageRoom)),
    },
  };
}

// --- Costs and yields ---

function addPart(bundle: PartsBundle, kind: PartKind, amount: number): void {
  if (amount > 0) bundle[kind] = (bundle[kind] ?? 0) + amount;
}

/** Price of the next upgrade: Essence and scrap, or null at the top level. */
export function upgradeCost(item: Pick<GearItem, 'rarity' | 'level'>): {
  essence: number;
  scrap: number;
} | null {
  if (!Number.isInteger(item.level) || item.level < 0) {
    throw new RangeError('level must be an integer >= 0');
  }
  if (item.level >= RULES.gear.maxLevel) return null;
  const mult = RULES.gear.upgrade.multiplierBp[item.rarity];
  const essence = RULES.gear.upgrade.essence[item.level];
  const scrap = RULES.gear.upgrade.scrap[item.level];
  if (essence === undefined || scrap === undefined) throw new Error('missing upgrade price');
  return {
    essence: Math.max(1, Math.floor((essence * mult) / 10_000)),
    scrap: Math.max(1, Math.floor((scrap * mult) / 10_000)),
  };
}

/** What dismantling an item returns: scrap (and part of the scrap its upgrades cost), a shard of its tint, glimmer. */
export function dismantleYield(item: Pick<GearItem, 'baseId' | 'rarity' | 'level'>): PartsBundle {
  const base = baseOrThrow(item.baseId);
  const out: PartsBundle = {};
  let spent = 0;
  for (let level = 0; level < item.level; level++) {
    spent += upgradeCost({ rarity: item.rarity, level })?.scrap ?? 0;
  }
  addPart(
    out,
    'scrap',
    RULES.gear.dismantle.scrap[item.rarity] +
      Math.floor((spent * RULES.gear.upgrade.refundBp) / 10_000),
  );
  if (base.tint !== null) addPart(out, shardOf(base.tint), RULES.gear.dismantle.shard[item.rarity]);
  addPart(out, 'glimmer', RULES.gear.dismantle.glimmer[item.rarity]);
  return out;
}

/** The parts a craft costs, by the blueprint's rarity (a shard is of the base's tint; neutral bases need none). */
export function craftCost(baseId: string): PartsBundle {
  const base = baseOrThrow(baseId);
  const cost = RULES.gear.craft[base.blueprint];
  const out: PartsBundle = {};
  addPart(out, 'scrap', cost.scrap);
  if (base.tint !== null) addPart(out, shardOf(base.tint), cost.shard);
  addPart(out, 'glimmer', cost.glimmer);
  return out;
}

/** The scrap an improve costs for an item of this rarity; null for rarities with no secondary to re-roll. */
export function improveCost(rarity: GearRarity): PartsBundle | null {
  const scrap = rarity === 'common' ? undefined : RULES.gear.improve.scrap[rarity];
  return scrap === undefined ? null : { scrap };
}

/** The parts an enchant costs: glimmer and shards of the enchant's element. Null for an unknown enchant. */
export function enchantCost(enchantId: string): PartsBundle | null {
  const enchant = enchantDef(enchantId);
  if (enchant === undefined) return null;
  const out: PartsBundle = {};
  addPart(out, 'glimmer', RULES.gear.enchant.glimmer);
  addPart(out, shardOf(enchant.shard), RULES.gear.enchant.shard);
  return out;
}

// --- Jobs and the crafting skill ---

const HOUR_MS = 3_600_000;

/** A job's nominal length in hours, before the skill: a craft follows the rarity, improve and enchant are fixed. */
export function jobHours(kind: GearJobKind, rarity: GearRarity): number {
  return kind === 'craft' ? RULES.gear.jobHours.craft[rarity] : RULES.gear.jobHours[kind];
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

/** How long a job takes in milliseconds: its hours, less `timeReductionBpPerLevel` for each skill level above 1. */
export function jobDuration(kind: GearJobKind, rarity: GearRarity, level: number): number {
  const above = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.trunc(level)) - 1);
  const keepBp = 10_000 - RULES.gear.skill.timeReductionBpPerLevel * above;
  return Math.floor((jobHours(kind, rarity) * HOUR_MS * keepBp) / 10_000);
}

/** XP a finished job gives: its nominal hours times `xpPerHour`. The skill does not change it. */
export function jobXp(kind: GearJobKind, rarity: GearRarity): number {
  return jobHours(kind, rarity) * RULES.gear.skill.xpPerHour;
}

const NEXT_RARITY: Record<GearRarity, GearRarity> = {
  common: 'rare',
  rare: 'epic',
  epic: 'epic',
  festival: 'festival',
};

/**
 * The rarity a craft comes out as: the blueprint's, or one higher with a chance of
 * `rarityUpBpPerLevel` for each skill level above 1 (epic and festival do not go higher).
 * Always draws once, so the draw count does not depend on the rarity.
 */
export function craftRarity(rng: Rng, blueprintRarity: GearRarity, level: number): GearRarity {
  const above = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.trunc(level)) - 1);
  const up = chance(rng, RULES.gear.skill.rarityUpBpPerLevel * above, 10_000);
  return up ? NEXT_RARITY[blueprintRarity] : blueprintRarity;
}

// --- Drops ---

/** Finale gear odds in basis points at a Boss Rank; the rest is common. */
export function finaleDropOddsBp(rank: number): { rare: number; epic: number; common: number } {
  const { baseBp, perRankBp, maxBp } = RULES.gear.drops.finale;
  const above = Math.max(0, Math.trunc(rank) - 1);
  const rare = Math.min(maxBp.rare, baseBp.rare + perRankBp.rare * above);
  const epic = Math.min(maxBp.epic, baseBp.epic + perRankBp.epic * above);
  return { rare, epic, common: 10_000 - rare - epic };
}

/** The bases that can drop as gear (everything but the Festival bases). */
export function droppableBases(): GearBase[] {
  return gearContent.bases.filter((b) => b.blueprint !== 'festival');
}

/**
 * The upgrade level finale gear arrives with: one level for every `ranksPerUpgrade` Boss Ranks above 1,
 * up to `RULES.gear.maxLevel` (ranks 1-2: +0, 3-4: +1, and so on, +5 from rank 11 with the starting values).
 */
export function finaleUpgradeLevel(rank: number): number {
  const above = Math.max(0, Math.trunc(rank) - 1);
  return Math.min(RULES.gear.maxLevel, Math.floor(above / RULES.gear.drops.finale.ranksPerUpgrade));
}

/** A gear drop: the base, rarity, rolled numbers and the upgrade level it arrives with. */
export interface GearDrop {
  baseId: string;
  rarity: GearRarity;
  rolls: GearRolls;
  level: number;
}

type DropRarity = 'common' | 'rare' | 'epic';

function rollFinaleRarity(rng: Rng, rank: number): DropRarity {
  const odds = finaleDropOddsBp(rank);
  return pickWeighted<{ rarity: DropRarity; weight: number }>(rng, [
    { rarity: 'common', weight: odds.common },
    { rarity: 'rare', weight: odds.rare },
    { rarity: 'epic', weight: odds.epic },
  ]).rarity;
}

/**
 * Rolls a finale gear drop for a Boss Rank: the rarity by the rank's odds, a base evenly, then its
 * rolls. It arrives pre-upgraded by rank (`finaleUpgradeLevel`).
 */
export function rollFinaleDrop(rng: Rng, rank: number): GearDrop {
  const rarity = rollFinaleRarity(rng, rank);
  const bases = droppableBases();
  const base = bases[int(rng, bases.length)];
  if (base === undefined) throw new Error('no gear bases to drop');
  return {
    baseId: base.id,
    rarity,
    rolls: rollGear(rng, base.id, rarity),
    level: finaleUpgradeLevel(rank),
  };
}

/** What a won finale gives each participant: one gear piece or one blueprint. */
export type FinaleReward =
  ({ kind: 'gear' } & GearDrop) | { kind: 'blueprint'; baseId: string; rarity: GearRarity };

const RARITY_FALLBACK: Record<DropRarity, readonly DropRarity[]> = {
  common: ['common', 'rare', 'epic'],
  rare: ['rare', 'common', 'epic'],
  epic: ['epic', 'rare', 'common'],
};

/**
 * The finale's reward slot. One draw decides gear or blueprint (`blueprintBp`). A blueprint takes its
 * rarity from the same rank odds as gear and a base of that rarity the player does not know yet
 * (`owned` holds the base ids they know). When they know every blueprint of that rarity it steps
 * down to the next rarity, then up. When they know them all, the reward is gear instead. Always
 * exactly one gear piece or one blueprint.
 */
export function rollFinaleReward(rng: Rng, rank: number, owned: ReadonlySet<string>): FinaleReward {
  if (chance(rng, RULES.gear.drops.finale.blueprintBp, 10_000)) {
    const rolled = rollFinaleRarity(rng, rank);
    const unowned = droppableBases().filter((b) => !owned.has(b.id));
    for (const rarity of RARITY_FALLBACK[rolled]) {
      const pool = unowned.filter((b) => b.blueprint === rarity);
      if (pool.length === 0) continue;
      const base = pool[int(rng, pool.length)];
      if (base !== undefined) return { kind: 'blueprint', baseId: base.id, rarity };
    }
  }
  return { kind: 'gear', ...rollFinaleDrop(rng, rank) };
}

/** The Festival base for a Festival creature's element: the base of that tint, else the first one. */
export function festivalBaseFor(element: Element): GearBase {
  const festival = gearContent.bases.filter((b) => b.blueprint === 'festival');
  const base = festival.find((b) => b.tint === element) ?? festival[0];
  if (base === undefined) throw new Error('no festival gear');
  return base;
}

/** Rolls the Festival piece for an element. */
export function rollFestivalDrop(
  rng: Rng,
  element: Element,
): { baseId: string; rarity: GearRarity; rolls: GearRolls } {
  const base = festivalBaseFor(element);
  return { baseId: base.id, rarity: 'festival', rolls: rollGear(rng, base.id, 'festival') };
}

/** Rolls a blueprint's base: the rarity by `blueprintOddsBp`, then a base of that rarity evenly. */
export function rollBlueprint(rng: Rng): string {
  const odds = RULES.gear.drops.blueprintOddsBp;
  const rarity = pickWeighted<{ rarity: GearRarity; weight: number }>(rng, [
    { rarity: 'common', weight: odds.common },
    { rarity: 'rare', weight: odds.rare },
    { rarity: 'epic', weight: odds.epic },
  ]).rarity;
  const bases = droppableBases().filter((b) => b.blueprint === rarity);
  const base = bases[int(rng, bases.length)];
  if (base === undefined) throw new Error(`no base with a ${rarity} blueprint`);
  return base.id;
}

/** What an expedition claim drops besides the catches. */
export interface ExpeditionLoot {
  parts: PartsBundle;
  /** A blueprint base id, if one dropped (it may turn out to be a duplicate: the server decides). */
  blueprint: string | null;
}

/**
 * Loot of a claimed expedition. Scrap follows the duration; a recalled trip pays the share of it that
 * was brought back (`caught` of `rolls`) and nothing else. A completed trip also rolls a shard of the
 * explorer's element, a glimmer and a blueprint at the duration's odds. Draws in a fixed order, always
 * the same number of draws for a completed trip.
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

/** The welcome kit's rolls: a common item and a common blueprint, both of random common bases. */
export function rollWelcomeKit(rng: Rng): {
  item: { baseId: string; rarity: GearRarity; rolls: GearRolls };
  blueprint: string;
} {
  const commons = droppableBases().filter((b) => b.blueprint === 'common');
  const itemBase = commons[int(rng, commons.length)];
  const blueprintBase = commons[int(rng, commons.length)];
  if (itemBase === undefined || blueprintBase === undefined) throw new Error('no common bases');
  return {
    item: { baseId: itemBase.id, rarity: 'common', rolls: rollGear(rng, itemBase.id, 'common') },
    blueprint: blueprintBase.id,
  };
}

/** Adds `amount` of a kind to a bundle (a new bundle is returned). */
export function addParts(a: PartsBundle, b: PartsBundle): PartsBundle {
  const out: PartsBundle = { ...a };
  for (const kind of PART_KINDS) addPart(out, kind, b[kind] ?? 0);
  return out;
}
