import { expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP_SPRITE_DATA } from './data/world-map-sprites';
import { spriteSize, validateSprite } from './sprite-data';
import {
  HUB,
  LANDMARKS,
  LANDMARK_LIFT,
  MAP_PATHS,
  MAP_SIZE,
  MAP_SPOTS,
  SEA_EDGE,
  TRAIL_DASH,
  decorPlacements,
  landmarkPixels,
  landmarkRect,
  logoRect,
  mapPlacements,
  pathCells,
  pathRoutes,
} from './world-map-art';

const destinations = expeditionContent.destinations;
const ids = destinations.map((d) => d.id);

function spot(id: string) {
  const s = MAP_SPOTS[id];
  if (s === undefined) throw new Error(id);
  return s;
}

describe('the world map art', () => {
  it('has a spot and a landmark for every destination of the content, and no other', () => {
    expect(Object.keys(MAP_SPOTS).sort()).toEqual([...ids].sort());
    expect(Object.keys(LANDMARKS).sort()).toEqual([...ids].sort());
  });

  it('puts the spots inside the map and apart from each other', () => {
    for (const id of ids) {
      const s = spot(id);
      expect(s.x, id).toBeGreaterThanOrEqual(30);
      expect(s.x, id).toBeLessThanOrEqual(MAP_SIZE.width - 30);
      expect(s.y, id).toBeGreaterThanOrEqual(50);
      expect(s.y, id).toBeLessThanOrEqual(MAP_SIZE.height - 30);
    }
    for (const [i, a] of ids.entries()) {
      for (const b of ids.slice(i + 1)) {
        const d = Math.hypot(spot(a).x - spot(b).x, spot(a).y - spot(b).y);
        expect(d, `${a} ${b}`).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it('lays the places out as geography: shore in the west, hub in the middle, caves and ridge north, grove and fen south, festival east', () => {
    const cx = MAP_SIZE.width / 2;
    const cy = MAP_SIZE.height / 2;
    expect(Math.abs(spot(HUB).x - cx)).toBeLessThan(30);
    expect(Math.abs(spot(HUB).y - cy)).toBeLessThan(40);
    // Both shore places are in the west and touch the sea's sand; one is north of the hub, one south.
    for (const id of ['tidepools', 'moonlit-reef']) {
      expect(spot(id).x, id).toBeLessThan(spot(HUB).x - 60);
      expect(landmarkRect(id)?.x ?? 99, id).toBeLessThanOrEqual(SEA_EDGE + 6);
    }
    expect(spot('tidepools').y).toBeLessThan(spot(HUB).y);
    expect(spot('moonlit-reef').y).toBeGreaterThan(spot(HUB).y);
    for (const id of ['ember-caves', 'storm-ridge']) expect(spot(id).y).toBeLessThan(spot(HUB).y);
    for (const id of ['verdant-hollow', 'sunken-fen'])
      expect(spot(id).y).toBeGreaterThan(spot(HUB).y);
    for (const id of ids) expect(spot('festival-grounds').x).toBeGreaterThanOrEqual(spot(id).x);
  });

  it('draws every sprite as well-formed data of at most 64x64, and keeps each landmark and logo on the map', () => {
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
    for (const id of ids) {
      const land = landmarkRect(id);
      const logo = logoRect(id);
      if (land === null || logo === null) throw new Error(id);
      expect(land.x, id).toBeGreaterThanOrEqual(0);
      expect(land.x + land.width, id).toBeLessThanOrEqual(MAP_SIZE.width);
      expect(land.y + land.height + LANDMARK_LIFT, id).toBe(spot(id).y);
      expect(logo.x, `${id} logo`).toBeGreaterThanOrEqual(0);
      expect(logo.y, `${id} logo`).toBeGreaterThanOrEqual(0);
      expect(logo.x + logo.width, `${id} logo`).toBeLessThanOrEqual(MAP_SIZE.width);
    }
  });

  it('keeps landmarks and logos off each other', () => {
    const rects = ids.flatMap((id) => [
      { id, r: landmarkRect(id) },
      { id: `${id} logo`, r: logoRect(id) },
    ]);
    for (const [i, a] of rects.entries()) {
      for (const b of rects.slice(i + 1)) {
        if (a.r === null || b.r === null) continue;
        if (a.id.split(' ')[0] === b.id.split(' ')[0]) continue;
        const apart =
          a.r.x + a.r.width <= b.r.x ||
          b.r.x + b.r.width <= a.r.x ||
          a.r.y + a.r.height <= b.r.y ||
          b.r.y + b.r.height <= a.r.y;
        expect(apart, `${a.id} and ${b.id}`).toBe(true);
      }
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

describe('the paths', () => {
  it('join places that exist, and every place reaches the hub', () => {
    for (const [a, b] of MAP_PATHS) {
      expect(ids).toContain(a);
      expect(ids).toContain(b);
    }
    const reached = new Set([HUB]);
    for (let round = 0; round < ids.length; round++) {
      for (const [a, b] of MAP_PATHS) {
        if (reached.has(a)) reached.add(b);
        if (reached.has(b)) reached.add(a);
      }
    }
    expect([...reached].sort()).toEqual([...ids].sort());
  });

  it('gives every path a route that runs from one pin to the other', () => {
    const routes = pathRoutes();
    expect(routes).toHaveLength(MAP_PATHS.length);
    for (const [i, route] of routes.entries()) {
      const edge = MAP_PATHS[i];
      if (route === null || edge === undefined) throw new Error(`no route for edge ${String(i)}`);
      expect(route.length, edge.join('-')).toBeGreaterThan(5);
      const [first, last] = [route[0], route[route.length - 1]];
      expect(first && Math.abs(first.cx * 2 - spot(edge[0]).x) <= 2).toBe(true);
      expect(first && Math.abs(first.cy * 2 - spot(edge[0]).y) <= 2).toBe(true);
      expect(last && Math.abs(last.cx * 2 - spot(edge[1]).x) <= 2).toBe(true);
      expect(last && Math.abs(last.cy * 2 - spot(edge[1]).y) <= 2).toBe(true);
    }
  });

  it('never lies on landmark art, a logo or the sea, and is dashes, not a solid line', () => {
    const cells = pathCells();
    expect(cells.length).toBeGreaterThan(200);
    const art = new Set(ids.flatMap((id) => [...landmarkPixels(id)]));
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(SEA_EDGE);
      expect(c.x + 1).toBeLessThan(MAP_SIZE.width);
      expect(c.y + 1).toBeLessThan(MAP_SIZE.height);
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        expect(
          art.has(`${String(c.x + dx)},${String(c.y + dy)}`),
          `${String(c.x)},${String(c.y)}`,
        ).toBe(false);
      }
      for (const id of ids) {
        const logo = logoRect(id);
        if (logo === null) continue;
        const inside =
          c.x < logo.x + logo.width &&
          logo.x < c.x + 2 &&
          c.y < logo.y + logo.height &&
          logo.y < c.y + 2;
        expect(inside, `${id} logo`).toBe(false);
      }
    }
    // Dashes: along a long straight stretch of a path some cells are missing.
    const keys = new Set(cells.map((c) => `${String(c.x)},${String(c.y)}`));
    const run = pathRoutes()[0] ?? [];
    expect(
      run.filter((p) => !keys.has(`${String(p.cx * 2)},${String(p.cy * 2)}`)).length,
    ).toBeGreaterThan(5);
  });

  it('is the same every time, and a shared stretch is drawn once', () => {
    expect(pathCells()).toEqual(pathCells());
    const keys = pathCells().map((c) => `${String(c.x)},${String(c.y)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no route through a wall, and says so with null', () => {
    const wall = [{ x: 0, y: 0, width: MAP_SIZE.width, height: MAP_SIZE.height }];
    const [route] = pathRoutes([['tidepools', 'sunken-fen']], MAP_SPOTS, wall);
    expect(route).toBeNull();
  });
});

describe('the small props', () => {
  it('are the same every time and keep clear of landmarks, paths and the sea', () => {
    const decor = decorPlacements();
    expect(decor.length).toBeGreaterThan(20);
    expect(decorPlacements()).toEqual(decor);
    const art = new Set(ids.flatMap((id) => [...landmarkPixels(id)]));
    const dashes = new Set(pathCells().map((c) => `${String(c.x)},${String(c.y)}`));
    for (const d of decor) {
      const size = spriteSize(WORLD_MAP_SPRITE_DATA[d.name]);
      expect(d.x).toBeGreaterThan(SEA_EDGE);
      for (let y = d.y; y < d.y + size.height; y++) {
        for (let x = d.x; x < d.x + size.width; x++) {
          expect(art.has(`${String(x)},${String(y)}`)).toBe(false);
          expect(dashes.has(`${String(x - (x % 2))},${String(y - (y % 2))}`)).toBe(false);
        }
      }
    }
  });
});
