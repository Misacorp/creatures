/**
 * What the Forge says about the player's anvils (phase 5 step 3, `systems/forge.md`, `return.md` V-RET-9), as plain functions over
 * the server's `valley` block: an order's words, what a piece waits on, the floor, the shelf, the exchange, the Places line and the
 * bubble. Pure: no clock and no request; the server's numbers go in, words come out. Nothing here says what was missed.
 */
import type { ReachId, ValleyAnvilView, ValleyForgeView, ValleyOrderView } from '@creatures/game';
import type { ValleyVisit } from '../api';
import { elementName } from '../game';
import { gearName } from '../gear-view';
import { formatCountdown } from '../time-format';

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

/** The shard elements, in the order the shelf lists them. */
export const SHARD_ELEMENTS = ['tide', 'ember', 'grove', 'spark', 'mire'] as const;

/** A shard pile's name ("Tide shards"). */
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

/** The Reach choices (V-FORGE-1, 8), with what they cost in Essence (from the server's order views the price is in the rules; shown as words). */
export const REACH_CHOICES: readonly { id: ReachId; name: string; line: string }[] = [
  { id: 'none', name: 'No Reach', line: 'A plain piece, the quickest way.' },
  {
    id: 'rare',
    name: 'Reach for Rare',
    line: 'Slower, 25 Essence a piece, a good chance of Rare.',
  },
  { id: 'epic', name: 'Reach for Epic', line: 'Slowest, 70 Essence a piece, a chance of Epic.' },
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

/** What the next piece of an order takes from the shelf, in words: "36 scrap, 1 Tide shard, 25 Essence". */
export function needsText(order: ValleyOrderView): string {
  const n = order.needs;
  const parts: string[] = [];
  if (n.scrap > 0) parts.push(`${String(n.scrap)} scrap`);
  if (n.shard > 0) {
    parts.push(
      n.shardElement === null
        ? plural(n.shard, '1 shard', 'shards')
        : `${String(n.shard)} ${elementName(n.shardElement)} ${n.shard === 1 ? 'shard' : 'shards'}`,
    );
  }
  if (n.essence > 0) parts.push(`${String(n.essence)} Essence`);
  return parts.length === 0 ? 'Nothing' : parts.join(', ');
}

/** What an order waits on, as the order's own short line ("Waiting for Tide shards"); null when it does not wait. */
export function orderWait(order: ValleyOrderView): string | null {
  switch (order.waiting) {
    case null:
      return null;
    case 'scrap':
      return 'Waiting for scrap';
    case 'essence':
      return 'Waiting for Essence';
    case 'shard':
      return order.needs.shardElement === null
        ? 'Waiting for shards'
        : `Waiting for ${shardName(order.needs.shardElement)}`;
  }
}

/** The shelf's pile that an order's wait is about (for the exchange's one-tap fix): the shard element, else null. */
export function waitingShardElement(order: ValleyOrderView): string | null {
  return order.waiting === 'shard' ? order.needs.shardElement : null;
}

/** How long a wait has lasted: "for 5 h"; empty when unknown. */
function forHours(hours: number | null): string {
  return hours === null || hours < 1 / 60
    ? ''
    : ` for ${formatCountdown(hours * 3_600_000, 'short')}`;
}

/** Why a smith tinkers, in plain words (V-FORGE-2, 4); null when the anvil is working or has no smith. */
export function tinkerLine(anvil: ValleyAnvilView): string | null {
  const t = anvil.tinkering;
  if (t === null) return null;
  switch (t.reason) {
    case 'idle':
      return 'Nothing is ordered, so the smith tinkers';
    case 'scrap':
      return `Waiting for scrap${forHours(t.sinceHours)}`;
    case 'essence':
      return `Waiting for Essence${forHours(t.sinceHours)}`;
    case 'shard':
      return `Waiting for ${t.shardElement === null ? 'shards' : shardName(t.shardElement)}${forHours(t.sinceHours)}`;
    case 'floor':
      return 'The floor is full';
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
  visit.anvils.filter((a) => a.creatureId !== null && a.tinkering === null).length;

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
  if (work === 0) return 'Nobody at the anvils';
  return work === 1 ? '1 smith at work' : `${String(work)} smiths at work`;
}

/** What the next anvil costs, in words ("free" for the first). */
export function anvilPriceText(price: { acorns: number; scrap: number } | null): string {
  if (price === null) return '';
  if (price.acorns === 0 && price.scrap === 0) return 'free';
  return `${String(price.acorns)} Acorns, ${String(price.scrap)} scrap`;
}

/** Why the next anvil cannot be bought now; null when it can. */
export function anvilBuyReason(visit: ValleyVisit, acorns: number): string | null {
  const price = visit.anvilPrices.next;
  if (price === null) return 'The Forge has no room for more anvils for now';
  const scrap = visit.forge.shelf.scrap;
  if (price.acorns > acorns && price.scrap > scrap) {
    return `You have ${String(acorns)} Acorns and ${String(scrap)} scrap; this costs ${String(price.acorns)} and ${String(price.scrap)}.`;
  }
  if (price.acorns > acorns) {
    return `You have ${String(acorns)} Acorns; this costs ${String(price.acorns)}.`;
  }
  if (price.scrap > scrap) {
    return `You have ${String(scrap)} scrap; this costs ${String(price.scrap)}.`;
  }
  return null;
}

/** The exchange's rate and crit in words (V-FORGE-10): "3 shards of one kind for 1 of another. 10% to get 2." */
export function exchangeRateText(forge: ValleyForgeView): string {
  const e = forge.exchange;
  return `${String(e.rate)} shards of one kind for 1 of another. A ${String(Math.round(e.critBp / 100))}% chance to get ${String(e.critYield)}.`;
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
): string | null {
  const sources = exchangeSources(forge, to).filter((s) => from === null || s.element === from);
  const can = sources.reduce((n, s) => n + tradesFrom(forge, s.held), 0);
  if (can === 0) {
    return from === null
      ? `You need ${String(forge.exchange.rate)} shards of one other kind.`
      : `You need ${String(forge.exchange.rate)} ${shardName(from)}.`;
  }
  if (from !== null && times > can)
    return `${shardName(from)} pay for ${plural(can, '1 trade', 'trades')}.`;
  return null;
}

/** The bag's count in words against its cap: "12 / 200". */
export const bagCountText = (forge: ValleyForgeView): string =>
  `${String(forge.bag.count)} / ${String(forge.bag.cap)}`;

/** The bag is full (pieces wait on the floors until it has room). */
export const bagIsFull = (forge: ValleyForgeView): boolean => forge.bag.count >= forge.bag.cap;
