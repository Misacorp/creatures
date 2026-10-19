/**
 * The item model of gear v2 (docs/design/gear-and-creatures-v2.md, sections 2 and 5): items with a
 * slot, a tag, an item level and rolled lines with tiers; rolling them; the wear rule; the fold of a
 * creature's worn items into its stats, crit bonus, modifier sheet and trip, Workshop and dungeon
 * rules; and "Equip best". Everything is pure over `RULES.gear` and the gear content, and randomness
 * is injected (`Rng`): the server passes its live crypto source, tests and the simulator a seeded one.
 * Nothing here touches the engine: the sheet it builds is plain numbers in the shape of `SlotMods`.
 *
 * Items carry base stats (2026-10-17): a base type has fixed base stats (a Hat: Attack and HP, a Scarf: HP
 * and Attack, some a crit stat too), the same on every item of the base and not scaled by item level;
 * better bases unlock at higher item levels (`minItemLevel`). "Local" lines change one of that item's own
 * stats only, so each stat of an item is `(base + flat local) x (1 + percent local)` (`itemStats`).
 * Everything else a line does is global: it acts on the creature or on the fight (crit, elements,
 * reactions, wards, roles, utility).
 */
import { content } from '../content';
import { strongAgainst, strongOver } from '../content/element-chart';
import { eligibleBases, gearBase, gearContent, gearLine, gearSet } from '../content/gear';
import {
  CHANCE_FIELDS,
  GEAR_SLOTS,
  TRIGGER_FIELDS,
  tagElement,
  tagRole,
  type BaseStatKind,
  type PositionRule,
  type GearBase,
  type GearLine,
  type GearRarity,
  type GearSet,
  type GearSlot,
  type GearTag,
} from '../content/gear-schema';
import type { CritBonus, Element, Role, Stats, Zone } from '../content/schema';
import type { TalentEffect } from '../content/talent-schema';
import { int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';

// --- The item ---

/** A rolled line of an item: its id and the tier it rolled (0 is tier I, 4 is tier V). */
export interface ItemLine {
  id: string;
  tier: number;
}

/**
 * An item as the rules see it. The base stat (a Hat's Attack, a Scarf's HP), the Charm's base line and a
 * Festival piece's unique line come from the base, not from here.
 */
export interface GearItem {
  baseId: string;
  slot: GearSlot;
  tag: GearTag;
  rarity: GearRarity;
  /** 1 to `RULES.gear.maxItemLevel`, fixed when the item drops or is crafted. */
  itemLevel: number;
  lines: readonly ItemLine[];
}

/**
 * Where a creature stands, for the position lines (`rules/gear-position.ts` builds it from the row a fight is
 * built with). Everything is already counted: the fold only reads numbers and flags.
 */
export interface Placement {
  /** 0-based place in its row, and how many creatures the row holds. */
  index: number;
  length: number;
  /** Its zone in the raid (Front, Middle, Back); the dungeon's single row of three has one slot in each. */
  zone: Zone;
  /** The elements of the creatures directly left and right of it in its row (guests count). */
  beside: readonly Element[];
  /** The elements of every creature in its row, itself included. */
  rowElements: readonly Element[];
  /** HP the Lantern bearers beside it give it, added up (basis points). */
  lanternHpBp: number;
  /** Rounds more that a Guard's own ability (Rally, Shield Wall, Purge) lasts in this row (Lantern Night; 0 or 1). */
  rowShieldWall: number;
}

/** How a creature looks to the gear rules. `placement` is absent where nobody knows the row (a card, "Equip best"). */
export interface Wearer {
  role: Role;
  element: Element;
  placement?: Placement | undefined;
}

export function clampItemLevel(level: number): number {
  return Math.max(1, Math.min(RULES.gear.maxItemLevel, Math.trunc(level)));
}

/**
 * The best tier (0 to 4) an item level allows: tier I from item level 1, II from 5, III from 10, IV
 * from 15 and V at 20. It is also the band of a base line's value.
 */
export function tierCap(itemLevel: number): number {
  const level = clampItemLevel(itemLevel);
  const from = RULES.gear.tierFromItemLevel;
  let cap = 0;
  for (let i = 0; i < from.length; i++) if (level >= (from[i] as number)) cap = i;
  return cap;
}

/**
 * Rolls one line's tier: counting down from the best tier the item level allows, with the weights of
 * `RULES.gear.tierWeights` (15 / 30 / 30 / 25); tiers further down cannot roll. `minTier` lifts the
 * floor (the conversion rolls at tier II or better); the best tier is never below it. Always draws once.
 */
export function rollTier(rng: Rng, itemLevel: number, minTier = 0): number {
  const best = Math.max(tierCap(itemLevel), minTier);
  const choices: { tier: number; weight: number }[] = [];
  RULES.gear.tierWeights.forEach((weight, i) => {
    const tier = best - i;
    if (tier >= minTier) choices.push({ tier, weight });
  });
  return pickWeighted(rng, choices).tier;
}

/** The value of a line at a tier (0-based): basis points, or whole numbers for flat lines. */
export function lineValue(line: GearLine, tier: number): number {
  const i = Math.max(0, Math.min(line.values.length - 1, Math.trunc(tier)));
  return line.values[i] as number;
}

/** The value of a base's fixed line (a Charm's implicit, a Festival piece's unique line) at an item level. */
export function fixedValue(values: readonly number[], itemLevel: number): number {
  return values[tierCap(itemLevel)] as number;
}

/** Chance lines are this many basis points (2 points) higher on an Epic or a Festival piece. */
export const CHANCE_BONUS_BP = 200;

/**
 * What a rolled line adds to its tier value on this item: chance lines (6.3) get +2 points on an Epic or a
 * Festival piece, every other line nothing. The item's own rarity and base decide, so a stored item needs
 * no change.
 */
export function lineBonus(line: GearLine, item: Pick<GearItem, 'rarity'>, base: GearBase): number {
  return line.group === 'chance' && (item.rarity === 'epic' || base.festival === true)
    ? CHANCE_BONUS_BP
    : 0;
}

const RARITY_RANK: Record<GearRarity, number> = { common: 0, rare: 1, epic: 2 };
const LINE_RANK = { common: 0, rare: 1, epic: 2 } as const;

/** True if a rarity may roll a line that needs `min` or better. */
export function rarityReaches(rarity: GearRarity, min: 'common' | 'rare' | 'epic'): boolean {
  return RARITY_RANK[rarity] >= LINE_RANK[min];
}

function baseOrThrow(baseId: string): GearBase {
  const base = gearBase(baseId);
  if (base === undefined) throw new RangeError(`unknown gear base "${baseId}"`);
  return base;
}

/** The item a base would make, so callers can build a `GearItem` from a base id and a few facts. */
export function itemOf(
  baseId: string,
  rarity: GearRarity,
  itemLevel: number,
  lines: readonly ItemLine[],
): GearItem {
  const base = baseOrThrow(baseId);
  return {
    baseId: base.id,
    slot: base.slot,
    tag: base.tag,
    rarity,
    itemLevel: clampItemLevel(itemLevel),
    lines,
  };
}

// --- The roll pool ---

/** A line with the weight it has on a given item. */
export interface PoolLine {
  line: GearLine;
  weight: number;
}

/**
 * The lines an item of this base, rarity and item level can roll, with their weights: the slot's
 * pool, the lines this rarity and item level reach, times the tag (an element tag multiplies its own
 * element's lines, a role-locked Charm its role's lines and drops the other roles', the Crossroads
 * Compass raises utility lines and lowers combat lines). A base with a narrow pool (a Festival piece)
 * rolls only the lines it names. The weights are 10 times the content's, so the 0.3 multiplier stays
 * an integer.
 */
export function linePool(
  base: Pick<GearBase, 'slot' | 'tag' | 'pool' | 'stats'>,
  rarity: GearRarity,
  itemLevel: number,
): PoolLine[] {
  const level = clampItemLevel(itemLevel);
  const own = RULES.gear.tagWeightBp.own;
  const element = tagElement(base.tag);
  const role = tagRole(base.tag);
  const out: PoolLine[] = [];
  for (const line of gearContent.lines) {
    const raw = line.weights[base.slot];
    if (raw <= 0 || line.fixedOnly) continue;
    if (base.pool !== undefined && !base.pool.includes(line.id)) continue;
    // A local line changes one of the item's own stats, so it only rolls where the base has that stat.
    if (
      line.effect.kind === 'local' &&
      !(base.stats ?? []).some((s) => line.effect.kind === 'local' && s.stat === line.effect.stat)
    ) {
      continue;
    }
    if (!rarityReaches(rarity, line.minRarity)) continue;
    if (level < line.minItemLevel) continue;
    let mulBp = 10_000;
    if (element !== null) {
      if (line.element === element) mulBp = own;
    } else if (role !== null) {
      if (line.roles.length > 0 && !line.roles.includes(role)) continue;
      if (line.roles.includes(role)) mulBp = own;
    } else if (base.tag === 'explorer') {
      mulBp =
        line.group === 'utility'
          ? RULES.gear.tagWeightBp.compassUtility
          : RULES.gear.tagWeightBp.compassCombat;
    }
    out.push({ line, weight: Math.max(1, Math.floor((raw * mulBp) / 1_000)) });
  }
  return out;
}

/**
 * Rolls an item's lines: as many as the rarity has, drawn by weight from the pool without taking
 * the same line twice, each with its own tier. Draws in a fixed order (the line, then its tier). An item
 * holds at most one special line (a position, chance or trigger line, `SPECIAL_GROUPS`):
 * once one is drawn, the others leave the pool, so the next draw is among the ordinary lines. Every way
 * an item gets lines (a drop, a craft, a Reach, the conversion) rolls through here.
 */
export function rollLines(
  rng: Rng,
  base: Pick<GearBase, 'slot' | 'tag' | 'pool' | 'stats'>,
  rarity: GearRarity,
  itemLevel: number,
  minTier = 0,
): ItemLine[] {
  const pool = linePool(base, rarity, itemLevel);
  const out: ItemLine[] = [];
  for (let i = 0; i < RULES.gear.rolledLines[rarity]; i++) {
    if (pool.length === 0) break;
    const picked = pickWeighted(rng, pool);
    pool.splice(pool.indexOf(picked), 1);
    if (picked.line.special) {
      for (let j = pool.length - 1; j >= 0; j--) {
        if ((pool[j] as PoolLine).line.special) pool.splice(j, 1);
      }
    }
    out.push({
      id: picked.line.id,
      tier: picked.line.single ? 0 : rollTier(rng, itemLevel, minTier),
    });
  }
  return out;
}

/** The special lines among an item's rolled lines (an item holds at most one; see `rollLines`). */
export function specialLinesOf(lines: readonly ItemLine[]): ItemLine[] {
  return lines.filter((l) => gearLine(l.id)?.special === true);
}

/** Rolls a whole item of a base. Throws RangeError for an unknown base. Any base can be of any rarity. */
export function rollItem(
  rng: Rng,
  spec: { baseId: string; rarity: GearRarity; itemLevel: number; minTier?: number },
): GearItem {
  const base = baseOrThrow(spec.baseId);
  const level = clampItemLevel(spec.itemLevel);
  return itemOf(
    base.id,
    spec.rarity,
    level,
    rollLines(rng, base, spec.rarity, level, spec.minTier ?? 0),
  );
}

// --- Lines as the player reads them ---

/** `150` as "1.5", `300` as "3": basis points as a percentage without trailing zeros. */
export function formatBp(bp: number): string {
  const whole = Math.trunc(Math.abs(bp) / 100);
  const frac = Math.abs(bp) % 100;
  const text =
    frac === 0
      ? String(whole)
      : `${String(whole)}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
  return text;
}

/** A line's value as text: "+6%", "-4%", "+2", "+3 pt". A once-only line has no number. */
export function formatLineValue(line: GearLine, value: number): string {
  const sign = line.reduction ? '−' : '+';
  switch (line.unit) {
    case 'pct':
      return `${sign}${formatBp(value)}%`;
    case 'pt':
      return `${sign}${formatBp(value)} pt`;
    case 'flat':
      return `${sign}${String(value)}`;
    case 'chance':
      return `${formatBp(value)}%`;
    case 'once':
      return '';
  }
}

/**
 * A line as one phrase: "Crit chance +3 pt", "Unbothered". A local line (it changes only this item's
 * own stat) reads the other way round and says so: "+60% Attack (this item)".
 */
export function lineText(line: GearLine, value: number): string {
  const number = formatLineValue(line, value);
  if (line.local) return `${number} ${line.name} (this item)`;
  return number === '' ? line.name : `${line.name} ${number}`;
}

/** Where a line on a card comes from. */
export type LineSource = 'base' | 'fixed' | 'rolled';

/** A line with its value worked out, for a card. */
export interface ResolvedLine {
  id: string;
  name: string;
  text: string;
  about: string;
  source: LineSource;
  value: number;
  /** Tier I to V as 1 to 5, or null for a base line and lines without tiers. */
  tier: number | null;
  /** The best tier this item level could roll (1 to 5), or null where tiers do not apply. */
  bestTier: number | null;
  unit: GearLine['unit'];
  /** A line of this item only ("(this item)"): it changes the item's own stat, not the creature. */
  local: boolean;
}

/** Every line of an item in card order: the Charm's base line, a Festival piece's unique line, then the rolled lines. */
export function itemLines(item: GearItem): ResolvedLine[] {
  const base = baseOrThrow(item.baseId);
  const out: ResolvedLine[] = [];
  const fixed = (
    spec: { line: string; values: number[] } | undefined,
    source: LineSource,
  ): void => {
    if (spec === undefined) return;
    const line = gearLine(spec.line);
    if (line === undefined) throw new Error(`base "${base.id}" uses unknown line "${spec.line}"`);
    const value = fixedValue(spec.values, item.itemLevel);
    out.push({
      id: line.id,
      name: line.name,
      text: lineText(line, value),
      about: line.about,
      source,
      value,
      tier: null,
      bestTier: null,
      unit: line.unit,
      local: line.local,
    });
  };
  fixed(base.implicit, 'base');
  fixed(base.fixed, 'fixed');
  const best = tierCap(item.itemLevel) + 1;
  for (const rolled of item.lines) {
    const line = gearLine(rolled.id);
    if (line === undefined) throw new Error(`item has unknown line "${rolled.id}"`);
    const value = lineValue(line, rolled.tier) + lineBonus(line, item, base);
    out.push({
      id: line.id,
      name: line.name,
      text: lineText(line, value),
      about: line.about,
      source: 'rolled',
      value,
      tier: line.single ? null : rolled.tier + 1,
      bestTier: line.single ? null : best,
      unit: line.unit,
      local: line.local,
    });
  }
  return out;
}

// --- The item's own stats ---

/** One of an item's own stats as the card shows it. */
export interface ItemStat {
  stat: BaseStatKind;
  /**
   * What the item adds to its wearer: `(base + flat local lines) x (1 + percent local lines)`, rounded
   * down. Attack and HP are points, crit chance and crit damage basis points.
   */
  value: number;
  /** The base alone, as the base type has it. */
  base: number;
  /** The flat amount of the item's local lines for this stat. */
  flat: number;
  /** The percentage of the item's local lines for this stat, in basis points. */
  pctBp: number;
}

/**
 * The item's own stats in the order its base lists them (a Hat: Attack, HP, then a third if it has one;
 * a Scarf: HP, Attack, ...); empty for a Charm. Each is the base's fixed number (the same on every item
 * of the base: it never rolls and the item level does not scale it), plus the flat local lines for that
 * stat, times one plus the percent local lines for it (added together, so two percentages never
 * multiply). Integers only. A local line for a stat the base does not have changes nothing (it cannot
 * roll there).
 */
export function itemStats(item: GearItem): ItemStat[] {
  const base = baseOrThrow(item.baseId);
  const out: ItemStat[] = [];
  for (const own of base.stats ?? []) {
    let flat = 0;
    let pctBp = 0;
    for (const rolled of item.lines) {
      const line = gearLine(rolled.id);
      if (line === undefined || line.effect.kind !== 'local' || line.effect.stat !== own.stat) {
        continue;
      }
      const value = lineValue(line, rolled.tier);
      if (line.effect.mode === 'flat') flat += value;
      else pctBp += value;
    }
    out.push({
      stat: own.stat,
      value: Math.floor(((own.value + flat) * (10_000 + pctBp)) / 10_000),
      base: own.value,
      flat,
      pctBp,
    });
  }
  return out;
}

/** One stat of an item by kind, or undefined when its base does not have it. */
export function itemStat(item: GearItem, stat: BaseStatKind): ItemStat | undefined {
  return itemStats(item).find((s) => s.stat === stat);
}

/** A stat as text: "Attack 35", "Crit chance 5 pt" (crit numbers are shown in points). */
export function statText(stat: BaseStatKind, value: number): string {
  switch (stat) {
    case 'atk':
      return `Attack ${String(value)}`;
    case 'hp':
      return `HP ${String(value)}`;
    case 'critChance':
      return `Crit chance ${formatBp(value)} pt`;
    case 'critDamage':
      return `Crit damage ${formatBp(value)} pt`;
  }
}

// --- The wear rule ---

/** Why a creature cannot wear an item: `needs` is the creature level it asks for. */
export type WearBlock =
  | { reason: 'role'; role: Role }
  | { reason: 'slot_locked'; needs: number }
  | { reason: 'item_level'; needs: number };

/**
 * Whether a creature can wear an item, or why not. Three rules: a role-locked Charm only goes on its
 * role; a slot opens at a creature level (Hat 1, Scarf 7, Charm 13); and the item's level may not
 * exceed the creature's level.
 */
export function wearBlock(
  item: Pick<GearItem, 'slot' | 'tag' | 'itemLevel'>,
  creature: { level: number; role: Role },
): WearBlock | null {
  const role = tagRole(item.tag);
  if (role !== null && role !== creature.role) return { reason: 'role', role };
  const opens = RULES.gear.slotUnlockLevel[item.slot];
  if (creature.level < opens) return { reason: 'slot_locked', needs: opens };
  if (creature.level < item.itemLevel) return { reason: 'item_level', needs: item.itemLevel };
  return null;
}

// --- Folding worn items ---

/**
 * The modifier sheet a creature's worn items fill: the same field names and units as the engine's
 * `SlotMods` (basis points; `ignoreSilence` 0 or 1), kept here so the game package does not depend on
 * the engine. The worker and the simulator hand it to `FightSlot.mods` as it is.
 */
export interface GearMods {
  vsElementBp?: Partial<Record<Element, number>>;
  markedFoeBp?: number;
  firstHitBp?: number;
  markingHitBp?: number;
  strikeBp?: number;
  besideRoleBp?: Partial<Record<Role, number>>;
  pierceBp?: number;
  reactionBp?: Partial<Record<string, number>>;
  pounceBp?: number;
  ownerMarkBp?: number;
  keenReactionBp?: number;
  shareBp?: number;
  takenBp?: number;
  areaBp?: number;
  aimedBp?: number;
  reflectedBp?: number;
  chargedBp?: number;
  wardBp?: Partial<Record<Element, number>>;
  healReceivedBp?: number;
  armorBp?: number;
  coverBp?: number;
  boostBp?: number;
  mendBp?: number;
  lingerRounds?: number;
  ignoreSilence?: 0 | 1;
  /** Cover a Guard's cover on it gains (the position line Sheltered). */
  shelterBp?: number;
  /** Gear sets, three pieces: see `SET_EFFECTS` in the content schema and `SlotMods` in the engine. */
  unreflected?: 0 | 1;
  critWindowBp?: number;
  healOnReactionBp?: number;
  chainMark?: 0 | 1;
  coverReach?: 0 | 1;
  boostReach?: 0 | 1;
  sealMark?: 0 | 1;
  firstReactionCrit?: 0 | 1;
  /** Chance lines (a chance in basis points) and trigger lines: see `CHANCE_FIELDS`, `TRIGGER_FIELDS` and `SlotMods` in the engine. */
  secondWindBp?: number;
  echoBp?: number;
  sidestepBp?: number;
  steadyPawsBp?: number;
  warmHeartBp?: number;
  quickRemarkBp?: number;
  spillOverBp?: number;
  paybackBp?: number;
  kindlingBp?: number;
  openingMark?: 0 | 1;
  rallyCryBp?: number;
  emberTailBp?: number;
  stormWarningBp?: number;
  stubborn?: 0 | 1;
  lastStandBp?: number;
  overflowBp?: number;
  secondBreathBp?: number;
  patientBp?: number;
  sharedWarmthBp?: number;
}

/** What gear does outside the fight, for the wearer (basis points; a time reduction is a positive number). */
export interface GearRules {
  /** Explorer XP of its trips, more. */
  trailXpBp: number;
  /** Its trips take less time. */
  quickFeetBp: number;
  /** Parts found on its trips, more. */
  keenNoseBp: number;
  /** The chance of a rarer catch on its trips, more (basis points of chance). */
  luckyFindBp: number;
  /** The chance of a supply find on its trips, more (a share of the chance). */
  packerBp: number;
  /** Workshop jobs it runs take less time. */
  busyPawsBp: number;
  /** Crafting XP it earns, more. */
  apprenticeBp: number;
  /** In the dungeon, the share of max HP it recovers between rooms. */
  restBp: number;
  /** The chance of a glimmer on its trips, more (a share of the chance; a talent, not a gear line). */
  glimmerFindBp: number;
  /** Extra catch rolls on its 24 hour trips (the Crossroads Wanderer set). */
  dayTripRolls: number;
  /** Tinker's luck: the chance (basis points) that a dismantle job it runs refunds an item's full craft cost. */
  tinkersLuckBp: number;
  /** Second look: the chance (basis points) that a duplicate its trip brings rolls its talent twice. */
  secondLookBp: number;
}

export const NO_GEAR_RULES: GearRules = Object.freeze({
  trailXpBp: 0,
  quickFeetBp: 0,
  keenNoseBp: 0,
  luckyFindBp: 0,
  packerBp: 0,
  busyPawsBp: 0,
  apprenticeBp: 0,
  restBp: 0,
  glimmerFindBp: 0,
  dayTripRolls: 0,
  tinkersLuckBp: 0,
  secondLookBp: 0,
});

const RULE_FIELD = {
  trailXp: 'trailXpBp',
  quickFeet: 'quickFeetBp',
  keenNose: 'keenNoseBp',
  luckyFind: 'luckyFindBp',
  packer: 'packerBp',
  busyPaws: 'busyPawsBp',
  apprentice: 'apprenticeBp',
  tinkersLuck: 'tinkersLuckBp',
  secondLook: 'secondLookBp',
} as const satisfies Record<string, keyof GearRules>;

/**
 * A talent as the fold sees it: its id, what it does and its value (already golden or normal), in the
 * unit of its line (`rules/talents.ts` builds these from a creature's slots and signature).
 */
export interface FoldTalent {
  id: string;
  effect: TalentEffect;
  value: number;
}

/** What a creature's worn items add, line by line, before they are applied. */
export interface WornEffects {
  /** Attack and HP of the creature's own, more by a share or a flat amount (Charm lines and talents; global). */
  atkBp: number;
  atkFlat: number;
  hpBp: number;
  hpFlat: number;
  /** What the worn items' own Attack and HP add (`itemStats`), added after the shares above. */
  atkItem: number;
  hpItem: number;
  critChanceBp: number;
  critDamageBp: number;
  /** Speed, more (a share; only a talent gives it). */
  spdBp: number;
  /** The modifier sheet; empty when no line fills it. */
  mods: GearMods;
  rules: GearRules;
  /** Ids of lines that do nothing for this wearer (a Guard's armor on a Support, an off-element Attunement). */
  idle: string[];
  /** Ids of talents that do nothing for this wearer (a Guard's cover on a Setter). */
  idleTalents: string[];
}

/** The ids of the reactions an element sets off (Tide: steam; Mire later adds a second for Ember). */
function reactionsOf(element: Element): string[] {
  const found = content.reactions.filter((r) => r.triggerElement === element);
  if (found.length === 0) throw new Error(`no reaction is set off by "${element}"`);
  return found.map((r) => r.id);
}

type SheetNumeric =
  | 'markedFoeBp'
  | 'firstHitBp'
  | 'markingHitBp'
  | 'strikeBp'
  | 'pierceBp'
  | 'pounceBp'
  | 'ownerMarkBp'
  | 'keenReactionBp'
  | 'shareBp'
  | 'takenBp'
  | 'areaBp'
  | 'aimedBp'
  | 'reflectedBp'
  | 'chargedBp'
  | 'healReceivedBp'
  | 'armorBp'
  | 'coverBp'
  | 'boostBp'
  | 'mendBp'
  | (typeof CHANCE_FIELDS)[number]
  | Exclude<(typeof TRIGGER_FIELDS)[number], 'openingMark' | 'stubborn'>;

function addTo<K extends string>(
  table: Partial<Record<K, number>> | undefined,
  key: K,
  value: number,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = table ?? {};
  out[key] = (out[key] ?? 0) + value;
  return out;
}

/** True if the line does something for this wearer. */
function lineApplies(line: GearLine, wearer: Wearer): boolean {
  if (line.restricted && !line.roles.includes(wearer.role)) return false;
  if (line.effect.kind === 'attune') return line.element === wearer.element;
  return true;
}

// --- Gear sets ---

/** The pieces of each set among these items, one per slot at most: set id to count (2 and 3 are the bonuses). */
export function setCounts(
  items: readonly Pick<GearItem, 'baseId' | 'slot'>[],
): Map<string, number> {
  const slots = new Map<string, Set<GearSlot>>();
  for (const item of items) {
    const id = gearBase(item.baseId)?.set;
    if (id === undefined) continue;
    const held = slots.get(id) ?? new Set<GearSlot>();
    held.add(item.slot);
    slots.set(id, held);
  }
  return new Map([...slots].map(([id, held]) => [id, held.size]));
}

/**
 * The bonuses of the sets a creature wears: two pieces give the set's plain lines (folded like the same line
 * on an item, but never reported as idle), three also its one named effect. Conditions (the wearer's
 * element) are resolved here, so the engine sees numbers and flags only.
 */
function foldSets(
  items: readonly GearItem[],
  wearer: Wearer,
  out: WornEffects,
  apply: (line: GearLine, value: number, talentId: string | null, record: boolean) => void,
): void {
  // Most creatures wear no set piece: skip the counting (it runs for every fold in the sim's Equip best).
  if (!items.some((item) => gearBase(item.baseId)?.set !== undefined)) return;
  for (const [id, count] of setCounts(items)) {
    const set = gearSet(id);
    if (set === undefined || count < 2) continue;
    for (const entry of set.two.lines) {
      const line = gearLine(entry.line);
      if (line !== undefined) apply(line, entry.value, null, false);
    }
    if (count >= 3) setEffect(set.three, wearer, out);
  }
}

/** One three-piece effect into the sheet (or the trip rules), for a wearer it works for. */
function setEffect(three: GearSet['three'], wearer: Wearer, out: WornEffects): void {
  if (three.wearerElement !== undefined && three.wearerElement !== wearer.element) return;
  const sheet = out.mods;
  const value = three.value ?? 0;
  switch (three.effect) {
    case 'unreflected':
      sheet.unreflected = 1;
      break;
    case 'critWindow':
      sheet.critWindowBp = (sheet.critWindowBp ?? 0) + value;
      break;
    case 'healOnReaction':
      sheet.healOnReactionBp = (sheet.healOnReactionBp ?? 0) + value;
      break;
    case 'chainMark':
      sheet.chainMark = 1;
      break;
    case 'coverReach':
      if (wearer.role === 'guard') sheet.coverReach = 1;
      break;
    case 'boostReach':
      if (wearer.role === 'support') sheet.boostReach = 1;
      break;
    case 'sealMark':
      sheet.sealMark = 1;
      break;
    case 'firstReactionCrit':
      sheet.firstReactionCrit = 1;
      break;
    case 'longTripCatch':
      out.rules.dayTripRolls += value;
      break;
    case 'rowShieldWall':
      // A gift to the row: the row's builder counts the wearers (`Placement.rowShieldWall`).
      break;
  }
}

/** The sheet fields capped at 100% (10000 bp) after the fold; one list, built once. */
const CAPPED_AT_WHOLE = [
  'pierceBp',
  'takenBp',
  'areaBp',
  'aimedBp',
  'reflectedBp',
  'chargedBp',
  ...CHANCE_FIELDS,
  'stormWarningBp',
  'lastStandBp',
  'secondBreathBp',
] as const;
const CAPPED_SET: ReadonlySet<string> = new Set(CAPPED_AT_WHOLE);

/**
 * Everything a creature's worn items give, summed. Lines that do nothing for the wearer (a Guard's
 * armor on a Support, an Attunement of another element) are listed in `idle` and add nothing. The
 * sheet's conditions are resolved here: an element Hunter becomes a bonus against every element it deals 150% to,
 * an element Ward a reduction against every element that deals 150% to it, a reaction line the bonus of that
 * reaction, a position line the bonus beside a role. Pure and deterministic; no caps beyond the ones
 * the engine's sheet checks (a reduction stays below 100%, a pierce at most 100%, Lingering at most 3 rounds).
 *
 * The creature's talents (`talents`) go through the same function: a talent whose effect is a gear line
 * is folded exactly like that line on an item, and the two rules only talents have (Speed, glimmer finds)
 * add to `spdBp` and the trip rules. Talents add after the items, so the order never matters for the sums.
 */
export function wornEffects(
  wearer: Wearer,
  items: readonly GearItem[],
  talents: readonly FoldTalent[] = [],
): WornEffects {
  const out: WornEffects = {
    atkBp: 0,
    atkFlat: 0,
    hpBp: 0,
    hpFlat: 0,
    atkItem: 0,
    hpItem: 0,
    critChanceBp: 0,
    critDamageBp: 0,
    spdBp: 0,
    mods: {},
    rules: { ...NO_GEAR_RULES },
    idle: [],
    idleTalents: [],
  };
  const sheet = out.mods;
  const addSheet = (field: SheetNumeric, value: number): void => {
    sheet[field] = (sheet[field] ?? 0) + value;
  };
  const place = wearer.placement;
  const apply = (
    line: GearLine,
    value: number,
    talentId: string | null = null,
    /** A line a set gives is not an item's line: when it does nothing for the wearer, nothing is recorded as idle. */
    record = true,
  ): void => {
    if (!lineApplies(line, wearer)) {
      if (!record) return;
      if (talentId === null) out.idle.push(line.id);
      else out.idleTalents.push(talentId);
      return;
    }
    const effect = line.effect;
    switch (effect.kind) {
      case 'stat':
        if (effect.stat === 'atk') {
          if (effect.mode === 'pct') out.atkBp += value;
          else out.atkFlat += value;
        } else if (effect.stat === 'hp') {
          if (effect.mode === 'pct') out.hpBp += value;
          else out.hpFlat += value;
        } else if (effect.stat === 'critChance') out.critChanceBp += value;
        else out.critDamageBp += value;
        break;
      case 'attune':
        out.atkBp += value;
        break;
      case 'local':
        // Counted in the item's own stats (`itemStats`), not on the creature.
        break;
      case 'hunter': {
        // Foes of every element the Hunter's element deals 150% to.
        for (const foe of strongAgainst(content.elementChart, line.element as Element)) {
          sheet.vsElementBp = addTo(sheet.vsElementBp, foe, value);
        }
        break;
      }
      case 'ward': {
        // Foes of every element that deals 150% to the Ward's element.
        for (const foe of strongOver(content.elementChart, line.element as Element)) {
          sheet.wardBp = addTo(sheet.wardBp, foe, value);
        }
        break;
      }
      case 'reaction':
        for (const id of reactionsOf(line.element as Element)) {
          sheet.reactionBp = addTo(sheet.reactionBp, id, value);
        }
        break;
      case 'besideRole':
        sheet.besideRoleBp = addTo(sheet.besideRoleBp, effect.role, value);
        break;
      case 'position':
        // Where it stands decides: without a placement (a card, "Equip best") the line adds nothing.
        if (place !== undefined) positionLine(effect.rule, value, place);
        break;
      case 'sheet':
        if (effect.field === 'lingerRounds') {
          sheet.lingerRounds = Math.min(3, (sheet.lingerRounds ?? 0) + value);
        } else if (effect.field === 'ignoreSilence') {
          sheet.ignoreSilence = 1;
        } else if (effect.field === 'openingMark' || effect.field === 'stubborn') {
          sheet[effect.field] = 1;
        } else {
          addSheet(effect.field, value);
        }
        break;
      case 'rule':
        out.rules[RULE_FIELD[effect.rule]] += value;
        break;
      case 'rest':
        out.rules.restBp += value;
        break;
    }
  };
  /** One position line's effect for a creature standing at `at`. All of these are folded here: the engine sees numbers. */
  const positionLine = (rule: PositionRule, value: number, at: Placement): void => {
    switch (rule) {
      case 'sameElementBeside':
        out.atkBp += value * Math.min(2, at.beside.filter((e) => e === wearer.element).length);
        break;
      case 'oddOneOut':
        if (!at.beside.includes(wearer.element)) out.atkBp += value;
        break;
      case 'edge':
        if (at.index === 0 || at.index === at.length - 1) out.atkBp += value;
        break;
      case 'heart':
        if (at.index > 0 && at.index < at.length - 1) out.hpBp += value;
        break;
      case 'front':
        if (at.zone === 'front') addSheet('takenBp', value);
        break;
      case 'back':
        if (at.zone === 'back') out.critChanceBp += value;
        break;
      case 'lantern':
        // Its gift goes to the creatures beside it (`Placement.lanternHpBp` of theirs), not to the bearer.
        break;
      case 'fourElements':
        if (new Set(at.rowElements).size >= 4) {
          for (const id of reactionsOf(wearer.element)) {
            sheet.reactionBp = addTo(sheet.reactionBp, id, value);
          }
        }
        break;
      case 'sheltered':
        sheet.shelterBp = (sheet.shelterBp ?? 0) + value;
        break;
    }
  };
  for (const item of items) {
    for (const own of itemStats(item)) {
      if (own.stat === 'atk') out.atkItem += own.value;
      else if (own.stat === 'hp') out.hpItem += own.value;
      else if (own.stat === 'critChance') out.critChanceBp += own.value;
      else out.critDamageBp += own.value;
    }
    for (const resolved of itemLines(item)) {
      const line = gearLine(resolved.id);
      if (line !== undefined) apply(line, resolved.value);
    }
  }
  foldSets(items, wearer, out, apply);
  if (place !== undefined) {
    // What the creatures beside it give it (Lantern bearer) and what its row gives (Lantern Night).
    out.hpBp += place.lanternHpBp;
    if (wearer.role === 'guard' && place.rowShieldWall > 0) {
      sheet.lingerRounds = Math.min(3, (sheet.lingerRounds ?? 0) + place.rowShieldWall);
    }
  }
  for (const talent of talents) {
    if ('line' in talent.effect) {
      const line = gearLine(talent.effect.line);
      if (line !== undefined) apply(line, talent.value, talent.id);
    } else if (talent.effect.rule === 'speed') {
      out.spdBp += talent.value;
    } else {
      out.rules.glimmerFindBp += talent.value;
    }
  }
  // Keep within what the engine's sheet accepts.
  // A reduction stays below 100%, a chance never passes 100% (two items can carry the same line), nor a cut.
  // (Walks the few fields the sheet holds, not the whole list: this runs for every fold.)
  for (const field of Object.keys(sheet) as (keyof GearMods)[]) {
    if (!CAPPED_SET.has(field)) continue;
    const value = sheet[field] as number;
    (sheet as Record<string, number>)[field] = Math.min(10_000, value);
  }
  out.rules.tinkersLuckBp = Math.min(10_000, out.rules.tinkersLuckBp);
  out.rules.secondLookBp = Math.min(10_000, out.rules.secondLookBp);
  out.rules.quickFeetBp = Math.min(5_000, out.rules.quickFeetBp);
  out.rules.busyPawsBp = Math.min(5_000, out.rules.busyPawsBp);
  return out;
}

/** True if a sheet has nothing in it (so the fight input carries no `mods`). */
export function modsEmpty(mods: GearMods): boolean {
  return Object.keys(mods).length === 0;
}

/**
 * Folds a creature's worn items and talents into its fight numbers. `stats` are the effective stats
 * (level, fusion) and `crit` the species' crit bonus. The result has Attack and HP raised by the
 * percentages and then the flat amounts of the talents, then the worn items' own Attack and HP (`itemStats`, each already
 * counting its local lines, so no global percentage multiplies it; their crit stats join the crit lines), Speed by a talent's share, the crit lines added to the crit bonus, the sheet for `FightSlot.mods`
 * (absent when empty) and the trip, Workshop and dungeon rules. The engine adds the crit bonus to the
 * baseline and applies its own caps, so the bonus is kept inside the room that is left. Integers only;
 * stats never fall. Without items the inputs come back unchanged.
 */
export function applyGear(
  stats: Stats,
  crit: CritBonus | undefined,
  wearer: Wearer,
  items: readonly GearItem[],
  talents: readonly FoldTalent[] = [],
): { stats: Stats; crit: CritBonus | undefined; mods: GearMods | undefined; rules: GearRules } {
  // A creature that wears nothing can still gain from the row (Lantern bearer, Lantern Night).
  const gifts = wearer.placement;
  const given = gifts !== undefined && (gifts.lanternHpBp > 0 || gifts.rowShieldWall > 0);
  if (items.length === 0 && talents.length === 0 && !given) {
    return { stats, crit, mods: undefined, rules: NO_GEAR_RULES };
  }
  const fx = wornEffects(wearer, items, talents);
  const scale = (value: number, bp: number, flat: number, item: number): number =>
    Math.floor((value * (10_000 + bp)) / 10_000) + flat + item;
  const folded: Stats = {
    hp: scale(stats.hp, fx.hpBp, fx.hpFlat, fx.hpItem),
    atk: scale(stats.atk, fx.atkBp, fx.atkFlat, fx.atkItem),
    spd: scale(stats.spd, fx.spdBp, 0, 0),
  };
  const mods = modsEmpty(fx.mods) ? undefined : fx.mods;
  if (crit === undefined && fx.critChanceBp === 0 && fx.critDamageBp === 0) {
    return { stats: folded, crit: undefined, mods, rules: fx.rules };
  }
  const luck = RULES.combat.luck;
  const ownChance = crit?.chanceBp ?? 0;
  const ownDamage = crit?.damageBp ?? 0;
  const chanceRoom = Math.max(0, luck.critMaxChanceBp - luck.critChanceBp);
  const damageRoom = Math.max(0, luck.critMaxBp - luck.critBp);
  return {
    stats: folded,
    crit: {
      chanceBp: Math.max(ownChance, Math.min(ownChance + fx.critChanceBp, chanceRoom)),
      damageBp: Math.max(ownDamage, Math.min(ownDamage + fx.critDamageBp, damageRoom)),
    },
    mods,
    rules: fx.rules,
  };
}

// --- Scoring and "Equip best" ---

/**
 * What an item is worth to a wearer, as a whole number in hundredths of the creature's power
 * (`creaturePower`: Attack + HP / 10), for choosing between items. The Attack and HP an item adds are
 * counted exactly (the item's own stat, Creature Attack and HP lines, an Attunement of the wearer's element); every
 * other line adds a share of the creature's power by its content `worth`, in full for the wearer it
 * is meant for and a quarter of it otherwise. This is a deterministic stand-in, not a fight: it
 * cannot see positions or this week's boss, so "Equip best" is a good first pick and the player's
 * own swaps (Hunter lines against this week's boss, Guard's shadow beside a Guard) beat it. A line
 * that does nothing for the wearer counts 0.
 */
export function itemScore(
  item: GearItem,
  wearer: Wearer & { stats: Pick<Stats, 'atk' | 'hp'> },
): number {
  const fx = wornEffects(wearer, [item]);
  const stats = wearer.stats;
  let centi = Math.floor((stats.atk * fx.atkBp + (fx.atkFlat + fx.atkItem) * 10_000) / 100);
  centi += Math.floor((stats.hp * fx.hpBp + (fx.hpFlat + fx.hpItem) * 10_000) / 1_000);
  const powerCenti = stats.atk * 100 + stats.hp * 10;
  for (const resolved of itemLines(item)) {
    const line = gearLine(resolved.id);
    if (line !== undefined) centi += lineScore(line, resolved.value, wearer, powerCenti);
  }
  return centi;
}

/**
 * The share of a creature's power one line adds, in hundredths of power (see `itemScore`): in full for
 * the wearer it is meant for, a quarter otherwise, 0 for a line that does nothing for the wearer or
 * that the fold counts exactly (Attack and HP lines have a `worth` of 0). `powerCenti` is the wearer's
 * `atk * 100 + hp * 10`.
 */
export function lineScore(
  line: GearLine,
  value: number,
  wearer: Wearer,
  powerCenti: number,
): number {
  if (line.worth === 0 || !lineApplies(line, wearer)) return 0;
  const v = line.unit === 'once' ? 10_000 : value;
  const meant =
    line.roles.length > 0 && !line.restricted
      ? line.roles.includes(wearer.role)
      : line.effect.kind === 'reaction'
        ? line.element === wearer.element
        : true;
  const share = Math.floor((powerCenti * v * line.worth) / 100_000_000);
  return meant ? share : Math.floor(share / 4);
}

/** One creature in an Equip best plan: its level, role, element, stats and what it wears now. */
export interface BestCreature {
  id: string;
  level: number;
  role: Role;
  element: Element;
  stats: Pick<Stats, 'atk' | 'hp'>;
  /** The id of the item it wears in each slot. */
  worn: Partial<Record<GearSlot, string>>;
}

/** An item that can be handed out: in the bag, or worn by one of the creatures being planned. */
export interface BestCandidate {
  id: string;
  item: GearItem;
}

/** A change an Equip best plan makes: `itemId` null empties the slot. */
export interface EquipMove {
  creatureId: string;
  slot: GearSlot;
  itemId: string | null;
}

/**
 * "Equip best" for one creature or a whole team. Considers the bag and what the planned creatures
 * wear (never what other creatures wear), and every pair a creature may wear (`wearBlock`). Best
 * pair first, by `itemScore`; ties go to the item the creature already wears, then to the smaller
 * ids, so the plan never depends on listing order. A creature's slot changes only when the new item
 * is better than what it holds (or the slot is empty): a creature's own item goes first on a tie, so it only loses it to a better pair. Returns the moves, empty when nothing is
 * better. Pure.
 */
export function planEquipBest(
  creatures: readonly BestCreature[],
  candidates: readonly BestCandidate[],
): EquipMove[] {
  type Pair = {
    creature: BestCreature;
    candidate: BestCandidate;
    score: number;
    current: boolean;
  };
  const pairs: Pair[] = [];
  for (const creature of creatures) {
    for (const candidate of candidates) {
      if (wearBlock(candidate.item, creature) !== null) continue;
      pairs.push({
        creature,
        candidate,
        score: itemScore(candidate.item, creature),
        current: creature.worn[candidate.item.slot] === candidate.id,
      });
    }
  }
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.current) - Number(a.current) ||
      (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0) ||
      (a.creature.id < b.creature.id ? -1 : a.creature.id > b.creature.id ? 1 : 0),
  );
  const scoreOf = new Map<string, number>();
  for (const pair of pairs) scoreOf.set(`${pair.creature.id}:${pair.candidate.id}`, pair.score);
  // Best pair first, but a slot that is pinned keeps its current item. A creature's slot changes only
  // for a better item: when the plan takes a creature's item for someone else and leaves it nothing, or
  // something worse, that slot is pinned and the plan is made again (each round pins at least one more
  // slot, so it ends).
  const pinned = new Set<string>();
  let assigned: Map<string, string>;
  for (;;) {
    const usedItems = new Set<string>();
    const taken = new Set<string>();
    assigned = new Map<string, string>();
    for (const key of pinned) {
      const [creatureId, slot] = key.split(':') as [string, GearSlot];
      const id = creatures.find((c) => c.id === creatureId)?.worn[slot];
      if (id === undefined) continue;
      usedItems.add(id);
      taken.add(key);
      assigned.set(key, id);
    }
    for (const pair of pairs) {
      const key = `${pair.creature.id}:${pair.candidate.item.slot}`;
      if (usedItems.has(pair.candidate.id) || taken.has(key)) continue;
      usedItems.add(pair.candidate.id);
      taken.add(key);
      assigned.set(key, pair.candidate.id);
    }
    let changed = false;
    for (const creature of creatures) {
      for (const slot of GEAR_SLOTS) {
        const key = `${creature.id}:${slot}`;
        const current = creature.worn[slot];
        if (current === undefined || pinned.has(key)) continue;
        const next = assigned.get(key);
        if (next === current) continue;
        const keep = scoreOf.get(`${creature.id}:${current}`);
        // A current item the creature may no longer wear (or that is not a candidate) is not kept.
        if (keep === undefined) continue;
        if (next === undefined || (scoreOf.get(`${creature.id}:${next}`) ?? 0) < keep) {
          pinned.add(key);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const moves: EquipMove[] = [];
  for (const creature of creatures) {
    for (const slot of GEAR_SLOTS) {
      const key = `${creature.id}:${slot}`;
      const next = assigned.get(key);
      const now = creature.worn[slot];
      if (next === undefined || next === now) continue;
      moves.push({ creatureId: creature.id, slot, itemId: next });
    }
  }
  return moves;
}

// --- Item levels by source ---

/** The item level of a raid finale piece at a Boss Rank (a Festival piece has the same: it is only a different base). */
export function finaleItemLevel(rank: number): number {
  return clampItemLevel(RULES.gear.itemLevel.finale.base + Math.trunc(rank));
}

/** The item level of a daily dungeon drop at a depth (a landmark adds a bonus). */
export function dungeonItemLevel(depth: number, landmark: boolean): number {
  const t = RULES.gear.itemLevel.dungeon;
  return clampItemLevel(
    t.base + Math.floor(Math.max(0, depth) / t.depthPerLevel) + (landmark ? t.landmarkBonus : 0),
  );
}

/** The item level of an expedition find for an explorer of this rank. */
export function expeditionItemLevel(explorerRank: number): number {
  return clampItemLevel(
    RULES.gear.itemLevel.expeditionPerRank * Math.max(1, Math.trunc(explorerRank)),
  );
}

/** The item level of a craft by a creature of this Crafting level. */
export function craftItemLevel(craftingLevel: number): number {
  return clampItemLevel(
    RULES.gear.itemLevel.craftPerLevel * Math.max(1, Math.trunc(craftingLevel)),
  );
}

/**
 * The item level of a converted item: the higher of `3 + Boss Rank` and the drop level of the
 * player's best dungeon depth (none: 0), at most 12 (what a fresh drop would give them today).
 */
export function convertedItemLevel(rank: number, bestDepth: number): number {
  const t = RULES.gear.itemLevel.convert;
  const dungeon = bestDepth > 0 ? dungeonItemLevel(bestDepth, false) : 0;
  return Math.min(t.max, Math.max(1, t.base + Math.trunc(rank), dungeon));
}

// --- Drops ---

/**
 * A drop's base: the slot by `dropSlotWeights`, then the base of that slot and tag (`element`; null
 * is neutral). A Charm is role-locked with `roleCharmBp` when `roleCharm` is on, for a role drawn
 * evenly. Then the base among those of that slot and tag the item level unlocks (`minItemLevel`), evenly.
 * A gear set's piece of that slot and tag is one of them once its level (12) is reached. The role lock
 * (finale only, `roleCharm`) also covers the Hats and Scarves of the role sets from that level: a role's
 * Charm, Hat or Scarf is drawn evenly among those of that role the level unlocks.
 * Draws the slot, then (for a Charm, or a Hat or Scarf that a role set unlocks, when allowed) the role
 * chance, then the base (a draw only when there is a choice).
 */
export function dropBase(
  rng: Rng,
  element: Element | null,
  itemLevel: number,
  options: { roleCharm?: boolean } = {},
): GearBase {
  const weights = RULES.gear.dropSlotWeights;
  const slot = pickWeighted(
    rng,
    GEAR_SLOTS.map((s) => ({ slot: s, weight: weights[s] })),
  ).slot;
  const level = clampItemLevel(itemLevel);
  const roles: Role[] = ['setter', 'payoff', 'support', 'guard'];
  if (
    options.roleCharm === true &&
    (slot === 'charm' || roles.some((r) => eligibleBases(slot, r, level, false, true).length > 0))
  ) {
    const lock = int(rng, 10_000) < RULES.gear.roleCharmBp;
    if (lock) {
      const role = roles[int(rng, roles.length)] as Role;
      const ofRole = eligibleBases(slot, role, level, false, true);
      const base = ofRole[ofRole.length > 1 ? int(rng, ofRole.length) : 0];
      if (base !== undefined) return base;
    }
  }
  // Any base of the slot and tag that the item level unlocks, evenly (Path of Exile style: a high
  // level drop can still be a plain base, and the plain base's lines can still be great).
  const eligible = eligibleBases(slot, element ?? 'neutral', level, false, true);
  const base = eligible[int(rng, Math.max(1, eligible.length))];
  if (base === undefined) throw new Error(`no ${slot} for ${element ?? 'neutral'}`);
  return base;
}
