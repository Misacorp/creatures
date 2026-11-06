/**
 * Sample `valley` blocks for the Signpost (the workbench and the tests): the destinations as the server lists them, seats with a pack
 * part full or full, and the three kits. The numbers follow `VALLEY_RULES` loosely (a seat's pack holds 72 hours; a day brings about
 * 50 scrap and 3 shards); they only have to look right.
 */
import type { ValleySeatView } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';

export const SAMPLE_PLACES: ValleyVisit['places'] = [
  { id: 'tidepools', element: 'tide', rich: 'scrap', open: true, night: false, special: false },
  { id: 'ember-caves', element: 'ember', rich: 'shards', open: true, night: false, special: true },
  {
    id: 'verdant-hollow',
    element: 'grove',
    rich: 'creatures',
    open: true,
    night: false,
    special: false,
  },
  { id: 'storm-ridge', element: 'spark', rich: 'rare', open: true, night: false, special: false },
  {
    id: 'moonlit-reef',
    element: 'tide',
    rich: 'creatures',
    open: true,
    night: true,
    special: false,
  },
  { id: 'old-crossroads', element: null, rich: 'none', open: true, night: false, special: false },
  {
    id: 'festival-grounds',
    element: null,
    rich: 'rare',
    open: false,
    night: false,
    special: false,
  },
];

/** A seat with `creatureId` posted at `destination`; `hours` of its 72-hour pack filled (72 or more: full). */
export function sampleSeat(
  id: string,
  destination: string,
  creatureId: string | null,
  hours: number,
  extra: Partial<ValleySeatView> = {},
): ValleySeatView {
  const full = creatureId !== null && hours >= 72;
  const held = creatureId === null ? 0 : Math.min(hours, 72);
  return {
    id,
    destination,
    creatureId,
    kit: null,
    fit: false,
    paused: null,
    second: false,
    deep: false,
    mastery: { hours: 20, step: 0, bonusBp: 0 },
    store: {
      hours: held,
      capHours: 72,
      full,
      wasFull: false,
      fullInHours: creatureId === null || full ? null : 72 - held,
      scrap: Math.round(held * 2.1),
      shards: Math.round(held * 0.13),
      gear: held >= 40 ? 1 : 0,
      blueprints: 0,
      pages: held >= 60 ? 1 : 0,
    },
    perDay:
      creatureId === null
        ? { scrap: 0, shards: 0, creatures: 0, gear: 0, blueprints: 0, pages: 0 }
        : { scrap: 50.6, shards: 3.2, creatures: 0.3, gear: 0.24, blueprints: 0.07, pages: 0.1 },
    ...extra,
  };
}

/** The server's `valley` block for `creatures` (all resting unless seated), with the given seats. */
export function sampleValley(
  creatures: readonly Pick<Creature, 'id'>[],
  seats: readonly ValleySeatView[],
  extra: Partial<ValleyVisit> = {},
): ValleyVisit {
  const seated = new Map(seats.map((s) => [s.creatureId, s.id]));
  const ladder = [0, 113, 188, 281, 394, 525];
  return {
    settledAt: 1_799_760_000_000,
    arrived: false,
    awayHours: 0,
    creatures: creatures.map((c) => ({
      id: c.id,
      state: seated.has(c.id) ? ('scouting' as const) : ('resting' as const),
      gained: 0,
      catchUpBp: 10000,
      seatId: seated.get(c.id) ?? null,
    })),
    online: [],
    allowance: { store: 0, cap: 480, brought: 0 },
    anvils: [],
    anvilPrices: {
      owned: 0,
      max: 2,
      next: { acorns: 0, scrap: 0 },
      ladder: [
        { acorns: 0, scrap: 0 },
        { acorns: 123, scrap: 38 },
      ],
    },
    forge: {
      shelf: { scrap: 0, essence: 0, shards: { tide: 0, ember: 0, grove: 0, spark: 0, mire: 0 } },
      bag: { count: 0, cap: 200 },
      fireLevel: 1,
      exchange: { rate: 3, critBp: 1000, critYield: 2 },
      queueMax: 3,
      orderCountMax: 99,
    },
    seats: [...seats],
    seatPrices: {
      owned: seats.length,
      max: 2,
      next: seats.length >= 2 ? null : (ladder[seats.length] ?? null),
      ladder,
    },
    kit: { owned: [], price: 875 },
    places: [...SAMPLE_PLACES],
    night: false,
    special: { destination: 'ember-caves', twist: 'rich-veins' },
    ...extra,
  };
}
