/**
 * Workshop conversions (refine, recycle; `content/data/conversions.json`): what a recipe takes and gives,
 * whether a player can start it, how long it takes and what experience it gives. Pure functions over the
 * recipe data and `RULES.gear.skill`; nothing here reads a supply's effects, only its id.
 */
import { conversionContent, type ConversionDef, type Ingredient } from '../content';
import { RULES } from './config';
import type { PartsBundle } from './gear';

const BP = 10_000;
const HOUR_MS = 3_600_000;

const RECIPES = new Map<string, ConversionDef>(conversionContent.map((c) => [c.id, c]));

/** Every recipe, in data order. */
export function conversionRecipes(): readonly ConversionDef[] {
  return conversionContent;
}

/** A recipe by id (`refine-lure-basic`), or undefined. */
export function conversionRecipe(id: string): ConversionDef | undefined {
  return RECIPES.get(id);
}

/** What a player holds that a recipe can use. */
export interface ConversionStock {
  /** Supply id to amount. */
  supplies: Readonly<Record<string, number>>;
  parts: PartsBundle;
}

/** A recipe's supplies and parts, split by type (amounts by id). */
export interface ConversionBundle {
  supplies: Record<string, number>;
  parts: PartsBundle;
}

function bundleOf(list: readonly Ingredient[]): ConversionBundle {
  const out: ConversionBundle = { supplies: {}, parts: {} };
  for (const i of list) {
    if (i.type === 'supply') out.supplies[i.id] = (out.supplies[i.id] ?? 0) + i.amount;
    else out.parts[i.id] = (out.parts[i.id] ?? 0) + i.amount;
  }
  return out;
}

/** What a recipe takes. */
export function conversionInputs(def: ConversionDef): ConversionBundle {
  return bundleOf(def.inputs);
}

/** What a recipe gives. */
export function conversionOutputs(def: ConversionDef): ConversionBundle {
  return bundleOf(def.outputs);
}

/** Why a recipe cannot be started now (checked in this order), or null when it can. */
export type ConversionBlock = 'skill_too_low' | 'insufficient_supplies' | 'insufficient_parts';

export function conversionBlock(
  def: ConversionDef,
  craftingLevel: number,
  stock: ConversionStock,
): ConversionBlock | null {
  if (craftingLevel < def.craftingLevel) return 'skill_too_low';
  const need = conversionInputs(def);
  for (const [id, amount] of Object.entries(need.supplies)) {
    if ((stock.supplies[id] ?? 0) < amount) return 'insufficient_supplies';
  }
  for (const [kind, amount] of Object.entries(need.parts)) {
    if ((stock.parts[kind as keyof PartsBundle] ?? 0) < amount) return 'insufficient_parts';
  }
  return null;
}

/** How long a conversion takes a creature of this Crafting level: its hours less the skill's share. */
export function conversionJobMs(def: ConversionDef, craftingLevel: number): number {
  const levels = RULES.gear.skill.xpForLevel.length;
  const above = Math.max(0, Math.min(levels, Math.trunc(craftingLevel)) - 1);
  const keepBp = BP - RULES.gear.skill.timeReductionBpPerLevel * above;
  return Math.floor((def.hours * HOUR_MS * keepBp) / BP);
}

/** The Crafting XP a finished conversion gives: its nominal hours times the usual XP per hour. */
export function conversionXp(def: ConversionDef): number {
  return def.hours * RULES.gear.skill.xpPerHour;
}
