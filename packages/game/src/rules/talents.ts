/**
 * Talents (docs/design/gear-and-creatures-v2.md section 8.1): what a catch rolls, how big a talent is,
 * how many slots a creature has at its level, which talents are active, how they read on a card and what
 * a talent is worth to a creature. A talent is a gear-line effect at one fixed value, so the fold
 * (`wornEffects` in `gear-items.ts`) is the same function that folds gear. Pure over `RULES.talents` and
 * the talent content; randomness is injected (`Rng`): the server passes its live crypto source, tests and
 * the simulator a seeded one.
 */
import {
  gearLine,
  talentDef,
  talentPool,
  talentSignature,
  TALENT_RULE_INFO,
  type LineUnit,
  type Rarity,
  type TalentDef,
} from '../content';
import { chance, int, type Rng } from '../rng';
import { RULES } from './config';
import {
  formatBp,
  lineScore,
  lineText,
  wornEffects,
  type FoldTalent,
  type Wearer,
} from './gear-items';
import type { Stats } from '../content/schema';

/** What a catch rolled: a talent id and whether it came out golden. */
export interface TalentRoll {
  talentId: string;
  golden: boolean;
}

/** A talent a creature holds (in its book): in a slot (1 to 3), or null when it only sits in the book. */
export interface HeldTalent extends TalentRoll {
  slot: number | null;
}

// --- Rolling ---

/**
 * Rolls the talent of one catch from its line's pool: even across the pool, then golden with chance
 * `RULES.talents.golden`. `exclude` talents are skipped (a creature never rolls the same talent twice
 * in one go); when that would leave nothing, the whole pool is used. Draws the pick, then the golden.
 * Throws for a line with no pool.
 */
export function rollTalent(
  rng: Rng,
  line: string,
  exclude: ReadonlySet<string> = new Set(),
): TalentRoll {
  const pool = talentPool(line);
  if (pool.length === 0) throw new RangeError(`line "${line}" has no talent pool`);
  const free = pool.filter((t) => !exclude.has(t.id));
  const from = free.length > 0 ? free : pool;
  const picked = from[int(rng, from.length)] as TalentDef;
  const { numerator, denominator } = RULES.talents.golden;
  return { talentId: picked.id, golden: chance(rng, numerator, denominator) };
}

// --- Size ---

/** The unit a talent's value is in: its line's, or the unit of a talent-only rule. */
export function talentUnit(def: TalentDef): LineUnit {
  if ('line' in def.effect) {
    const line = gearLine(def.effect.line);
    if (line === undefined) throw new Error(`talent "${def.id}" uses unknown line`);
    return line.unit;
  }
  return TALENT_RULE_INFO[def.effect.rule].unit;
}

/**
 * A golden talent's value: 1.5 times the normal one, rounded down to a whole percent or point (so
 * +14% is +21%, +3 pt is +4 pt, +25% is +37%). A flat amount or a once-only talent rounds to a whole number.
 */
export function goldenValue(unit: LineUnit, value: number): number {
  const times = Math.floor((value * RULES.talents.goldenBp) / 10_000);
  if ((unit === 'pct' || unit === 'pt') && value >= 100) return Math.floor(times / 100) * 100;
  return times;
}

/** A talent's value, normal or golden. */
export function talentValue(def: TalentDef, golden: boolean): number {
  return golden ? goldenValue(talentUnit(def), def.value) : def.value;
}

/** The talent as the fold takes it. */
export function foldTalent(def: TalentDef, golden: boolean): FoldTalent {
  return { id: def.id, effect: def.effect, value: talentValue(def, golden) };
}

/** A talent as the player reads it: its name, the effect in one phrase, a plain sentence and its value. */
export interface TalentText {
  id: string;
  name: string;
  golden: boolean;
  /** "First pounce +14%". */
  text: string;
  about: string;
  value: number;
  unit: LineUnit;
}

export function talentText(def: TalentDef, golden: boolean): TalentText {
  const value = talentValue(def, golden);
  if ('line' in def.effect) {
    const line = gearLine(def.effect.line);
    if (line === undefined) throw new Error(`talent "${def.id}" uses unknown line`);
    return {
      id: def.id,
      name: def.name,
      golden,
      text: lineText(line, value),
      about: line.about,
      value,
      unit: line.unit,
    };
  }
  const info = TALENT_RULE_INFO[def.effect.rule];
  return {
    id: def.id,
    name: def.name,
    golden,
    text: `${info.name} +${formatBp(value)}%`,
    about: info.about,
    value,
    unit: info.unit,
  };
}

// --- Slots ---

/** How many talent slots a species of this rarity has at most. */
export function slotCount(rarity: Rarity): number {
  return RULES.talents.slotsByRarity[rarity];
}

/** How many slots are open at a level: the ladder (1, 20, 25), up to the species' own number. */
export function slotsOpen(rarity: Rarity, level: number): number {
  const open = RULES.talents.slotLevels.filter((l) => level >= l).length;
  return Math.min(open, slotCount(rarity));
}

/** The creature level slot `slot` (1-based) opens at, or null for a slot a species of this rarity does not have. */
export function slotOpensAt(rarity: Rarity, slot: number): number | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > slotCount(rarity)) return null;
  return RULES.talents.slotLevels[slot - 1] ?? null;
}

/**
 * The talents that are active on a creature: its fixed signature talent (epic and Festival species;
 * always golden-free) and the talents in its open slots. Unknown ids (a talent that left the content)
 * are skipped.
 */
export function activeTalents(
  line: string,
  rarity: Rarity,
  level: number,
  held: readonly Pick<HeldTalent, 'talentId' | 'golden' | 'slot'>[],
): FoldTalent[] {
  const out: FoldTalent[] = [];
  const signature = talentSignature(line);
  if (signature !== undefined) out.push(foldTalent(signature, false));
  const open = slotsOpen(rarity, level);
  const bySlot = [...held]
    .filter((h) => h.slot !== null && h.slot >= 1 && h.slot <= open)
    .sort((a, b) => (a.slot as number) - (b.slot as number));
  for (const h of bySlot) {
    const def = talentDef(h.talentId);
    if (def !== undefined) out.push(foldTalent(def, h.golden));
  }
  return out;
}

// --- What a talent is worth to a creature ---

/** What the two talent-only rules are worth, as a `worth` of a gear line is (basis points of power). */
const RULE_WORTH = { speed: 1_500, glimmerFind: 100 } as const;

/** A creature as far as scoring a talent for it needs. */
export interface TalentWearer extends Wearer {
  stats: Pick<Stats, 'atk' | 'hp'>;
}

/**
 * What a talent is worth to a creature, in hundredths of its power (the same stand-in `itemScore` uses
 * for gear): the Attack and HP it adds exactly, any other effect as a share of power by its line's
 * `worth`, in full for the creature it is meant for and a quarter otherwise, and 0 when it does nothing for
 * this creature (a Guard's cover on a Setter). Deterministic, not a fight: it cannot see positions or the
 * week's boss, so Recommended is a good first pick and the player's own choice beats it.
 */
export function talentScore(talent: FoldTalent, wearer: TalentWearer): number {
  const fx = wornEffects(wearer, [], [talent]);
  const { stats } = wearer;
  let centi = Math.floor((stats.atk * fx.atkBp + fx.atkFlat * 10_000) / 100);
  centi += Math.floor((stats.hp * fx.hpBp + fx.hpFlat * 10_000) / 1_000);
  const powerCenti = stats.atk * 100 + stats.hp * 10;
  if ('line' in talent.effect) {
    const line = gearLine(talent.effect.line);
    if (line !== undefined) centi += lineScore(line, talent.value, wearer, powerCenti);
  } else {
    const worth = RULE_WORTH[talent.effect.rule];
    centi += Math.floor((powerCenti * talent.value * worth) / 100_000_000);
  }
  return centi;
}
