/**
 * Floors = pattern x colour (`docs/design/housing-interior.md`, layer 2). A floor tile is 8 rows (the strip the furniture
 * stands on, seen from the front) and a width that divides 112. Same four keys as the wallpaper: `a` the board or tile,
 * `b` a second board's shade, `c` the light edge, `d` the seam. Row 0 is the walking surface's far edge.
 */
import type { SpriteDef } from '../../sprite-data';
import { FLOOR_H, hash2, makeTile, mod, paletteOf, type Tones } from './kit';

export interface FloorPattern {
  readonly id: string;
  readonly name: string;
  /** Tile width; divides 112. */
  readonly w: number;
  readonly at: (x: number, y: number) => string;
}

/** Boards two rows of four: a seam under each, and a butt joint at `joints[row]` (every `len` pixels). */
function boards(len: number, offset: number): (x: number, y: number) => string {
  return (x, y) => {
    const row = Math.floor(y / 4);
    const r = y % 4;
    if (r === 3) return 'd';
    if (mod(x - row * offset, len) === 0) return 'd';
    const face = row === 0 ? 'a' : 'b';
    if (r === 0) return face === 'a' ? 'c' : 'a';
    // a little grain
    return hash2(Math.floor((x - row * offset) / len), row, 21) % 4 === 0 && r === 2 && x % 7 < 3
      ? 'b'
      : face;
  };
}

export const FLOOR_PATTERNS: readonly FloorPattern[] = [
  { id: 'planks-long', name: 'Long planks', w: 56, at: boards(56, 28) },
  { id: 'planks-short', name: 'Short planks', w: 16, at: boards(16, 8) },
  {
    id: 'herringbone',
    name: 'Herringbone parquet',
    w: 16,
    at: (x, y) => {
      const m = x % 8;
      const fold = m < 4 ? m : 7 - m;
      const k = y + fold;
      if (mod(k, 4) === 3) return 'd';
      return mod(Math.floor(k / 4), 2) === 0 ? 'a' : 'b';
    },
  },
  {
    id: 'checker',
    name: 'Checker tiles',
    w: 16,
    at: (x, y) => {
      if (y % 4 === 3 || x % 8 === 7) return 'd';
      return mod(Math.floor(x / 8) + Math.floor(y / 4), 2) === 0 ? 'a' : 'b';
    },
  },
  {
    id: 'flags',
    name: 'Stone flags',
    w: 56,
    at: (x, y) => {
      const row = Math.floor(y / 4);
      // flags of uneven length, the second row's joints between the first row's
      const joints = row === 0 ? [0, 21, 40] : [10, 31, 49];
      if (y % 4 === 3) return 'd';
      let flag = 0;
      for (const [i, j] of joints.entries()) if (x >= j) flag = i;
      if (joints.includes(x)) return 'd';
      const start = joints[flag] ?? 0;
      if (x === start + 1 && y % 4 === 0) return 'c';
      return hash2(flag, row, 13) % 3 === 0 ? 'b' : 'a';
    },
  },
  {
    id: 'cobble',
    name: 'Cobblestones',
    w: 16,
    at: (x, y) => {
      const g = Math.floor(y / 4);
      const sx = x + (g % 2) * 4;
      const stone = Math.floor(sx / 8);
      if (y % 4 === 3 || sx % 8 === 7) return 'd';
      if (sx % 8 === 0 && y % 4 === 0) return 'd';
      const h = hash2(mod(stone, 2), g, 17) % 3;
      return h === 0 ? 'a' : h === 1 ? 'b' : 'c';
    },
  },
  {
    id: 'carpet',
    name: 'Carpet',
    w: 56,
    at: (x, y) => {
      if (y === 0) return 'b';
      const h = hash2(x, y, 31);
      if (h % 13 === 0) return 'b';
      return h % 29 === 1 ? 'c' : 'a';
    },
  },
  {
    id: 'carpet-border',
    name: 'Bordered carpet',
    w: 16,
    at: (x, y) => {
      if (y === 0 || y === 7) return 'd';
      if (y === 1 || y === 6) return 'c';
      // a lozenge in the field every 16
      const m = x % 16;
      const dx = Math.abs(m - 7.5);
      const dy = Math.abs(y - 3.5);
      if (dx + dy * 1.5 <= 2.6) return 'c';
      return y === 2 || y === 5 ? 'b' : 'a';
    },
  },
  {
    id: 'tatami',
    name: 'Tatami',
    w: 56,
    at: (x, y) => {
      const row = Math.floor(y / 4);
      const r = y % 4;
      if (r === 3) return 'd';
      if (mod(x - row * 28, 56) === 0) return 'd';
      // woven rows
      if (r === 1) return 'b';
      return r === 0 ? 'c' : 'a';
    },
  },
];

/** The floor tile of a pattern in a palette: `w` x 8. */
export function floorTile(pattern: FloorPattern, tones: Tones): SpriteDef {
  return makeTile(pattern.w, FLOOR_H, pattern.at, paletteOf(tones));
}

export function floorPatternById(id: string): FloorPattern {
  const found = FLOOR_PATTERNS.find((p) => p.id === id);
  if (found === undefined) throw new RangeError(`No floor pattern "${id}".`);
  return found;
}
