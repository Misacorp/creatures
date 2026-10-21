/**
 * Made-up trips and explorers for the world map's workbench page and tests (the map only needs where a
 * trip is, whose it is, and whether it is out, ready or waiting for a push-on choice).
 */
import type { Trip } from './expedition-types';
import type { Creature } from './api';

const HOUR = 3_600_000;

export type MapSample = 'empty' | 'four-out' | 'crowded';

export type MapExplorer = Pick<Creature, 'id' | 'species' | 'shiny'>;

export const SAMPLE_EXPLORERS: readonly MapExplorer[] = [
  ['cindle', false],
  ['splashet', false],
  ['sproutle', true],
  ['coralynx', false],
  ['zipmouse', false],
  ['mudlump', false],
].map(([species, shiny], i) => ({
  id: `00000000-0000-4000-8400-0000000001${String(i).padStart(2, '0')}`,
  species: String(species),
  shiny: shiny === true,
}));

function trip(i: number, destination: string, now: number, kind: 'out' | 'home' | 'choice'): Trip {
  const explorer = SAMPLE_EXPLORERS[i % SAMPLE_EXPLORERS.length];
  return {
    id: `00000000-0000-4000-8400-0000000002${String(i).padStart(2, '0')}`,
    creatureId: explorer?.id ?? '',
    duration: 'short',
    supplies: 'basic',
    kit: [],
    destination,
    twist: null,
    rolls: 1,
    cost: 0,
    treat: false,
    startedAt: now - 3 * HOUR,
    endsAt: kind === 'out' ? now + 2 * HOUR : now - HOUR,
    readyAt: kind === 'out' ? now + 2 * HOUR : now - HOUR,
    status: 'active',
    claimedAt: null,
    result: null,
    offer:
      kind === 'choice'
        ? { goals: [{ id: 'forage', risk: 'safe', extraHours: 2, oddsBp: 10_000 }] }
        : null,
    pushOn: null,
  };
}

/** The trips of a scenario at server time `now`. */
export function sampleMapTrips(sample: MapSample, now: number): Trip[] {
  switch (sample) {
    case 'empty':
      return [];
    case 'four-out':
      // Two at the Tidepools, one ready at the Ember Caves, one waiting for a choice at the Ridge.
      return [
        trip(0, 'tidepools', now, 'out'),
        trip(1, 'tidepools', now, 'out'),
        trip(2, 'ember-caves', now, 'home'),
        trip(3, 'storm-ridge', now, 'choice'),
      ];
    case 'crowded':
      return [
        trip(0, 'tidepools', now, 'out'),
        trip(1, 'tidepools', now, 'out'),
        trip(2, 'tidepools', now, 'home'),
        trip(3, 'ember-caves', now, 'out'),
        trip(4, 'verdant-hollow', now, 'home'),
        trip(5, 'old-crossroads', now, 'choice'),
      ];
  }
}
