/**
 * The bag's filter and sort (phase 5 step 3, V-GEAR-7: "tools to manage the bag, not rules that hide loot"). Pure: items and a choice
 * in, the items to show out. Nothing here hides anything for good: a filter only decides what the grid draws, and "Select all" takes
 * what is drawn.
 */
import { elementName } from './game';
import type { GearItem, GearSlot } from './gear-types';
import { PILE_MAX, RARITY_ORDER, gearName, sortItems } from './gear-view';

export type SlotChoice = 'all' | GearSlot;
export type RarityChoice = 'all' | GearItem['rarity'];
/** An element's id, "none" (a piece tied to no element) or "all". */
export type ElementChoice = string;
export type SortChoice = 'best' | 'newest' | 'level';

export interface BagFilter {
  slot: SlotChoice;
  rarity: RarityChoice;
  element: ElementChoice;
  sort: SortChoice;
}

export const NO_FILTER: BagFilter = { slot: 'all', rarity: 'all', element: 'all', sort: 'best' };

export const SORT_OPTIONS: readonly { id: SortChoice; label: string }[] = [
  { id: 'best', label: 'Best first' },
  { id: 'level', label: 'Item level' },
  { id: 'newest', label: 'Newest' },
];

/** The element an item is tied to (its tag when the tag is an element), else null. */
export function itemElement(item: GearItem, elements: readonly string[]): string | null {
  return elements.includes(item.tag) ? item.tag : null;
}

/** Whether any filter is on (the sort alone is not a filter). */
export const isFiltered = (filter: BagFilter): boolean =>
  filter.slot !== 'all' || filter.rarity !== 'all' || filter.element !== 'all';

/** The items that pass the filter, in the chosen order. `elements` are the element ids the game has. */
export function shownItems(
  items: readonly GearItem[],
  filter: BagFilter,
  elements: readonly string[],
): GearItem[] {
  const passed = items.filter((item) => {
    if (filter.slot !== 'all' && item.slot !== filter.slot) return false;
    if (filter.rarity !== 'all' && item.rarity !== filter.rarity) return false;
    if (filter.element !== 'all') {
      const own = itemElement(item, elements);
      if (filter.element === 'none' ? own !== null : own !== filter.element) return false;
    }
    return true;
  });
  const best = sortItems(passed);
  switch (filter.sort) {
    case 'best':
      return best;
    case 'level':
      return [...best].sort(
        (a, b) =>
          b.itemLevel - a.itemLevel ||
          RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) ||
          gearName(a.baseId).localeCompare(gearName(b.baseId)) ||
          a.id.localeCompare(b.id),
      );
    case 'newest':
      return [...best].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }
}

/** The ids "Select all" takes: what is shown, at most one pile (the server's limit for a dismantle). */
export const selectableIds = (shown: readonly GearItem[]): string[] =>
  shown.slice(0, PILE_MAX).map((i) => i.id);

/** The words of an element choice. */
export const elementChoiceName = (choice: ElementChoice): string =>
  choice === 'all' ? 'Any' : choice === 'none' ? 'None' : elementName(choice);
