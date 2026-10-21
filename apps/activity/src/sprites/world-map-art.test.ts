import { expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP_SPRITE_DATA } from './data/world-map-sprites';
import { spriteSize, validateSprite } from './sprite-data';
import {
  LANDMARKS,
  LANDMARK_LIFT,
  MAP_SIZE,
  MAP_SPOTS,
  TRAIL_DASH,
  landmarkOrigin,
  mapPlacements,
  trailCells,
  trailCorner,
} from './world-map-art';

const destinations = expeditionContent.destinations;

describe('the world map art', () => {
  it('has a spot and a landmark for every destination of the content, and no other', () => {
    expect(Object.keys(MAP_SPOTS).sort()).toEqual(destinations.map((d) => d.id).sort());
    expect(Object.keys(LANDMARKS).sort()).toEqual(destinations.map((d) => d.id).sort());
  });

  it('puts the spots inside the map, with room for the plate below, and apart from each other', () => {
    const spots = destinations.map((d) => MAP_SPOTS[d.id]);
    for (const spot of spots) {
      if (spot === undefined) throw new Error('missing spot');
      expect(spot.x).toBeGreaterThanOrEqual(24);
      expect(spot.x).toBeLessThanOrEqual(MAP_SIZE.width - 24);
      expect(spot.y).toBeGreaterThanOrEqual(60);
      expect(spot.y).toBeLessThanOrEqual(MAP_SIZE.height - 30);
    }
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) {
        if (a === undefined || b === undefined) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('grows in x in the content order, so the trail reads left to right', () => {
    const xs = destinations.map((d) => MAP_SPOTS[d.id]?.x ?? -1);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
  });

  it('draws every sprite as well-formed data of at most 64x64, and keeps each landmark on the map', () => {
    for (const [name, sprite] of Object.entries(WORLD_MAP_SPRITE_DATA)) {
      expect(() => {
        validateSprite(sprite);
      }, name).not.toThrow();
      const size = spriteSize(sprite);
      expect(size.width, name).toBeLessThanOrEqual(64);
      expect(size.height, name).toBeLessThanOrEqual(64);
    }
    expect(() => {
      validateSprite(TRAIL_DASH);
    }).not.toThrow();
    for (const d of destinations) {
      const name = LANDMARKS[d.id];
      const origin = landmarkOrigin(d.id);
      if (name === undefined || origin === null) throw new Error(d.id);
      const size = spriteSize(WORLD_MAP_SPRITE_DATA[name]);
      expect(origin.x, d.id).toBeGreaterThanOrEqual(0);
      expect(origin.y, d.id).toBeGreaterThanOrEqual(0);
      expect(origin.x + size.width, d.id).toBeLessThanOrEqual(MAP_SIZE.width);
      expect(origin.y + size.height + LANDMARK_LIFT, d.id).toBe(MAP_SPOTS[d.id]?.y);
    }
  });

  it('tiles the ground and the sea, then draws a landmark for each place', () => {
    const placements = mapPlacements();
    const grass = placements.filter((p) => p.sprite === WORLD_MAP_SPRITE_DATA.grass);
    expect(grass).toHaveLength((MAP_SIZE.width / 16) * Math.ceil(MAP_SIZE.height / 16));
    for (const name of Object.values(LANDMARKS)) {
      expect(placements.some((p) => p.sprite === WORLD_MAP_SPRITE_DATA[name])).toBe(true);
    }
  });
});

describe('the trail', () => {
  it('is dashes on whole pixels that touch every spot, in order', () => {
    const spots = destinations.map((d) => MAP_SPOTS[d.id] ?? { x: 0, y: 0 });
    const cells = trailCells(spots);
    expect(cells.length).toBeGreaterThan(100);
    for (const cell of cells) {
      expect(Number.isInteger(cell.x) && Number.isInteger(cell.y)).toBe(true);
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
    }
    // Dashes, not a solid line: gaps along each straight leg.
    const first = spots[0];
    const second = spots[1];
    if (first === undefined || second === undefined) throw new Error('spots');
    const corner = trailCorner(first, second);
    const lo = Math.min(first.x, corner.x);
    const hi = Math.max(first.x, corner.x);
    const leg = new Set(
      cells.filter((c) => c.y === first.y - 1 && c.x >= lo - 1 && c.x <= hi - 1).map((c) => c.x),
    );
    expect(leg.size).toBeGreaterThan(0);
    expect(leg.size).toBeLessThan(hi - lo);
  });

  it('runs along the lower spot row and climbs at the higher spot column', () => {
    expect(trailCorner({ x: 10, y: 100 }, { x: 40, y: 60 })).toEqual({ x: 40, y: 100 });
    expect(trailCorner({ x: 10, y: 60 }, { x: 40, y: 100 })).toEqual({ x: 10, y: 100 });
  });

  it('is empty for fewer than two spots, and is the same every time', () => {
    expect(trailCells([])).toEqual([]);
    expect(trailCells([{ x: 5, y: 5 }])).toEqual([]);
    const spots = [
      { x: 5, y: 5 },
      { x: 20, y: 30 },
    ];
    expect(trailCells(spots)).toEqual(trailCells(spots));
  });
});
