/**
 * What the Forge says about the player's anvils (phase 5 step 3, `systems/forge.md`, `return.md` V-RET-9), as plain functions over
 * the server's `valley` block: an order's words, what a piece waits on, the floor, the shelf, the exchange, the Places line and the
 * bubble. Pure: no clock and no request; the server's numbers go in, words come out. Nothing here says what was missed.
 */
import {
  VALLEY_ELEMENTS,
  fullestPile,
  patchworkBlueprint,
  type ReachId,
  type ValleyAnvilView,
  type ValleyForgeView,
  type ValleyOrderView,
} from '@creatures/game';
import type { ValleyVisit } from '../api';
import { elementName } from '../game';
import { gearName } from '../gear-view';
import {
  acornCount,
  anyShardCount,
  anyShardMark,
  essenceAmount,
  priceOf,
  resourceMark,
  scrapCount,
  shardCount,
  shardMark,
  type Price,
  type Say,
  type ShortOf,
} from '../resource-count';
import { formatCountdown } from '../time-format';
import type { CountItem } from '../ui/CountBadge';

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

/** The shard elements, in the order the shelf lists them. */
export const SHARD_ELEMENTS = ['tide', 'ember', 'grove', 'spark', 'mire'] as const;

/**
 * The element a patchwork order that names none uses now (V-FORGE-12): the pile held most, the first of them on a tie, as the Forge's pass
 * picks it when a piece starts.
 */
export const mostHeldElement = (shards: Readonly<Record<string, number>>): string =>
  VALLEY_ELEMENTS[fullestPile(VALLEY_ELEMENTS.map((e) => shards[e] ?? 0))] ?? 'tide';

/** Whether an order is for a patchwork blueprint (V-FORGE-12). */
export const isPatchwork = (order: Pick<ValleyOrderView, 'blueprintId'>): boolean =>
  order.blueprintId !== null && patchworkBlueprint(order.blueprintId) !== undefined;

/** A shard pile's name for assistive technology ("Tide shards"); the screen shows the shard's icon, never this. */
export const shardName = (element: string): string => `${elementName(element)} shards`;

/** The anvils' two kit items (V-FORGE-8), in the order the picker lists them. */
export const ANVIL_KIT_ORDER = ['tongs', 'loupe'] as const;
export const ANVIL_KIT_INFO: Readonly<Record<'tongs' | 'loupe', { name: string; line: string }>> = {
  tongs: { name: 'Tongs', line: 'Plain pieces come out faster.' },
  loupe: { name: 'Loupe', line: 'Slower, with a better chance of a rarer piece.' },
};

/** The rarities of a piece, by the floor's order. */
export const PIECE_RARITIES = ['Common', 'Rare', 'Epic'] as const;

/** An anvil's name by its place among the player's anvils ("Anvil 1"). */
export const anvilName = (visit: ValleyVisit, anvil: ValleyAnvilView): string =>
  `Anvil ${String(visit.anvils.indexOf(anvil) + 1)}`;

/** The Reach choices (V-FORGE-1, 8), with what they cost in Essence (from the server's order views the price is in the rules; shown as an icon and a number). */
export const REACH_CHOICES: readonly { id: ReachId; name: string; line: Say }[] = [
  { id: 'none', name: 'No Reach', line: ['A plain piece, the quickest way.'] },
  {
    id: 'rare',
    name: 'Reach for Rare',
    line: ['Slower, ', essenceAmount(25), ' a piece, a good chance of Rare.'],
  },
  {
    id: 'epic',
    name: 'Reach for Epic',
    line: ['Slowest, ', essenceAmount(70), ' a piece, a chance of Epic.'],
  },
];

/** The Reach of an order in words; empty for none. */
export function reachName(reach: ReachId): string {
  return reach === 'none' ? '' : reach === 'rare' ? 'Reach for Rare' : 'Reach for Epic';
}

/** An order's name: its blueprint, or "For my team". */
export function orderName(order: ValleyOrderView): string {
  return order.forTeam || order.blueprintId === null ? 'For my team' : gearName(order.blueprintId);
}

/** How far an order is: "2 of 3" for a count, "until the team is dressed" for a team order. */
export function orderProgress(order: ValleyOrderView): string {
  return order.forTeam
    ? `${String(order.made)} made`
    : `${String(order.made)} / ${String(order.count)}`;
}

/** What the next piece of an order takes from the shelf, as badges: scrap, a shard of its element (any when it has none), Essence. */
export function needsItems(order: ValleyOrderView): CountItem[] {
  const n = order.needs;
  const items: CountItem[] = [];
  if (n.scrap > 0) items.push(scrapCount(n.scrap));
  if (n.shard > 0) {
    items.push(
      n.shardElement === null ? anyShardCount(n.shard) : shardCount(n.shardElement, n.shard),
    );
  }
  if (n.essence > 0) items.push(essenceAmount(n.essence));
  return items;
}

/** The mark of the shard an order or a smith waits on: that element's, or the any-shard icon. */
const shardWaitMark = (element: string | null): CountItem =>
  element === null ? anyShardMark() : shardMark(element);

/** What an order waits on, as its own short line ("Waiting for [tide shard]"); null when it does not wait. */
export function orderWait(order: ValleyOrderView): Say | null {
  switch (order.waiting) {
    case null:
      return null;
    case 'scrap':
      return ['Waiting for ', resourceMark('scrap')];
    case 'essence':
      return ['Waiting for ', resourceMark('essence')];
    case 'shard':
      return ['Waiting for ', shardWaitMark(order.needs.shardElement)];
  }
}

/** How long a wait has lasted: "for 5 h"; empty when unknown. */
function forHours(hours: number | null): string {
  return hours === null || hours < 1 / 60
    ? ''
    : ` for ${formatCountdown(hours * 3_600_000, 'short')}`;
}

/** Why a smith tinkers, in plain words (V-FORGE-2, 4); null when the anvil is working or has no smith. `marketBuilt`: whether shards can be traded yet (Q64). */
export function tinkerLine(anvil: ValleyAnvilView, marketBuilt: boolean): Say | null {
  const t = anvil.tinkering;
  if (t === null) return null;
  switch (t.reason) {
    case 'idle':
      return ['Nothing is ordered, so the smith tinkers'];
    case 'scrap':
      return ['Waiting for ', resourceMark('scrap'), forHours(t.sinceHours)];
    case 'essence':
      return ['Waiting for ', resourceMark('essence'), forHours(t.sinceHours)];
    case 'shard':
      // Q64: shards change hands at the Market only; until the valley builds it, the line says so.
      return [
        'Waiting for ',
        shardWaitMark(t.shardElement),
        `${forHours(t.sinceHours)}${marketBuilt ? '' : '. The Market will trade for them once the valley builds it.'}`,
      ];
    case 'floor':
      return ['The floor is full'];
  }
}

/** Whether the smith waits on an input that a stockpile or a scout could fix (not a plain empty queue, not a full floor). */
export const isShort = (anvil: ValleyAnvilView): boolean => {
  const reason = anvil.tinkering?.reason;
  return reason === 'scrap' || reason === 'shard' || reason === 'essence';
};

/** The piece in hand as one line: "Kelp Cap (Rare), 6 h left", or "paused". */
export function pieceLine(anvil: ValleyAnvilView): string | null {
  const p = anvil.piece;
  if (p === null) return null;
  const order = anvil.orders.find((o) => o.id === p.orderId);
  const what =
    order === undefined || order.blueprintId === null
      ? 'A piece for the team'
      : gearName(order.blueprintId);
  const rarity = p.rarity === 0 ? '' : ` (${PIECE_RARITIES[p.rarity] ?? ''})`;
  const left =
    p.leftHours === null
      ? 'paused'
      : p.leftHours < 1 / 60
        ? 'almost done'
        : `${formatCountdown(p.leftHours * 3_600_000, 'short')} left`;
  return `${what}${rarity}, ${left}`;
}

/** The floor's one line: "Floor 2 of 5", or "Floor full". */
export function floorLine(anvil: ValleyAnvilView): string {
  const f = anvil.floor;
  return f.full ? 'Floor full' : `Floor ${String(f.count)} / ${String(f.cap)}`;
}

/** What the floor holds by rarity, as label and number rows (the tap on the floor's fill). */
export function floorRows(anvil: ValleyAnvilView): { label: string; value: string }[] {
  return PIECE_RARITIES.map((label, i) => ({
    label,
    value: String(anvil.floor.byRarity[i] ?? 0),
  }));
}

/** What an anvil brings a day: "about 1.5 pieces a day", empty when no smith or no order. */
export function paceLine(anvil: ValleyAnvilView): string {
  const d = anvil.perDay.pieces;
  if (d <= 0) return 'No pieces yet';
  return `About ${d >= 10 ? String(Math.round(d)) : String(Math.round(d * 10) / 10)} pieces a day`;
}

/** The mastery steps' names for smithing (V-POST-12). */
const SMITH_STEPS = ['New to smithing', 'Skilled', 'Expert', 'Master Smith'] as const;
export const smithStepName = (step: 0 | 1 | 2 | 3): string => SMITH_STEPS[step];

/** The anvils that have a smith. */
export const smithsAtWork = (visit: ValleyVisit): number =>
  visit.anvils.filter((a) => a.creatureId !== null && a.tinkering === null && a.paused === null)
    .length;

/** The anvils whose smith is in the raid (V-POST-7): paused until the finale. */
export const pausedAnvils = (visit: ValleyVisit): number =>
  visit.anvils.filter((a) => a.creatureId !== null && a.paused !== null).length;

/** The anvils whose smith tinkers. */
export const tinkering = (visit: ValleyVisit): number =>
  visit.anvils.filter((a) => a.creatureId !== null && a.tinkering !== null).length;

/** The anvils whose floor is full. */
export const fullFloors = (visit: ValleyVisit): number =>
  visit.anvils.filter((a) => a.floor.full).length;

/** The anvils whose smith has waited on one input for more than a day (V-FORGE-4: the one thing that earns a bubble besides a full floor). */
export const longWaits = (visit: ValleyVisit): number =>
  visit.anvils.filter(
    (a) =>
      a.creatureId !== null &&
      isShort(a) &&
      a.tinkering !== null &&
      a.tinkering.sinceHours !== null &&
      a.tinkering.sinceHours > 24,
  ).length;

/** The Forge's line in the Places list: a full floor first, then a tinkering anvil, else how many smiths are at work. */
export function forgeSystemsLine(visit: ValleyVisit): string {
  const full = fullFloors(visit);
  if (full > 0) return full === 1 ? 'the floor is full' : `${String(full)} floors are full`;
  const tink = tinkering(visit);
  if (tink > 0)
    return tink === 1 ? 'an anvil is tinkering' : `${String(tink)} anvils are tinkering`;
  const work = smithsAtWork(visit);
  if (work > 0) return `${plural(work, '1 smith', 'smiths')} at work`;
  const away = pausedAnvils(visit);
  if (away > 0)
    return away === 1 ? 'a smith is in the raid' : `${String(away)} smiths are in the raid`;
  return visit.anvils.length === 0 ? 'a free anvil waits' : 'nobody at the anvils';
}

/** The scene's one calm line under the Forge's art. */
export function forgeCalm(visit: ValleyVisit): string {
  const full = fullFloors(visit);
  if (full > 0) return full === 1 ? 'A floor is full' : `${String(full)} floors are full`;
  const tink = tinkering(visit);
  if (tink > 0)
    return tink === 1 ? 'An anvil is tinkering' : `${String(tink)} anvils are tinkering`;
  const work = smithsAtWork(visit);
  if (visit.anvils.length === 0) return 'Your first anvil is free';
  const away = pausedAnvils(visit);
  if (work === 0 && away > 0)
    return away === 1 ? 'A smith is in the raid' : 'Smiths are in the raid';
  if (work === 0) return 'Nobody at the anvils';
  return work === 1 ? '1 smith at work' : `${String(work)} smiths at work`;
}

/** What the next anvil costs, as badges ("free" for the first); nothing for no anvil to buy. */
export function anvilPrice(price: { acorns: number; scrap: number } | null): Price {
  if (price === null) return { text: '', items: [] };
  return priceOf([acornCount(price.acorns), scrapCount(price.scrap)]);
}

/** Why the next anvil cannot be bought now: the Forge has no more anvils (text), what the player is short of (badges), or null when it can. */
export function anvilBuyReason(visit: ValleyVisit, acorns: number): string | ShortOf | null {
  const price = visit.anvilPrices.next;
  if (price === null) return 'The Forge has no more anvils for now';
  const scrap = visit.forge.shelf.scrap;
  const have: CountItem[] = [];
  const cost: CountItem[] = [];
  if (price.acorns > acorns) {
    have.push(acornCount(acorns));
    cost.push(acornCount(price.acorns));
  }
  if (price.scrap > scrap) {
    have.push(scrapCount(scrap));
    cost.push(scrapCount(price.scrap));
  }
  return cost.length === 0 ? null : { have, cost };
}

/** The exchange's rate and crit (V-FORGE-10): "[3 shards] of one kind for [1] of another. A 10% chance to get [2]." */
export function exchangeRate(forge: ValleyForgeView): Say {
  const e = forge.exchange;
  return [
    anyShardCount(e.rate),
    ' of one kind for ',
    anyShardCount(1),
    ` of another. A ${String(Math.round(e.critBp / 100))}% chance to get `,
    anyShardCount(e.critYield),
    '.',
  ];
}

/** The shard piles the exchange can pay for `to` from: the other elements with at least `rate` shards, biggest first. */
export function exchangeSources(
  forge: ValleyForgeView,
  to: string,
): { element: string; held: number }[] {
  return SHARD_ELEMENTS.filter((e) => e !== to)
    .map((element) => ({ element, held: forge.shelf.shards[element] ?? 0 }))
    .sort((a, b) => b.held - a.held);
}

/** How many trades a pile can pay at the rate. */
export const tradesFrom = (forge: ValleyForgeView, held: number): number =>
  Math.floor(held / forge.exchange.rate);

/** Why an exchange cannot run; null when it can. */
export function exchangeReason(
  forge: ValleyForgeView,
  to: string,
  from: string | null,
  times: number,
): Say | null {
  const sources = exchangeSources(forge, to).filter((s) => from === null || s.element === from);
  const can = sources.reduce((n, s) => n + tradesFrom(forge, s.held), 0);
  if (can === 0) {
    return from === null
      ? ['You need ', anyShardCount(forge.exchange.rate), ' of one other kind.']
      : ['You need ', shardCount(from, forge.exchange.rate), '.'];
  }
  if (from !== null && times > can) {
    return [shardMark(from), ` pay for ${plural(can, '1 trade', 'trades')}.`];
  }
  return null;
}
