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
import { partBadge } from './count-items';
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

/** A supply or a part as a count badge (a supply with its name after the number). */
function badgeOf(i: Ingredient): CountItem {
  if (i.type === 'part') return { key: i.id, ...partBadge(i.id, i.amount) };
  return {
    key: `supply-${i.id}`,
    icon: { kind: 'supply', id: supplyKindOf(i.id) ?? 'unknown' },
    amount: i.amount,
    name: supplyName(i.id),
  };
}

/** "Needs 2 more Plain Lure." for the first input the player is short of, or null when none is. */
export function shortText(inputs: readonly RecipeInput[]): string | null {
  const short = inputs.find((i) => i.have < i.amount);
  if (short === undefined) return null;
  return `Needs ${String(short.amount - short.have)} more ${short.name ?? short.label ?? 'of those'}.`;
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
    .map((r) => ({
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
    }));
}

/** What a conversion takes a creature of this Crafting level, in milliseconds (the job's own time). */
export function conversionDurationFor(recipeId: string, level: number): number {
  const recipe = conversionRecipe(recipeId);
  return recipe === undefined ? 0 : conversionJobMs(recipe, level);
}
