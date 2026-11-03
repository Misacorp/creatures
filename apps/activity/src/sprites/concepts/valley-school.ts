/**
 * The School's visiting teacher, concept art (not in the game), in the liked "valley glow" style
 * (`valley-glow.ts`; the School is `school` there, the lectern `lectern` in `valley-glow-camp.ts`). The
 * visit is shown with no banner (valley session, round 22): the bell swings, a lectern stands at the
 * door, the teacher wears a mortarboard and students sit on a bench in the yard. Same conventions as
 * `valley-glow.ts`: the main palette is night, `alts.day` recolours the same pixels; keys `1 2 3` are the
 * window light on the ground (3 inner and solid, 1 outer and dithered), `x` is the cast shadow, `k` the ink.
 */
import type { SpriteDef } from '../sprite-data';
import { expandRows } from '../sprite-data';
import { BUNDLED_CREATURE_SPRITES } from '../creature-sprites';
import { WORLD_MAP_SPRITE_DATA } from '../data/world-map-sprites';
import type { ConceptSet } from './index';

const SCHOOL_YARD: SpriteDef = {
  palette: {
    '1': '#6a5236',
    '2': '#93713c',
    '3': '#c08e3c',
    k: '#0d0a1a',
    d: '#4a3b36',
    D: '#3a2d2c',
    e: '#5e4a3c',
    p: '#8a7a74',
    f: '#3c6a48',
    U: '#f0b878',
    u: '#e0954a',
    v: '#8a5240',
    w: '#3a2a48',
    x: '#112430',
  },
  rows: [
    '..........................1dddddddDdde.........f................................',
    '......................e...d1ddDdddddd1e222.3.2e1e.ee.....d......................',
    '...................2.2.2.e1d1dpddddd1D1d2222221d1f.Dde.dee..fe..e...............',
    '..........e..e..d.e12.22d1d1ddDdDdddd1d1d22221d1d1edeedddeeeeddeef.e............',
    '...........fd.1d1d1e122d1d1d1ddddped1d1d1d2p1d1d1d1dDddddddddd.dedeee..f........',
    '........eeede1d1e1d1p1e1d1d1d1dDddd1D1e1d1d1d1d1d1d1dddddddDdDDdeDpde.e.f.e.....',
    '.....e.d.deded1e1d1d1d1d1D1d1edddded1d1e1d1d1d1d1d1dddddddddddddedDddd.d.fd.....',
    '..fef.deeddeedd1D1d1d1d1d1d1dddddddde1d1D1D1d1D1d1edddddddddddddddddddefeD..d...',
    'f...eededeDDdedd1e1d1d1d1e1dDddddddddd1d1d1d1d1D1ddddddddddddDddddddddddDdeed...',
    '.e.efddddddDdddddDd1d1d1d1dDdddeddddded1d1d1d1dddddddDdddedddddddDdedddeeefpdf..',
    'dfekkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkddddddddDDdddeddddddeD.f.',
    'ddkkUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUkkDdeepdedddddddddddddeded',
    'eekkuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuukkeddddddddddddddddeddDdd.',
    'e.kkvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvkkdddddDddddddddDddddddDdd',
    'ddkkwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwkkddddDdddddddDdddddedeedf',
    'fedkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkdddpDddddddddddddddede.e.',
    '...xxkwkxxxxxxxxxxxxxxxxxxxkwkxxxxxxxxxxxxxxxxxxxxxkwkxddDdddddedddddDdded.d.d.e',
    '..e.xkvkxdxdxdxDxDxDxdxdxdxkvkxdxdxdxdxdxexexdxdxdxkvkxdDddeddddddddddpdde.deee.',
    '..f..kvkdddddDdddddDdddddDdkvkdddddedddDddDddDddDddkvkddDpdDdddddddeddddeede....',
    '...xxkkkxxxeeDddeddddeddexxkkkxxxdDddddDddddddddDxxkkkxxxddddddedddddedd.ee..f..',
    '.......fdfd..dddeedddddDDeddDdddddddeeDdddddppddDddDddddddddddedpdedd.f.e.e.....',
    '.........e...eeedededDddddDdDDdDDDDdpdddddDdddeddddddddddededeDdfdedf.....e.....',
    '...............d.ed.ddededddddeddddddddddddedDdeedDeDddddedeeeee.eff............',
    '..............f.ef.df..e.de.eeeeddeeedddddddDedeee.e..eededd..e.................',
  ],
};

const SCHOOL_YARD_DAY = {
  '1': '#bd9f72',
  '2': '#b8996a',
  '3': '#b8996a',
  d: '#b8996a',
  D: '#a58558',
  e: '#cdb386',
  p: '#ebe4d2',
  f: '#467a4c',
  U: '#dcb070',
  u: '#c99a58',
  v: '#9c6a3c',
  w: '#6a4630',
  x: '#2f5a38',
};

/**
 * A small lectern for the yard (21x17): a reading stand a creature stands beside, with an open book on a
 * slanted board, a short post and a flared foot. The camp's `lectern` is a big reading desk (48x50, about
 * the School's own size), too big for the yard beside a 16x16 teacher.
 */
const SCHOOL_LECTERN: SpriteDef = {
  palette: {
    k: '#0d0a1a',
    M: '#fff0c0',
    m: '#c8b890',
    a: '#8a6a50',
    u: '#e0954a',
    v: '#8a5240',
    w: '#3a2a48',
    x: '#112430',
  },
  rows: [
    '..kkkkkkkkkkkkkkkkkk..',
    '.kMMMMMMMMaaMMMMMMMMk.',
    '.kMaaaaaaMaaMaaaaaaMk.',
    '.kMMMMMMMMaaMMMMMMMMk.',
    '.kMaaaaMMMaaMaaaaaMMk.',
    '.kmmmmmmmmaammmmmmmmk.',
    'kuuuuuuuuuuuuuuuuuuuuk',
    'kvvvvvvvvvvvvvvvvvvvvk',
    '.kwwwwwwwwwwwwwwwwwwk.',
    '..kkkkkkkkvvkkkkkkkk..',
    '.........kuvk.........',
    '........kuuuuk........',
    '.........kuvk.........',
    '.......kkvvvvkk.......',
    '......kuvvvvvvwk......',
    '.....kwwwwwwwwwwk.....',
    '....xxxxxxxxxxxxxx....',
  ],
};

const SCHOOL_LECTERN_DAY = {
  m: '#d9cfae',
  M: '#f2ead0',
  a: '#a88a60',
  u: '#c99a58',
  v: '#9c6a3c',
  w: '#6a4630',
  x: '#2f5a38',
};

/**
 * The bell: the School's cupola opening, 6x6 at (27, 7) on the School sprite (x 27 to 32, y 7 to 12).
 * Keys and pixels are the School's own; the rest frame is those pixels exactly.
 */
const BELL_PALETTE = { m: '#8a7488', a: '#45406a', u: '#e0954a' };
const BELL_DAY = { m: '#e6d8c0', a: '#bfae9e', u: '#c99a58' };

const SCHOOL_BELL: SpriteDef = {
  palette: BELL_PALETTE,
  rows: ['mmmmaa', 'maaaaa', 'mauuaa', 'mauuaa', 'maaaaa', 'mmmmaa'],
};
const SCHOOL_BELL_LEFT: SpriteDef = {
  palette: BELL_PALETTE,
  rows: ['mmmmaa', 'maaaaa', 'mauuaa', 'muuaaa', 'maaaaa', 'mmmmaa'],
};
const SCHOOL_BELL_RIGHT: SpriteDef = {
  palette: BELL_PALETTE,
  rows: ['mmmmaa', 'maaaaa', 'mauuaa', 'maauua', 'maaaaa', 'mmmmaa'],
};

/**
 * The mortarboard with its tassel (16 wide, 8 tall), worn over a 16x16 creature's head top. Fixed colours,
 * not item-tinted: a deep navy board with a lighter top face, a navy cap under it, a gold button and a
 * gold cord to the right corner, where the tassel hangs.
 */
const TEACHER_CAP: SpriteDef = {
  palette: {
    k: '#0d0a1a',
    N: '#34479a',
    M: '#6f84d8',
    T: '#f6d56a',
    Y: '#c8902a',
    L: '#a8baf8',
    B: '#5a6fd0',
  },
  rows: [
    '......LLLL......',
    '...LLLMMNNLLL...',
    '.LLMMNNTTYYYYYY.',
    '..BBBBBBBBBBBBY.',
    '....kNNNNNNk..Y.',
    '...kBBBBBBBBk.Y.',
    '.............TT.',
    '.............TY.',
  ],
};
const CAP_BAND_ROW = 5;

/** The first row where x 5 to 10 are all filled (the head top), as `wearing()` finds it. */
export function headTop(grid: readonly (readonly string[])[]): number {
  for (let y = 0; y <= 6; y++) {
    if ([5, 6, 7, 8, 9, 10].every((x) => (grid[y]?.[x] ?? '.') !== '.')) return y;
  }
  return 5;
}

/**
 * A creature wearing the teacher's cap: the cap's top row sits two rows above the head top (never above
 * row 0, never so low that its band passes row 7), so ears, antlers and the dome stay readable beside the
 * board, and the face (rows 8 to 10, x 3 to 12) is never painted. `flip` hangs the tassel on the left.
 */
export function withCap(creature: SpriteDef, flip = false, low = false): SpriteDef {
  const grid = expandRows(creature).map((row) => [...row]);
  const top = Math.max(
    0,
    Math.min(headTop(grid) - (low ? 1 : 2), 7 - CAP_BAND_ROW + (low ? 1 : 0)),
  );
  const cap = expandRows(TEACHER_CAP).filter((_, dy) => !(low && dy === 4));
  for (const [dy, row] of cap.entries()) {
    const chars = flip ? [...row].reverse() : [...row];
    for (const [x, ch] of chars.entries()) {
      const y = top + dy;
      const face = y >= 8 && y <= 10 && x >= 3 && x <= 12;
      if (ch === '.' || face || y >= 16) continue;
      const target = grid[y];
      if (target !== undefined) target[x] = ch;
    }
  }
  const palette: Record<string, string> = { ...creature.palette };
  for (const [key, colour] of Object.entries(TEACHER_CAP.palette)) {
    if (palette[key] !== undefined && palette[key] !== colour && key !== 'k') {
      throw new Error(`Cap key ${key} is used by the creature`);
    }
    palette[key] = colour;
  }
  return { palette, rows: grid.map((row) => row.join('')) };
}

function species(id: string): SpriteDef {
  const sprite = BUNDLED_CREATURE_SPRITES[id];
  if (sprite === undefined) throw new Error(`Unknown species ${id}`);
  return sprite;
}

/** The world map's grass tile recoloured for night; the backdrop's `day` alt is the normal grass. */
const NIGHT_GRASS: Readonly<Record<string, string>> = {
  a: '#1f3a3e',
  b: '#182e33',
  c: '#28484a',
  d: '#12262b',
  e: '#9fb0d8',
  f: '#c9a64e',
  g: '#a76a90',
};

export const VALLEY_SCHOOL_CONCEPTS: ConceptSet = {
  id: 'valley-school',
  title: "The School's visiting teacher",
  requested:
    "2026-11-03 (via the valley session, Misa's round 22 decision): show the visiting teacher with no banner: the bell swings, a lectern at the door, a bench of students, a teacher prop.",
  status: 'draft',
  notes: [
    "Lead's review (2026-11-03): the yard's window light is kept faint on purpose, because the School sprite throws its own spill and students on the bench cover most of it. Push it brighter if it should read on its own. Talent icons need no new art: the four combat v2 role glyphs already ship (Setter `mark`, Payoff `sparkle`, Guard `shield`, Support `ability`).",
    'Spec: valley/systems/school.md, "As decided (round 22)": no banner; the bell swings and a lectern appears at the door before the teacher comes, the teacher stands at the lectern Monday to Wednesday, students sit on a bench in front (empty seats show there is room to join), at dusk the windows light.',
    "Lectern: the camp's `lectern` (48x50) is as big as the School itself, so beside a 16x16 teacher it is too big for the yard; `school-lectern` (22x17) is a small stand for the yard. Its foot is (10, 15) in its own pixels; the game puts that point at yard (73, 14). The teacher stands left of it, feet (62, 14): the sprite's top-left is (54, -1). Draw order: yard, lectern, teacher, then the students.",
    "Yard: 80x24 (wider than the 64 asked: the bench takes the left 56 px and the right 24 px are the clear spot for the lectern and the teacher). Placed so the yard's x 31 and 32 are under the School door (yard top-left = School top-left + (-2, 38)), top row against the door steps; the two warm pools are under the School's two windows (yard x 21 and 42). Four seats on one long bench, 13 px apart. A creature is drawn with its sprite's bottom row (its feet, the last row, 15) on the seat row, so its top-left is (seat x - 8, 12 - 15): seat feet points (9, 12), (22, 12), (35, 12), (48, 12) in yard pixels (plank top rows 11 and 12; the front face below is clear). Nothing is drawn above row 10 over the bench, so the seats are unobstructed; an empty seat is just bare plank. Day: bare dirt, pebbles and grass tufts at the edge, no light.",
    "Bell: three 6x6 overlays for the School's cupola opening; top-left (27, 7) on the 60x50 School sprite. `school-bell` is the School's own pixels at rest (a test checks it against `valley-glow.ts`); `left` and `right` tilt the 2x2 bronze bell one pixel across and one row apart. Play rest, left, rest, right while the bell rings. The day alt uses the School's own day colours for the same keys.",
    'Teacher cap: a navy mortarboard (a flat diamond board with a lighter top face and an ink underside), a small cap under it, a gold button, a gold cord to the right corner and a gold tassel hanging beside the head. It is fixed colour (not item-tinted). How it plugs in: a new hat class `mortarboard` in `worn-sprites.ts` would hold the board and cap as a `HalfShape` (rows 0 to 5, left half, mirrored; the top face of the board in rows 1 and 2 is drawn a little off-centre and the cord crosses row 2, so a mirrored version makes those two rows symmetric and leaves the cord to the patch) and `wearing()` would paint the tassel patch (the three cord and tassel columns, x 13 to 14, rows 2 to 7 of the cap) on the right as a second small shape; a hat that is taller than the usual rule puts its top row two rows above the head top (the usual rule puts its bottom row one under the head top), so ears stay visible beside the board. Face rows 8 to 10 are never painted; the tassel is the only part that can reach row 8 and 9, at x 13 to 14, beside the cheek.',
    'The variants of `teacher-cap` show it on three shipped creatures: Splashet (round), Sproutle (leaf ears) and Zipmouse (small, ears and a tail on the right, so its tassel hangs on the left). They are composed in code from the shipped sprites, not drawn by hand.',
  ],
  backdrop: {
    tile: { palette: NIGHT_GRASS, rows: WORLD_MAP_SPRITE_DATA.grass.rows },
    alts: { day: WORLD_MAP_SPRITE_DATA.grass.palette },
  },
  sprites: {
    'school-yard': {
      kind: 'free',
      note: 'The ground in front of the School door: a trodden dirt yard, 80x24, with one long bench of four seats, 13 px apart, facing the School. Seat feet points (9, 12), (22, 12), (35, 12), (48, 12); the clear spot for the lectern (foot (73, 14)) and the teacher (feet (62, 14)) is on the right. Night: warm stepped light from the two windows on the dirt. Day: bare dirt with pebbles and grass tufts at the edge.',
      sprite: SCHOOL_YARD,
      alts: { day: SCHOOL_YARD_DAY },
    },
    'school-lectern': {
      kind: 'free',
      note: 'A small lectern for the yard, 22x17: an open book on a slanted board, a short post and a flared foot; the teacher stands to its left. Foot point (10, 15). The camp lectern stays for places where a big desk fits.',
      sprite: SCHOOL_LECTERN,
      alts: { day: SCHOOL_LECTERN_DAY },
    },
    'school-bell': {
      kind: 'free',
      note: "The School's bell at rest, 6x6 over the cupola opening at (27, 7) on the School sprite; `left` and `right` are the two swung frames.",
      sprite: SCHOOL_BELL,
      alts: { day: BELL_DAY },
      variants: { left: SCHOOL_BELL_LEFT, right: SCHOOL_BELL_RIGHT },
    },
    'teacher-cap': {
      kind: 'free',
      note: "The teacher's mortarboard with a gold tassel, 16x8, worn over the head top of a 16x16 creature (top row two rows above the head top). Light blue rim on the board's top edge and a lighter underside line and band keep it readable on dark ground. Variants: worn by Splashet, Sproutle and Zipmouse (small head: the cap sits one row lower and drops the cap's under row (row 4, the cap band under the board) so the ears show above the board).",
      sprite: TEACHER_CAP,
      variants: {
        'on-splashet': withCap(species('splashet')),
        'on-sproutle': withCap(species('sproutle')),
        'on-zipmouse': withCap(species('zipmouse'), true, true),
      },
    },
  },
};
