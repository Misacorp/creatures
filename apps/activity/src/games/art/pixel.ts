/**
 * Small pure helpers for the Games art: transforms that derive tiles from one drawing (a shore edge
 * turned to face each side, a water frame shifted along) and a pixel grid for shapes drawn by code
 * (the ice floe, the lane-rope ellipse, the thermometer's fill), cut into sprites of at most 64x64 so
 * every piece is a valid `SpriteDef`.
 */
import { expandRows, type SpriteDef } from '../../sprites/sprite-data';

/** A sprite placed in scene pixels (its top-left). */
export interface Placement {
  sprite: SpriteDef;
  x: number;
  y: number;
}

const MAX = 64;

function rowsOf(def: SpriteDef): string[] {
  return expandRows(def);
}

/** Mirror image left to right. */
export function flipX(def: SpriteDef): SpriteDef {
  return { rows: rowsOf(def).map((r) => [...r].reverse().join('')), palette: def.palette };
}

/** Upside down. */
export function flipY(def: SpriteDef): SpriteDef {
  return { rows: [...rowsOf(def)].reverse(), palette: def.palette };
}

/** A quarter turn clockwise (the top edge becomes the right edge). */
export function rotateCW(def: SpriteDef): SpriteDef {
  const rows = rowsOf(def);
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = h - 1; y >= 0; y--) line += rows[y]?.[x] ?? '.';
    out.push(line);
  }
  return { rows: out, palette: def.palette };
}

/** Shifts every row `n` pixels to the right, wrapping round (keeps a seamless tile seamless). */
export function shiftX(def: SpriteDef, n: number): SpriteDef {
  const rows = rowsOf(def);
  return {
    rows: rows.map((r) => {
      const k = ((n % r.length) + r.length) % r.length;
      return r.slice(r.length - k) + r.slice(0, r.length - k);
    }),
    palette: def.palette,
  };
}

/** A blank grid of `.` to draw into by code. */
export class PixelGrid {
  readonly cells: string[][];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
  }

  set(x: number, y: number, key: string): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    const row = this.cells[yi];
    if (row !== undefined && xi >= 0 && xi < this.width) row[xi] = key;
  }

  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? '.';
  }

  /** Fills a rectangle (clipped to the grid). */
  rect(x: number, y: number, w: number, h: number, key: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, key);
  }

  /** Copies rows onto the grid with their top-left at (x, y); `.` leaves what is under it. */
  stamp(rows: readonly string[], x: number, y: number): void {
    for (const [dy, row] of rows.entries()) {
      for (const [dx, ch] of [...row].entries()) if (ch !== '.') this.set(x + dx, y + dy, ch);
    }
  }

  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }

  /** The grid as one sprite (it must be at most 64x64), with only the palette keys it uses. */
  toSprite(palette: Readonly<Record<string, string>>): SpriteDef {
    const rows = this.rows();
    const used = new Set(rows.join('').replaceAll('.', ''));
    const pal: Record<string, string> = {};
    for (const key of used) {
      const colour = palette[key];
      if (colour !== undefined) pal[key] = colour;
    }
    return { rows, palette: pal };
  }
}

/**
 * The grid as placements of sprites of at most 64x64, with its top-left at (`x`, `y`). Empty pieces are
 * left out. Each piece only lists the palette keys it uses, so it validates on its own.
 */
export function gridPlacements(
  grid: PixelGrid,
  palette: Readonly<Record<string, string>>,
  x: number,
  y: number,
): Placement[] {
  const out: Placement[] = [];
  const rows = grid.rows();
  for (let top = 0; top < grid.height; top += MAX) {
    for (let left = 0; left < grid.width; left += MAX) {
      const piece = rows
        .slice(top, top + MAX)
        .map((r) => r.slice(left, Math.min(grid.width, left + MAX)));
      const used = new Set(piece.join('').replaceAll('.', ''));
      if (used.size === 0) continue;
      const pal: Record<string, string> = {};
      for (const key of used) {
        const colour = palette[key];
        if (colour !== undefined) pal[key] = colour;
      }
      out.push({ sprite: { rows: piece, palette: pal }, x: x + left, y: y + top });
    }
  }
  return out;
}
