/**
 * Amounts of a resource as count items, the one way a cost, price, need or holding is shown (Misa, 2026-11-06:
 * "Use the shard icons to indicate cost. Don't spell them out anywhere. Same for acorns and scrap"): the
 * resource's icon from the resource library and a number. The name is only the spoken label for assistive
 * technology. Pure: nothing here touches the DOM.
 */
import { resourceName } from '@creatures/game';
import { resourceIconRef, type IconRef } from './icon-ref';
import type { CountItem } from './ui/CountBadge';

/** The neutral shard of "any element" (the Market's shards of any kind, the exchange's rates). */
export const ANY_SHARD_ICON: IconRef = { kind: 'glyph', id: 'shard-any' };

/** A resource of the library ("bait", "scrap", "essence", "ember-shard") as a count item; `entry` opens its glossary entry. */
export function resourceCount(
  id: string,
  amount: number,
  options: { entry?: string } = {},
): CountItem {
  return {
    key: id,
    icon: resourceIconRef(id),
    amount,
    label: resourceName(id, amount),
    ...(options.entry === undefined ? {} : { entry: options.entry }),
  };
}

/** Acorns: the `bait` resource (its icon shows; the name does not). */
export const acornCount = (amount: number): CountItem => resourceCount('bait', amount);

/** Scrap. */
export const scrapCount = (amount: number): CountItem => resourceCount('scrap', amount);

/** Essence. */
export const essenceAmount = (amount: number): CountItem => resourceCount('essence', amount);

/** What something costs: the amounts as count items, or a word ("free") when there is nothing to pay. */
export interface Price {
  text: string;
  items: CountItem[];
}

/** A price of the amounts that are above zero; "free" when none is. */
export function priceOf(items: readonly CountItem[]): Price {
  const paid = items.filter((item) => Number(item.amount) > 0);
  return paid.length === 0 ? { text: 'free', items: [] } : { text: '', items: paid };
}

/** What a player has against what a thing costs, for the line that says why it cannot be paid ("You have 3; this costs 10"). */
export interface ShortOf {
  have: CountItem[];
  cost: CountItem[];
}

/** Shards of any kind. */
export function anyShardCount(amount: number): CountItem {
  return { key: 'shards:any', icon: ANY_SHARD_ICON, amount, label: 'Shards of any kind' };
}

/** Shards of one element ("tide", "ember", ...); an element the library does not know shows the any-shard icon. */
export function shardCount(element: string, amount: number): CountItem {
  const id = `${element}-shard`;
  return resourceName(id) === id
    ? anyShardCount(amount)
    : { ...resourceCount(id, amount), key: `shards:${element}` };
}

/** A line of words with resources in it: strings are text, count items are drawn as an icon (and a number when it has one). */
export type Say = readonly (string | CountItem)[];

/** A resource's icon with no number ("Waiting for [scrap]"). */
export function resourceMark(id: string): CountItem {
  return { key: id, icon: resourceIconRef(id), label: resourceName(id) };
}

/** The any-shard icon with no number. */
export const anyShardMark = (): CountItem => ({
  key: 'shards:any',
  icon: ANY_SHARD_ICON,
  label: 'Shards of any kind',
});

/** A shard of one element with no number. */
export function shardMark(element: string): CountItem {
  const { key, icon, label } = shardCount(element, 0);
  return { key, icon, ...(label === undefined ? {} : { label }) };
}

/** The words of a `Say`, for assistive technology: text as it is, each count item as its label and number. */
export function sayText(say: Say): string {
  return say
    .map((part) =>
      typeof part === 'string'
        ? part
        : part.amount === undefined
          ? (part.label ?? '')
          : `${String(part.amount)} ${part.label ?? ''}`,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
