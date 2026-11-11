/**
 * Shared bits of the room-interior generators (`docs/design/housing-interior.md`): the room's geometry, a palette of
 * four tones, a tile built from a function of the pixel, small colour helpers and the `Raster` the sheets are painted on.
 * Everything is pure and has no randomness: the same pattern and palette always draw the same pixels.
 */
import { expandRows, type SpriteDef } from '../../sprite-data';
import { glyph } from '../../world-map-font';

/** A room cell as the scene draws it (`housing/house-scene.ts`): 112 x 64, of which 52 wall, 8 floor strip and a 4 slab. */
export const CELL_W = 112;
export const CELL_H = 64;
export const WALL_H = 52;
export const FLOOR_H = 8;
export const SLAB_H = 4;
/** The walls (posts) are 4 thick and straddle the cell edge, 2 px each side. */
export const POST_T = 4;
/** The row furniture stands on, from the room's top. */
export const FEET = 58;
export const INK = '#0d0a1a';

/**
 * The four tones of a pattern. `a` is the ground, `b` a soft second tone (the pattern's body), `c` the detail and `d`
 * the line or shadow. The generators only ever use these four keys, so a pattern takes any palette.
 */
export interface Tones {
  readonly id: string;
  readonly name: string;
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
}

export const TONE_KEYS = ['a', 'b', 'c', 'd'] as const;

export function paletteOf(t: Tones): Record<string, string> {
  return { a: t.a, b: t.b, c: t.c, d: t.d };
}

/** A tile `w` x `h` from a function of the pixel; `.` leaves a pixel transparent (overlays). The palette is cut to the keys used. */
export function makeTile(
  w: number,
  h: number,
  at: (x: number, y: number) => string,
  palette: Readonly<Record<string, string>>,
): SpriteDef {
  const rows: string[] = [];
  const used = new Set<string>();
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const key = at(x, y);
      if (key.length !== 1) throw new RangeError(`A palette key is one character, not "${key}".`);
      if (key !== '.') {
        if (!Object.hasOwn(palette, key))
          throw new RangeError(`Key "${key}" is not in the palette.`);
        used.add(key);
      }
      row += key;
    }
    rows.push(row);
  }
  return {
    rows,
    palette: Object.fromEntries(Object.entries(palette).filter(([key]) => used.has(key))),
  };
}

/** A small stable hash of a pixel, for the scatter of a pattern (not random: the same pixel always gives the same number). */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(salt | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

// ---------------------------------------------------------------------------------------------------------------
// Colours

export type RGB = [number, number, number];

export function hexToRgb(c: string): RGB {
  const full = c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c;
  return [1, 3, 5].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex([r, g, b]: readonly number[]): string {
  const h = (v: number | undefined): string =>
    Math.max(0, Math.min(255, Math.round(v ?? 0)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function luma(c: string): number {
  const [r, g, b] = hexToRgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** `t` of the way from `from` to `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex(a.map((v, i) => v + ((b[i] ?? 0) - v) * t));
}

// ---------------------------------------------------------------------------------------------------------------
// Raster

/** The materials a pixel can be made of, by index (`Raster.mat`), the names `housing/house-light.ts` shades by. */
export const MATERIALS = [
  'auto',
  'wall',
  'floor',
  'exterior',
  'light',
  'creature',
  'fixed',
  'window',
] as const;
export type MaterialName = (typeof MATERIALS)[number];

const DIGITS: Readonly<Record<string, readonly string[]>> = {
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
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..##.', '..##.'],
  ':': ['.....', '..##.', '..##.', '.....', '..##.', '..##.', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
  ' ': ['.....'],
};

/** An RGB picture with a material per pixel (so a room can be put through the house's night). */
export class Raster {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  readonly mat: Uint8Array;
  constructor(w: number, h: number, background = '#241e42') {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.mat = new Uint8Array(w * h);
    this.rect(0, 0, w, h, background);
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    colour: string,
    mat: MaterialName = 'auto',
  ): void {
    const [r, g, b] = hexToRgb(colour);
    const m = MATERIALS.indexOf(mat);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const at = j * this.w + i;
        this.px[at * 3] = r;
        this.px[at * 3 + 1] = g;
        this.px[at * 3 + 2] = b;
        this.mat[at] = m;
      }
    }
  }

  /** A sprite at x, y; `clip` keeps it inside a box (the room's inside). */
  sprite(
    def: SpriteDef,
    x: number,
    y: number,
    mat: MaterialName = 'auto',
    clip?: { x: number; y: number; w: number; h: number },
  ): void {
    for (const [j, row] of expandRows(def).entries()) {
      for (const [i, ch] of [...row].entries()) {
        const colour = def.palette[ch];
        if (ch === '.' || colour === undefined) continue;
        const px = x + i;
        const py = y + j;
        if (
          clip !== undefined &&
          (px < clip.x || py < clip.y || px >= clip.x + clip.w || py >= clip.y + clip.h)
        )
          continue;
        this.rect(px, py, 1, 1, colour, mat);
      }
    }
  }

  /** A sprite repeated over a box, its top left at the box's top left. */
  tileFill(
    def: SpriteDef,
    x: number,
    y: number,
    w: number,
    h: number,
    mat: MaterialName = 'auto',
  ): void {
    const rows = expandRows(def);
    const th = rows.length;
    const tw = rows[0]?.length ?? 0;
    for (let j = 0; j < h; j++) {
      const row = rows[j % th] ?? '';
      for (let i = 0; i < w; i++) {
        const ch = row[i % tw] ?? '.';
        const colour = def.palette[ch];
        if (ch !== '.' && colour !== undefined) this.rect(x + i, y + j, 1, 1, colour, mat);
      }
    }
  }

  /** Another raster at x, y (keeps its materials). */
  put(src: Raster, x: number, y: number): void {
    for (let j = 0; j < src.h; j++) {
      for (let i = 0; i < src.w; i++) {
        const to = (y + j) * this.w + x + i;
        if (x + i < 0 || y + j < 0 || x + i >= this.w || y + j >= this.h) continue;
        const from = j * src.w + i;
        for (let k = 0; k < 3; k++) this.px[to * 3 + k] = src.px[from * 3 + k] ?? 0;
        this.mat[to] = src.mat[from] ?? 0;
      }
    }
  }

  /** The same picture with every pixel `n` times as big. */
  scaled(n: number): Raster {
    const out = new Raster(this.w * n, this.h * n);
    for (let j = 0; j < out.h; j++) {
      for (let i = 0; i < out.w; i++) {
        const from = Math.floor(j / n) * this.w + Math.floor(i / n);
        const to = j * out.w + i;
        for (let k = 0; k < 3; k++) out.px[to * 3 + k] = this.px[from * 3 + k] ?? 0;
        out.mat[to] = this.mat[from] ?? 0;
      }
    }
    return out;
  }

  /** Text in the world map's 5 x 7 capitals (a few signs besides), `s` pixels a dot. */
  text(t: string, x: number, y: number, s: number, colour = '#f4eedc'): void {
    let cx = x;
    for (const ch of t.toUpperCase()) {
      const rows = /[A-Z]/.test(ch) ? glyph(ch) : DIGITS[ch];
      for (const [j, row] of (rows ?? []).entries()) {
        for (const [i, c] of [...row].entries())
          if (c === '#') this.rect(cx + i * s, y + j * s, s, s, colour);
      }
      cx += 6 * s;
    }
  }

  get(x: number, y: number): string {
    const at = (y * this.w + x) * 3;
    return rgbToHex([this.px[at] ?? 0, this.px[at + 1] ?? 0, this.px[at + 2] ?? 0]);
  }
}
