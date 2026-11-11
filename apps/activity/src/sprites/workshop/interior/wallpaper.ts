/**
 * Wallpaper = pattern x colour (`docs/design/housing-interior.md`, layer 1). A pattern is a function of the pixel in a tile
 * 52 rows tall (the whole wall) and a width that divides 112, so the paper tiles across a room (and across a two cell room)
 * without a seam. It uses the four keys `a b c d` only, so any palette from `palettes.ts` fits. The pattern tones stay near
 * the ground (see `CONTRAST` in the test) so a lamp, a shelf or a creature in front is never lost.
 */
import type { SpriteDef } from '../../sprite-data';
import { hash2, makeTile, mod, paletteOf, WALL_H, type Tones } from './kit';

export interface WallPattern {
  readonly id: string;
  readonly name: string;
  /** Tile width; divides 112. */
  readonly w: number;
  /** The palette key of a pixel of the tile. */
  readonly at: (x: number, y: number) => string;
}

/** A motif given as rows (`.` leaves the ground), stamped at a centre. */
function stamp(
  rows: readonly string[],
  cx: number,
  cy: number,
  w: number,
  h: number,
  x: number,
  y: number,
): string | null {
  const rw = rows[0]?.length ?? 0;
  const x0 = cx - Math.floor(rw / 2);
  // test the pixel against the motif repeated across the tile edges (wraps both ways)
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      const mx = x - (x0 + ox);
      const my = y - (cy + oy);
      if (mx >= 0 && my >= 0 && my < rows.length && mx < rw) {
        const ch = rows[my]?.[mx] ?? '.';
        if (ch !== '.') return ch;
      }
    }
  }
  return null;
}

const DAMASK = [
  '...c...',
  '..cbc..',
  '..cbc..',
  '.cbbbc.',
  '..cbc..',
  '.c.b.c.',
  'c..b..c',
  '.c.b.c.',
  '..cbc..',
  '.cbbbc.',
  '..cbc..',
  '..cbc..',
  '...c...',
];

const FLOWER = ['.c.', 'cdc', '.c.'];

export const WALL_PATTERNS: readonly WallPattern[] = [
  {
    id: 'plain',
    name: 'Plain plaster',
    w: 56,
    at: (x, y) => (hash2(x, y, 3) % 83 === 0 ? 'b' : 'a'),
  },
  {
    id: 'pinstripe',
    name: 'Thin stripes',
    w: 8,
    at: (x) => (x === 0 ? 'b' : 'a'),
  },
  {
    id: 'stripes',
    name: 'Wide stripes',
    w: 16,
    at: (x) => {
      const m = x % 16;
      if (m === 8) return 'c';
      return m > 8 ? 'b' : 'a';
    },
  },
  {
    id: 'damask',
    name: 'Damask',
    w: 16,
    // two motifs a half drop apart; the repeat is 16 x 26, so the 52 rows hold two
    at: (x, y) => stamp(DAMASK, 3, 0, 16, 26, x, y) ?? stamp(DAMASK, 11, 13, 16, 26, x, y) ?? 'a',
  },
  {
    id: 'panels',
    name: 'Panels',
    w: 28,
    at: (x, y) => {
      // a moulded panel 22 wide in every 28, the stile between them in the second tone
      const px = x - 3;
      const py = y - 5;
      if (px < 0 || px > 21 || py < 0 || py > 37) return 'b';
      if (px === 0 || py === 0) return 'c';
      if (px === 21 || py === 37) return 'd';
      if (px === 2 || py === 2) return px >= 2 && py >= 2 && px <= 19 && py <= 35 ? 'd' : 'a';
      if (px === 19 || py === 35) return px >= 2 && py >= 2 && px <= 19 && py <= 35 ? 'c' : 'a';
      return 'a';
    },
  },
  {
    id: 'tiles',
    name: 'Tiles',
    w: 8,
    at: (x, y) => {
      if (x === 7 || y % 8 === 7) return 'b';
      return x === 1 && y % 8 === 1 ? 'c' : 'a';
    },
  },
  {
    id: 'brick',
    name: 'Brick',
    w: 16,
    at: (x, y) => {
      const row = Math.floor(y / 4);
      if (y % 4 === 3) return 'b';
      const joint = row % 2 === 0 ? 7 : 3;
      if (x % 8 === joint) return 'b';
      const brick = Math.floor(mod(x - joint - 1, 16) / 8) + row * 2;
      return hash2(brick, row, 5) % 6 === 0 && y % 4 === 1 && x % 8 === (joint + 3) % 8 ? 'c' : 'a';
    },
  },
  {
    id: 'planks',
    name: 'Planks',
    w: 16,
    at: (x, y) => {
      const board = Math.floor(x / 8);
      const m = x % 8;
      if (m === 7) return 'b';
      if (m === 0) return board === 0 ? 'a' : 'a';
      const seg = Math.floor((y + board * 9) / 11);
      if (m === 3 + (hash2(board, seg, 9) % 3) && (y + board * 9) % 11 < 4) return 'b';
      return 'a';
    },
  },
  {
    id: 'starry',
    name: 'Starry',
    w: 56,
    at: (x, y) => {
      // a few single stars and four small crosses, never in a lattice
      const crosses: readonly (readonly [number, number])[] = [
        [9, 9],
        [34, 21],
        [47, 6],
        [18, 36],
        [51, 40],
      ];
      for (const [cx, cy] of crosses) {
        const dx = x - cx;
        const dy = y - cy;
        if ((dx === 0 && Math.abs(dy) <= 1) || (dy === 0 && Math.abs(dx) <= 1)) return 'c';
      }
      return hash2(x, y, 11) % 71 === 0 ? 'c' : 'a';
    },
  },
  {
    id: 'floral',
    name: 'Floral',
    w: 16,
    at: (x, y) => {
      const f = stamp(FLOWER, 3, 3, 16, 26, x, y) ?? stamp(FLOWER, 11, 16, 16, 26, x, y);
      if (f !== null) return f;
      // a leaf either side of every flower
      for (const [cx, cy] of [
        [3, 3],
        [11, 16],
      ] as const) {
        for (const ox of [-16, 0, 16]) {
          for (const oy of [-26, 0, 26]) {
            const dx = x - (cx + ox);
            const dy = y - (cy + oy);
            if ((dx === 3 && dy === 1) || (dx === -3 && dy === 1)) return 'b';
            if ((dx === 4 && dy === 2) || (dx === -4 && dy === 2)) return 'b';
          }
        }
      }
      return 'a';
    },
  },
  {
    id: 'polka',
    name: 'Polka dots',
    w: 16,
    at: (x, y) => {
      for (const [cx, cy] of [
        [4, 4],
        [12, 12],
      ] as const) {
        for (const oy of [-16, 0, 16, 32, 48]) {
          const dx = mod(x - cx + 8, 16) - 8;
          const dy = y - (cy + oy);
          if (Math.abs(dx) + Math.abs(dy) <= 1) return 'b';
        }
      }
      return 'a';
    },
  },
  {
    id: 'harlequin',
    name: 'Harlequin',
    w: 16,
    at: (x, y) => {
      // diamonds 16 wide between thin lines, every other diamond in the second tone
      const u = mod(x + y, 16);
      const v = mod(x - y, 16);
      if (u === 0 || v === 0) return 'c';
      const p = Math.floor((x + y) / 16) + Math.floor((x - y + 64) / 16);
      return mod(p, 2) === 0 ? 'a' : 'b';
    },
  },
  {
    id: 'split',
    name: 'Two-tone split',
    w: 8,
    at: (_x, y) => {
      if (y < 28) return 'a';
      if (y === 28) return 'c';
      if (y === 29) return 'd';
      return 'b';
    },
  },
];

/** The wallpaper tile of a pattern in a palette: `w` x 52, ready to repeat across a room. */
export function wallpaper(pattern: WallPattern, tones: Tones): SpriteDef {
  return makeTile(pattern.w, WALL_H, pattern.at, paletteOf(tones));
}

export function wallPatternById(id: string): WallPattern {
  const found = WALL_PATTERNS.find((p) => p.id === id);
  if (found === undefined) throw new RangeError(`No wallpaper pattern "${id}".`);
  return found;
}
