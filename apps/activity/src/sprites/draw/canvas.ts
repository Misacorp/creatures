/**
 * The drawing library's grid (`docs/design/housing-workshop.md`): a sprite being drawn, one palette key per pixel,
 * `.` transparent. A recipe makes a canvas, draws on it with the functions of `shapes.ts` and `parts.ts`, and turns it
 * into the game's `SpriteDef` with `toSprite`. Everything is pure apart from the canvas a recipe owns, and has no
 * randomness: the same recipe always draws the same pixels.
 */
import type { SpriteDef } from '../sprite-data';

export const CLEAR = '.';

/** A grid of palette keys, row by row (`px[y * w + x]`). Drawing outside it is ignored. */
export interface Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: string[];
}

export function canvas(w: number, h: number): Canvas {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    throw new RangeError(`A canvas is at least 1x1 whole pixels, not ${String(w)}x${String(h)}.`);
  }
  return { w, h, px: new Array<string>(w * h).fill(CLEAR) };
}

/** A canvas from sprite rows (every row the same length). */
export function fromRows(rows: readonly string[]): Canvas {
  const c = canvas(rows[0]?.length ?? 0, rows.length);
  for (const [y, row] of rows.entries()) {
    if (row.length !== c.w) throw new RangeError(`Row ${String(y)} is not ${String(c.w)} wide.`);
    for (const [x, key] of [...row].entries()) c.px[y * c.w + x] = key;
  }
  return c;
}

export function inside(c: Canvas, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < c.w && y < c.h;
}

/** The key at a pixel; `.` outside the canvas. */
export function get(c: Canvas, x: number, y: number): string {
  return inside(c, x, y) ? (c.px[y * c.w + x] ?? CLEAR) : CLEAR;
}

/** Sets one pixel (clipped to the canvas). A key is one character; `.` clears. */
export function put(c: Canvas, x: number, y: number, key: string): void {
  if (key.length !== 1) throw new RangeError(`A palette key is one character, not "${key}".`);
  if (inside(c, x, y)) c.px[y * c.w + x] = key;
}

/** Sets a pixel only where it is transparent (draws behind what is there). */
export function under(c: Canvas, x: number, y: number, key: string): void {
  if (get(c, x, y) === CLEAR) put(c, x, y, key);
}

export function rowsOf(c: Canvas): string[] {
  const rows: string[] = [];
  for (let y = 0; y < c.h; y++) rows.push(c.px.slice(y * c.w, (y + 1) * c.w).join(''));
  return rows;
}

export function copy(c: Canvas): Canvas {
  return { w: c.w, h: c.h, px: [...c.px] };
}

/** Draws `src` onto `dst` with its top left at x, y; transparent pixels of `src` leave `dst` as it is. */
export function blit(dst: Canvas, src: Canvas | readonly string[], x: number, y: number): void {
  const from = Array.isArray(src) ? fromRows(src as readonly string[]) : (src as Canvas);
  for (let sy = 0; sy < from.h; sy++) {
    for (let sx = 0; sx < from.w; sx++) {
      const key = get(from, sx, sy);
      if (key !== CLEAR) put(dst, x + sx, y + sy, key);
    }
  }
}

/** The canvas flipped left to right. */
export function flipX(c: Canvas): Canvas {
  const out = canvas(c.w, c.h);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) put(out, c.w - 1 - x, y, get(c, x, y));
  return out;
}

/** Makes the canvas symmetric: the right half becomes the mirror image of the left (the middle column of an odd width stays). */
export function mirrorLeft(c: Canvas): void {
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < Math.floor(c.w / 2); x++) put(c, c.w - 1 - x, y, get(c, x, y));
  }
}

/** Replaces every pixel of one key by another (inside a box when given). */
export function recolour(
  c: Canvas,
  from: string,
  to: string,
  box?: { x: number; y: number; w: number; h: number },
): void {
  const b = box ?? { x: 0, y: 0, w: c.w, h: c.h };
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) if (get(c, x, y) === from) put(c, x, y, to);
  }
}

/**
 * The finished sprite: the rows and only the palette entries they use. Throws when a pixel uses a key the palette
 * does not have, so a recipe cannot ship a colour that is not in its style.
 */
export function toSprite(c: Canvas, palette: Readonly<Record<string, string>>): SpriteDef {
  const rows = rowsOf(c);
  const used = new Set(rows.join(''));
  used.delete(CLEAR);
  for (const key of used) {
    if (!Object.hasOwn(palette, key)) throw new RangeError(`Key "${key}" is not in the palette.`);
  }
  return {
    rows,
    palette: Object.fromEntries(Object.entries(palette).filter(([key]) => used.has(key))),
  };
}

/** True when no pixel is drawn. */
export function isEmpty(c: Canvas): boolean {
  return c.px.every((key) => key === CLEAR);
}
