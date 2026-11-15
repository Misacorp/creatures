/**
 * The small props of the Forge's canvas (`ForgeCanvas.tsx`), each one a thing in the yard you click: the anvil (one for each anvil
 * the player owns, a dashed outline for the next), the chest (the bag), the crate (the floor: finished pieces waiting) and the plans
 * table (the blueprints). 16 x 16 pixel sprites in the scene's own ink and wood colours. Pure data.
 */
import { PixelGrid } from '../games/art/pixel';
import type { SpriteDef } from '../sprites/sprite-data';

const INK = '#0d0a1a';
const WOOD = { light: '#b07a45', mid: '#8a5a34', dark: '#5e3b22' } as const;

/** The anvil: a dark iron horn and face on a stout foot. */
export const ANVIL_PROP: SpriteDef = (() => {
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

/** The chest, shut: the bag. */
export const CHEST_PROP: SpriteDef = (() => {
  const g = new PixelGrid(16, 16);
  g.rect(1, 8, 14, 8, 'k');
  g.rect(2, 9, 12, 6, 'c');
  g.rect(2, 9, 12, 1, 'b');
  g.rect(2, 12, 12, 1, 'd');
  g.rect(7, 9, 2, 3, 'y');
  g.rect(1, 3, 14, 6, 'k');
  g.rect(2, 4, 12, 4, 'b');
  g.rect(2, 4, 12, 1, 'a');
  g.rect(7, 6, 2, 3, 'y');
  return g.toSprite({
    a: WOOD.light,
    b: WOOD.mid,
    c: WOOD.dark,
    d: '#472c19',
    y: '#ffd25a',
    k: INK,
  });
})();

/** An open crate with finished pieces standing in it: the floor. */
export const CRATE_PROP: SpriteDef = (() => {
  const g = new PixelGrid(16, 16);
  // Pieces sticking up: a hat's tip, a scarf's end and a charm's ring.
  g.rect(3, 2, 3, 6, 'k');
  g.rect(4, 3, 1, 4, 'p');
  g.rect(7, 0, 3, 8, 'k');
  g.rect(8, 1, 1, 6, 'q');
  g.rect(11, 3, 3, 5, 'k');
  g.rect(12, 4, 1, 3, 'y');
  // The crate.
  g.rect(1, 7, 14, 9, 'k');
  g.rect(2, 8, 12, 7, 'b');
  g.rect(2, 8, 12, 1, 'a');
  g.rect(2, 11, 12, 1, 'c');
  g.rect(2, 14, 12, 1, 'c');
  g.rect(2, 8, 1, 7, 'c');
  g.rect(13, 8, 1, 7, 'c');
  return g.toSprite({
    a: WOOD.light,
    b: WOOD.mid,
    c: WOOD.dark,
    p: '#d86a6a',
    q: '#5ec8d8',
    y: '#ffd25a',
    k: INK,
  });
})();

/** A small table with a rolled blueprint on it: the plans. */
export const PLANS_PROP: SpriteDef = (() => {
  const g = new PixelGrid(16, 16);
  // The roll, tied with a blue band.
  g.rect(2, 4, 12, 5, 'k');
  g.rect(3, 5, 10, 3, 'w');
  g.rect(3, 5, 10, 1, 'x');
  g.rect(7, 4, 2, 5, 'k');
  g.rect(7, 5, 2, 3, 'u');
  // The table top, its legs.
  g.rect(0, 9, 16, 3, 'k');
  g.rect(1, 9, 14, 2, 'b');
  g.rect(1, 9, 14, 1, 'a');
  g.rect(2, 12, 2, 4, 'k');
  g.rect(12, 12, 2, 4, 'k');
  g.rect(3, 12, 1, 3, 'c');
  g.rect(12, 12, 1, 3, 'c');
  return g.toSprite({
    a: WOOD.light,
    b: WOOD.mid,
    c: WOOD.dark,
    w: '#f4ead0',
    x: '#ffffff',
    u: '#4a74b8',
    k: INK,
  });
})();

/** A notice board on a post with a pinned sheet: the project board, outside the forge. */
export const BOARD_PROP: SpriteDef = (() => {
  const g = new PixelGrid(16, 16);
  g.rect(7, 9, 2, 7, 'k');
  g.rect(7, 10, 1, 6, 'c');
  g.rect(1, 1, 14, 9, 'k');
  g.rect(2, 2, 12, 7, 'b');
  g.rect(2, 2, 12, 1, 'a');
  g.rect(4, 3, 5, 5, 'w');
  g.rect(5, 4, 3, 1, 'u');
  g.rect(5, 6, 3, 1, 'u');
  g.rect(10, 4, 3, 3, 'y');
  return g.toSprite({
    a: WOOD.light,
    b: WOOD.mid,
    c: WOOD.dark,
    w: '#f4ead0',
    u: '#4a74b8',
    y: '#ffd25a',
    k: INK,
  });
})();
