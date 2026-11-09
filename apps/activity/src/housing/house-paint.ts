/**
 * Paints placements of the house scene onto a canvas at one pixel per scene pixel; the canvas is then shown at an integer
 * scale with `image-rendering: pixelated` (CSS), so a 1,500 px wide house is a 1,500 px wide canvas, not a 4,500 px one.
 * Each sprite is rendered to a small canvas once (a roof is one sprite of up to 240 x 55) and stamped with `drawImage`.
 * Where there is no canvas (the tests' fake DOM) nothing is painted. Colours are `#rgb` or `#rrggbb`.
 */
import { expandRows, type SpriteDef } from '../sprites/sprite-data';
import type { Placement } from './house-scene';

const bitmaps = new WeakMap<SpriteDef, HTMLCanvasElement | null>();

/** `#rgb` / `#rrggbb` to bytes. */
function rgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A sprite as a canvas of its own size, or null where canvases cannot be made. */
function bitmapOf(sprite: SpriteDef): HTMLCanvasElement | null {
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
      const colours = new Map<string, [number, number, number]>();
      for (const [key, colour] of Object.entries(sprite.palette)) colours.set(key, rgb(colour));
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

/** Clears the canvas and paints the placements in order. A crop (`w`, `h`) draws the top left part of its sprite. */
export function paintPlacements(
  ctx: CanvasRenderingContext2D | null,
  placements: readonly Placement[],
  width: number,
  height: number,
): void {
  if (ctx === null) return;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  for (const p of placements) {
    const bitmap = bitmapOf(p.sprite);
    if (bitmap === null) continue;
    const w = p.w ?? bitmap.width;
    const h = p.h ?? bitmap.height;
    ctx.drawImage(bitmap, 0, 0, w, h, p.x, p.y, w, h);
  }
}
