/**
 * What the valley says about the Market and its broker (phase 5 step 7, `systems/forge.md` V-FORGE-11), as plain functions over the
 * server's `valley.market` block and the commons' row of the Market: the broker's seat in words, its rate ("12 shards for 5"), what it
 * trades toward, the next mastery step, and the Market's lines for the Places list. Pure: no clock and no request.
 */
import type { ValleyMarketView } from '@creatures/game';
import type { ValleyVisit } from '../api';
import { elementName } from '../game';
import { anyShardCount, anyShardMark, shardMark, type Say } from '../resource-count';
import { placeOf, commonsOf } from './commons-view';
import { masteryName } from './signpost-view';

type Broker = NonNullable<ValleyMarketView['seat']>;

/** The elements of shards, in the order the shelf lists them. */
export const BROKER_ELEMENTS = ['tide', 'ember', 'grove', 'spark', 'mire'] as const;

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

/** The Market of the valley view, when the server sent one. */
export const marketOf = (visit: ValleyVisit | null | undefined): ValleyMarketView | null =>
  visit?.market ?? null;

/** The broker's seat once the Market is built (null before). */
export const brokerOf = (visit: ValleyVisit | null | undefined): Broker | null =>
  marketOf(visit)?.seat ?? null;

/** The Market's state, from its row in the commons: `waiting` (the guided start has not reached it), `building` (its project is open or its days run) or `built`. */
export type MarketState = 'waiting' | 'building' | 'built';

export function marketState(visit: ValleyVisit | null | undefined): MarketState | null {
  const market = marketOf(visit);
  if (market === null) return null;
  if (market.open) return 'built';
  const row = placeOf(commonsOf(visit), 'market');
  return row === undefined || row.state === 'waiting' ? 'waiting' : 'building';
}

/**
 * A rate (shards of another element for 1) as a ratio of whole shards: 2.4 is 12 for 5, 2 is 2 for 1, 1.6 is 8 for 5. The smallest
 * denominator up to 10 that makes it whole; a rate that does not is shown with one decimal.
 */
export function rateRatio(rate: number): { paid: number | string; got: number } {
  for (let n = 1; n <= 10; n++) {
    const paid = rate * n;
    if (Math.abs(paid - Math.round(paid)) < 1e-6) return { paid: Math.round(paid), got: n };
  }
  return { paid: rate.toFixed(1), got: 1 };
}

/** A rate as shards for a shard: "[12 shards] for [5]" (an icon and a number each, no words for the shard). */
export function rateSay(rate: number): Say {
  const { paid, got } = rateRatio(rate);
  return [{ ...anyShardCount(0), amount: paid }, ' for ', anyShardCount(got)];
}

/** A bonus chance in basis points as "10%". */
export const bonusText = (bp: number): string => `${String(Math.round(bp / 100))}%`;

/** The element the broker trades toward as its shard's icon, or "What the orders need". */
export const towardSay = (toward: string | null): Say =>
  toward === null ? ['What the orders need'] : [shardMark(toward)];

/** The same for assistive technology. */
export const towardName = (toward: string | null): string =>
  toward === null ? 'What the orders need' : `${elementName(toward)} shards`;

/** The broker's small second line under its creature: its mastery step. */
export const brokerSub = (seat: Broker, level: number): string =>
  `Lv ${String(level)}${seat.mastery.step === 0 ? '' : ' · ' + masteryName(seat.mastery.step)}`;

/** What the broker is doing, as the card's one line under the slots. */
export function brokerLine(seat: Broker): Say {
  if (seat.creatureId === null) return ['Pick a creature, or drag one here.'];
  if (seat.paused !== null) return ['In the raid. It trades again when the finale is over.'];
  const rate: Say = [
    'Swaps ',
    ...rateSay(seat.terms.rate),
    `, with a ${bonusText(seat.terms.critBp)} chance of one extra`,
  ];
  if (seat.blocked !== null) {
    return [...rate, '. Waiting for a spare ', anyShardMark(), ' to trade for ', shardMark(seat.blocked), '.'];
  }
  return rate;
}

/** A row of the broker's numbers: a label and a value that may hold shard icons. */
export interface BrokerRow {
  label: string;
  value: Say;
}

/** The rows of the broker's numbers drawer: its rate and bonus now, its trading, and the next step's rate. */
export function brokerRows(seat: Broker): BrokerRow[] {
  const rows: BrokerRow[] = [
    { label: 'Rate', value: rateSay(seat.terms.rate) },
    {
      label: 'Bonus shard',
      value: [`${bonusText(seat.terms.critBp)} of trades give `, anyShardCount(seat.terms.critYield)],
    },
    {
      label: 'Trading',
      value: [seat.mastery.step === 0 ? masteryName(0) : masteryName(seat.mastery.step)],
    },
    { label: 'Trades toward', value: towardSay(seat.toward) },
  ];
  if (seat.next !== null) {
    rows.push({
      label: 'Next step',
      value: [
        ...rateSay(seat.next.rate),
        `, ${bonusText(seat.next.critBp)} bonus, after ${plural(Math.round(seat.next.atHours / 24), '1 day', 'days')}`,
      ],
    });
  }
  return rows;
}

/** The Places list's line for the Market once the valley's systems are on. */
export function marketLine(visit: ValleyVisit | null | undefined): string | null {
  const state = marketState(visit);
  if (state === null || state === 'waiting') return null;
  const seat = brokerOf(visit);
  if (state === 'building') return 'being built';
  if (seat === null || seat.creatureId === null) return 'a free broker seat';
  if (seat.paused !== null) return 'the broker is in the raid';
  return seat.blocked === null ? 'the broker trades' : 'the broker waits to trade';
}

/** The tray's one-line word for a creature at the broker's seat. */
export const TRADING_LABEL = 'Trading at the Market.';
