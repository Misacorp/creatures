// A small RGB image for the workshop's sheets (docs/design/housing-workshop.md): rectangles, sprites at a scale,
// and the pixel font for labels. Used by the room sheet and the variant sheet (housing-room.mts).
import { writeFileSync } from 'node:fs';
import type { SpriteDef } from '../src/sprites/sprite-data.ts';
import { png } from './png.mts';

export const BACK = '#241e42';
export const PANEL = '#2f2857';
export const TEXT = '#f4eedc';
export const MUTED = '#8f86b8';
export const RED = '#ff4d6d';
export const AMBER = '#ffc861';

type RGB = [number, number, number];
const hex = (c: string): RGB => {
  const full = c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
};

const DIGITS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
};

export class Image {
  readonly px: Uint8Array;
  readonly w: number;
  readonly h: number;
  readonly glyph: (ch: string) => readonly string[] | undefined;
  constructor(
    w: number,
    h: number,
    glyph: (ch: string) => readonly string[] | undefined,
    back = BACK,
  ) {
    this.w = w;
    this.h = h;
    this.glyph = glyph;
    this.px = new Uint8Array(w * h * 3);
    this.rect(0, 0, w, h, back);
  }
  rect(x: number, y: number, w: number, h: number, colour: string): void {
    const [r, g, b] = hex(colour);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const at = (j * this.w + i) * 3;
        this.px[at] = r;
        this.px[at + 1] = g;
        this.px[at + 2] = b;
      }
    }
  }
  /** A sprite at a scale; `rows` are its expanded rows (`expandRows`). Transparent pixels are skipped. */
  sprite(def: SpriteDef, rows: readonly string[], x: number, y: number, s: number): void {
    for (const [j, row] of rows.entries()) {
      for (const [i, ch] of [...row].entries()) {
        const colour = def.palette[ch];
        if (ch !== '.' && colour !== undefined) this.rect(x + i * s, y + j * s, s, s, colour);
      }
    }
  }
  /** A grid of colours (`''` transparent) at a scale. */
  colours(grid: readonly (readonly string[])[], x: number, y: number, s: number): void {
    for (const [j, row] of grid.entries()) {
      for (const [i, colour] of row.entries()) {
        if (colour !== '') this.rect(x + i * s, y + j * s, s, s, colour);
      }
    }
  }
  text(t: string, x: number, y: number, s: number, colour = TEXT): void {
    let cx = x;
    for (const ch of t.toUpperCase()) {
      const rows = /[A-Z]/.test(ch) ? this.glyph(ch) : DIGITS[ch];
      for (const [j, row] of (rows ?? []).entries()) {
        for (const [i, c] of [...row].entries())
          if (c === '#') this.rect(cx + i * s, y + j * s, s, s, colour);
      }
      cx += 6 * s;
    }
  }
  save(file: string): void {
    writeFileSync(file, png(this.px, this.w, this.h));
  }
}
