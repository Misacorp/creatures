/**
 * The Expeditions world map as data: a 288x184 pixel world (grass, a sea strip on the left, one
 * landmark per destination, a dashed trail through them in order and a few small props) plus the
 * client-only `MAP_SPOTS` (where each place's marker sits, like `ROOM_SPOTS` in the living room). The
 * pixel data lives in `data/world-map-sprites.ts`; `WorldMap.tsx` draws it with `drawSprites`.
 *
 * A spot is the point on the trail where a place's marker sits, in map pixels. The landmark stands just
 * above it (its feet `LANDMARK_LIFT` px over the spot), so the marker, its name plate and the explorers'
 * faces never hide the picture. Spots zigzag high and low and grow in x in the order of the content's
 * destinations, so the trail reads left to right.
 */
import { WORLD_MAP_SPRITE_DATA, type WorldMapSpriteName } from './data/world-map-sprites';
import { spriteSize, type SpriteDef } from './sprite-data';

export const MAP_SIZE = { width: 288, height: 184 } as const;
export const GRASS_TILE = 16;
/** The sea strip's tile height; it repeats downwards, its wave edge is periodic over it. */
export const SEA_TILE_HEIGHT = 32;
/** How far a landmark's feet stand above its spot (map pixels). */
export const LANDMARK_LIFT = 20;

export interface MapPoint {
  x: number;
  y: number;
}

/** Where each destination's marker sits (client-only; the content knows nothing of the map). */
export const MAP_SPOTS: Readonly<Record<string, MapPoint>> = {
  tidepools: { x: 36, y: 112 },
  'ember-caves': { x: 76, y: 80 },
  'verdant-hollow': { x: 100, y: 130 },
  'storm-ridge': { x: 136, y: 84 },
  'sunken-fen': { x: 160, y: 132 },
  'old-crossroads': { x: 194, y: 90 },
  'moonlit-reef': { x: 220, y: 134 },
  'festival-grounds': { x: 256, y: 90 },
};

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

/** One dash of the trail (2x2 map pixels): sand with a darker lower edge. */
export const TRAIL_DASH: SpriteDef = {
  palette: { e: '#efe2b4', d: '#b89968' },
  rows: ['ee', 'dd'],
};

const TRAIL_ON = 4;
const TRAIL_OFF = 3;

/**
 * The dashed trail through the spots in the given order: the top-left of each 2x2 dash, walking whole
 * pixels along the horizontal and vertical legs through `trailCorner`. The pattern runs on across
 * corners and spots, so a corner never starts a new dash early.
 */
export function trailCells(spots: readonly MapPoint[]): MapPoint[] {
  const cells: MapPoint[] = [];
  let step = 0;
  const walk = (a: MapPoint, b: MapPoint): void => {
    const sx = Math.sign(b.x - a.x);
    const sy = Math.sign(b.y - a.y);
    let x = a.x;
    let y = a.y;
    while (x !== b.x || y !== b.y) {
      if (step % (TRAIL_ON + TRAIL_OFF) < TRAIL_ON) cells.push({ x: x - 1, y: y - 1 });
      step++;
      x += sx;
      y += sy;
    }
  };
  for (let i = 0; i + 1 < spots.length; i++) {
    const from = spots[i];
    const to = spots[i + 1];
    if (from === undefined || to === undefined) continue;
    const corner = trailCorner(from, to);
    walk(from, corner);
    walk(corner, to);
  }
  return cells;
}

/**
 * The corner of the trail between two neighbouring spots: it runs along the lower spot's row and climbs
 * at the higher spot's column, so it never cuts through a landmark standing above the lower spot.
 */
export function trailCorner(from: MapPoint, to: MapPoint): MapPoint {
  return from.y < to.y ? { x: from.x, y: to.y } : { x: to.x, y: from.y };
}

export interface MapPlacement {
  sprite: SpriteDef;
  x: number;
  y: number;
}

/** Small props that fill the gaps between the landmarks (top-left, map pixels). */
const DECOR: readonly (readonly [WorldMapSpriteName, number, number])[] = [
  ['smallPine', 30, 6],
  ['smallPine', 38, 12],
  ['smallTree', 84, 6],
  ['smallPine', 172, 8],
  ['smallPine', 182, 14],
  ['smallTree', 222, 6],
  ['smallPine', 276, 8],
  ['bush', 32, 60],
  ['flowers', 58, 100],
  ['rock', 24, 126],
  ['bush', 60, 150],
  ['flowers', 100, 152],
  ['smallTree', 136, 120],
  ['rock', 140, 156],
  ['bush', 176, 150],
  ['flowers', 186, 124],
  ['rock', 210, 150],
  ['flowers', 250, 126],
  ['bush', 262, 150],
  ['smallTree', 268, 100],
  ['smallPine', 40, 160],
  ['smallTree', 120, 160],
  ['smallPine', 240, 160],
];

/** Where a landmark's top-left sits: centred on its spot, feet `LANDMARK_LIFT` above it. */
export function landmarkOrigin(id: string): MapPoint | null {
  const spot = MAP_SPOTS[id];
  const name = LANDMARKS[id];
  if (spot === undefined || name === undefined) return null;
  const size = spriteSize(worldSprite(name));
  return { x: spot.x - Math.floor(size.width / 2), y: spot.y - LANDMARK_LIFT - size.height };
}

/** Every placement of the map in draw order: ground, sea, trail, small props, landmarks (top to bottom). */
export function mapPlacements(): MapPlacement[] {
  const out: MapPlacement[] = [];
  const grass = worldSprite('grass');
  for (let y = 0; y < MAP_SIZE.height; y += GRASS_TILE) {
    for (let x = 0; x < MAP_SIZE.width; x += GRASS_TILE) out.push({ sprite: grass, x, y });
  }
  const sea = worldSprite('sea');
  for (let y = 0; y < MAP_SIZE.height; y += SEA_TILE_HEIGHT) out.push({ sprite: sea, x: 0, y });
  for (const cell of trailCells(Object.values(MAP_SPOTS)))
    out.push({ sprite: TRAIL_DASH, ...cell });
  for (const [name, x, y] of DECOR) out.push({ sprite: worldSprite(name), x, y });
  const ids = Object.keys(MAP_SPOTS).sort(
    (a, b) => (MAP_SPOTS[a]?.y ?? 0) - (MAP_SPOTS[b]?.y ?? 0),
  );
  for (const id of ids) {
    const origin = landmarkOrigin(id);
    const name = LANDMARKS[id];
    if (origin === null || name === undefined) continue;
    out.push({ sprite: worldSprite(name), ...origin });
  }
  return out;
}
