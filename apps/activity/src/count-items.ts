/**
 * The count badges every reward and cost line is built from, in one place: Essence, Bait, supplies and
 * parts as `CountItem`s (an icon, a number, and the words a screen reader says). Screens differ only in
 * whether a badge opens a glossary entry or shows its name after the number, so those are options.
 * Pure: nothing here touches the DOM.
 */
import { GLOSSARY_IDS, type PartKind } from '@creatures/game';
import type { PartsBundle } from './gear-types';
import { partName, partsEntries } from './gear-view';
import type { IconRef } from './icon-ref';
import { supplyKindOf, supplyName } from './trip-view';
import type { CountBadgeProps, CountItem } from './ui/CountBadge';

/** The pictures of Essence and Bait, for every list that draws them (count badges, the reward pile, gifts). */
export const ESSENCE_ICON: IconRef = { kind: 'glyph', id: 'gem' };
export const BAIT_ICON: IconRef = { kind: 'glyph', id: 'bait' };

/** What differs between screens: a tap-for-help tag on the badge, and the name written after the number. */
export interface CountOptions {
  entry?: boolean;
  name?: boolean;
}

/** An Essence badge ("Essence: 4" spoken); `entry` makes it open the glossary, `name` writes "Essence" after it. */
export function essenceCount(amount: number, options: CountOptions = {}): CountItem {
  return {
    key: 'essence',
    icon: ESSENCE_ICON,
    amount,
    label: 'Essence',
    ...(options.entry === true ? { entry: 'essence' } : {}),
    ...(options.name === true ? { name: 'Essence' } : {}),
  };
}

/** A Bait badge, with the same options as `essenceCount`. */
export function baitCount(amount: number, options: CountOptions = {}): CountItem {
  return {
    key: 'bait',
    icon: BAIT_ICON,
    amount,
    label: 'Bait',
    ...(options.entry === true ? { entry: 'bait' } : {}),
    ...(options.name === true ? { name: 'Bait' } : {}),
  };
}

/** One badge per kind of supply found, with the supply's name after the number. */
export function supplyCounts(
  supplies: readonly { id: string; name: string; amount: number }[],
): CountItem[] {
  return supplies.map((s) => ({
    key: `supply-${s.id}`,
    icon: { kind: 'supply', id: supplyKindOf(s.id) ?? 'unknown' },
    amount: s.amount,
    name: s.name,
  }));
}

/** The count badge of one kind of part, with the part's name spoken. */
export function partBadge(kind: PartKind, amount: number): CountBadgeProps {
  return {
    icon: { kind: 'part', part: kind },
    amount,
    label: partName(kind),
    entry: GLOSSARY_IDS.part(kind),
  };
}

/** The count badges of a bundle of parts, in the order of the part kinds, without the empty ones. */
export function partCountItems(parts: PartsBundle): CountItem[] {
  return partsEntries(parts).map(({ kind, amount }) => ({ key: kind, ...partBadge(kind, amount) }));
}

/**
 * The badges of what a recipe takes or gives: its supplies (with the supply's name after the number), then
 * its parts. Supplies come in the order of the ids given, so a screen can keep the recipe's own order.
 */
export function conversionCountItems(bundle: {
  supplies: Readonly<Record<string, number>>;
  parts: PartsBundle;
}): CountItem[] {
  return [
    ...supplyCounts(
      Object.entries(bundle.supplies).map(([id, amount]) => ({ id, name: supplyName(id), amount })),
    ),
    ...partCountItems(bundle.parts),
  ];
}
