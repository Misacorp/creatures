/**
 * The item model of gear v2 (docs/design/gear-and-creatures-v2.md, sections 2 and 5): items with a
 * slot, a tag, an item level and rolled lines with tiers; rolling them; the wear rule; the fold of a
 * creature's worn items into its stats, crit bonus, modifier sheet and trip, Workshop and dungeon
 * rules; and "Equip best". Everything is pure over `RULES.gear` and the gear content, and randomness
 * is injected (`Rng`): the server passes its live crypto source, tests and the simulator a seeded one.
 * Nothing here touches the engine: the sheet it builds is plain numbers in the shape of `SlotMods`.
 */
import { content } from '../content';
import { baseFor, gearBase, gearContent, gearLine } from '../content/gear';
import {
  GEAR_SLOTS,
  tagElement,
  tagRole,
  type GearBase,
  type GearLine,
  type GearRarity,
  type GearSlot,
  type GearTag,
} from '../content/gear-schema';
import { ELEMENTS, type CritBonus, type Element, type Role, type Stats } from '../content/schema';
import type { TalentEffect } from '../content/talent-schema';
import { int, pickWeighted, type Rng } from '../rng';
import { RULES } from './config';

// --- The item ---

/** A rolled line of an item: its id and the tier it rolled (0 is tier I, 4 is tier V). */
export interface ItemLine {
  id: string;
  tier: number;
}

/** An item as the rules see it. The base line and the Festival glow come from the base, not from here. */
export interface GearItem {
  baseId: string;
  slot: GearSlot;
  tag: GearTag;
  rarity: GearRarity;
  /** 1 to `RULES.gear.maxItemLevel`, fixed when the item drops or is crafted. */
  itemLevel: number;
  lines: readonly ItemLine[];
}

/** How a creature looks to the gear rules. */
export interface Wearer {
  role: Role;
  element: Element;
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

/** The value of a base's fixed line (its implicit, the Festival glow) at an item level. */
export function fixedValue(values: readonly number[], itemLevel: number): number {
  return values[tierCap(itemLevel)] as number;
}

const RARITY_RANK: Record<GearRarity, number> = { common: 0, rare: 1, epic: 2, festival: 2 };
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

/** True if a rarity fits a base: Festival pieces only Festival, the rest never. */
export function rarityFitsBase(base: Pick<GearBase, 'festival'>, rarity: GearRarity): boolean {
  return (base.festival === true) === (rarity === 'festival');
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
 * Compass raises utility lines and lowers combat lines). The weights are 10 times the content's, so
 * the 0.3 multiplier stays an integer.
 */
export function linePool(
  base: Pick<GearBase, 'slot' | 'tag'>,
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
    if (raw <= 0) continue;
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
 * the same line twice, each with its own tier. Draws in a fixed order (the line, then its tier).
 */
export function rollLines(
  rng: Rng,
  base: Pick<GearBase, 'slot' | 'tag'>,
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
    out.push({
      id: picked.line.id,
      tier: picked.line.single ? 0 : rollTier(rng, itemLevel, minTier),
    });
  }
  return out;
}

/** Rolls a whole item of a base. Throws RangeError for an unknown base or a rarity the base cannot have. */
export function rollItem(
  rng: Rng,
  spec: { baseId: string; rarity: GearRarity; itemLevel: number; minTier?: number },
): GearItem {
  const base = baseOrThrow(spec.baseId);
  if (!rarityFitsBase(base, spec.rarity)) {
    throw new RangeError(`base "${spec.baseId}" cannot be ${spec.rarity}`);
  }
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
    case 'once':
      return '';
  }
}

/** A line as one phrase: "Attack +6%", "Unbothered". */
export function lineText(line: GearLine, value: number): string {
  const number = formatLineValue(line, value);
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
}

/** Every line of an item in card order: the base line, the Festival glow, then the rolled lines. */
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
    });
  };
  fixed(base.implicit, 'base');
  fixed(base.fixed, 'fixed');
  const best = tierCap(item.itemLevel) + 1;
  for (const rolled of item.lines) {
    const line = gearLine(rolled.id);
    if (line === undefined) throw new Error(`item has unknown line "${rolled.id}"`);
    const value = lineValue(line, rolled.tier);
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
    });
  }
  return out;
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
});

const RULE_FIELD = {
  trailXp: 'trailXpBp',
  quickFeet: 'quickFeetBp',
  keenNose: 'keenNoseBp',
  luckyFind: 'luckyFindBp',
  packer: 'packerBp',
  busyPaws: 'busyPawsBp',
  apprentice: 'apprenticeBp',
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
  atkBp: number;
  atkFlat: number;
  hpBp: number;
  hpFlat: number;
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

/** The element that `element` is strong against (Tide beats Ember). */
function beatenBy(element: Element): Element {
  const found = content.elements.find((e) => e.id === element);
  if (found === undefined) throw new Error(`unknown element "${element}"`);
  return found.strongAgainst;
}

/** The element that is strong against `element` (Spark beats Tide). */
function beaterOf(element: Element): Element {
  const found = content.elements.find((e) => e.strongAgainst === element);
  if (found === undefined) throw new Error(`nothing beats "${element}"`);
  return found.id;
}

/** The id of the reaction an element sets off (Tide: steam). */
function reactionOf(element: Element): string {
  const found = content.reactions.find((r) => r.triggerElement === element);
  if (found === undefined) throw new Error(`no reaction is set off by "${element}"`);
  return found.id;
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
  | 'mendBp';

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

/**
 * Everything a creature's worn items give, summed. Lines that do nothing for the wearer (a Guard's
 * armor on a Support, an Attunement of another element) are listed in `idle` and add nothing. The
 * sheet's conditions are resolved here: an element Hunter becomes a bonus against the element it beats,
 * an element Ward a reduction against the element that beats it, a reaction line the bonus of that
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
  const apply = (line: GearLine, value: number, talentId: string | null = null): void => {
    if (!lineApplies(line, wearer)) {
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
      case 'glow':
        out.atkBp += value;
        out.hpBp += value;
        break;
      case 'hunter': {
        const foe = beatenBy(line.element as Element);
        sheet.vsElementBp = addTo(sheet.vsElementBp, foe, value);
        break;
      }
      case 'ward': {
        const foe = beaterOf(line.element as Element);
        sheet.wardBp = addTo(sheet.wardBp, foe, value);
        break;
      }
      case 'reaction':
        sheet.reactionBp = addTo(sheet.reactionBp, reactionOf(line.element as Element), value);
        break;
      case 'besideRole':
        sheet.besideRoleBp = addTo(sheet.besideRoleBp, effect.role, value);
        break;
      case 'sheet':
        if (effect.field === 'lingerRounds') {
          sheet.lingerRounds = Math.min(3, (sheet.lingerRounds ?? 0) + value);
        } else if (effect.field === 'ignoreSilence') {
          sheet.ignoreSilence = 1;
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
  for (const item of items) {
    for (const resolved of itemLines(item)) {
      const line = gearLine(resolved.id);
      if (line !== undefined) apply(line, resolved.value);
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
  for (const field of [
    'pierceBp',
    'takenBp',
    'areaBp',
    'aimedBp',
    'reflectedBp',
    'chargedBp',
  ] as const) {
    const value = sheet[field];
    if (value !== undefined) sheet[field] = Math.min(10_000, value);
  }
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
 * percentages and then the flat amounts of the items and talents, Speed by a talent's share, the crit lines added to the crit bonus, the sheet for `FightSlot.mods`
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
  if (items.length === 0 && talents.length === 0) {
    return { stats, crit, mods: undefined, rules: NO_GEAR_RULES };
  }
  const fx = wornEffects(wearer, items, talents);
  const scale = (value: number, bp: number, flat: number): number =>
    Math.floor((value * (10_000 + bp)) / 10_000) + flat;
  const folded: Stats = {
    hp: scale(stats.hp, fx.hpBp, fx.hpFlat),
    atk: scale(stats.atk, fx.atkBp, fx.atkFlat),
    spd: scale(stats.spd, fx.spdBp, 0),
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
 * counted exactly (percent, flat, an Attunement of the wearer's element, the Festival glow); every
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
  let centi = Math.floor((stats.atk * fx.atkBp + fx.atkFlat * 10_000) / 100);
  centi += Math.floor((stats.hp * fx.hpBp + fx.hpFlat * 10_000) / 1_000);
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

/** The item level of a raid finale piece at a Boss Rank. */
export function finaleItemLevel(rank: number): number {
  return clampItemLevel(RULES.gear.itemLevel.finale.base + Math.trunc(rank));
}

/** The item level of a Festival finale piece at a Boss Rank. */
export function festivalItemLevel(rank: number): number {
  return clampItemLevel(RULES.gear.itemLevel.festival.base + Math.trunc(rank));
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
 * evenly. Draws the slot, then (for a Charm, when allowed) the role chance.
 */
export function dropBase(
  rng: Rng,
  element: Element | null,
  options: { roleCharm?: boolean } = {},
): GearBase {
  const weights = RULES.gear.dropSlotWeights;
  const slot = pickWeighted(
    rng,
    GEAR_SLOTS.map((s) => ({ slot: s, weight: weights[s] })),
  ).slot;
  if (slot === 'charm' && options.roleCharm === true) {
    const lock = int(rng, 10_000) < RULES.gear.roleCharmBp;
    if (lock) {
      const roles: Role[] = ['setter', 'payoff', 'support', 'guard'];
      const role = roles[int(rng, roles.length)] as Role;
      const base = baseFor('charm', role);
      if (base !== undefined) return base;
    }
  }
  const base = baseFor(slot, element ?? 'neutral');
  if (base === undefined) throw new Error(`no ${slot} for ${element ?? 'neutral'}`);
  return base;
}

/** The tags an element can have, for tests and the sim. */
export const ELEMENT_TAGS: readonly Element[] = ELEMENTS;
