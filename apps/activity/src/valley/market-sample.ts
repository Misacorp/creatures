/**
 * Sample `valley.market` blocks (the workbench and the tests): the Market not open yet, being built, built with a free broker seat, with a
 * broker at work, a broker with no spare shards to trade, and a Master broker. The numbers follow `VALLEY_RULES.broker` (the lab's tiers);
 * they only have to look right.
 */
import {
  VALLEY_RULES,
  type ValleyCommonsPlace,
  type ValleyCommonsView,
  type ValleyMarketView,
} from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { openPlace, waitingPlace } from './commons-sample';

/** The Market presets the workbench shows. */
export const MARKET_PRESETS = [
  'off',
  'not open',
  'being built',
  'open, free seat',
  'open with a broker',
  'broker stuck',
  'master broker',
] as const;

type Broker = NonNullable<ValleyMarketView['seat']>;

const tier = (n: number): { rate: number; critBp: number; critYield: number } => {
  const t = VALLEY_RULES.broker.tiers[n] ?? VALLEY_RULES.broker.tiers[0];
  return {
    rate: t?.rate ?? 3,
    critBp: Math.round((t?.critChance ?? 0.1) * 10_000),
    critYield: VALLEY_RULES.forge.exchange.critYield,
  };
};

/** The broker's seat as the server sends it: `step` is its creature's trading step (0 to 3). */
export function sampleBroker(creatureId: string | null, step: 0 | 1 | 2 | 3 = 0, extra: Partial<Broker> = {}): Broker {
  const hours = [0, 60, 200, 520][step] ?? 0;
  const next = VALLEY_RULES.posts.mastery[step];
  return {
    id: 'broker-1',
    creatureId,
    paused: null,
    toward: null,
    mastery: { hours, step, bonusBp: 0 },
    terms: tier(step),
    next: next === undefined ? null : { ...tier(step + 1), atHours: next.hours },
    blocked: null,
    ...extra,
  };
}

/** The Market's row of the commons for a preset (the project's size follows the lab: a level-2 project with no shards). */
export function marketPlace(preset: string): ValleyCommonsPlace {
  switch (preset) {
    case 'being built': {
      const place = openPlace('market', 1, 700, 0.45, { mine: { given: 40, shareBp: 600 } });
      return {
        ...place,
        project:
          place.project === null
            ? null
            : {
                ...place.project,
                needs: { acorns: 190, scrap: 380, shards: 0 },
                shardElement: 'mire',
              },
      };
    }
    case 'open, free seat':
    case 'open with a broker':
    case 'broker stuck':
    case 'master broker':
      return {
        ...waitingPlace('market'),
        level: 2,
        state: 'done',
        plaque: ['Ada', 'Mia', 'Tobias', 'You'],
        keepsakes: 1,
      };
    default:
      return waitingPlace('market');
  }
}

/** The commons with the Market's row set for a preset. */
export const withMarketPlace = (commons: ValleyCommonsView, preset: string): ValleyCommonsView => ({
  ...commons,
  places: commons.places.some((p) => p.id === 'market')
    ? commons.places.map((p) => (p.id === 'market' ? marketPlace(preset) : p))
    : [...commons.places, marketPlace(preset)],
});

/** The Market block of a preset, the broker (if any) being the first creature of the roster. */
export function presetMarket(
  preset: string,
  roster: readonly Pick<Creature, 'id'>[],
): ValleyMarketView | null {
  const first = roster[0]?.id ?? null;
  switch (preset) {
    case 'not open':
    case 'being built':
      return { open: false, seat: null };
    case 'open, free seat':
      return { open: true, seat: sampleBroker(null) };
    case 'open with a broker':
      return { open: true, seat: sampleBroker(first, 1) };
    case 'broker stuck':
      return { open: true, seat: sampleBroker(first, 1, { blocked: 'tide' }) };
    case 'master broker':
      return { open: true, seat: sampleBroker(first, 3, { toward: 'grove' }) };
    default:
      return null;
  }
}

/** The same valley with a market block; the creature at the broker's seat is `trading`. */
export function withMarket(visit: ValleyVisit, market: ValleyMarketView): ValleyVisit {
  const at = market.seat?.creatureId ?? null;
  const seatId = market.seat?.id ?? null;
  return {
    ...visit,
    market,
    creatures: visit.creatures.map((c) =>
      c.id === at ? { ...c, state: 'trading' as const, seatId } : c,
    ),
  };
}
