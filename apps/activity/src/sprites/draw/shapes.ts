/**
 * Plain shapes on a canvas: fills, lines, outlined and shaded boxes, ellipses, dithers, repeating tiles and the ink
 * outline pass. Light comes from the top left, as in every sprite of the game: a shaded shape is light on its top and
 * left, dark on its right and bottom. The shapes know nothing of furniture; `parts.ts` builds on them.
 */
import { type Canvas, CLEAR, get, put } from './canvas';

/** The game's ink, the outline of every sprite. */
export const INK = 'k';

/** The colours of one material, as palette keys, lightest first. `hi` is a highlight, `deep` a deepest shade. */
export interface Ramp {
  readonly hi?: string;
  readonly light: string;
  readonly mid: string;
  readonly dark: string;
  readonly deep?: string;
}

/** A one-key ramp: every step the same colour. */
export function flat(key: string): Ramp {
  return { light: key, mid: key, dark: key };
}

export function fill(c: Canvas, x: number, y: number, w: number, h: number, key: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(c, xx, yy, key);
}

export function hline(c: Canvas, x: number, y: number, w: number, key: string): void {
  fill(c, x, y, w, 1, key);
}

export function vline(c: Canvas, x: number, y: number, h: number, key: string): void {
  fill(c, x, y, 1, h, key);
}

/** A straight line between two pixels (Bresenham), ends included. */
export function line(c: Canvas, x0: number, y0: number, x1: number, y1: number, key: string): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    put(c, x, y, key);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** The one-pixel border of a box. */
export function rect(c: Canvas, x: number, y: number, w: number, h: number, key: string): void {
  hline(c, x, y, w, key);
  hline(c, x, y + h - 1, w, key);
  vline(c, x, y, h, key);
  vline(c, x + w - 1, y, h, key);
}

export interface BoxOptions {
  /** The border key; `false` draws no border. Default the ink. */
  ink?: string | false;
  /** Cuts this many pixels off each corner (1 is the soft corner of most pieces). */
  round?: number;
  /**
   * How the ramp shades the inside: `tl` light top row and left column, dark right column and bottom row (the
   * default); `rows` light top row, dark bottom row; `cols` light left column, dark right column; `flat` mid only.
   */
  shade?: 'tl' | 'rows' | 'cols' | 'flat';
  /** How many pixels wide the light and dark edges are (default 1). */
  edge?: number;
}

/** True when a pixel of a w x h box at dx, dy lies in a corner cut of `round` pixels. */
function cut(dx: number, dy: number, w: number, h: number, round: number): boolean {
  if (round <= 0) return false;
  const ex = Math.min(dx, w - 1 - dx);
  const ey = Math.min(dy, h - 1 - dy);
  return ex + ey < round;
}

/** A box with an ink border and an inside shaded by a ramp (or one key). Corners cut by `round`. */
export function box(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  paint: Ramp | string,
  options: BoxOptions = {},
): void {
  const ramp = typeof paint === 'string' ? flat(paint) : paint;
  const ink = options.ink === undefined ? INK : options.ink;
  const round = options.round ?? 0;
  const shade = options.shade ?? 'tl';
  const edge = options.edge ?? 1;
  const b = ink === false ? 0 : 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (cut(dx, dy, w, h, round)) continue;
      const border =
        b === 1 &&
        (dx === 0 ||
          dy === 0 ||
          dx === w - 1 ||
          dy === h - 1 ||
          cut(dx - 1, dy, w, h, round) ||
          cut(dx + 1, dy, w, h, round) ||
          cut(dx, dy - 1, w, h, round) ||
          cut(dx, dy + 1, w, h, round));
      if (border && ink !== false) {
        put(c, x + dx, y + dy, ink);
        continue;
      }
      const ix = dx - b;
      const iy = dy - b;
      const iw = w - 2 * b;
      const ih = h - 2 * b;
      let key = ramp.mid;
      const top = iy < edge;
      const bottom = iy >= ih - edge;
      const left = ix < edge;
      const right = ix >= iw - edge;
      if (shade === 'tl') {
        if (bottom || right) key = ramp.dark;
        else if (top || left) key = ramp.light;
      } else if (shade === 'rows') {
        if (top) key = ramp.light;
        else if (bottom) key = ramp.dark;
      } else if (shade === 'cols') {
        if (left) key = ramp.light;
        else if (right) key = ramp.dark;
      }
      put(c, x + dx, y + dy, key);
    }
  }
}

/**
 * The pixels of an ellipse that fits the box x, y, w, h (a pixel is in when its centre is). `ring` keeps only the
 * pixels with a neighbour outside (4 neighbours, or 8 with `thick`).
 */
export function ellipsePixels(
  x: number,
  y: number,
  w: number,
  h: number,
  mode: 'fill' | 'ring' = 'fill',
  thick = false,
): { x: number; y: number }[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const isIn = (px: number, py: number): boolean => {
    const nx = (px + 0.5 - cx) / rx;
    const ny = (py + 0.5 - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };
  const out: { x: number; y: number }[] = [];
  const steps = thick
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (!isIn(px, py)) continue;
      if (mode === 'ring' && steps.every(([sx = 0, sy = 0]) => isIn(px + sx, py + sy))) continue;
      out.push({ x: px, y: py });
    }
  }
  return out;
}

export function ellipse(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  key: string,
  mode: 'fill' | 'ring' = 'fill',
): void {
  for (const p of ellipsePixels(x, y, w, h, mode)) put(c, p.x, p.y, key);
}

/** Where a two-key dither puts its second key. */
export type DitherKind = 'checker' | 'sparse' | 'rows' | 'cols' | 'diagonal';

/** True when the dither puts its second key at x, y (in the canvas's own coordinates, so dithers line up). */
export function ditherAt(kind: DitherKind, x: number, y: number): boolean {
  switch (kind) {
    case 'checker':
      return (x + y) % 2 === 0;
    case 'sparse':
      return x % 2 === 0 && y % 2 === 0 && (x / 2 + y / 2) % 2 === 0;
    case 'rows':
      return y % 2 === 0;
    case 'cols':
      return x % 2 === 0;
    case 'diagonal':
      return (x + y) % 3 === 0;
  }
}

/** Fills a box with key `a`, `b` where the dither says (only over drawn pixels when `onlyDrawn`). */
export function dither(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  a: string,
  b: string,
  kind: DitherKind = 'checker',
  onlyDrawn = false,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (onlyDrawn && get(c, xx, yy) === CLEAR) continue;
      put(c, xx, yy, ditherAt(kind, xx, yy) ? b : a);
    }
  }
}

/**
 * Repeats a small pattern over a box (its rows, `.` leaves the canvas as it is). The pattern starts at the box's top
 * left plus `ox`, `oy`, so a pattern can be shifted to centre a motif.
 */
export function tile(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  pattern: readonly string[],
  ox = 0,
  oy = 0,
): void {
  const ph = pattern.length;
  const pw = pattern[0]?.length ?? 0;
  if (ph === 0 || pw === 0) return;
  for (let dy = 0; dy < h; dy++) {
    const row = pattern[(((dy + oy) % ph) + ph) % ph] ?? '';
    for (let dx = 0; dx < w; dx++) {
      const key = row[(((dx + ox) % pw) + pw) % pw] ?? CLEAR;
      if (key !== CLEAR) put(c, x + dx, y + dy, key);
    }
  }
}

/**
 * The outline pass: every transparent pixel next to a drawn pixel that is not ink becomes ink (4 neighbours, or 8
 * with `corners`). Run it once a shape is filled to give it the game's ink edge.
 */
export function outline(c: Canvas, ink = INK, corners = false): void {
  const add: number[] = [];
  const near = corners
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (get(c, x, y) !== CLEAR) continue;
      const touches = near.some(([dx = 0, dy = 0]) => {
        const key = get(c, x + dx, y + dy);
        return key !== CLEAR && key !== ink;
      });
      if (touches) add.push(y * c.w + x);
    }
  }
  for (const i of add) c.px[i] = ink;
}

/**
 * Shades what is already drawn in one key by a ramp, by its position in its own run: the first pixel of each
 * horizontal run of `key` becomes light, the last dark (`cols`), or the top and bottom of each vertical run (`rows`).
 */
export function shadeRuns(
  c: Canvas,
  key: string,
  ramp: Ramp,
  direction: 'cols' | 'rows' = 'cols',
): void {
  const marks: { i: number; to: string }[] = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (get(c, x, y) !== key) continue;
      const [bx, by] = direction === 'cols' ? [1, 0] : [0, 1];
      const before = get(c, x - bx, y - by) !== key;
      const after = get(c, x + bx, y + by) !== key;
      const to = after ? ramp.dark : before ? ramp.light : ramp.mid;
      marks.push({ i: y * c.w + x, to });
    }
  }
  for (const m of marks) c.px[m.i] = m.to;
}
