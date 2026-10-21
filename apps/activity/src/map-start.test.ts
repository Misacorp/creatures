import { describe, expect, it } from 'vitest';
import { startingPlace } from './map-start';

const places = [
  { id: 'tidepools', home: false },
  { id: 'ember-caves', home: true },
  { id: 'storm-ridge', home: false },
];

describe('where the map starts', () => {
  it('prefers a place with a trip at home', () => {
    expect(startingPlace(places, [{ destination: 'storm-ridge' }])).toBe('ember-caves');
  });

  it('else the first trip that is out', () => {
    expect(
      startingPlace(
        places.map((p) => ({ ...p, home: false })),
        [{ destination: 'storm-ridge' }, { destination: 'tidepools' }],
      ),
    ).toBe('storm-ridge');
  });

  it('else the hub, Old Crossroads', () => {
    expect(startingPlace([], [])).toBe('old-crossroads');
  });
});
