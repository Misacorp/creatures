/**
 * Ceilings (`docs/design/housing-interior.md`, layer 6): what the top of a room's wall shows, drawn over the wallpaper as an
 * overlay `roomW` wide (112 for a one cell room, 224 for a two cell room) and `height` tall. Plain, beamed, coffered, and
 * rafters for a room under the roof (a pitched underside: dark in the corners, a collar tie and a king post). A colourway
 * is two tone sets: the plaster (or boards) and the timber of the beams.
 */
import type { SpriteDef } from '../../sprite-data';
import { CELL_W, INK, makeTile, mod, type Tones } from './kit';

export type CeilingKind = 'plain' | 'beamed' | 'coffered' | 'rafters';

export const CEILING_KINDS: readonly { id: CeilingKind; name: string; height: number; note: string }[] = [
  { id: 'plain', name: 'Plain', height: 4, note: 'a flat ceiling line' },
  { id: 'beamed', name: 'Beamed', height: 11, note: 'a tie beam on corbels' },
  { id: 'coffered', name: 'Coffered', height: 12, note: 'recessed panels between beams' },
  { id: 'rafters', name: 'Rafters', height: 15, note: 'the roof showing, for the top floor' },
];

export interface CeilingColours {
  readonly id: string;
  readonly name: string;
  /** The plaster or boards (`a b c d` of a tone set). */
  readonly surface: Tones;
  /** The beams and rafters. */
  readonly timber: Tones;
}

const T = (id: string, name: string, a: string, b: string, c: string, d: string): Tones => ({
  id,
  name,
  a,
  b,
  c,
  d,
});

const PLASTER_WHITE = T('plaster-white', 'White plaster', '#f1ece0', '#e0d8c6', '#fbf7ee', '#b9af9a');
const PLASTER_CREAM = T('plaster-cream', 'Cream plaster', '#eedfb8', '#dcc89a', '#f8edcf', '#b39c70');
const BOARDS_DARK = T('boards-dark', 'Dark boards', '#5a3c2c', '#4a3024', '#74503c', '#2e1d16');
const STONE_VAULT = T('stone-vault', 'Stone', '#9a9faa', '#868c98', '#b6bbc4', '#646a78');
const OAK = T('oak', 'Oak', '#b07a4c', '#82553a', '#d29c68', '#5e3a28');
const WALNUT = T('walnut', 'Walnut', '#6b4531', '#583625', '#8c5d43', '#3a2218');
const EBONY = T('ebony', 'Ebony', '#3b3141', '#2f2735', '#54485d', '#1d1721');

export const CEILING_COLOURS: readonly CeilingColours[] = [
  { id: 'white-oak', name: 'White and oak', surface: PLASTER_WHITE, timber: OAK },
  { id: 'cream-walnut', name: 'Cream and walnut', surface: PLASTER_CREAM, timber: WALNUT },
  { id: 'dark', name: 'Dark boards', surface: BOARDS_DARK, timber: EBONY },
  { id: 'stone', name: 'Stone and walnut', surface: STONE_VAULT, timber: WALNUT },
];

/** Surface keys `a b c d`, timber keys `e f g h` (face, shade, light, line), ink `k`. */
function palette(c: CeilingColours): Record<string, string> {
  return {
    a: c.surface.a,
    b: c.surface.b,
    c: c.surface.c,
    d: c.surface.d,
    e: c.timber.a,
    f: c.timber.b,
    g: c.timber.c,
    h: c.timber.d,
    k: INK,
  };
}

const heightOf = (kind: CeilingKind): number =>
  CEILING_KINDS.find((k) => k.id === kind)?.height ?? 4;

/** The pitched underside's depth at x in a one cell room: 15 at the walls, 0 under the ridge. */
const SLOPE = 13;
const slopeDepth = (x: number): number => {
  const m = mod(x, CELL_W);
  const d = Math.abs(m - (CELL_W - 1) / 2) / ((CELL_W - 1) / 2);
  return Math.round(SLOPE * d);
};

function at(kind: CeilingKind, x: number, y: number): string {
  switch (kind) {
    case 'plain':
      // the plaster to the ceiling line, shaded where it meets the wall
      return ['a', 'a', 'b', 'd'][y] ?? '.';
    case 'beamed': {
      const m = mod(x, CELL_W);
      if (y < 3) return ['a', 'a', 'b'][y] ?? '.';
      // a tie beam across, with a corbel under each end and under the middle
      if (y >= 3 && y <= 7) {
        const row = ['g', 'e', 'e', 'f', 'h'][y - 3] ?? 'e';
        return row;
      }
      const corbel = (m <= 5 && y - 8 <= 2 - Math.floor(m / 2)) || (m >= CELL_W - 6 && y - 8 <= 2 - Math.floor((CELL_W - 1 - m) / 2));
      const mid = Math.abs(m - 55.5) <= 4 && y - 8 <= 2 - Math.floor((Math.abs(m - 55.5) - 0.5) / 2) + 0;
      if (corbel || mid) return y === 10 ? 'h' : 'f';
      if (y === 8) return 'd';
      return '.';
    }
    case 'coffered': {
      // 14 wide coffers between 2 wide beams, 12 tall
      const m = x % 14;
      if (y === 0) return 'g';
      if (y <= 1) return 'e';
      if (y === 11) return 'h';
      if (y === 10) return 'f';
      if (m < 2) return m === 0 ? 'g' : 'e';
      const py = y - 2;
      if (py === 0 || m === 2) return 'd';
      if (py === 7 || m === 13) return 'c';
      return 'b';
    }
    case 'rafters': {
      const m = mod(x, CELL_W);
      const depth = slopeDepth(x);
      const mid = Math.abs(m - 55.5) <= 1.5;
      // king post and collar tie
      if (mid && y <= 14) return y === 0 ? 'g' : m < 55.5 ? 'g' : 'f';
      if (y >= 12 && y <= 14 && m >= 14 && m <= CELL_W - 15) return ['g', 'e', 'h'][y - 12] ?? 'e';
      if (y >= 15) return '.';
      if (y > depth) return '.';
      // the underside's boards, the edge lit; rafters run along the slope every 14 px
      if (y === depth) return 'g';
      const along = m < 56 ? m + y * 4 : CELL_W - 1 - m + y * 4;
      if (along % 28 < 2) return along % 28 === 0 ? 'g' : 'f';
      return (y + Math.floor(m / 8)) % 4 === 3 ? 'h' : 'e';
    }
  }
}

/** The overlay of a kind in a colourway for a room `roomW` wide (a multiple of 112). */
export function ceilingOverlay(kind: CeilingKind, colours: CeilingColours, roomW: number): SpriteDef {
  return makeTile(roomW, kind === 'rafters' ? 15 : heightOf(kind), (x, y) => at(kind, x, y), palette(colours));
}

export const ceilingHeight = heightOf;
