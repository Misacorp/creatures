/**
 * The one painter of layered pixel scenes (`docs/design/housing-next.md` B2). A scene is a list of placements (a sprite at a
 * place, in order: back props, creatures, front props), and painting it is stamping each sprite's cached bitmap with
 * `drawImage` at a whole scale, nearest neighbour, so edges stay hard. The living room, the Valley Games scenes and the world
 * map (`room-canvas.ts`, `drawSprites`) and the player's house (`housing/house-paint.ts`) all stamp through here.
 *
 * Each sprite is rendered to a small canvas once (a `WeakMap` by sprite, so a recoloured sprite is its own entry and the
 * bitmap is dropped with it). There is no size limit: the 128 x 64 of `parseSprite` is a rule for authored art, checked where
 * art is checked (the lint and the pack tests), not a limit of painting, so a 240 px roof or a 1,500 px house stamps like a prop.
 * Where there is no canvas (the tests' fake DOM) nothing is painted. Colours are `#rgb` or `#rrggbb`.
 */
import { expandRows, type SpriteDef } from './sprites/sprite-data';

/** A sprite at a place, in scene pixels; `w` and `h` crop it to its top left corner (a tile at an edge). */
export interface Stamp {
  sprite: SpriteDef;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** `#rgb` / `#rrggbb` to bytes. */
export function hexRgb(hex: string): readonly [number, number, number] {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const bitmaps = new WeakMap<SpriteDef, HTMLCanvasElement | null>();

/** A sprite as a canvas of its own size (cached), or null where canvases cannot be made. */
export function bitmapOf(sprite: SpriteDef): HTMLCanvasElement | null {
  const cached = bitmaps.get(sprite);
  if (cached !== undefined) return cached;
  let result: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    const rows = expandRows(sprite);
    const width = rows[0]?.length ?? 0;
    const height = rows.length;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = width > 0 && height > 0 ? canvas.getContext('2d') : null;
    if (ctx !== null && typeof ctx.createImageData === 'function') {
      const image = ctx.createImageData(width, height);
      const colours = new Map<string, readonly [number, number, number]>();
      for (const [key, colour] of Object.entries(sprite.palette)) colours.set(key, hexRgb(colour));
      for (const [y, row] of rows.entries()) {
        for (let x = 0; x < width; x++) {
          const c = colours.get(row[x] ?? '.');
          if (c === undefined) continue;
          const at = (y * width + x) * 4;
          image.data[at] = c[0];
          image.data[at + 1] = c[1];
          image.data[at + 2] = c[2];
          image.data[at + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      result = canvas;
    }
  }
  bitmaps.set(sprite, result);
  return result;
}

/**
 * Stamps the placements in order, each with its top left at (`originX` + x * scale, `originY` + y * scale) and every sprite
 * pixel `scale` (a whole number, at least 1) canvas pixels wide. Does not clear the canvas.
 */
export function stamp(
  ctx: CanvasRenderingContext2D,
  placements: readonly Stamp[],
  scale = 1,
  originX = 0,
  originY = 0,
): void {
  const factor = Math.max(1, Math.floor(scale));
  ctx.imageSmoothingEnabled = false;
  for (const p of placements) {
    const bitmap = bitmapOf(p.sprite);
    if (bitmap === null) continue;
    const w = Math.min(p.w ?? bitmap.width, bitmap.width);
    const h = Math.min(p.h ?? bitmap.height, bitmap.height);
    ctx.drawImage(
      bitmap,
      0,
      0,
      w,
      h,
      originX + p.x * factor,
      originY + p.y * factor,
      w * factor,
      h * factor,
    );
  }
}
