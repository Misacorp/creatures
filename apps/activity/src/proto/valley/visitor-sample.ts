/**
 * The visitor's stock and rerolls as SAMPLE data for the prototype (V-VIS-2, V-VIS-3, V-VIS-5). The prices are
 * the economy lab's (`packages/econ` rules: 60 Acorns and 400 scrap at item level 10, linear in the item level,
 * times 1.5 for each reroll already made that week); the purse, the week's blueprint and the rolls are made up
 * here. A reroll draws all of a piece's lines again with the game's own roll (`rollItem`, the same pools at its
 * item level) from a fixed seed built from the piece's id and how many rerolls came before, so the same taps
 * always give the same result (never `Math.random`). Pure: no clock, no randomness.
 */
import type { GearItem } from '../../gear-types';
import { sampleGearItem } from '../../workbench/gear-sample';

/** What a reroll costs at item level 10, and the rise for each reroll already made this week (the lab's rules). */
export const REROLL = { acorns: 60, scrap: 400, baseLevel: 10, growth: 1.5 } as const;

/** The lab's chance that a rolled line is the top pip its item level allows (about 3 in 10). */
export const TOP_PIP_IN_TEN = 3;

/** What the sample player holds when they reach his stall. */
export const SAMPLE_PURSE = { acorns: 420, scrap: 2400, shards: 140 } as const;

/** The week's rare blueprint: found nowhere else, for Acorns and shards of any element (the lab's price). */
export const SAMPLE_STOCK = {
  blueprintBaseId: 'thundercap',
  blueprintAcorns: 40,
  blueprintShards: 50,
} as const;

export interface Purse {
  acorns: number;
  scrap: number;
  shards: number;
}

export interface Price {
  acorns: number;
  scrap: number;
}

/** The price of the player's next reroll of a piece of this item level, after `rerollsSoFar` this week. */
export function rerollPrice(itemLevel: number, rerollsSoFar: number): Price {
  const factor =
    (Math.max(1, itemLevel) / REROLL.baseLevel) * REROLL.growth ** Math.max(0, rerollsSoFar);
  return { acorns: Math.round(REROLL.acorns * factor), scrap: Math.round(REROLL.scrap * factor) };
}

/** Whether the purse covers a price (Acorns and scrap). */
export function canPay(purse: Purse, price: Price): boolean {
  return purse.acorns >= price.acorns && purse.scrap >= price.scrap;
}

/** What is missing, in words ("Not enough Scrap"), or null when the purse covers it. */
export function shortOf(purse: Purse, price: Price): string | null {
  const missing = [
    ...(purse.acorns < price.acorns ? ['Acorns'] : []),
    ...(purse.scrap < price.scrap ? ['Scrap'] : []),
  ];
  return missing.length === 0 ? null : `Not enough ${missing.join(' and ')}`;
}

/** The worn pieces: the only ones he rerolls (a piece in the bag has no lines yet). */
export function wornPieces(items: readonly GearItem[]): GearItem[] {
  return items.filter((i) => i.equippedOn !== null);
}

const lineSignature = (item: Pick<GearItem, 'lines'>): string =>
  item.lines.map((l) => `${l.id}:${l.text}`).join('|');

/**
 * The piece after a reroll: all its modifier lines drawn again at its item level; rarity, item level, who wears
 * it and everything else stay. `nth` is how many rerolls of this piece came before (it picks the seed). The
 * result differs from the piece before whenever the pool allows it.
 */
export function rerollPiece(item: GearItem, nth: number): GearItem {
  let rolled = item;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const drawn = sampleGearItem({
      id: `${item.id}:reroll:${String(nth)}:${String(attempt)}`,
      baseId: item.baseId,
      rarity: item.rarity,
      itemLevel: item.itemLevel,
    });
    rolled = { ...item, stats: drawn.stats, lines: drawn.lines };
    if (lineSignature(rolled) !== lineSignature(item)) return rolled;
  }
  return rolled;
}

/** How many lines are the piece's own roll (the ones a reroll draws again). */
export function rolledLineCount(item: Pick<GearItem, 'lines'>): number {
  return item.lines.filter((l) => l.source === 'rolled').length;
}

/** The odds in plain words, for the piece about to be rerolled. */
export function oddsText(item: Pick<GearItem, 'lines'>): string {
  const n = rolledLineCount(item);
  const best = Math.max(
    0,
    ...item.lines.map((l) => (l.source === 'rolled' ? (l.bestTier ?? 0) : 0)),
  );
  const top = best > 0 ? ` (tier ${String(best)} at this level)` : '';
  const lines = n === 1 ? 'Its line is' : `All ${String(n)} of its lines are`;
  return `${lines} rolled again from the same pool. About ${String(TOP_PIP_IN_TEN)} in 10 land on the top pip${top}, the rest lower. Rarity and level stay, and the old ${n === 1 ? 'line is' : 'lines are'} gone.`;
}
