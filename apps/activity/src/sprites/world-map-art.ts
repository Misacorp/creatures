/**
 * The Expeditions world map as data: a 368x288 pixel world with the sea along the west edge, a landmark
 * per destination, a small graph of dashed paths between them and a scatter of small props, plus the
 * client-only `MAP_SPOTS` (where each place's marker sits, like `ROOM_SPOTS` in the living room). The pixel
 * data lives in `data/world-map-sprites.ts`, the title logos in `world-map-logos.ts`; `WorldMap.tsx` draws it
 * with `drawSprites`.
 *
 * Geography: Tidepools and Moonlit Reef on the west shore (north and south), Ember Caves and Storm Ridge up
 * north, Old Crossroads at the centre as the hub, Verdant Hollow and Sunken Fen in the south and the
 * Festival Grounds in the east. A spot is the point where a place's marker pin sits, in map pixels. The
 * landmark stands on it (its feet `LANDMARK_LIFT` px above), the place's logo hangs just over the landmark,
 * and the explorers' faces hang under the pin, so nothing covers the art.
 */
import { WORLD_MAP_SPRITE_DATA, type WorldMapSpriteName } from './data/world-map-sprites';
import { parseSprite, spriteSize, type SpriteDef } from './sprite-data';
import { logoOf } from './world-map-logos';
import { PATH_CELL, routeCells, type GridPoint } from './world-map-paths';

export const MAP_SIZE = { width: 368, height: 288 } as const;
export const GRASS_TILE = 16;
/** The sea strip's tile height; it repeats downwards, its wave edge is periodic over it. */
export const SEA_TILE_HEIGHT = 32;
/** How far a landmark's feet stand above its spot (map pixels). */
export const LANDMARK_LIFT = 6;
/** Where the sea ends (paths and props keep east of it); the sand reaches a little further. */
export const SEA_EDGE = 20;

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where each destination's marker pin sits (client-only; the content knows nothing of the map). */
export const MAP_SPOTS: Readonly<Record<string, MapPoint>> = {
  tidepools: { x: 46, y: 62 },
  'ember-caves': { x: 112, y: 84 },
  'verdant-hollow': { x: 120, y: 250 },
  'storm-ridge': { x: 232, y: 84 },
  'sunken-fen': { x: 250, y: 250 },
  'old-crossroads': { x: 176, y: 168 },
  'moonlit-reef': { x: 46, y: 205 },
  'festival-grounds': { x: 322, y: 140 },
};

/** The place every path leads to. */
export const HUB = 'old-crossroads';

/** The places a path joins: every place reaches the hub, directly or through a neighbour. */
export const MAP_PATHS: readonly (readonly [string, string])[] = [
  ['old-crossroads', 'ember-caves'],
  ['old-crossroads', 'storm-ridge'],
  ['old-crossroads', 'festival-grounds'],
  ['old-crossroads', 'verdant-hollow'],
  ['old-crossroads', 'sunken-fen'],
  ['tidepools', 'ember-caves'],
  ['ember-caves', 'storm-ridge'],
  ['tidepools', 'moonlit-reef'],
  ['moonlit-reef', 'verdant-hollow'],
  ['verdant-hollow', 'sunken-fen'],
  ['sunken-fen', 'festival-grounds'],
  ['storm-ridge', 'festival-grounds'],
];

/** The landmark of each destination. */
export const LANDMARKS: Readonly<Record<string, WorldMapSpriteName>> = {
  tidepools: 'tidepools',
  'ember-caves': 'emberCaves',
  'verdant-hollow': 'verdantHollow',
  'storm-ridge': 'stormRidge',
  'sunken-fen': 'sunkenFen',
  'old-crossroads': 'oldCrossroads',
  'moonlit-reef': 'moonlitReef',
  'festival-grounds': 'festivalGrounds',
};

export function worldSprite(name: WorldMapSpriteName): SpriteDef {
  return WORLD_MAP_SPRITE_DATA[name];
}

/** One dash of a path (2x2 map pixels): sand with a darker lower edge. */
export const TRAIL_DASH: SpriteDef = {
  palette: { e: '#efe2b4', d: '#b89968' },
  rows: ['ee', 'dd'],
};

/** The landmark's box on the map (null for an id the map does not know). */
export function landmarkRect(id: string): MapRect | null {
  const spot = MAP_SPOTS[id];
  const name = LANDMARKS[id];
  if (spot === undefined || name === undefined) return null;
  const size = spriteSize(worldSprite(name));
  return {
    x: spot.x - Math.floor(size.width / 2),
    y: spot.y - LANDMARK_LIFT - size.height,
    width: size.width,
    height: size.height,
  };
}

/** Where a landmark's top-left sits. */
export function landmarkOrigin(id: string): MapPoint | null {
  const rect = landmarkRect(id);
  return rect === null ? null : { x: rect.x, y: rect.y };
}

/** The place's logo: its box, hung centred just over the landmark (null where there is no logo). */
export function logoRect(id: string): MapRect | null {
  const land = landmarkRect(id);
  const spot = MAP_SPOTS[id];
  const logo = logoOf(id);
  if (land === null || spot === undefined || logo === undefined) return null;
  const size = spriteSize(logo);
  return {
    x: spot.x - Math.floor(size.width / 2),
    y: land.y - size.height - 1,
    width: size.width,
    height: size.height,
  };
}

function inflate(r: MapRect, by: number): MapRect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

function overlaps(a: MapRect, b: MapRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** What paths may not cross: every landmark and logo (with a margin) and the sea. */
export function pathObstacles(): MapRect[] {
  const out: MapRect[] = [{ x: 0, y: 0, width: SEA_EDGE, height: MAP_SIZE.height }];
  for (const id of Object.keys(MAP_SPOTS)) {
    const land = landmarkRect(id);
    if (land !== null) out.push(inflate(land, 2));
    const logo = logoRect(id);
    if (logo !== null) out.push(inflate(logo, 2));
  }
  return out;
}

/** A pin is this far (px) clear of a path that is not going to it. */
const PIN_CLEARANCE = 9;

/** The routes of the path graph as cells (`PATH_CELL` px square), one per edge; null for an edge with no route. */
export function pathRoutes(
  edges: readonly (readonly [string, string])[] = MAP_PATHS,
  spots: Readonly<Record<string, MapPoint>> = MAP_SPOTS,
  obstacles: readonly MapRect[] = pathObstacles(),
): (GridPoint[] | null)[] {
  const cols = Math.ceil(MAP_SIZE.width / PATH_CELL);
  const rows = Math.ceil(MAP_SIZE.height / PATH_CELL);
  return edges.map(([a, b]) => {
    const from = spots[a];
    const to = spots[b];
    if (from === undefined || to === undefined) return null;
    const others = Object.entries(spots)
      .filter(([id]) => id !== a && id !== b)
      .map(([, p]) => p);
    const blocked = (cx: number, cy: number): boolean => {
      const cell = { x: cx * PATH_CELL, y: cy * PATH_CELL, width: PATH_CELL, height: PATH_CELL };
      if (obstacles.some((o) => overlaps(cell, o))) return true;
      return others.some(
        (p) => Math.abs(cell.x - p.x) < PIN_CLEARANCE && Math.abs(cell.y - p.y) < PIN_CLEARANCE,
      );
    };
    return routeCells(
      { cx: Math.floor(from.x / PATH_CELL), cy: Math.floor(from.y / PATH_CELL) },
      { cx: Math.floor(to.x / PATH_CELL), cy: Math.floor(to.y / PATH_CELL) },
      cols,
      rows,
      blocked,
    );
  });
}

/**
 * The dashes of the path graph: the top-left of each 2x2 dash. Routes that share a stretch share its
 * dashes (the pattern depends on the cell, not on the route), so a shared trunk never turns solid.
 */
export function pathCells(
  edges: readonly (readonly [string, string])[] = MAP_PATHS,
  spots: Readonly<Record<string, MapPoint>> = MAP_SPOTS,
  obstacles: readonly MapRect[] = pathObstacles(),
): MapPoint[] {
  const seen = new Set<number>();
  const out: MapPoint[] = [];
  const cols = Math.ceil(MAP_SIZE.width / PATH_CELL);
  for (const route of pathRoutes(edges, spots, obstacles)) {
    for (const { cx, cy } of route ?? []) {
      const k = cy * cols + cx;
      if (seen.has(k) || (cx + cy) % 4 >= 2) continue;
      seen.add(k);
      out.push({ x: cx * PATH_CELL, y: cy * PATH_CELL });
    }
  }
  return out;
}

export interface MapPlacement {
  sprite: SpriteDef;
  x: number;
  y: number;
}

type DecorName = 'smallPine' | 'smallTree' | 'bush' | 'rock' | 'flowers';
const DECOR_KINDS: readonly DecorName[] = [
  'smallPine',
  'smallTree',
  'bush',
  'bush',
  'rock',
  'flowers',
  'flowers',
  'smallTree',
];
const DECOR_COUNT = 46;

/**
 * Small props scattered over the free ground (a fixed pseudo-random walk, so the map is the same for
 * everyone): never on a landmark, a logo, the room under a pin where the explorers' faces hang, a path or
 * the sea, and never on each other.
 */
export function decorPlacements(
  dashes: readonly MapPoint[] = pathCells(),
  obstacles: readonly MapRect[] = pathObstacles(),
): { name: DecorName; x: number; y: number }[] {
  const keep: MapRect[] = [
    ...obstacles.map((o) => inflate(o, 3)),
    ...Object.values(MAP_SPOTS).map((s) => ({ x: s.x - 24, y: s.y - 8, width: 48, height: 58 })),
    ...dashes.map((d) => ({ x: d.x - 1, y: d.y - 1, width: PATH_CELL + 2, height: PATH_CELL + 2 })),
  ];
  const out: { name: DecorName; x: number; y: number }[] = [];
  const boxes: MapRect[] = [];
  let state = 20_261_021;
  const next = (n: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % n;
  };
  for (let attempt = 0; attempt < 600 && out.length < DECOR_COUNT; attempt++) {
    const name = DECOR_KINDS[next(DECOR_KINDS.length)];
    if (name === undefined) continue;
    const size = spriteSize(worldSprite(name));
    const box = {
      x: next(MAP_SIZE.width - size.width - 4) + 2,
      y: next(MAP_SIZE.height - size.height - 4) + 2,
      width: size.width,
      height: size.height,
    };
    if (keep.some((r) => overlaps(box, r)) || boxes.some((r) => overlaps(box, inflate(r, 2)))) {
      continue;
    }
    boxes.push(box);
    out.push({ name, x: box.x, y: box.y });
  }
  return out;
}

let cached: MapPlacement[] | null = null;

/** Every placement of the map in draw order: ground, sea, paths, small props, landmarks (top to bottom). */
export function mapPlacements(): MapPlacement[] {
  if (cached !== null) return cached;
  const out: MapPlacement[] = [];
  const grass = worldSprite('grass');
  for (let y = 0; y < MAP_SIZE.height; y += GRASS_TILE) {
    for (let x = 0; x < MAP_SIZE.width; x += GRASS_TILE) out.push({ sprite: grass, x, y });
  }
  const sea = worldSprite('sea');
  for (let y = 0; y < MAP_SIZE.height; y += SEA_TILE_HEIGHT) out.push({ sprite: sea, x: 0, y });
  const dashes = pathCells();
  for (const cell of dashes) out.push({ sprite: TRAIL_DASH, ...cell });
  for (const d of decorPlacements(dashes))
    out.push({ sprite: worldSprite(d.name), x: d.x, y: d.y });
  const ids = Object.keys(MAP_SPOTS).sort(
    (a, b) => (MAP_SPOTS[a]?.y ?? 0) - (MAP_SPOTS[b]?.y ?? 0),
  );
  for (const id of ids) {
    const origin = landmarkOrigin(id);
    const name = LANDMARKS[id];
    if (origin === null || name === undefined) continue;
    out.push({ sprite: worldSprite(name), ...origin });
  }
  cached = out;
  return out;
}

/** The pixels a landmark really covers (not its box), as "x,y" keys in map pixels: for tests and tools. */
export function landmarkPixels(id: string): Set<string> {
  const origin = landmarkOrigin(id);
  const name = LANDMARKS[id];
  const pixels = new Set<string>();
  if (origin === null || name === undefined) return pixels;
  for (const cell of parseSprite(worldSprite(name)).cells) {
    pixels.add(`${String(origin.x + cell.x)},${String(origin.y + cell.y)}`);
  }
  return pixels;
}
