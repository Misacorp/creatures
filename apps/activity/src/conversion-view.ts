/**
 * What the Workshop shows of the conversion recipes (refine and recycle): one view per recipe the player
 * has something to put into, with the amount needed and held of each input. Pure: the recipes are the
 * game's data, and the server checks every start again; nothing here decides what a recipe is.
 */
import {
  conversionJobMs,
  conversionRecipe,
  conversionRecipes,
  type Ingredient,
} from '@creatures/game';
import { baitCount, partBadge } from './count-items';
import type { PartsBundle } from './gear-types';
import { partsEntries } from './gear-view';
import { supplyKindOf, supplyName } from './trip-view';
import type { CountItem } from './ui/CountBadge';
import type { RecipeInput } from './ui/RecipeCard';

export interface ConversionView {
  id: string;
  kind: 'refine' | 'recycle';
  /** "Refine" or "Recycle", the button's words. */
  verb: string;
  inputs: RecipeInput[];
  outputs: CountItem[];
  /** The Crafting level a creature needs. */
  level: number;
}

/** A supply as a count badge, with its name after the number (what a craft makes). */
export function supplyBadge(supplyId: string, amount: number): CountItem {
  return {
    key: `supply-${supplyId}`,
    icon: { kind: 'supply', id: supplyKindOf(supplyId) ?? 'unknown' },
    amount,
    name: supplyName(supplyId),
  };
}

/** A supply or a part as a count badge (a supply with its name after the number). */
function badgeOf(i: Ingredient): CountItem {
  if (i.type === 'part') return { key: i.id, ...partBadge(i.id, i.amount) };
  return supplyBadge(i.id, i.amount);
}

/**
 * What a supply craft takes, as the recipe card's inputs: each part with the amount needed and held, and the
 * Bait of a lure (held: the player's Bait). The same look as a refine's inputs, so Craft, Refine and Recycle
 * show their recipe the same way.
 */
export function craftInputs(
  cost: PartsBundle,
  bait: number,
  parts: Readonly<Record<string, number>>,
  baitHeld: number,
): RecipeInput[] {
  const inputs = partsEntries(cost).map(({ kind, amount }): RecipeInput => ({
    key: kind,
    ...partBadge(kind, amount),
    amount,
    have: parts[kind] ?? 0,
  }));
  return bait > 0
    ? [{ ...baitCount(bait, { name: true }), amount: bait, have: baitHeld }, ...inputs]
    : inputs;
}

/** "Needs 2 more Plain Lure." for the first input the player is short of, or null when none is. */
export function shortText(inputs: readonly RecipeInput[]): string | null {
  const short = inputs.find((i) => i.have < i.amount);
  if (short === undefined) return null;
  return `Needs ${String(short.amount - short.have)} more ${short.name ?? short.label ?? 'of those'}.`;
}

function viewOf(
  r: ReturnType<typeof conversionRecipes>[number],
  stock: Readonly<Record<string, number>>,
  parts: Readonly<Record<string, number>>,
): ConversionView {
  return {
    id: r.id,
    kind: r.kind,
    verb: r.kind === 'refine' ? 'Refine' : 'Recycle',
    inputs: r.inputs.map((i): RecipeInput => ({
      ...badgeOf(i),
      amount: i.amount,
      have: i.type === 'supply' ? (stock[i.id] ?? 0) : (parts[i.id] ?? 0),
    })),
    outputs: r.outputs.map(badgeOf),
    level: r.craftingLevel,
  };
}

/**
 * The recipes of one kind the player holds at least one input supply for, in data order (a player who has
 * none of an input has nothing to refine or recycle there, so the Workshop does not list it).
 */
export function conversionViews(
  kind: 'refine' | 'recycle',
  stock: Readonly<Record<string, number>>,
  parts: Readonly<Record<string, number>>,
): ConversionView[] {
  return conversionRecipes()
    .filter((r) => r.kind === kind)
    .filter((r) => r.inputs.some((i) => i.type === 'supply' && (stock[i.id] ?? 0) > 0))
    .map((r) => viewOf(r, stock, parts));
}

/**
 * The recipe of one kind that takes this supply, held or not (null when the supply has none: the best
 * tier cannot be refined and basic supplies cannot be recycled).
 */
export function conversionOf(
  kind: 'refine' | 'recycle',
  supplyId: string,
  stock: Readonly<Record<string, number>>,
  parts: Readonly<Record<string, number>>,
): ConversionView | null {
  const recipe = conversionRecipes().find(
    (r) => r.kind === kind && r.inputs.some((i) => i.type === 'supply' && i.id === supplyId),
  );
  return recipe === undefined ? null : viewOf(recipe, stock, parts);
}

/** What a conversion takes a creature of this Crafting level, in milliseconds (the job's own time). */
export function conversionDurationFor(recipeId: string, level: number): number {
  const recipe = conversionRecipe(recipeId);
  return recipe === undefined ? 0 : conversionJobMs(recipe, level);
}
