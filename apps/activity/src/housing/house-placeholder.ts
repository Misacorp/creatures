/**
 * The picture of anything that has no art yet: a grey box of the right size with an ink outline (`k`), so a new piece
 * shows where it stands and how big it is until its pack lands (`house-art.ts`). Pure; built once per size.
 */
import type { SpriteDef } from '../sprites/sprite-data';

const INK = '#0d0a1a';
const GREY = '#8d889a';
const LIGHT = '#a9a4b6';

const boxes = new Map<string, SpriteDef>();

/** A `width` x `height` box: ink outline, grey fill with a lighter top row. At least 3x3. */
export function placeholderSprite(width: number, height: number): SpriteDef {
  const w = Math.max(3, Math.floor(width));
  const h = Math.max(3, Math.floor(height));
  const key = `${String(w)}x${String(h)}`;
  let box = boxes.get(key);
  if (box === undefined) {
    const rows = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 'k';
        return y === 1 ? 'l' : 'g';
      }).join(''),
    );
    box = { rows, palette: { k: INK, g: GREY, l: LIGHT } };
    boxes.set(key, box);
  }
  return box;
}

const tiles = new Map<string, SpriteDef>();

/** A flat grey tile (no outline: a wallpaper, a roof or a ground tile repeats). */
export function placeholderTile(width: number, height: number): SpriteDef {
  const key = `${String(width)}x${String(height)}`;
  let tile = tiles.get(key);
  if (tile === undefined) {
    const rows = Array.from({ length: height }, (_, y) => (y === 0 ? 'l' : 'g').repeat(width));
    tile = { rows, palette: { g: GREY, l: LIGHT } };
    tiles.set(key, tile);
  }
  return tile;
}
