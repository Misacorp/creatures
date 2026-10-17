/**
 * What the item picker says and filters, as plain functions: the short reason an item cannot be worn,
 * the one-line stats, and find and filter over a slot's items (search on the name, chips for rarity,
 * element and "Can wear"). Pure; the picker components only draw it. The wear rule itself is the game's
 * (`wearReason`); nothing here decides what a creature may wear.
 */
import type { Creature } from '../../api';
import { fold } from '../../creature-find';
import type { GearItem, GearRarity } from '../../gear-types';
import {
  RARITY_ORDER,
  equipChoices,
  gearName,
  itemElement,
  type EquipChoice,
  wearReason,
} from '../../gear-view';
import { capitalize } from '../../game';

/** Longest search the item field takes. */
export const ITEM_QUERY_MAX = 40;

/** The reason in as few words as fit beside a row or under a cell: "Lv 16", "Guards only". */
export function compactReason(
  item: Pick<GearItem, 'slot' | 'tag' | 'itemLevel' | 'needs'>,
  creature: Pick<Creature, 'level' | 'species'>,
): string | null {
  const reason = wearReason(item, creature);
  if (reason === null) return null;
  // The game's own sentences: "Guards only.", "Needs creature level 16.", "Scarfs open at level 7."
  if (reason.endsWith(' only.')) return reason.slice(0, -1);
  return `Needs Lv ${String(item.needs.level)}`;
}

/** An item's own numbers on one line: "Attack 44 · HP 38"; a Charm has none (empty string). */
export function statsLine(item: Pick<GearItem, 'stats'>): string {
  return item.stats.map((s) => s.text).join(' · ');
}

/** An item's lines on one line: "Wildfire bonus +18%, +60% Attack (this item)". */
export function linesLine(item: Pick<GearItem, 'lines'>): string {
  return item.lines.map((l) => l.text).join(', ');
}

/** The picker's choices for a slot: the bag's items (not the worn one) with who wears them and why not. */
export function pickerChoices(
  items: readonly GearItem[],
  creature: Pick<Creature, 'id' | 'level' | 'species'>,
  creatures: readonly Creature[],
  slot: GearItem['slot'],
): EquipChoice[] {
  return equipChoices(items, creature, creatures, slot);
}

export interface ItemFilters {
  /** Rarities to show; none selected: all. */
  rarities: readonly GearRarity[];
  /** Element ids to show; none selected: all. Items with no element (neutral, role pieces) only show when none is selected. */
  elements: readonly string[];
  /** Only items this creature can wear now. */
  canWear: boolean;
}

export const NO_ITEM_FILTERS: ItemFilters = { rarities: [], elements: [], canWear: false };

export function itemsFiltered(filters: ItemFilters, query: string): boolean {
  return (
    filters.canWear ||
    filters.rarities.length > 0 ||
    filters.elements.length > 0 ||
    query.trim() !== ''
  );
}

/** Whether a choice passes the chips and the search (name only, folded for case and accents). */
export function matchesItem(choice: EquipChoice, filters: ItemFilters, query: string): boolean {
  const { item } = choice;
  if (filters.canWear && choice.blocked !== null) return false;
  if (filters.rarities.length > 0 && !filters.rarities.includes(item.rarity)) return false;
  if (filters.elements.length > 0) {
    const element = itemElement(item.baseId);
    if (element === null || !filters.elements.includes(element)) return false;
  }
  const needle = fold(query.trim());
  return needle === '' || fold(gearName(item.baseId)).includes(needle);
}

export function filterChoices(
  choices: readonly EquipChoice[],
  filters: ItemFilters,
  query: string,
): EquipChoice[] {
  return choices.filter((c) => matchesItem(c, filters, query));
}

/** The rarity chips, in order. */
export const RARITY_CHIPS: readonly { id: GearRarity; name: string }[] = RARITY_ORDER.map((id) => ({
  id,
  name: capitalize(id),
}));

/** "12 / 20 items", the line under the chips ("No item matches." for none). */
export function itemResultLine(shown: number, total: number): string {
  if (shown === 0) return 'No item matches.';
  return `${String(shown)} / ${String(total)} items`;
}

/** The item to select first in the grid: the best one this creature can wear (the first), else the first. */
export function firstPick(choices: readonly EquipChoice[]): string | null {
  return (choices.find((c) => c.blocked === null) ?? choices[0])?.item.id ?? null;
}
