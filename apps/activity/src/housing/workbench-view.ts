/**
 * The workbench as plain data (`WorkbenchPanel.tsx` draws it): every blueprint the player knows as a recipe
 * (materials, Acorns and scrap in, the piece or skin out), grouped by set, then the wild pieces, the garden pieces and
 * the exterior skins. Pure.
 */
import {
  housing,
  piecePrice,
  skinPrice,
  type OwnHouseView,
  type PriceLine,
  type SpotType,
} from '@creatures/game';
import type { CountItem } from '../count-types';
import { canAfford, itemName, recipeInputs, setName } from './house-names';
import type { RecipeInput } from '../ui/RecipeCard';

/** One blueprint as a recipe. */
export interface RecipeView {
  id: string;
  name: string;
  kind: 'piece' | 'skin';
  inputs: RecipeInput[];
  output: CountItem;
  /** Copies of the piece the player owns (a skin: 1 or 0). */
  owned: number;
  /** A skin that is made already: nothing more to make. */
  done: boolean;
  /** Everything is held. */
  affordable: boolean;
  /** Why "Make" is off, or null when it can be pressed. */
  reason: string | null;
}

export interface RecipeGroup {
  id: string;
  title: string;
  recipes: RecipeView[];
  /** Recipes that can be made right now. */
  ready: number;
  /** The pieces of the set (or of the wild or garden pieces) the player owns, and how many there are: the catalogue's "3 / 9". Null for the skins. */
  held: { owned: number; total: number } | null;
}

const OUTDOOR_SPOTS: ReadonlySet<SpotType> = new Set([
  'yard-large',
  'yard-small',
  'fence',
  'poolside',
  'water',
]);

/**
 * The parts that stand built, worked out from what the server tells the owner: a part is built when every part it
 * needs is built and it is not offered for building (the hut always is).
 */
export function builtFromOwn(own: Pick<OwnHouseView, 'buildable'>): Set<string> {
  const built = new Set<string>(['hut']);
  for (let changed = true; changed;) {
    changed = false;
    for (const part of housing.parts) {
      if (built.has(part.id) || own.buildable.includes(part.id)) continue;
      if (part.requires.every((id) => built.has(id))) {
        built.add(part.id);
        changed = true;
      }
    }
  }
  return built;
}

/** The ids of every piece and skin the player may make: starters, learned blueprints and what built parts teach. */
export function knownIds(own: OwnHouseView): Set<string> {
  const known = new Set<string>(own.items.blueprints);
  for (const id of own.items.skins) known.add(id);
  const built = builtFromOwn(own);
  for (const item of [...housing.pieces, ...housing.skins]) {
    if (item.unlock.kind === 'starter') known.add(item.id);
    if (item.unlock.kind === 'part' && built.has(item.unlock.part)) known.add(item.id);
  }
  for (const part of housing.parts) {
    if (built.has(part.id)) for (const id of part.unlocks) known.add(id);
  }
  return known;
}

function recipe(
  id: string,
  kind: 'piece' | 'skin',
  lines: readonly PriceLine[],
  own: OwnHouseView,
): RecipeView {
  const name = itemName(id);
  const owned =
    kind === 'piece' ? (own.items.pieces[id] ?? 0) : own.items.skins.includes(id) ? 1 : 0;
  const done = kind === 'skin' && owned > 0;
  const affordable = canAfford(lines, own);
  return {
    id,
    name,
    kind,
    inputs: recipeInputs(lines, own),
    // How many the player has shows beside the piece, so a craft is seen to count (1 becomes 2).
    output: {
      key: id,
      icon: { kind: 'house', id },
      label: name,
      name,
      ...(kind === 'piece' && owned > 0
        ? { amount: owned, spokenAmount: `${String(owned)} owned` }
        : {}),
    },
    owned,
    done,
    affordable,
    reason: done ? 'You have it already.' : affordable ? null : 'Not enough yet.',
  };
}

/** Every known blueprint as a recipe, in groups: each set, the wild pieces, the garden pieces, the exterior skins. */
export function workbenchGroups(own: OwnHouseView): RecipeGroup[] {
  const known = knownIds(own);
  const pieceRecipe = (id: string) => recipe(id, 'piece', piecePrice(housing, id), own);
  const skinRecipe = (id: string) => recipe(id, 'skin', skinPrice(housing, id), own);
  const makeable = (skinId: string) => {
    const skin = housing.skins.find((s) => s.id === skinId);
    return skin !== undefined && skin.kind !== 'ground' && known.has(skinId);
  };
  const groups: Omit<RecipeGroup, 'ready'>[] = [];
  const heldOf = (pieces: readonly { id: string }[]): { owned: number; total: number } => ({
    owned: pieces.filter((p) => (own.items.pieces[p.id] ?? 0) > 0).length,
    total: pieces.length,
  });
  for (const set of housing.sets) {
    groups.push({
      id: set.id,
      title: setName(set.id) ?? set.id,
      recipes: [
        ...housing.pieces
          .filter((p) => p.set === set.id && known.has(p.id))
          .map((p) => pieceRecipe(p.id)),
        ...housing.skins
          .filter((s) => s.set === set.id && makeable(s.id))
          .map((s) => skinRecipe(s.id)),
      ],
      held: heldOf(housing.pieces.filter((p) => p.set === set.id)),
    });
  }
  const formSpot = new Map(housing.forms.map((f) => [f.id, f.spot]));
  const loose = housing.pieces.filter((p) => p.set === null && known.has(p.id));
  const outdoor = (form: string) => {
    const spot = formSpot.get(form);
    return spot !== undefined && OUTDOOR_SPOTS.has(spot);
  };
  groups.push({
    id: 'wild',
    title: 'Wild pieces',
    recipes: loose.filter((p) => !outdoor(p.form)).map((p) => pieceRecipe(p.id)),
    held: heldOf(housing.pieces.filter((p) => p.set === null && !outdoor(p.form))),
  });
  groups.push({
    id: 'garden',
    title: 'Garden and pool',
    recipes: loose.filter((p) => outdoor(p.form)).map((p) => pieceRecipe(p.id)),
    held: heldOf(housing.pieces.filter((p) => p.set === null && outdoor(p.form))),
  });
  groups.push({
    id: 'exterior',
    title: 'Roofs and walls',
    recipes: housing.skins
      .filter((s) => s.set === null && makeable(s.id))
      .map((s) => skinRecipe(s.id)),
    held: null,
  });
  return groups
    .filter((g) => g.recipes.length > 0)
    .map((g) => ({ ...g, ready: g.recipes.filter((r) => !r.done && r.affordable).length }));
}

/** One item's recipe by id (a piece or a skin), whether or not it is known; undefined for an id the content lacks. */
export function recipeFor(id: string, own: OwnHouseView): RecipeView | undefined {
  if (housing.pieces.some((p) => p.id === id))
    return recipe(id, 'piece', piecePrice(housing, id), own);
  if (housing.skins.some((s) => s.id === id))
    return recipe(id, 'skin', skinPrice(housing, id), own);
  return undefined;
}

/** The id of the group that holds an item, or null. */
export function groupOf(groups: readonly RecipeGroup[], itemId: string): string | null {
  return groups.find((g) => g.recipes.some((r) => r.id === itemId))?.id ?? null;
}
