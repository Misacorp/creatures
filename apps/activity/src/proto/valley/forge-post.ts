/**
 * The Forge as a post (prototype, SAMPLE rules; V-FORGE-4, V-FORGE-10, V-FORGE-11): a smith works an order,
 * the shelf fills with finished pieces, and when the order waits on a shard the player lacks, the exchange
 * trades surplus shards for it in one tap. With a broker on duty at the Market the wait never happens. Pure:
 * the parts in, plain data out. The lucky extra is a fixed pattern here; the real server draws it.
 */
import type { PartKind, PartsBundle } from '../../gear-types';

export const SHARD_KINDS = [
  'tide-shard',
  'ember-shard',
  'grove-shard',
  'spark-shard',
  'mire-shard',
] as const satisfies readonly PartKind[];
export type ShardKind = (typeof SHARD_KINDS)[number];

/** The exchange's rate (sample): `give` shards of one element for `get` of another, `lucky` on a lucky one. */
export const EXCHANGE = { give: 3, get: 1, lucky: 2 } as const;

/** Every tenth trade is lucky (sample pattern for the 10% chance; `n` counts the trades so far). */
export function isLucky(n: number): boolean {
  return n % 10 === 3;
}

export interface Trade {
  from: ShardKind;
  to: ShardKind;
  spent: number;
  got: number;
  lucky: boolean;
}

const count = (parts: PartsBundle, kind: PartKind): number => parts[kind] ?? 0;

/** The shard the order lacks most: the fewest in the bag, the first of the elements on a tie. */
export function shortShard(parts: PartsBundle): ShardKind {
  let best: ShardKind = SHARD_KINDS[0];
  for (const kind of SHARD_KINDS) if (count(parts, kind) < count(parts, best)) best = kind;
  return best;
}

/** The shards that are spare for `need`: every other element with at least one trade's worth, most first. */
export function surplusOf(
  parts: PartsBundle,
  need: ShardKind,
): { kind: ShardKind; spare: number }[] {
  return SHARD_KINDS.filter((k) => k !== need)
    .map((kind) => ({
      kind,
      spare: Math.floor(count(parts, kind) / EXCHANGE.give) * EXCHANGE.give,
    }))
    .filter((s) => s.spare > 0)
    .sort((a, b) => b.spare - a.spare);
}

/** The trade one tap makes for `need` (`tradeNo` trades were made before), or null when nothing is spare. */
export function planTrade(parts: PartsBundle, need: ShardKind, tradeNo: number): Trade | null {
  const top = surplusOf(parts, need)[0];
  if (top === undefined) return null;
  const lucky = isLucky(tradeNo);
  return {
    from: top.kind,
    to: need,
    spent: EXCHANGE.give,
    got: lucky ? EXCHANGE.lucky : EXCHANGE.get,
    lucky,
  };
}

export function applyTrade(parts: PartsBundle, trade: Trade): PartsBundle {
  return {
    ...parts,
    [trade.from]: count(parts, trade.from) - trade.spent,
    [trade.to]: count(parts, trade.to) + trade.got,
  };
}

/**
 * What one tap trades: as many trades as the spare shards allow, until the bag holds a shard for every piece
 * the order still asks for (`wanted`). The lucky pattern counts on from `tradeNo`.
 */
export function planTrades(
  parts: PartsBundle,
  need: ShardKind,
  tradeNo: number,
  wanted: number,
): Trade[] {
  const out: Trade[] = [];
  let bag = parts;
  for (let i = 0; i < 50 && count(bag, need) < wanted; i++) {
    const trade = planTrade(bag, need, tradeNo + i);
    if (trade === null) break;
    out.push(trade);
    bag = applyTrade(bag, trade);
  }
  return out;
}

/** The parts after all of these trades. */
export function applyTrades(parts: PartsBundle, trades: readonly Trade[]): PartsBundle {
  return trades.reduce(applyTrade, parts);
}

/** What a tap's trades came to, for the words and the pictures: spent, got, and whether any was lucky. */
export function summarize(trades: readonly Trade[]): {
  from: ShardKind;
  to: ShardKind;
  spent: number;
  got: number;
  base: number;
  lucky: boolean;
} | null {
  const first = trades[0];
  if (first === undefined) return null;
  return {
    from: first.from,
    to: first.to,
    spent: trades.reduce((n, t) => n + t.spent, 0),
    got: trades.reduce((n, t) => n + t.got, 0),
    base: trades.length * EXCHANGE.get,
    lucky: trades.some((t) => t.lucky),
  };
}

/** The order on the anvil: pieces made out of pieces asked for, and the element each piece needs. */
export interface ForgeOrder {
  baseId: string;
  made: number;
  of: number;
  need: ShardKind;
}

export type PostStatus = 'working' | 'waiting' | 'done';

/** Working while the shard is in the bag, waiting when it is not (the shelf shows what is there, no clock). */
export function postStatus(order: ForgeOrder, parts: PartsBundle): PostStatus {
  if (order.made >= order.of) return 'done';
  return count(parts, order.need) >= 1 ? 'working' : 'waiting';
}

/** The smith finishes a piece: one shard of its element goes in, one piece joins the shelf. */
export function finishPiece(
  order: ForgeOrder,
  parts: PartsBundle,
): { order: ForgeOrder; parts: PartsBundle } {
  if (postStatus(order, parts) !== 'working') return { order, parts };
  return {
    order: { ...order, made: order.made + 1 },
    parts: { ...parts, [order.need]: count(parts, order.need) - 1 },
  };
}

/** The smith finishes every piece the bag has a shard for (up to the order's end). */
export function finishPieces(
  order: ForgeOrder,
  parts: PartsBundle,
): { order: ForgeOrder; parts: PartsBundle } {
  let state = { order, parts };
  while (postStatus(state.order, state.parts) === 'working') {
    state = finishPiece(state.order, state.parts);
  }
  return state;
}

/**
 * With a broker on duty the shard is always there: the broker has traded for it before the smith needs it
 * (as long as something is spare). Returns the parts after the broker's trade, or the same when none is due.
 */
export function brokerKeepsStocked(
  parts: PartsBundle,
  order: ForgeOrder,
  tradeNo: number,
): { parts: PartsBundle; trades: Trade[] } {
  const trades = planTrades(parts, order.need, tradeNo, order.of - order.made);
  return { parts: applyTrades(parts, trades), trades };
}

/** The pieces of the order on the shelf when the Forge opens, and how many the order asks for (sample). */
export const SAMPLE_MADE = 3;
export const ORDER_OF = 6;

// The session's shelf (sample: the real one is the server's).
let made = SAMPLE_MADE;

export function getMade(): number {
  return made;
}

export function setMade(n: number): void {
  made = n;
}

let orderNeed: ShardKind | null = null;

/** The element the order takes: the shard the bag lacks when the order is first seen, then fixed. */
export function getNeed(parts: PartsBundle): ShardKind {
  orderNeed ??= shortShard(parts);
  return orderNeed;
}

/** Back to the start (tests). */
export function resetMade(): void {
  made = SAMPLE_MADE;
  orderNeed = null;
}

/** The shard's name for words ("Mire"). */
export function shardWord(kind: ShardKind): string {
  const word = kind.replace('-shard', '');
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}
