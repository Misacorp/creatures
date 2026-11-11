/**
 * The pieces of the Forge's workshop interior (`ForgeInterior.tsx`), by name: the one swap point for the Art session's set
 * `valley-forge-interior` (night is the set's main palette, `alts.day` the recolour). Until that set lands each piece is a simple
 * stand-in drawn here in the scene's own ink and timber colours, at the size the art will have. To swap: fill `ART` from the concept
 * set (a `SpriteDef` and a day recolour for each name) and delete the stand-ins; nothing else reads a sprite.
 *
 * Sizes (the art's, and the stand-ins') in pixels: back-wall 128x56 (tiles sideways, two windows), furnace 48x56, shelf 32x16,
 * tool-rack 32x24, workbench 32x20 (smiths stand behind it), floor 16x16 (a tile), barrel 12x16, quench-trough 24x12,
 * hanging-tools 24x16, coal-heap 16x10. `door` (14x24) is the stand-ins' own and is not in the art's list: the way back outside.
 * Where each stands in the room is `forge-interior.ts` (`ROOM`, 128x96).
 */
import { PixelGrid } from '../games/art/pixel';
import type { SpriteDef } from '../sprites/sprite-data';
import { swapPalette } from '../sprites/sprite-data';

export const INTERIOR_PIECES = [
  'back-wall',
  'furnace',
  'shelf',
  'tool-rack',
  'workbench',
  'floor',
  'barrel',
  'quench-trough',
  'hanging-tools',
  'coal-heap',
  'door',
] as const;
export type InteriorPiece = (typeof INTERIOR_PIECES)[number];

/** The size of each piece in pixels. */
export const PIECE_SIZE: Readonly<Record<InteriorPiece, { w: number; h: number }>> = {
  'back-wall': { w: 128, h: 56 },
  furnace: { w: 48, h: 56 },
  shelf: { w: 32, h: 16 },
  'tool-rack': { w: 32, h: 24 },
  workbench: { w: 32, h: 20 },
  floor: { w: 16, h: 16 },
  barrel: { w: 12, h: 16 },
  'quench-trough': { w: 24, h: 12 },
  'hanging-tools': { w: 24, h: 16 },
  'coal-heap': { w: 16, h: 10 },
  door: { w: 14, h: 24 },
};

const INK = '#0d0a1a';
/** Night, the main palette: sandstone gone blue-grey, timber, black iron, the fire's orange. */
const NIGHT = {
  k: INK,
  s: '#6a5f78', // sandstone, mid
  t: '#82768e', // sandstone, light
  u: '#4c4460', // sandstone, dark (the joints)
  a: '#a8743f', // timber, light
  b: '#7d5230', // timber, mid
  c: '#523320', // timber, dark
  i: '#3a3550', // iron
  j: '#6e6490', // iron, lit
  w: '#1d2b5c', // window glass
  x: '#e9e2c8', // a star in it
  f: '#ff7a2e', // fire
  y: '#ffd25a', // fire, bright
  r: '#7a2e24', // embers
} as const;
/** Day, the recolour: the same keys, the light of a day through the windows. */
const DAY: Readonly<Record<string, string>> = {
  s: '#b89a6a',
  t: '#d4b886',
  u: '#8f7650',
  a: '#c08850',
  b: '#946038',
  c: '#60402a',
  w: '#8ec8ee',
  x: '#ffffff',
};

function grid(piece: InteriorPiece): PixelGrid {
  const { w, h } = PIECE_SIZE[piece];
  return new PixelGrid(w, h);
}

/** Sandstone bricks over a block: rows of joints, offset by half a brick on every other row. */
function bricks(g: PixelGrid, x: number, y: number, w: number, h: number): void {
  g.rect(x, y, w, h, 's');
  for (let row = 0; row * 6 < h; row++) {
    const top = y + row * 6;
    g.rect(x, top, w, 1, 'u');
    for (let col = (row % 2) * 6; col < w; col += 12)
      g.rect(x + col, top, 1, Math.min(6, y + h - top), 'u');
    g.rect(x, top + 1, w, 1, 't');
  }
}

function drawBackWall(): PixelGrid {
  const g = grid('back-wall');
  bricks(g, 0, 4, 128, 52);
  // The tie beam under the roof and the skirting on the floor, in timber (they join at the tile's ends: it tiles sideways).
  g.rect(0, 0, 128, 4, 'k');
  g.rect(0, 1, 128, 2, 'b');
  g.rect(0, 1, 128, 1, 'a');
  g.rect(0, 53, 128, 3, 'k');
  g.rect(0, 54, 128, 1, 'c');
  // Two windows with a timber frame and a cross, a star in the night glass.
  for (const x of [56, 100]) {
    g.rect(x - 1, 3, 16, 14, 'k');
    g.rect(x, 4, 14, 12, 'w');
    g.rect(x + 6, 4, 2, 12, 'b');
    g.rect(x, 9, 14, 2, 'b');
    g.set(x + 2, 6, 'x');
    g.set(x + 10, 13, 'x');
  }
  return g;
}

function drawFurnace(): PixelGrid {
  const g = grid('furnace');
  // The chimney stack and the body of dark sandstone round a black iron mouth with the fire in it.
  g.rect(14, 0, 20, 14, 'k');
  g.rect(15, 0, 18, 14, 's');
  bricks(g, 15, 0, 18, 14);
  g.rect(2, 12, 44, 44, 'k');
  bricks(g, 3, 13, 42, 43);
  g.rect(11, 28, 26, 24, 'k');
  g.rect(12, 29, 24, 22, 'i');
  g.rect(12, 29, 24, 2, 'j');
  // The fire: embers, then flames, the brightest in the middle.
  g.rect(14, 44, 20, 7, 'r');
  g.rect(14, 38, 20, 6, 'f');
  g.rect(18, 34, 12, 6, 'f');
  g.rect(20, 36, 8, 8, 'y');
  g.rect(22, 33, 4, 4, 'y');
  // An iron lintel and hearth stone.
  g.rect(9, 26, 30, 3, 'k');
  g.rect(10, 27, 28, 1, 'j');
  g.rect(8, 52, 32, 4, 'k');
  g.rect(9, 53, 30, 2, 't');
  return g;
}

function drawShelf(): PixelGrid {
  const g = grid('shelf');
  g.rect(0, 11, 32, 3, 'k');
  g.rect(1, 12, 30, 1, 'a');
  g.rect(2, 14, 2, 2, 'k');
  g.rect(28, 14, 2, 2, 'k');
  // A jar, a mould and a stack of ingots.
  g.rect(3, 4, 6, 7, 'k');
  g.rect(4, 5, 4, 5, 'w');
  g.rect(12, 6, 8, 5, 'k');
  g.rect(13, 7, 6, 3, 'j');
  g.rect(23, 7, 6, 4, 'k');
  g.rect(24, 8, 4, 1, 'y');
  g.rect(24, 9, 4, 1, 'a');
  return g;
}

function drawToolRack(): PixelGrid {
  const g = grid('tool-rack');
  g.rect(0, 2, 32, 4, 'k');
  g.rect(1, 3, 30, 2, 'b');
  // Tongs, a hammer, a chisel and a file hung from it, black iron with a lit edge.
  g.rect(4, 6, 2, 14, 'k');
  g.rect(8, 6, 2, 14, 'k');
  g.rect(5, 7, 1, 11, 'j');
  g.rect(14, 6, 2, 11, 'k');
  g.rect(11, 17, 8, 5, 'k');
  g.rect(12, 18, 6, 3, 'i');
  g.rect(23, 6, 2, 16, 'k');
  g.rect(24, 7, 1, 12, 'j');
  g.rect(27, 6, 2, 12, 'k');
  g.rect(28, 7, 1, 8, 'a');
  return g;
}

function drawWorkbench(): PixelGrid {
  const g = grid('workbench');
  // A thick top, a vice, two stout legs and a low shelf; smiths stand behind it.
  g.rect(0, 4, 32, 5, 'k');
  g.rect(1, 5, 30, 3, 'b');
  g.rect(1, 5, 30, 1, 'a');
  g.rect(2, 9, 4, 11, 'k');
  g.rect(26, 9, 4, 11, 'k');
  g.rect(3, 9, 2, 10, 'c');
  g.rect(27, 9, 2, 10, 'c');
  g.rect(6, 14, 20, 3, 'k');
  g.rect(7, 15, 18, 1, 'c');
  g.rect(22, 0, 5, 5, 'k');
  g.rect(23, 1, 3, 3, 'i');
  return g;
}

function drawFloor(): PixelGrid {
  const g = grid('floor');
  g.rect(0, 0, 16, 16, 'b');
  g.rect(0, 0, 16, 1, 'c');
  g.rect(0, 8, 16, 1, 'c');
  g.rect(0, 1, 16, 1, 'a');
  g.rect(0, 9, 16, 1, 'a');
  g.rect(5, 0, 1, 8, 'c');
  g.rect(12, 8, 1, 8, 'c');
  return g;
}

function drawBarrel(): PixelGrid {
  const g = grid('barrel');
  g.rect(1, 1, 10, 15, 'k');
  g.rect(2, 2, 8, 13, 'b');
  g.rect(2, 2, 2, 13, 'a');
  g.rect(1, 4, 10, 2, 'k');
  g.rect(1, 11, 10, 2, 'k');
  g.rect(2, 4, 8, 1, 'i');
  g.rect(2, 11, 8, 1, 'i');
  return g;
}

function drawTrough(): PixelGrid {
  const g = grid('quench-trough');
  g.rect(0, 2, 24, 10, 'k');
  g.rect(1, 3, 22, 8, 'b');
  g.rect(2, 3, 20, 3, 'w');
  g.rect(4, 4, 6, 1, 'x');
  g.rect(1, 7, 22, 1, 'c');
  return g;
}

function drawHangingTools(): PixelGrid {
  const g = grid('hanging-tools');
  g.rect(0, 0, 24, 2, 'k');
  g.rect(3, 2, 1, 5, 'k');
  g.rect(11, 2, 1, 7, 'k');
  g.rect(19, 2, 1, 4, 'k');
  g.rect(1, 7, 5, 8, 'k');
  g.rect(2, 8, 3, 6, 'i');
  g.rect(9, 9, 5, 5, 'k');
  g.rect(10, 10, 3, 3, 'j');
  g.rect(17, 6, 5, 9, 'k');
  g.rect(18, 7, 3, 7, 'a');
  return g;
}

function drawCoalHeap(): PixelGrid {
  const g = grid('coal-heap');
  g.rect(1, 6, 14, 4, 'k');
  g.rect(3, 3, 10, 4, 'k');
  g.rect(6, 1, 5, 3, 'k');
  g.rect(4, 5, 2, 1, 'i');
  g.rect(8, 3, 2, 1, 'i');
  g.rect(11, 7, 2, 1, 'r');
  return g;
}

function drawDoor(): PixelGrid {
  const g = grid('door');
  g.rect(0, 0, 14, 24, 'k');
  g.rect(1, 1, 12, 23, 'b');
  g.rect(1, 1, 12, 1, 'a');
  g.rect(6, 1, 1, 23, 'c');
  g.rect(1, 6, 12, 1, 'i');
  g.rect(1, 17, 12, 1, 'i');
  g.rect(9, 12, 2, 2, 'y');
  return g;
}

const DRAW: Readonly<Record<InteriorPiece, () => PixelGrid>> = {
  'back-wall': drawBackWall,
  furnace: drawFurnace,
  shelf: drawShelf,
  'tool-rack': drawToolRack,
  workbench: drawWorkbench,
  floor: drawFloor,
  barrel: drawBarrel,
  'quench-trough': drawTrough,
  'hanging-tools': drawHangingTools,
  'coal-heap': drawCoalHeap,
  door: drawDoor,
};

/** The Art session's pieces, once they land: a sprite for each name and its day recolour. Empty: the stand-ins draw. */
const ART: Partial<
  Record<InteriorPiece, { sprite: SpriteDef; day?: Readonly<Record<string, string>> }>
> = {};

const cache = new Map<string, SpriteDef>();

/** A piece of the interior by name: at night (the main palette) or by day. Cached. */
export function interiorSprite(piece: InteriorPiece, night: boolean): SpriteDef {
  const key = `${piece}:${night ? 'n' : 'd'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const art = ART[piece];
  let sprite: SpriteDef;
  if (art !== undefined) {
    sprite = night || art.day === undefined ? art.sprite : swapPalette(art.sprite, art.day);
  } else {
    const night0 = DRAW[piece]().toSprite(NIGHT);
    sprite = night ? night0 : swapPalette(night0, DAY);
  }
  cache.set(key, sprite);
  return sprite;
}
