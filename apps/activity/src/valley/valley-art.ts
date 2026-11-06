/**
 * The valley as data: one 36 x 24 tile world of 16 px tiles (576 x 384 valley pixels), built from the Valley
 * Games tileset, the world-map landmarks and the living room's props. Pure: it returns placements for a canvas
 * (`paint.ts`) and the places' rectangles for the buttons laid over it.
 *
 * The valley reads west to east: the cave (the Dungeon) and the fairground (the Valley Games) with its lake;
 * the house, the paddock and the forge (the Workshop) in the middle; the arena (the Raid) and the signpost
 * (Expeditions, the road out) in the east. The School, the Market, the bonfire and the visitor's roadside stall
 * stand among them (drawn, not open yet). Every place is one of the art library's glow sprites
 * (`valley-places.ts`); the tiles carry only the sky, the hills, the roads, the lake and the garden.
 */
import { WORLD_MAP_SPRITE_DATA } from '../sprites/data/world-map-sprites';
import type { SpriteDef } from '../sprites/sprite-data';
import type { Placement } from '../games/art/pixel';
import { propSprite } from '../games/art/props';
import { TILE, tileFrame, type TileName } from '../games/art/tiles';
import { DEFAULT_LOOK, artBox, placePlacements, type ValleyLook } from './valley-places';
import { maybeTint, type Ramp, type RampName } from '../games/art/tint';

export { TILE };
export type { Placement };

export const VALLEY_COLS = 36;
export const VALLEY_ROWS = 24;
export const VALLEY_SIZE = { width: VALLEY_COLS * TILE, height: VALLEY_ROWS * TILE } as const;

/** The places of the valley, west to east and north to south (the reading order of their buttons). */
export const PLACE_IDS = [
  'cave',
  'fair',
  'school',
  'house',
  'paddock',
  'market',
  'forge',
  'bonfire',
  'arena',
  'visitor',
  'signpost',
] as const;
export type PlaceId = (typeof PLACE_IDS)[number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ValleyPlace {
  id: PlaceId;
  /** The place in the world ("Forge"). */
  name: string;
  /** What it is in the game ("Workshop"). */
  what: string;
  /** The button's rectangle, in valley pixels. */
  rect: Rect;
  /** The glyph of its edge arrow and its row in the Places list (`glyphs.ts`). */
  glyph: string;
}

const tiles = (x: number, y: number, w: number, h: number): Rect => ({
  x: x * TILE,
  y: y * TILE,
  width: w * TILE,
  height: h * TILE,
});

export const PLACES: readonly ValleyPlace[] = [
  {
    id: 'cave',
    name: 'Cave',
    what: 'Dungeon',
    rect: artBox('cave'),
    glyph: 'lantern',
  },
  {
    id: 'fair',
    name: 'Fairground',
    what: 'Valley Games',
    rect: artBox('fairground'),
    glyph: 'trophy',
  },
  {
    id: 'house',
    name: 'House',
    what: 'living room',
    rect: artBox('house'),
    glyph: 'home',
  },
  {
    id: 'paddock',
    name: 'Paddock',
    what: 'your creatures',
    rect: artBox('paddock'),
    glyph: 'paw',
  },
  {
    id: 'forge',
    name: 'Forge',
    what: 'Workshop',
    rect: artBox('forge'),
    glyph: 'anvil',
  },
  {
    id: 'arena',
    name: 'Arena',
    what: 'Raid',
    rect: artBox('arena'),
    glyph: 'blade',
  },
  {
    id: 'signpost',
    name: 'Signpost',
    what: 'Expeditions',
    rect: artBox('road'),
    glyph: 'compass',
  },
  // The four newer places (art: the library's `valley-glow`, see `valley-places.ts`).
  {
    id: 'school',
    name: 'School',
    what: 'talents',
    rect: tiles(7, 4, 5, 4),
    glyph: 'journal',
  },
  {
    id: 'market',
    name: 'Market',
    what: 'shards',
    rect: tiles(20, 4, 4, 4),
    glyph: 'gem',
  },
  {
    id: 'bonfire',
    name: 'Bonfire',
    what: 'resting creatures',
    rect: tiles(20, 14, 5, 4),
    glyph: 'map-camp',
  },
  {
    id: 'visitor',
    name: 'Visitor',
    what: 'weekly stall',
    // A roadside stall: its rectangle starts on the road and stops short of the Signpost's marker below.
    rect: { x: 28 * TILE, y: 146, width: 5 * TILE, height: 50 },
    glyph: 'moon',
  },
];

export function placeOf(id: PlaceId): ValleyPlace {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no place ${id}`);
  return found;
}

// --- The tile grid ---

type Cell = { tile: TileName; tint?: RampName | Ramp; tint2?: RampName | Ramp } | null;

/** The base layer: sky, the hills' sky, then grass. Any cell, also outside the valley (desktop margins). */
function baseCell(row: number): TileName {
  if (row <= 0) return 'sky';
  if (row <= 2) return 'skyLow';
  return 'grass';
}

/** What lies on the base at a cell inside the valley (null: nothing). */
export function featureGrid(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: VALLEY_ROWS }, () =>
    Array.from({ length: VALLEY_COLS }, (): Cell => null),
  );
  const fill = (x: number, y: number, w: number, h: number, cell: Cell): void => {
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        const row = grid[r];
        if (row !== undefined && c >= 0 && c < VALLEY_COLS) row[c] = cell;
      }
    }
  };
  // Hills along the horizon (two tiles that make one 32 px wave).
  for (let c = 0; c < VALLEY_COLS; c++)
    fill(c, 2, 1, 1, { tile: c % 2 === 0 ? 'hillsA' : 'hillsB' });
  // Roads.
  const dirt: Cell = { tile: 'dirt' };
  fill(3, 9, 33, 1, dirt);
  fill(3, 7, 1, 2, dirt);
  fill(15, 8, 1, 1, dirt);
  fill(10, 10, 1, 8, dirt);
  fill(5, 18, 31, 1, dirt);
  fill(5, 17, 1, 1, dirt);
  fill(26, 10, 1, 8, dirt);
  fill(18, 13, 4, 1, dirt);
  fill(18, 14, 1, 4, dirt);
  // (The places themselves are glow sprites drawn over the grass, see `valley-places.ts`.)
  // The south: a road out of the valley's bottom edge, and a garden of beds beside it.
  fill(26, 19, 1, 5, dirt);
  fill(14, 20, 9, 1, dirt);
  fill(14, 22, 9, 1, dirt);
  fill(0, 19, 9, 5, { tile: 'water' });
  fill(0, 19, 9, 1, { tile: 'shoreN' });
  fill(9, 20, 1, 4, { tile: 'shoreE' });
  fill(9, 19, 1, 1, { tile: 'shoreNE' });
  return grid;
}

/** The tiles that are animated (the lake's water drifts in two frames). */
export function isWater(cell: Cell): boolean {
  return cell !== null && cell.tile === 'water';
}

const FEATURES = featureGrid();

function cellSprite(cell: NonNullable<Cell>, frame: number): SpriteDef {
  return maybeTint(tileFrame(cell.tile, frame), cell.tint, cell.tint2);
}

/** A tree or a bush at a cell outside the valley, so the desktop's margins are not bare (fixed pattern). */
function marginDecor(col: number, row: number): Placement | null {
  if (row < 3) return null;
  const n = (((col * 7 + row * 13) % 11) + 11) % 11;
  if (n === 0)
    return { sprite: WORLD_MAP_SPRITE_DATA.smallPine, x: col * TILE + 2, y: row * TILE - 2 };
  if (n === 5) return { sprite: WORLD_MAP_SPRITE_DATA.smallTree, x: col * TILE + 3, y: row * TILE };
  if (n === 8) return { sprite: WORLD_MAP_SPRITE_DATA.bush, x: col * TILE + 4, y: row * TILE + 6 };
  return null;
}

/** Trees, bushes, rocks and flowers inside the valley: a fixed list, clear of every place. */
const DECOR: readonly [keyof typeof WORLD_MAP_SPRITE_DATA, number, number][] = [
  ['smallPine', 104, 56],
  ['smallTree', 552, 50],
  ['smallPine', 556, 92],
  ['bush', 182, 104],
  ['flowers', 168, 122],
  ['smallTree', 4, 120],
  ['smallPine', 24, 128],
  ['bush', 132, 120],
  ['rock', 140, 176],
  ['smallTree', 180, 168],
  ['flowers', 148, 194],
  ['smallPine', 132, 222],
  ['bush', 290, 178],
  ['flowers', 376, 202],
  ['smallTree', 400, 150],
  ['smallPine', 396, 182],
  ['smallTree', 420, 164],
  ['smallPine', 540, 168],
  ['smallTree', 560, 214],
  ['smallTree', 168, 316],
  ['smallPine', 196, 330],
  ['rock', 380, 318],
  ['smallPine', 470, 316],
  ['flowers', 500, 340],
  ['smallTree', 540, 330],
  ['bush', 452, 362],
  ['rock', 168, 290],
  ['flowers', 220, 290],
];

export interface ValleyDrawing {
  /** Placements in drawing pixels (valley pixels shifted by the margin). */
  placements: Placement[];
  /** The drawing's size in pixels. */
  width: number;
  height: number;
  /** Where the valley's top-left sits in the drawing. */
  ox: number;
  oy: number;
}

/**
 * Roads that leave the valley go on through the margin to the window's edge, never ending in the grass: the two
 * roads that cross it from the west go on east (the high road and the road out), the road south goes on south.
 */
function marginRoad(col: number, row: number): boolean {
  if (col >= VALLEY_COLS && (row === 9 || row === 18)) return true;
  return row >= VALLEY_ROWS && col === 26;
}

/**
 * The valley with `margin` extra tiles on each side (left, top, right, bottom) of sky, hills and grass, so a
 * window wider or taller than the valley shows more of the world, not a dark bar. `frame` is the water's frame.
 */
export function valleyDrawing(
  margin: { left: number; top: number; right: number; bottom: number },
  frame = 0,
  look: ValleyLook = DEFAULT_LOOK,
): ValleyDrawing {
  const ox = margin.left * TILE;
  const oy = margin.top * TILE;
  const cols = VALLEY_COLS + margin.left + margin.right;
  const rows = VALLEY_ROWS + margin.top + margin.bottom;
  const out: Placement[] = [];
  // Base and features, cell by cell.
  for (let r = 0; r < rows; r++) {
    const row = r - margin.top;
    for (let c = 0; c < cols; c++) {
      const col = c - margin.left;
      const x = c * TILE;
      const y = r * TILE;
      out.push({ sprite: tileFrame(baseCell(row)), x, y });
      const inside = col >= 0 && col < VALLEY_COLS && row >= 0 && row < VALLEY_ROWS;
      if (inside) {
        const cell = FEATURES[row]?.[col] ?? null;
        if (cell !== null) out.push({ sprite: cellSprite(cell, frame), x, y });
      } else if (row === 2) {
        out.push({ sprite: tileFrame(col % 2 === 0 ? 'hillsA' : 'hillsB'), x, y });
      } else if (marginRoad(col, row)) {
        out.push({ sprite: tileFrame('dirt'), x, y });
      }
    }
  }
  // The margins' trees.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = c - margin.left;
      const row = r - margin.top;
      if (col >= 0 && col < VALLEY_COLS && row >= 0 && row < VALLEY_ROWS) continue;
      if (marginRoad(col, row)) continue;
      const decor = marginDecor(col, row);
      if (decor !== null) out.push({ ...decor, x: decor.x + ox, y: decor.y + oy });
    }
  }
  const at = (p: Placement): Placement => ({ ...p, x: p.x + ox, y: p.y + oy });
  for (const p of buildingPlacements()) out.push(at(p));
  for (const p of placePlacements(look)) out.push(at(p));
  return { placements: out, width: cols * TILE, height: rows * TILE, ox, oy };
}

/** The buildings, landmarks and decor drawn over the tiles, in valley pixels. */
export function buildingPlacements(): Placement[] {
  const out: Placement[] = [];
  const wm = WORLD_MAP_SPRITE_DATA;
  for (const [name, x, y] of DECOR) out.push({ sprite: wm[name], x, y });
  // The garden's beds: rows of flowers on the dug earth.
  for (let x = 14 * TILE + 4; x < 23 * TILE - 4; x += 12) {
    out.push({ sprite: wm.flowers, x, y: 20 * TILE + 6 });
    out.push({ sprite: wm.flowers, x: x + 4, y: 22 * TILE + 6 });
  }
  // Reeds at the lake.
  out.push({ sprite: propSprite('reeds'), x: 10 * TILE + 4, y: 21 * TILE });
  out.push({ sprite: propSprite('duck'), x: 4 * TILE, y: 21 * TILE + 4 });
  return out;
}

const PADDOCK_AT = artBox('paddock');
/** The most creatures drawn wandering the paddock on the map (the tray lists them all). */
export const MAX_WANDERERS = 4;
/** Valley pixels a place's name plate covers up from the foot of its art: creatures keep their feet above it. */
export const PLATE_ROWS = 10;
/**
 * The open grass inside the paddock's rails, from the art's top-left: room for four creatures a whole sprite apart,
 * with their feet above the name plate (the map's label stays readable).
 */
export const PADDOCK_ROAM_OFFSET = { x: 8, y: 9, width: 33, height: 17 } as const;
/** Where your idle creatures roam on the map, in valley pixels. */
export const PADDOCK_ROAM = {
  x: PADDOCK_AT.x + PADDOCK_ROAM_OFFSET.x,
  y: PADDOCK_AT.y + PADDOCK_ROAM_OFFSET.y,
  width: PADDOCK_ROAM_OFFSET.width,
  height: PADDOCK_ROAM_OFFSET.height,
} as const;

/** The name plate of a place (valley pixels): about 60 wide, centred, over the last `PLATE_ROWS` of its art and a little below. */
export function plateBox(rect: Rect): Rect {
  return {
    x: rect.x + Math.floor(rect.width / 2) - 30,
    y: rect.y + rect.height - PLATE_ROWS,
    width: 60,
    height: PLATE_ROWS + 2,
  };
}

/** The small flame over a creature that is warming up, catching up toward the server (V-BON-2; 5 x 7 pixels). */
export const WARMING_FLAME: SpriteDef = {
  rows: ['..o..', '..oo.', '.ooyo', '.oyyo', 'oyyyo', 'oyyyo', '.ooo.'],
  palette: { o: '#ff7a2e', y: '#ffd25a' },
};
