/**
 * The valley as data (prototype, dev only): one 36 x 24 tile world of 16 px tiles (576 x 384 valley
 * pixels), built from the Valley Games tileset, the world-map landmarks and the living room's props, plus
 * two small sprites of the concept's own (an anvil and a chest). Pure: it returns
 * placements for a canvas (`paint.ts`) and the places' rectangles for the buttons laid over it.
 *
 * The valley reads west to east: the cave (the Dungeon) and the fairground (the Valley Games) with its
 * lake; the house (the living room), the paddock (your creatures) and the forge (the Workshop) in the
 * middle; the arena (the Raid) and the signpost (Expeditions, the road out) in the east.
 * Every place is one of the art library's glow sprites (`valley-places.ts`), by day or by night. The School (between the cave and the house), the Market (north of the forge), the bonfire (south of it, east
 * of the paddock) and the visitor's roadside stall (below the arena) stand among them; the tiles carry only
 * the sky, the hills, the roads, the lake and the garden.
 */
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import type { SpriteDef } from '../../sprites/sprite-data';
import { PixelGrid, type Placement } from '../../games/art/pixel';
import { propSprite } from '../../games/art/props';
import { TILE, tileFrame, type TileName } from '../../games/art/tiles';
import { DEFAULT_LOOK, artBox, dimmed, placePlacements, type ValleyLook } from './valley-places';
import { RAMPS, maybeTint, type Ramp, type RampName } from '../../games/art/tint';

export { TILE };
export type { Placement };

export const VALLEY_COLS = 36;
export const VALLEY_ROWS = 24;
export const VALLEY_SIZE = { width: VALLEY_COLS * TILE, height: VALLEY_ROWS * TILE } as const;

const INK = '#0d0a1a';

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
  /** Its door (the point a zoom centres on), in valley pixels. */
  door: { x: number; y: number };
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
    door: { x: 48, y: 104 },
    glyph: 'lantern',
  },
  {
    id: 'fair',
    name: 'Fairground',
    what: 'Valley Games',
    rect: artBox('fairground'),
    door: { x: 92, y: 248 },
    glyph: 'trophy',
  },
  {
    id: 'house',
    name: 'House',
    what: 'living room',
    rect: artBox('house'),
    door: { x: 240, y: 122 },
    glyph: 'home',
  },
  {
    id: 'paddock',
    name: 'Paddock',
    what: 'your creatures',
    rect: artBox('paddock'),
    door: { x: 252, y: 266 },
    glyph: 'paw',
  },
  {
    id: 'forge',
    name: 'Forge',
    what: 'Workshop',
    rect: artBox('forge'),
    door: { x: 336, y: 196 },
    glyph: 'anvil',
  },
  {
    id: 'arena',
    name: 'Arena',
    what: 'Raid',
    rect: artBox('arena'),
    door: { x: 456, y: 112 },
    glyph: 'blade',
  },
  {
    id: 'signpost',
    name: 'Signpost',
    what: 'Expeditions',
    rect: artBox('road'),
    door: { x: 492, y: 272 },
    glyph: 'compass',
  },
  // The four newer places (art: the library's `valley-glow`, see `valley-places.ts`).
  {
    id: 'school',
    name: 'School',
    what: 'talents',
    rect: tiles(7, 4, 5, 4),
    door: { x: 152, y: 7 * TILE + 4 },
    glyph: 'journal',
  },
  {
    id: 'market',
    name: 'Market',
    what: 'shards',
    rect: tiles(20, 4, 4, 4),
    door: { x: 352, y: 7 * TILE + 4 },
    glyph: 'gem',
  },
  {
    id: 'bonfire',
    name: 'Bonfire',
    what: 'resting creatures',
    rect: tiles(20, 14, 5, 4),
    door: { x: 360, y: 17 * TILE },
    glyph: 'map-camp',
  },
  {
    id: 'visitor',
    name: 'Visitor',
    what: 'weekly stall',
    // A roadside stall: its rectangle starts on the road and stops short of the Signpost's marker below.
    rect: { x: 28 * TILE, y: 146, width: 5 * TILE, height: 50 },
    door: { x: 486, y: 190 },
    glyph: 'moon',
  },
];

export function placeOf(id: PlaceId): ValleyPlace {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no place ${id}`);
  return found;
}

// --- Sprites of the concept's own: an anvil, a chest, an upscale ---

/** The anvil (16 x 16): a dark iron horn and face on a stout foot. */
export const ANVIL: SpriteDef = (() => {
  const g = new PixelGrid(16, 16);
  g.rect(0, 5, 15, 1, 'k');
  g.rect(1, 6, 14, 3, 'k');
  g.rect(2, 6, 12, 2, 'b');
  g.rect(2, 6, 12, 1, 'a');
  g.rect(0, 6, 2, 1, 'k');
  g.rect(5, 9, 6, 3, 'k');
  g.rect(6, 9, 4, 3, 'c');
  g.rect(3, 12, 10, 1, 'k');
  g.rect(3, 13, 10, 2, 'k');
  g.rect(4, 13, 8, 1, 'c');
  g.rect(2, 15, 12, 1, 'k');
  return g.toSprite({ a: '#c4bcd8', b: '#6e6490', c: '#463e66', k: INK });
})();

/** The chest (16 x 16) in three frames: shut, ajar, open (the lid tips back, gold shows inside). */
export const CHEST_FRAMES: readonly SpriteDef[] = [0, 1, 2].map((frame) => {
  const g = new PixelGrid(16, 16);
  // Body.
  g.rect(1, 8, 14, 8, 'k');
  g.rect(2, 9, 12, 6, 'c');
  g.rect(2, 9, 12, 1, 'b');
  g.rect(2, 12, 12, 1, 'd');
  g.rect(7, 9, 2, 3, 'y');
  if (frame === 0) {
    g.rect(1, 3, 14, 6, 'k');
    g.rect(2, 4, 12, 4, 'b');
    g.rect(2, 4, 12, 1, 'a');
    g.rect(7, 6, 2, 3, 'y');
  } else if (frame === 1) {
    g.rect(1, 2, 14, 5, 'k');
    g.rect(2, 3, 12, 3, 'b');
    g.rect(2, 3, 12, 1, 'a');
    g.rect(2, 7, 12, 1, 'y');
  } else {
    g.rect(1, 0, 14, 4, 'k');
    g.rect(2, 1, 12, 2, 'd');
    g.rect(2, 4, 12, 4, 'y');
    g.rect(3, 5, 2, 1, 'w');
    g.rect(9, 6, 2, 1, 'w');
  }
  return g.toSprite({
    a: RAMPS.wood[0],
    b: RAMPS.wood[1],
    c: RAMPS.wood[2],
    d: RAMPS.wood[3],
    y: '#ffd25a',
    w: '#ffffff',
    k: INK,
  });
});

/** A sprite drawn `n` times as big (pixel for pixel), for the boss seen from the valley. At most 64 px. */
export function upscale(def: SpriteDef, n: number): SpriteDef {
  const rows = def.mirror === true ? def.rows.map((r) => r + [...r].reverse().join('')) : def.rows;
  const out: string[] = [];
  for (const row of rows) {
    const wide = [...row].map((ch) => ch.repeat(n)).join('');
    for (let i = 0; i < n; i++) out.push(wide);
  }
  return { rows: out, palette: def.palette };
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
  fill(3, 9, 32, 1, dirt);
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
      } else if (row === 18 && col >= VALLEY_COLS) {
        // The road out keeps going east.
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
      if (row === 18 && col >= VALLEY_COLS) continue;
      const decor = marginDecor(col, row);
      if (decor !== null) out.push({ ...decor, x: decor.x + ox, y: decor.y + oy });
    }
  }
  const at = (p: Placement): Placement => ({ ...p, x: p.x + ox, y: p.y + oy });
  for (const p of buildingPlacements()) out.push(at(p));
  // Night: everything so far is dimmed and cooled; the four places' glow is drawn over it, as it is.
  const world = look.time === 'night' ? out.map((p) => ({ ...p, sprite: dimmed(p.sprite) })) : out;
  for (const p of placePlacements(look)) world.push(at(p));
  return { placements: world, width: cols * TILE, height: rows * TILE, ox, oy };
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

/** The lake's tiles, in valley pixels: redrawn when the water drifts. */
export const LAKE = tiles(0, 19, 10, 5);
const ARENA_AT = artBox('arena');
/** The boss in the arena, from the valley (its 24 px sprite): in the right of the sand oval. */
export const ARENA_BOSS = { x: ARENA_AT.x + 38, y: ARENA_AT.y + 24 } as const;
/** The raid's board in the sand, west of the boss: a column x for each zone, and the row of the first line. */
export const ARENA_TEAM = {
  zoneX: { back: ARENA_AT.x + 6, middle: ARENA_AT.x + 16, front: ARENA_AT.x + 26 },
  y: ARENA_AT.y + 12,
  rowStep: 8,
} as const;
/** Where the other players' creatures cheer: on the grass at either side of the arena. */
export const ARENA_FANS = [
  { x: ARENA_AT.x - 36, y: ARENA_AT.y + 28 },
  { x: ARENA_AT.x - 20, y: ARENA_AT.y + 36 },
  { x: ARENA_AT.x + ARENA_AT.width + 4, y: ARENA_AT.y + 28 },
  { x: ARENA_AT.x + ARENA_AT.width + 18, y: ARENA_AT.y + 36 },
] as const;
const PADDOCK_AT = artBox('paddock');
/** Where your idle creatures roam: the open grass inside the paddock's rails. */
export const PADDOCK_ROAM = {
  x: PADDOCK_AT.x + 10,
  y: PADDOCK_AT.y + 20,
  width: 30,
  height: 14,
} as const;
/** Where the creatures stand around the other places (top-left of a creature, valley pixels). */
const FORGE_AT = artBox('forge');
export const FORGE_WORKERS = [
  { x: FORGE_AT.x - 14, y: FORGE_AT.y + 32 },
  { x: FORGE_AT.x + FORGE_AT.width - 2, y: FORGE_AT.y + 32 },
] as const;
const HOUSE_AT = artBox('house');
export const HOUSE_DOOR_SPOT = { x: HOUSE_AT.x + 40, y: HOUSE_AT.y + 40 } as const;
const ROAD_AT = artBox('road');
/** The explorer home with its sack, beside the signpost; and where a departing one starts, on the road east. */
export const SIGNPOST_HOME = { x: ROAD_AT.x - 14, y: ROAD_AT.y + 30 } as const;

/**
 * The explorer's sack opening (the game's `PACK_ART`, with its flap redrawn): ajar with gold peeking, then
 * open with the flap thrown back, then open with the loot glinting.
 */
export const SACK_FRAMES: readonly SpriteDef[] = (() => {
  const base = PACK_ART;
  const pal = { ...base.palette, n: '#2a1a10', w: '#ffffff' };
  const edit = (changes: Readonly<Record<number, string>>): SpriteDef => ({
    mirror: true,
    palette: pal,
    rows: base.rows.map((r, i) => changes[i] ?? r),
  });
  return [
    edit({ 3: '...kkkkk', 4: '..kyyyyy', 5: '..kddddd' }),
    edit({ 1: '....hhhh', 2: '...khhhh', 3: '...knnnn', 4: '..knnyyn', 5: '..knyyyy' }),
    edit({
      0: '....hhhh',
      1: '...khhhh',
      2: '...knnwn',
      3: '..knyynn',
      4: '..knyyyy',
      5: '..kyyyyw',
    }),
  ];
})();
