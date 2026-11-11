import { VALLEY_RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { MAP_SPOTS } from '../sprites/world-map-art';
import { CLOSED_RULE, packFlag, seatsAt, signpostMapPlaces } from './signpost-map';
import { sampleSeat, sampleValley } from './signpost-sample';

const creatures = [
  { id: 'c1', species: 'sproutle', shiny: false },
  { id: 'c2', species: 'cindle', shiny: false },
  { id: 'c3', species: 'sproutle', shiny: true },
];

describe('the Signpost map: every destination has a spot', () => {
  it('the map has a spot for each destination the valley can list, so none is left off the map', () => {
    const ids = [
      ...VALLEY_RULES.scouts.destinations.map((d) => d.id),
      ...VALLEY_RULES.scouts.extraPlaces.map((d) => d.id),
    ];
    for (const id of ids) expect(MAP_SPOTS[id], id).toBeDefined();
  });
});

describe('signpostMapPlaces', () => {
  it('one place for each destination the valley lists, in its order, at the map spot', () => {
    const visit = sampleValley(creatures, []);
    const places = signpostMapPlaces(visit, creatures, null);
    expect(places.map((p) => p.id)).toEqual(visit.places.map((p) => p.id));
    expect(places[0]?.spot).toEqual(MAP_SPOTS['tidepools']);
    expect(places.every((p) => p.count === 0 && !p.home && p.flag === null)).toBe(true);
  });

  it('puts each scout at the place its seat points at, two faces and a +N for the rest', () => {
    const visit = sampleValley(creatures, [
      sampleSeat('s1', 'tidepools', 'c1', 10),
      sampleSeat('s2', 'tidepools', 'c2', 10),
      sampleSeat('s3', 'tidepools', 'c3', 10),
      sampleSeat('s4', 'ember-caves', null, 0),
    ]);
    const places = signpostMapPlaces(visit, creatures, 'tidepools');
    const pools = places.find((p) => p.id === 'tidepools');
    expect(pools).toMatchObject({ count: 3, more: 1, selected: true });
    expect(pools?.faces.map((f) => f.creatureId)).toEqual(['c1', 'c2']);
    // A seat with nobody posted puts nobody on the map.
    expect(places.find((p) => p.id === 'ember-caves')?.count).toBe(0);
    expect(seatsAt(visit, 'tidepools')).toHaveLength(3);
  });

  it('the pack flag is FULL for a full pack, else the fullest pack as a percent, and none for a paused post', () => {
    expect(packFlag([])).toBeNull();
    expect(packFlag([sampleSeat('a', 'x', 'c1', 80)])).toBe('FULL');
    expect(packFlag([sampleSeat('a', 'x', 'c1', 18), sampleSeat('b', 'x', 'c2', 36)])).toBe('50%');
    expect(
      packFlag([sampleSeat('a', 'x', 'c1', 80, { paused: { reason: 'raid' } as never })]),
    ).toBeNull();
  });

  it('a closed place is locked and says what opens it; a special and a night place say so; the label speaks all of it', () => {
    const visit = sampleValley(creatures, [sampleSeat('s1', 'ember-caves', 'c1', 80)]);
    const places = signpostMapPlaces(visit, creatures, null);
    const grounds = places.find((p) => p.id === 'festival-grounds');
    expect(grounds).toMatchObject({ locked: true, rule: CLOSED_RULE });
    expect(grounds?.label).toMatch(/closed, opens in Festival weeks/);
    expect(places.find((p) => p.id === 'tidepools')?.locked).toBe(false);
    const caves = places.find((p) => p.id === 'ember-caves');
    expect(caves?.rule).toBe('Special');
    expect(caves?.label).toBe("Ember Caves, 1 scout there, a pack is full, this week's special");
    expect(places.find((p) => p.id === 'moonlit-reef')?.rule).toBe('More at night');
  });

  it('a place the map has no spot for is left off rather than drawn at nothing', () => {
    const visit = sampleValley(creatures, [], {
      places: [
        { id: 'nowhere', element: null, rich: 'none', open: true, night: false, special: false },
      ],
    });
    expect(signpostMapPlaces(visit, creatures, null)).toEqual([]);
  });
});
