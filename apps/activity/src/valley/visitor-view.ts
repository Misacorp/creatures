/**
 * What the valley says about the weekly visitor (phase 5 step 8b, `systems/visitor.md` V-VIS-1 to 5), as plain functions over the server's
 * answers (`GET /api/valley/visitor`, the reroll's and the blueprint's): where he stands, his prices as count items (an icon and a number,
 * never the resource's name), what a player is short of, the odds of a reroll in a few words, and the pieces a player can hand him. Pure:
 * no clock and no request. There is no timer and no "until Saturday" line anywhere: while he is here the page never counts down, and while
 * he is away his spot says he is back Thursday (V-VIS-1, V-RET-7).
 */
import type { RerollOddsView, VisitorPriceView, VisitorViewState } from '@creatures/game';
import type { GearItem } from '../gear-types';
import type { CountItem } from '../count-types';
import {
  acornCount,
  anyShardCount,
  priceOf,
  scrapCount,
  type Price,
  type ShortOf,
} from '../resource-count';

/** The visitor's view when he is here (his stock is shown). */
export type VisitorHere = Extract<VisitorViewState, { here: true }>;

/** True when the server says he is here. */
export const isHere = (view: VisitorViewState | null | undefined): view is VisitorHere =>
  view !== null && view !== undefined && view.here;

/** The one line of his shuttered spot (V-VIS-1): when he is back, never a timer. */
export const AWAY_LINE = 'The stall is shuttered. Back Thursday.';

/** What his place says before the server has answered (or with the valley's systems off): the "not open yet" line. */
export const WAITING_LINE = 'A stranger will set up a stall here once a week.';

/** The Places list's line for his place: his stall is open, or he is back Thursday; null until the server has said. */
export function visitorLine(view: VisitorViewState | null | undefined): string | null {
  if (view === null || view === undefined) return null;
  return view.here ? 'the stall is open' : 'back Thursday';
}

/** What a player holds of what he asks for: Acorns, scrap and shards of every element together. */
export interface Purse {
  acorns: number;
  scrap: number;
  shards: number;
}

/** The shards a player holds, of every element, as one number (the blueprint takes shards of any kind). */
export function shardsHeld(parts: Readonly<Record<string, number>> | null): number {
  if (parts === null) return 0;
  return Object.entries(parts)
    .filter(([kind]) => kind.endsWith('-shard'))
    .reduce((sum, [, n]) => sum + n, 0);
}

/** A reroll's price as a price line: Acorns and scrap (a free one reads "free"). */
export const rerollPrice = (price: VisitorPriceView): Price =>
  priceOf([acornCount(price.acorns), scrapCount(price.scrap)]);

/** A reroll's price as count items (for a button's cost). */
export const rerollCost = (price: VisitorPriceView): CountItem[] => rerollPrice(price).items;

/** What a player is short of for a reroll ("You have [3] [20]; this costs [60] [400]"): null when it can be paid. */
export function rerollShort(price: VisitorPriceView, purse: Purse): ShortOf | null {
  if (purse.acorns >= price.acorns && purse.scrap >= price.scrap) return null;
  return {
    have: [acornCount(purse.acorns), scrapCount(purse.scrap)],
    cost: [acornCount(price.acorns), scrapCount(price.scrap)],
  };
}

/** The week's blueprint's price as count items: Acorns and shards of any kind. */
export const blueprintCost = (blueprint: VisitorHere['blueprint']): CountItem[] => [
  acornCount(blueprint.acorns),
  anyShardCount(blueprint.shards),
];

/** What a player is short of for the blueprint: null when it can be paid. */
export function blueprintShort(blueprint: VisitorHere['blueprint'], purse: Purse): ShortOf | null {
  if (purse.acorns >= blueprint.acorns && purse.shards >= blueprint.shards) return null;
  return {
    have: [acornCount(purse.acorns), anyShardCount(purse.shards)],
    cost: blueprintCost(blueprint),
  };
}

/** A tier of the roller (0 is the first) as the card shows it: "Tier 5 / 5". */
export const tierText = (tier: number): string => `Tier ${String(tier + 1)} / 5`;

const percent = (share: number): string => `${String(Math.round(share * 100))}%`;

/**
 * The odds of a reroll in a few short lines (V-VIS-2): how many lines are drawn again, the chance each has of the best tier this piece's
 * item level allows, and (when some of what can be drawn is a single line) that those have no tier.
 */
export function oddsLines(odds: RerollOddsView): string[] {
  const lines = [
    odds.lines === 1
      ? 'Its one line is drawn again.'
      : `All ${String(odds.lines)} of its lines are drawn again.`,
  ];
  lines.push(
    odds.topChance >= 1
      ? `This piece can only reach ${tierText(odds.topTier)}, so every tiered line lands there.`
      : `Each tiered line has a ${percent(odds.topChance)} chance of ${tierText(odds.topTier)}, the best this piece can reach.`,
  );
  if (odds.singleShare > 0) {
    lines.push(
      `About ${percent(odds.singleShare)} of what can be drawn is a single line, with no tier.`,
    );
  }
  return lines;
}

/** The plain warning before and after a reroll: there is no keeping the old version (V-VIS-2). */
export const GONE_LINE = 'The old lines are gone for good. There is no keeping the old version.';

/** The pieces a player can hand him, worn ones first, then the bag by item level (the higher first), then by name for a steady order. */
export function pieces(items: readonly GearItem[]): GearItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.equippedOn !== null) - Number(a.equippedOn !== null) ||
      b.itemLevel - a.itemLevel ||
      a.baseId.localeCompare(b.baseId) ||
      a.id.localeCompare(b.id),
  );
}

/** What the blueprint card says under the piece, by what the player knows: a copy adds a mark of quality (as every other source does). */
export function blueprintNote(known: boolean): string {
  return known
    ? 'You know this one already: a copy adds a mark of quality.'
    : 'A new one for you. A copy of it later adds a mark of quality.';
}
