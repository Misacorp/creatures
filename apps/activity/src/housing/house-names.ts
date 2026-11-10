/**
 * Plain helpers the housing panels share: names and lookups from the content, price lines as count items
 * (icons and numbers, never the currency's name), and what a player holds against a price. Pure.
 */
import {
  lineKey,
  type Holdings,
  type OwnHouseView,
  type PieceDef,
  type PriceLine,
  type SkinDef,
  type SpotType,
} from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import type { CountItem } from '../count-types';
import { acornCount, resourceCount, scrapCount, shardCount } from '../resource-count';
import type { RecipeInput } from '../ui/RecipeCard';

/** What a spot is called ("Small floor"), by its type. */
export const SPOT_NAMES: Readonly<Record<SpotType, string>> = {
  window: 'Window',
  'wall-large': 'Wall',
  'wall-small': 'Small wall',
  ceiling: 'Ceiling',
  'floor-large': 'Big floor place',
  'floor-small': 'Small floor',
  rug: 'Rug',
  display: 'Display',
  'yard-large': 'Big yard place',
  'yard-small': 'Small yard place',
  fence: 'Fence',
  poolside: 'Poolside',
  water: 'Water',
  porch: 'Porch',
};

const PIECES = new Map<string, PieceDef>(housing.pieces.map((p) => [p.id, p]));
const SKINS = new Map<string, SkinDef>(housing.skins.map((s) => [s.id, s]));

export const pieceOf = (id: string): PieceDef | undefined => PIECES.get(id);
export const skinOf = (id: string): SkinDef | undefined => SKINS.get(id);

/** A piece's or skin's name; the id itself for one the content does not know. */
export function itemName(id: string): string {
  return PIECES.get(id)?.name ?? SKINS.get(id)?.name ?? id;
}

/** The name of a set, or null for none. */
export function setName(id: string | null): string | null {
  if (id === null) return null;
  return housing.sets.find((s) => s.id === id)?.name ?? id;
}

/** The part's name. */
export function partName(id: string): string {
  return housing.parts.find((p) => p.id === id)?.name ?? id;
}

/** The family's first material: its icon stands for "any of the family". */
function familyIconId(family: string): string {
  return housing.materials.find((m) => m.family === family)?.id ?? 'unknown';
}

/** A price line as a count item (an icon and a number); `amount` replaces the line's own (what is left, what is held). */
export function lineCount(line: PriceLine, amount: number = line.amount): CountItem {
  switch (line.kind) {
    case 'bait':
      return { ...acornCount(amount), key: lineKey(line) };
    case 'scrap':
      return { ...scrapCount(amount), key: lineKey(line) };
    case 'shard':
      return { ...shardCount(line.element, amount), key: lineKey(line) };
    case 'material':
      return { ...resourceCount(line.id, amount), key: lineKey(line) };
    case 'family':
      return {
        ...resourceCount(familyIconId(line.family), amount),
        key: lineKey(line),
        label: `Any ${line.family}`,
      };
  }
}

/** What a player holds that a price can take. */
export function holdingsOf(own: OwnHouseView): Holdings {
  return {
    bait: own.purse.bait,
    scrap: own.purse.scrap,
    shards: own.purse.shards,
    materials: Object.fromEntries(Object.entries(own.materials).map(([id, m]) => [id, m.have])),
  };
}

/** How much of a price line's thing the player holds (a family line counts every material of the family). */
export function haveOf(line: PriceLine, own: OwnHouseView): number {
  switch (line.kind) {
    case 'bait':
    case 'scrap':
      return own.purse[line.kind];
    case 'shard':
      return own.purse.shards[line.element];
    case 'material':
      return own.materials[line.id]?.have ?? 0;
    case 'family':
      return housing.materials
        .filter((m) => m.family === line.family)
        .reduce((sum, m) => sum + (own.materials[m.id]?.have ?? 0), 0);
  }
}

/** Price lines as the inputs of a recipe (have / need). */
export function recipeInputs(lines: readonly PriceLine[], own: OwnHouseView): RecipeInput[] {
  return lines.map((line) => ({
    ...lineCount(line),
    amount: line.amount,
    have: haveOf(line, own),
  }));
}

/** True when the player holds all of every line. */
export function canAfford(lines: readonly PriceLine[], own: OwnHouseView): boolean {
  return lines.every((line) => haveOf(line, own) >= line.amount);
}

/** Cuts a long name to `max` characters with an ellipsis ("Aino-with-a-very-long-na…"); counts code points. */
export function cut(text: string, max: number): string {
  const points = [...text];
  return points.length <= max ? text : `${points.slice(0, Math.max(0, max - 1)).join('')}…`;
}
