import { expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { SAMPLE_EXPLORERS, sampleMapTrips } from './map-sample';
import {
  mapPlaces,
  mapReadingOrder,
  mapScale,
  mapScaleWide,
  mapScrolls,
  nextMarker,
  placeLabel,
} from './map-view';
import { MAP_SPOTS } from './sprites/world-map-art';

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function places(sample: Parameters<typeof sampleMapTrips>[0], selected: string | null = null) {
  return mapPlaces({
    trips: sampleMapTrips(sample, NOW),
    creatures: SAMPLE_EXPLORERS,
    now: NOW,
    selected,
  });
}

function place(list: ReturnType<typeof places>, id: string) {
  const found = list.find((p) => p.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

describe('mapPlaces', () => {
  it('lists every destination in content order with its spot, element and name', () => {
    const list = places('empty');
    expect(list.map((p) => p.id)).toEqual(expeditionContent.destinations.map((d) => d.id));
    for (const p of list) {
      expect(p.spot).toEqual(MAP_SPOTS[p.id]);
      expect(p.count).toBe(0);
      expect(p.faces).toEqual([]);
      expect(p.home || p.pushOn || p.selected).toBe(false);
      expect(p.label).toBe(p.name);
    }
    expect(place(list, 'old-crossroads').element).toBeNull();
    expect(place(list, 'ember-caves').element).toBe('ember');
  });

  it('shows who is out, who is home and who waits for a push-on choice', () => {
    const list = places('four-out');
    const tide = place(list, 'tidepools');
    expect(tide.count).toBe(2);
    expect(tide.faces.map((f) => f.species)).toEqual(['cindle', 'splashet']);
    expect(tide.more).toBe(0);
    expect(tide.home).toBe(false);
    const ember = place(list, 'ember-caves');
    expect(ember.home).toBe(true);
    expect(ember.pushOn).toBe(false);
    expect(ember.label).toBe('Ember Caves, 1 explorer there, 1 home');
    const ridge = place(list, 'storm-ridge');
    expect(ridge.pushOn).toBe(true);
    expect(ridge.home).toBe(false);
    expect(ridge.label).toBe('Storm Ridge, 1 explorer there, 1 waiting for a choice');
  });

  it('shows at most two faces and counts the rest as more', () => {
    const tide = place(places('crowded'), 'tidepools');
    expect(tide.count).toBe(3);
    expect(tide.faces).toHaveLength(2);
    expect(tide.more).toBe(1);
    expect(tide.home).toBe(true);
    expect(tide.label).toBe('Tidepools, 3 explorers there, 1 home');
  });

  it('ignores claimed trips and trips whose explorer is unknown (still counted)', () => {
    const trips = sampleMapTrips('four-out', NOW).map((t) => ({
      ...t,
      status: 'claimed' as const,
    }));
    const claimed = mapPlaces({ trips, creatures: SAMPLE_EXPLORERS, now: NOW, selected: null });
    expect(claimed.every((p) => p.count === 0)).toBe(true);
    const unknown = mapPlaces({
      trips: sampleMapTrips('four-out', NOW),
      creatures: [],
      now: NOW,
      selected: null,
    });
    const tide = place(unknown, 'tidepools');
    expect(tide.count).toBe(2);
    expect(tide.faces).toEqual([]);
  });

  it('marks the selected place and passes a time rule through to the label', () => {
    const list = mapPlaces({
      trips: [],
      creatures: [],
      now: NOW,
      selected: 'moonlit-reef',
      rules: { 'moonlit-reef': 'Night only' },
    });
    const reef = place(list, 'moonlit-reef');
    expect(reef.selected).toBe(true);
    expect(reef.rule).toBe('Night only');
    expect(reef.label).toBe('Moonlit Reef, Night only');
    expect(list.filter((p) => p.selected)).toHaveLength(1);
    expect(place(list, 'tidepools').rule).toBeNull();
  });

  it('never locks a place by rank', () => {
    const reef = place(places('empty'), 'moonlit-reef');
    expect(reef.label).toBe('Moonlit Reef');
  });
});

describe('placeLabel', () => {
  it('says one explorer in the singular', () => {
    expect(placeLabel('Fen', { count: 1, home: 0, pushOn: 0 }, null)).toBe('Fen, 1 explorer there');
    expect(placeLabel('Fen', { count: 2, home: 2, pushOn: 0 }, null)).toBe(
      'Fen, 2 explorers there, 2 home',
    );
  });
});

describe('mapScale', () => {
  it('is a whole number: 2 until the whole map fits at 3 (1104 px), then 3', () => {
    expect(mapScale(360)).toBe(2);
    expect(mapScale(390)).toBe(2);
    expect(mapScale(736)).toBe(2);
    expect(mapScale(1103)).toBe(2);
    expect(mapScale(1104)).toBe(3);
    expect(mapScale(1600)).toBe(3);
  });

  it('pans sideways only while the map is wider than its window', () => {
    expect(mapScrolls(390)).toBe(true);
    expect(mapScrolls(735)).toBe(true);
    expect(mapScrolls(736)).toBe(false);
    expect(mapScrolls(1103)).toBe(false);
    expect(mapScrolls(1104)).toBe(false);
  });
});

describe('mapReadingOrder', () => {
  it('goes west to east and, within a column, north to south, and keeps the input unchanged', () => {
    const list = places('empty');
    const ordered = mapReadingOrder(list).map((p) => p.id);
    expect(ordered).toEqual([
      'tidepools',
      'moonlit-reef',
      'ember-caves',
      'verdant-hollow',
      'old-crossroads',
      'storm-ridge',
      'sunken-fen',
      'festival-grounds',
    ]);
    expect(list.map((p) => p.id)).toEqual(expeditionContent.destinations.map((d) => d.id));
  });
});

describe('nextMarker', () => {
  const ids = ['a', 'b', 'c'];
  it('moves along the trail and stops at the ends', () => {
    expect(nextMarker(ids, 'a', 1)).toBe('b');
    expect(nextMarker(ids, 'c', -1)).toBe('b');
    expect(nextMarker(ids, 'c', 1)).toBe('c');
    expect(nextMarker(ids, 'a', -1)).toBe('a');
  });
  it('starts at an end when nothing (or an unknown id) is current', () => {
    expect(nextMarker(ids, null, 1)).toBe('a');
    expect(nextMarker(ids, null, -1)).toBe('c');
    expect(nextMarker(ids, 'zzz', 1)).toBe('a');
    expect(nextMarker([], 'a', 1)).toBeNull();
  });
});

describe('mapScaleWide', () => {
  it('is the largest whole scale that fits the width, from 2 to 4', () => {
    expect(mapScaleWide(600, 5000)).toBe(2);
    expect(mapScaleWide(1103, 5000)).toBe(2);
    expect(mapScaleWide(1104, 5000)).toBe(3);
    expect(mapScaleWide(1471, 5000)).toBe(3);
    expect(mapScaleWide(1472, 5000)).toBe(4);
    expect(mapScaleWide(3000, 5000)).toBe(4);
  });

  it('takes 4 only where the height fits it too, and never shrinks below the width scale', () => {
    // A 1920 x 1080 window has about 840 px under the HUD and the room band: 4 (1152 px tall) does not fit.
    expect(mapScaleWide(1700, 840)).toBe(3);
    expect(mapScaleWide(1700, 1152)).toBe(4);
    expect(mapScaleWide(1700, 100)).toBe(3);
    expect(mapScaleWide(1000, 100)).toBe(2);
  });
});
