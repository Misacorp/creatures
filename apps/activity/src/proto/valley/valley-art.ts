/**
 * The valley as data (prototype, dev only): one 36 x 24 tile world of 16 px tiles (576 x 384 valley
 * pixels), built from the Valley Games tileset, the world-map landmarks and the living room's props, plus
 * the four small new sprites of the concept (a roof, an anvil, a chest and a smoke puff). Pure: it returns
 * placements for a canvas (`paint.ts`) and the places' rectangles for the buttons laid over it.
 *
 * The valley reads west to east: the cave (the Dungeon) and the fairground (the Valley Games) with its
 * lake; the house (the living room), the paddock (your creatures) and the forge (the Workshop) in the
 * middle; the arena (the Raid) and the signpost (Expeditions, the road out) in the east.
 */
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import { DOOR, WINDOW } from '../../games/art/drawn';
import { PixelGrid, gridPlacements, type Placement } from '../../games/art/pixel';
import { propSprite } from '../../games/art/props';
import { TILE, tileFrame, type TileName } from '../../games/art/tiles';
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
  'house',
  'paddock',
  'forge',
  'arena',
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
    rect: tiles(1, 3, 5, 4),
    door: { x: 56, y: 96 },
    glyph: 'lantern',
  },
  {
    id: 'fair',
    name: 'Fairground',
    what: 'Valley Games',
    rect: tiles(1, 12, 8, 5),
    door: { x: 72, y: 264 },
    glyph: 'trophy',
  },
  {
    id: 'house',
    name: 'House',
    what: 'living room',
    rect: tiles(12, 3, 7, 5),
    door: { x: 15 * TILE + 8, y: 8 * TILE },
    glyph: 'home',
  },
  {
    id: 'paddock',
    name: 'Paddock',
    what: 'your creatures',
    rect: tiles(12, 13, 6, 4),
    door: { x: 15 * TILE, y: 17 * TILE },
    glyph: 'paw',
  },
  {
    id: 'forge',
    name: 'Forge',
    what: 'Workshop',
    rect: tiles(19, 10, 5, 4),
    door: { x: 21 * TILE + 8, y: 13 * TILE },
    glyph: 'anvil',
  },
  {
    id: 'arena',
    name: 'Arena',
    what: 'Raid',
    rect: tiles(24, 3, 10, 6),
    door: { x: 29 * TILE, y: 9 * TILE },
    glyph: 'blade',
  },
  {
    id: 'signpost',
    name: 'Signpost',
    what: 'Expeditions',
    rect: tiles(28, 14, 6, 4),
    door: { x: 31 * TILE, y: 18 * TILE },
    glyph: 'compass',
  },
];

export function placeOf(id: PlaceId): ValleyPlace {
  const found = PLACES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no place ${id}`);
  return found;
}

// --- New sprites (the concept's own art: a roof, an anvil, a chest, a smoke puff) ---

/** A gabled roof of `w` x `h` pixels: shingle rows, lit along the top, inked round. Cut into pieces. */
export function roofPlacements(
  w: number,
  h: number,
  ramp: Ramp,
  x: number,
  y: number,
): Placement[] {
  const g = new PixelGrid(w, h);
  const slope = Math.floor(h / 2);
  for (let yy = 0; yy < h; yy++) {
    const inset = Math.max(0, slope - Math.floor(yy / 2));
    const from = inset;
    const to = w - inset - 1;
    for (let xx = from; xx <= to; xx++) {
      let key = 'c';
      if (yy === 0 || xx === from || xx === to || yy === h - 1) key = 'k';
      else if (yy === 1) key = 'a';
      else if (yy % 4 === 0) key = 'd';
      else if (yy % 4 === 1) key = 'b';
      else if ((xx + Math.floor(yy / 4) * 3) % 6 === 0) key = 'd';
      g.set(xx, yy, key);
    }
  }
  return gridPlacements(g, { a: ramp[0], b: ramp[1], c: ramp[2], d: ramp[3], k: INK }, x, y);
}

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

/** A smoke puff (4 x 4) in three frames: small, full, thin. */
export const SMOKE_FRAMES: readonly SpriteDef[] = [
  { rows: ['....', '.ab.', '.bb.', '....'], palette: { a: '#f4f0ff', b: '#cfc5ea' } },
  { rows: ['.ab.', 'abbb', 'bbbc', '.bc.'], palette: { a: '#f4f0ff', b: '#cfc5ea', c: '#9488c6' } },
  { rows: ['.c..', 'c..c', '..c.', 'c...'], palette: { c: '#cfc5ea' } },
];

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

/** The ember caves landmark re-tinted for the Dungeon: slate rock, the fire turned into lantern gold. */
export const CAVE_MOUTH: SpriteDef = swapPalette(WORLD_MAP_SPRITE_DATA.emberCaves, {
  n: '#2b2d3a',
  m: '#4a4c63',
  o: '#f2b84b',
});

// --- The tile grid ---

type Cell = { tile: TileName; tint?: RampName | Ramp; tint2?: RampName | Ramp } | null;

const SLATE: Ramp = ['#7a7c96', '#585a73', '#3d3f52', '#2b2d3a'];
const EMBER_STONE: Ramp = ['#a07a6a', '#7a5048', '#5a3632', '#3a2024'];

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
  // The cliff the cave is cut into.
  fill(0, 3, 8, 4, { tile: 'stoneWall', tint: SLATE });
  // The house's walls and the forge's.
  fill(12, 5, 7, 3, { tile: 'woodWall' });
  fill(19, 11, 5, 2, { tile: 'stoneWall', tint: EMBER_STONE });
  // The paddock: a fence along the top and bottom.
  fill(12, 12, 6, 1, { tile: 'fence' });
  fill(12, 16, 6, 1, { tile: 'fence' });
  // The arena: bleachers north and south, sand between.
  fill(24, 3, 10, 1, { tile: 'bleacher' });
  fill(24, 4, 10, 4, { tile: 'sand' });
  fill(24, 8, 10, 1, { tile: 'bleacher' });
  // The fairground's fence and the lake south of it.
  fill(1, 17, 4, 1, { tile: 'fence' });
  fill(6, 17, 3, 1, { tile: 'fence' });
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
  ['smallPine', 132, 46],
  ['smallTree', 154, 50],
  ['smallPine', 312, 44],
  ['smallTree', 334, 52],
  ['smallPine', 360, 40],
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
  ['bush', 300, 172],
  ['flowers', 328, 196],
  ['smallTree', 400, 150],
  ['smallPine', 396, 182],
  ['smallTree', 420, 164],
  ['rock', 448, 196],
  ['smallPine', 540, 168],
  ['smallTree', 560, 214],
  ['bush', 386, 232],
  ['flowers', 360, 252],
  ['smallTree', 168, 316],
  ['smallPine', 196, 330],
  ['bush', 232, 316],
  ['flowers', 260, 336],
  ['smallTree', 300, 322],
  ['smallPine', 340, 340],
  ['rock', 380, 318],
  ['smallTree', 420, 332],
  ['smallPine', 470, 316],
  ['flowers', 500, 340],
  ['smallTree', 540, 330],
  ['bush', 236, 360],
  ['flowers', 300, 364],
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
  return { placements: out, width: cols * TILE, height: rows * TILE, ox, oy };
}

/** The buildings, landmarks and decor drawn over the tiles, in valley pixels. */
export function buildingPlacements(): Placement[] {
  const out: Placement[] = [];
  const wm = WORLD_MAP_SPRITE_DATA;
  for (const [name, x, y] of DECOR) out.push({ sprite: wm[name], x, y });
  // Cave: the mouth in the cliff.
  out.push({ sprite: CAVE_MOUTH, x: 26, y: 50 });
  // House: a red roof, a chimney, two windows and the door.
  out.push({ sprite: chimney(), x: 16 * TILE + 6, y: 3 * TILE - 2 });
  out.push(...roofPlacements(7 * TILE + 6, 34, RAMPS.red, 12 * TILE - 3, 3 * TILE - 2));
  out.push({ sprite: WINDOW, x: 12 * TILE + 8, y: 5 * TILE + 10 });
  out.push({ sprite: WINDOW, x: 17 * TILE - 6, y: 5 * TILE + 10 });
  out.push({ sprite: DOOR, x: 15 * TILE, y: 8 * TILE - 44 });
  // Forge: a slate roof, the fire in its opening, the anvil out front.
  out.push(...roofPlacements(5 * TILE + 6, 18, RAMPS.iron, 19 * TILE - 3, 10 * TILE - 2));
  out.push({ sprite: forgeOpening(), x: 21 * TILE - 4, y: 11 * TILE + 4 });
  out.push({ sprite: ANVIL, x: 21 * TILE, y: 13 * TILE - 2 });
  // Arena: bunting over the north bleachers.
  for (let c = 24; c < 34; c++)
    out.push({ sprite: tileFrame('bunting'), x: c * TILE, y: 2 * TILE });
  // Fairground: the festival tents, the podium and pennants.
  out.push({ sprite: wm.festivalGrounds, x: 1 * TILE + 6, y: 12 * TILE + 10 });
  out.push({ sprite: propSprite('podium2', 0, 'silver'), x: 82, y: 262 - 18 });
  out.push({ sprite: propSprite('podium1', 0, 'gold'), x: 102, y: 262 - 24 });
  out.push({ sprite: propSprite('podium3', 0, 'bronze'), x: 122, y: 262 - 14 });
  out.push({ sprite: propSprite('pennant', 0, 'red'), x: 84, y: 212 });
  out.push({ sprite: propSprite('pennant', 1, 'blue'), x: 106, y: 204 });
  out.push({ sprite: propSprite('pennant', 0, 'yellow'), x: 126, y: 214 });
  // Signpost: the old crossroads' post.
  out.push({ sprite: wm.oldCrossroads, x: 28 * TILE + 12, y: 14 * TILE + 6 });
  // Reeds at the lake.
  out.push({ sprite: propSprite('reeds'), x: 10 * TILE + 4, y: 21 * TILE });
  out.push({ sprite: propSprite('duck'), x: 4 * TILE, y: 21 * TILE + 4 });
  return out;
}

/** The house's chimney (8 x 12): stone with an ink rim. */
function chimney(): SpriteDef {
  const g = new PixelGrid(8, 12);
  g.rect(0, 0, 8, 12, 'k');
  g.rect(1, 2, 6, 10, 'c');
  g.rect(1, 2, 6, 1, 'a');
  g.rect(1, 6, 6, 1, 'd');
  g.rect(0, 0, 8, 2, 'k');
  return g.toSprite({ a: RAMPS.stone[0], c: RAMPS.stone[2], d: RAMPS.stone[3], k: INK });
}

/** The forge's opening (24 x 24): a dark arch with a bed of coals; the flame is drawn over it, animated. */
function forgeOpening(): SpriteDef {
  const g = new PixelGrid(24, 24);
  g.rect(2, 2, 20, 22, 'k');
  g.rect(4, 4, 16, 20, 'n');
  g.rect(6, 2, 12, 1, '.');
  g.rect(3, 3, 1, 1, 'k');
  g.rect(4, 19, 16, 3, 'r');
  g.rect(5, 20, 3, 1, 'y');
  g.rect(12, 20, 4, 1, 'y');
  return g.toSprite({ k: INK, n: '#1a1216', r: '#a83a24', y: '#ffd25a' });
}

/** Where the forge's flame (an animated prop) and the chimney's smoke are drawn, in valley pixels. */
export const FORGE_FLAME = { x: 21 * TILE + 4, y: 11 * TILE + 12 } as const;
export const CHIMNEY_TOP = { x: 16 * TILE + 8, y: 3 * TILE - 8 } as const;
/** The lake's tiles, in valley pixels: redrawn when the water drifts. */
export const LAKE = tiles(0, 19, 10, 5);
/** The boss in the arena, from the valley (its 24 px sprite at 2x). */
export const ARENA_BOSS = { x: 29 * TILE - 24, y: 4 * TILE + 4 } as const;
/** Where your idle creatures roam: inside the paddock's fence. */
export const PADDOCK_ROAM = {
  x: 12 * TILE + 4,
  y: 13 * TILE,
  width: 6 * TILE - 24,
  height: 3 * TILE - 16,
} as const;

export function flameSprite(frame: number): SpriteDef {
  return propSprite('flame', frame);
}

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
