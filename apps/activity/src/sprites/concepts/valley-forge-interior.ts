/**
 * The Forge, inside (concept art, not in the game): the workshop interior the valley shows when a player clicks
 * the Forge. Separate pieces the game lays out behind its existing props (`valley/forge-props.ts`: the 16x16
 * anvil, chest, crate and plans table, drawn in the ink and the three woods below). Every piece is `free` art
 * with a night main palette and `alts.day` (same pixels): at night the windows are dark blue with a moon glint
 * and the fire is the room's light (warm stepped light lies on the floor); by day the windows are bright and
 * daylight falls in (the `b` and `B` patches are plain wall and floor colours at night). The room uses the
 * level 3 look (`valley-tiers`: warm sandstone, timber, black iron, terracotta) so it matches the Forge's outside.
 * Pieces are drawn by small helpers below and kept as plain pixel data like any sprite.
 *
 * Palette keys shared by every piece (a sprite carries only the ones it uses):
 * `k` ink, `s S L` sandstone body, shade, light, `w W V` wood light, mid, dark (the props' woods), `i I j` iron
 * dark, mid, light (the anvil's), `t T` terracotta tile and shade, `o y c` fire (orange, yellow, hot core),
 * `g G m` glass, its lower shade, the glint, `b` daylight on the wall, `B` daylight on the floor,
 * `f F h` floor stone, mortar, lit edge, `z` soot, `1 2 3 4` the fire's light on the floor (dim to bright),
 * `q Q` coal and its sheen, `r u` red and blue jar liquid, `a A` quench water and its sparkle.
 */
import { BUNDLED_CREATURE_SPRITES } from '../creature-sprites';
import { expandRows } from '../sprite-data';
import type { SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';

type Pal = Readonly<Record<string, string>>;

/**
 * The furnace's light on the flagstones, four rings from dim (1) to bright (4): `1 2 3 4` lit stone, `5 6 7 8` lit
 * mortar, `9 ! @ #` lit stone edge. By day the two outer rings are the plain floor colours (only the inner two
 * stay warm: a small patch at the mouth). `N M P R` are the outer rings under the window's daylight patch.
 */
const RING_NIGHT: Record<string, string> = {
  '1': '#4a3c58',
  '2': '#6a4658',
  '3': '#9a5a48',
  '4': '#c8743c',
  '5': '#34283e',
  '6': '#4a3040',
  '7': '#6e3c38',
  '8': '#8e4c30',
  '9': '#5e4868',
  '!': '#86546a',
  '@': '#b8704e',
  '#': '#e89048',
};
const RING_DAY: Record<string, string> = {
  '1': '#a8926e',
  '2': '#a8926e',
  '3': '#c89c60',
  '4': '#e0a450',
  '5': '#86724f',
  '6': '#86724f',
  '7': '#a8784a',
  '8': '#c08a3c',
  '9': '#bca680',
  '!': '#bca680',
  '@': '#d8b070',
  '#': '#f0c060',
};

const NIGHT: Pal = {
  k: '#0d0a1a',
  s: '#a8845c',
  S: '#7a5a50',
  L: '#d8bc8c',
  w: '#b07a45',
  W: '#8a5a34',
  V: '#5e3b22',
  i: '#463e66',
  I: '#6e6490',
  j: '#c4bcd8',
  t: '#c0623a',
  T: '#7c3a3c',
  o: '#ff9a2e',
  y: '#ffd966',
  c: '#fff6c8',
  g: '#18204a',
  G: '#10163a',
  m: '#c8d4ff',
  b: '#a8845c',
  B: '#3c3654',
  f: '#3c3654',
  F: '#2a2640',
  h: '#4e4670',
  z: '#1c182e',
  ...RING_NIGHT,
  O: '#ffb05a',
  D: '#2a2640',
  N: '#4a3c58',
  M: '#6a4658',
  P: '#34283e',
  R: '#4a3040',
  q: '#2c2848',
  Q: '#6a6490',
  r: '#d86a6a',
  u: '#5ec8d8',
  a: '#3f95b8',
  A: '#9ae0f0',
  // blueprint paper, its shade and white lines
  '0': '#2f5fa8',
  '-': '#244a86',
  '`': '#eaf2ff',
  // scarf shade, sack and its shade, cat fur, dark fur and belly, green
  ',': '#a84848',
  '|': '#8a7250',
  '}': '#6a563c',
  '(': '#b0703c',
  ')': '#7c4a2e',
  _: '#d8b088',
  '"': '#4e7a52',
  // lantern light on the wall: dim, mid, bright
  '[': '#b8905e',
  ']': '#d0a066',
  '{': '#e8b870',
};

const DAY: Pal = {
  k: '#0d0a1a',
  s: '#dcb97c',
  S: '#b08a56',
  L: '#f2e0ae',
  w: '#c48c52',
  W: '#9c6c3c',
  V: '#6e4628',
  i: '#5a5278',
  I: '#8a82b0',
  j: '#d6d0e6',
  t: '#e4743a',
  T: '#b04a22',
  o: '#ff9a2e',
  y: '#ffd966',
  c: '#fff6c8',
  g: '#7ec0ee',
  G: '#5aa0d8',
  m: '#fbfdff',
  b: '#f8ecbc',
  B: '#ecd49a',
  f: '#a8926e',
  F: '#86724f',
  h: '#bca680',
  z: '#5a4c3c',
  ...RING_DAY,
  O: '#ffb05a',
  D: '#c8b07c',
  N: '#ecd49a',
  M: '#ecd49a',
  P: '#c8b07c',
  R: '#c8b07c',
  q: '#3a3448',
  Q: '#7a7498',
  r: '#d86a6a',
  u: '#5ec8d8',
  a: '#5ec8d8',
  A: '#d8f6fc',
  '0': '#3b6cb8',
  '-': '#2f5a9c',
  '`': '#ffffff',
  ',': '#b85050',
  '|': '#bf9f68',
  '}': '#97784c',
  '(': '#c88444',
  ')': '#92583a',
  _: '#ecc898',
  '"': '#5a9460',
  // by day the lantern's light is the plain wall
  '[': '#dcb97c',
  ']': '#dcb97c',
  '{': '#dcb97c',
};

// ------------------------------------------------------------------ the drawing kit
class Grid {
  readonly cells: string[][];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  }
  px(x: number, y: number, c: string): void {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) (this.cells[y] as string[])[x] = c;
  }
  at(x: number, y: number): string {
    return this.cells[y]?.[x] ?? '.';
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  /** A filled box with an ink outline. */
  box(x: number, y: number, w: number, h: number, fill: string): void {
    this.rect(x, y, w, h, 'k');
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }
  /** Draws a picture; `.` is transparent. */
  stamp(x: number, y: number, rows: readonly string[]): void {
    rows.forEach((row, j) =>
      [...row].forEach((c, i) => {
        if (c !== '.') this.px(x + i, y + j, c);
      }),
    );
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}

/** A sprite from a grid: the night palette of the keys it uses and `day` for the same keys. */
function build(g: Grid | string[]): { sprite: SpriteDef; day: Pal } {
  const rows = Array.isArray(g) ? g : g.rows();
  const used = new Set(rows.join(''));
  const palette: Record<string, string> = {};
  const day: Record<string, string> = {};
  for (const key of used) {
    if (key === '.') continue;
    palette[key] = NIGHT[key] ?? '#ff00ff';
    day[key] = DAY[key] ?? '#ff00ff';
  }
  return { sprite: { palette, rows }, day };
}

const BIG_FLAME = [
  '....o....',
  '....oo...',
  '...ooo...',
  '...oyo...',
  '..ooyoo..',
  '..oyyyo..',
  '.ooyyyoo.',
  '.oyyyyyo.',
  '.oyyccyo.',
  'oyyccccyo',
  'oyccccccy',
  'ooyyyyyoo',
];
const SMALL_FLAME = ['..o..', '.oyo.', '.oyo.', 'oyyyo', 'oycyo', 'ooyoo'];

/** Courses of sandstone blocks 16 wide (so a 128 wide strip tiles), staggered by 8, lit top edge, shade mortar. */
function masonry(g: Grid, x0: number, y0: number, w: number, h: number, course: number): void {
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / course);
    const k = j % course;
    const off = (row % 2) * 8;
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const col = (x - off + 128) % 16;
      let c = 's';
      if (k === course - 1) c = 'S';
      else if (col === 0) c = 'S';
      else if (k === 0 && col < 12) c = 'L';
      g.px(x, y0 + j, c);
    }
  }
}

// ------------------------------------------------------------------ back-wall 128 x 56
function backWall(): Grid {
  const g = new Grid(128, 56);
  masonry(g, 0, 9, 128, 39, 6);
  // the plinth: bigger, darker stones along the floor
  for (let y = 48; y < 55; y++)
    for (let x = 0; x < 128; x++) {
      const j = y - 48;
      const col = (x + 4) % 32;
      let c = j < 2 ? 's' : 'S';
      if (j === 0) c = 'L';
      else if (j === 6) c = 'S';
      else if (col === 0) c = 'k';
      g.px(x, y, c);
    }
  g.rect(0, 55, 128, 1, 'k');
  // the terracotta frieze under the beam: barrel tiles
  for (let x = 0; x < 128; x++) {
    g.px(x, 6, 'k');
    g.px(x, 7, x % 4 === 3 ? 'T' : 't');
    g.px(x, 8, 'T');
  }
  for (let x = 0; x < 128; x++) g.px(x, 6, x % 4 === 3 ? 'k' : 't');
  // the main beam
  g.rect(0, 0, 128, 6, 'k');
  g.rect(0, 1, 128, 2, 'w');
  g.rect(0, 3, 128, 1, 'W');
  g.rect(0, 4, 128, 1, 'V');
  for (const x of [10, 42, 74, 106]) {
    g.px(x, 2, 'i');
    g.px(x + 1, 2, 'k');
  }
  // the two windows: lintel, frame, four panes, sill
  for (const wx of [20, 84]) windowAt(g, wx);
  // timber posts (one crosses the seam: columns 124 to 127 and 0 to 3) with iron bands
  for (const px0 of [60, 124]) post(g, px0);
  return g;
}

function post(g: Grid, x0: number): void {
  const cols = ['k', 'w', 'w', 'W', 'W', 'V', 'V', 'k'];
  for (let y = 5; y < 52; y++) cols.forEach((c, i) => g.px((x0 + i) % 128, y, c));
  for (const y of [14, 34]) {
    for (let i = 0; i < 8; i++) {
      const x = (x0 + i) % 128;
      g.px(x, y, 'k');
      g.px(x, y + 1, i === 0 || i === 7 ? 'k' : 'I');
      g.px(x, y + 2, i === 0 || i === 7 ? 'k' : 'i');
      g.px(x, y + 3, 'k');
    }
    g.px((x0 + 3) % 128, y + 1, 'j');
    g.px((x0 + 4) % 128, y + 2, 'j');
  }
  // the foot: a stone block it stands in
  for (let i = 0; i < 8; i++) g.px((x0 + i) % 128, 51, 'k');
}

function windowAt(g: Grid, wx: number): void {
  // lintel
  g.rect(wx - 2, 9, 28, 4, 'k');
  g.rect(wx - 1, 10, 26, 1, 'w');
  g.rect(wx - 1, 11, 26, 1, 'W');
  // opening, frame and glass
  g.rect(wx, 13, 24, 22, 'k');
  g.rect(wx + 1, 14, 22, 20, 'W');
  g.rect(wx + 2, 15, 20, 18, 'g');
  g.rect(wx + 2, 28, 20, 5, 'G');
  g.rect(wx + 11, 15, 2, 18, 'W');
  g.rect(wx + 2, 23, 20, 2, 'W');
  g.rect(wx + 2, 15, 20, 1, 'V');
  // the glint: a small bright diagonal on each of two panes
  for (const [dx, dy] of [
    [4, 17],
    [5, 18],
    [6, 19],
    [15, 26],
    [16, 27],
  ] as const)
    g.px(wx + dx, dy, 'm');
  // sill, a stone that sticks out
  g.rect(wx - 2, 35, 28, 5, 'k');
  g.rect(wx - 1, 36, 26, 1, 'L');
  g.rect(wx - 1, 37, 26, 1, 's');
  g.rect(wx - 1, 38, 26, 1, 'S');
  // daylight falling on the wall below the sill (a slanted patch; the same colour as the wall at night)
  for (let j = 0; j < 8; j++) {
    const y = 40 + j;
    const sx = wx + 1 + Math.floor(j / 2) * 2;
    for (let i = 0; i < 16; i++) {
      const c = g.at(sx + i, y);
      if (c === 's' || c === 'L') g.px(sx + i, y, 'b');
    }
  }
}

// ------------------------------------------------------------------ furnace 48 x 56
function furnace(): Grid {
  const g = new Grid(48, 52);
  // the chimney stack (drawn first; the hood covers its foot)
  g.rect(16, 3, 16, 12, 'k');
  g.rect(17, 3, 14, 12, 's');
  for (let y = 3; y < 14; y++) {
    if ((y - 3) % 4 === 3) g.rect(17, y, 14, 1, 'S');
    else for (let x = 17 + (((y - 3) >> 2) % 2) * 4 + 3; x < 31; x += 8) g.px(x, y, 'S');
  }
  g.rect(17, 3, 2, 11, 'L');
  g.rect(14, 0, 20, 4, 'k');
  g.rect(15, 1, 18, 1, 'L');
  g.rect(15, 2, 18, 1, 's');
  g.rect(15, 3, 18, 1, 'S');
  // the hood: a terracotta tiled breast widening to the body
  for (let y = 12; y <= 23; y++) {
    const grow = Math.round(((y - 12) * 9) / 11);
    const l = 15 - grow;
    const r = 32 + grow;
    for (let x = l; x <= r; x++) {
      let c = 't';
      if ((y - 12) % 3 === 2) c = 'T';
      else if ((y - 12) % 3 === 1 && (x + ((y - 12) >> 1)) % 4 === 0) c = 'T';
      g.px(x, y, c);
    }
    g.px(l, y, 'k');
    g.px(r, y, 'k');
  }
  g.rect(15, 11, 18, 1, 'k');
  // the body: sandstone courses between ink edges
  g.rect(6, 24, 36, 28, 'k');
  for (let y = 25; y < 51; y++) {
    const j = y - 25;
    for (let x = 7; x < 41; x++) {
      let c = 's';
      if (j % 5 === 4) c = 'S';
      else if ((x + ((j / 5) | 0) * 6) % 12 === 0) c = 'S';
      else if (j % 5 === 0 && (x + ((j / 5) | 0) * 6) % 12 < 9) c = 'L';
      g.px(x, y, c);
    }
  }
  // the iron band round the top of the body
  g.rect(6, 25, 36, 4, 'k');
  g.rect(7, 25, 34, 1, 'I');
  g.rect(7, 26, 34, 2, 'i');
  for (let x = 9; x < 41; x += 6) g.px(x, 26, 'j');
  // the mouth: an arch; ink inside, a ring of light stones round it
  const edge = (y: number): [number, number] =>
    y <= 32 ? [19, 28] : y === 33 ? [17, 30] : y === 34 ? [16, 31] : y === 35 ? [15, 32] : [14, 33];
  for (let y = 29; y < 51; y++)
    for (let x = 7; x < 41; x++) {
      // distance to the opening (Chebyshev)
      let d = 9;
      for (let yy = Math.max(32, y - 3); yy <= Math.min(50, y + 3); yy++) {
        const [a, b] = edge(yy);
        const dx = x < a ? a - x : x > b ? x - b : 0;
        d = Math.min(d, Math.max(dx, Math.abs(yy - y)));
      }
      if (d === 0) g.px(x, y, 'k');
      else if (d === 1) g.px(x, y, 'k');
      else if (d <= 3 && y >= 29) g.px(x, y, (x * 3 + y) % 7 === 0 ? 'S' : d === 2 ? 'L' : 's');
    }
  // the hearth floor and the fire
  g.rect(14, 49, 20, 2, 'o');
  for (let x = 14; x < 34; x += 3) g.px(x, 49, 'y');
  g.stamp(19, 38, BIG_FLAME);
  g.stamp(26, 42, SMALL_FLAME);
  g.stamp(14, 43, SMALL_FLAME);
  g.stamp(23, 37, ['.', 'o']);
  g.rect(14, 48, 20, 1, 'o');
  g.stamp(19, 47, ['..yy..yy.yy.yy', '.oyyyoyyoyyyoy']);
  // the hearth slab and the base
  g.rect(6, 50, 36, 1, 'k');
  g.rect(7, 50, 34, 1, 'S');
  g.rect(5, 51, 38, 1, 'k');
  // sparks leaving the fire
  for (const [x, y] of [
    [16, 33],
    [31, 35],
    [24, 34],
  ] as const)
    g.px(x, y, 'y');
  return g;
}

// ------------------------------------------------------------------ shelf 32 x 16, tool-rack 32 x 24
const JAR = [
  '..kkk..',
  '..kWk..',
  '.kkkkk.',
  'kmXXXXk',
  'kmXXXXk',
  'kXXXXXk',
  'kXXXXXk',
  'kXXXXXk',
  '.kkkkk.',
];
const jar = (fill: string): string[] => JAR.map((r) => r.replaceAll('X', fill));

function ingot(g: Grid, x: number, y: number, fill: string, lit: string): void {
  g.rect(x, y, 8, 4, 'k');
  g.rect(x + 1, y + 1, 6, 2, fill);
  g.rect(x + 1, y + 1, 6, 1, lit);
}

function shelf(): Grid {
  const g = new Grid(32, 16);
  g.stamp(1, 1, jar('r'));
  g.stamp(9, 0, jar('u'));
  // ingots: two below, one on top, a gold one beside
  ingot(g, 17, 7, 'I', 'j');
  ingot(g, 24, 7, 'I', 'j');
  ingot(g, 20, 4, 'y', 'c');
  // the plank, with brackets
  g.rect(0, 11, 32, 1, 'k');
  g.rect(0, 12, 32, 1, 'w');
  g.rect(0, 13, 32, 1, 'W');
  g.rect(0, 14, 32, 1, 'k');
  g.rect(0, 12, 1, 3, 'k');
  g.rect(31, 12, 1, 3, 'k');
  g.stamp(4, 15, ['kVVk']);
  g.stamp(24, 15, ['kVVk']);
  return g;
}

function toolRack(): Grid {
  const g = new Grid(32, 24);
  g.box(0, 0, 32, 24, 'V');
  g.rect(10, 1, 1, 22, 'W');
  g.rect(21, 1, 1, 22, 'W');
  g.rect(1, 1, 30, 2, 'w');
  g.rect(1, 3, 30, 1, 'W');
  g.rect(1, 20, 30, 2, 'w');
  g.rect(1, 22, 30, 1, 'W');
  // a hammer: handle hung from a peg, heavy head at the bottom
  g.rect(5, 4, 3, 9, 'k');
  g.rect(6, 4, 1, 9, 'w');
  g.rect(2, 12, 9, 6, 'k');
  g.rect(3, 13, 7, 4, 'I');
  g.rect(3, 13, 7, 1, 'j');
  g.rect(3, 16, 7, 1, 'i');
  // tongs: two long arms crossing at a pivot, jaws open at the bottom
  g.stamp(14, 4, [
    'kI..Ik',
    'kI..Ik',
    '.kIIk.',
    '..kjk.',
    '.kIIk.',
    '.kIIk.',
    '.kIIk.',
    '.kIIk.',
    '.kIIk.',
    '.kIIk.',
    '.kIIk.',
    'kIkkIk',
    'kk..kk',
  ]);
  // a file and a small hammer on the right
  g.rect(24, 4, 4, 3, 'k');
  g.rect(25, 5, 2, 1, 'w');
  g.rect(24, 7, 4, 11, 'k');
  g.rect(25, 7, 2, 10, 'I');
  g.rect(25, 7, 1, 10, 'j');
  for (let y = 9; y < 17; y += 2) g.px(26, y, 'i');
  g.rect(28, 12, 3, 6, 'k');
  g.rect(29, 13, 1, 4, 'w');
  g.rect(27, 5, 4, 3, 'k');
  g.rect(28, 6, 2, 1, 'j');
  return g;
}

// ------------------------------------------------------------------ workbench 32 x 20
function workbench(): Grid {
  const g = new Grid(32, 20);
  // the top edge (rows 0 to 3) stays clear for a creature behind it, except a vise at one end and ingots at the other
  g.rect(1, 1, 5, 3, 'k');
  g.rect(2, 2, 3, 1, 'I');
  g.rect(2, 1, 3, 1, 'j');
  g.rect(3, 3, 1, 1, 'i');
  g.stamp(26, 2, ['kkkkkk', 'kjIIIk']);
  g.stamp(27, 0, ['kkkkk', 'kyyyk']);
  g.stamp(27, 1, ['kccck']);
  g.rect(0, 4, 32, 1, 'k');
  g.rect(0, 5, 32, 2, 'w');
  g.rect(0, 7, 32, 1, 'W');
  g.rect(0, 8, 32, 1, 'k');
  // the front board and the legs
  for (const x of [9, 16, 23]) g.rect(x, 10, 1, 5, 'V');
  g.rect(2, 15, 28, 1, 'V');
  g.rect(1, 9, 1, 11, 'k');
  g.rect(30, 9, 1, 11, 'k');
  g.rect(2, 16, 28, 1, 'k');
  g.rect(2, 9, 28, 1, 'k');
  for (const x of [9, 16, 23]) g.rect(x, 11, 1, 4, 'V');
  g.rect(3, 11, 6, 4, 'W');
  g.rect(10, 11, 6, 4, 'W');
  g.rect(17, 11, 6, 4, 'W');
  g.rect(24, 11, 6, 4, 'W');
  g.rect(3, 11, 26, 1, 'w');
  g.rect(2, 15, 28, 1, 'k');
  for (const x of [0, 29]) {
    g.rect(x, 8, 3, 12, 'k');
    g.rect(x + 1, 9, 1, 10, 'V');
  }
  // a low shelf between the legs: coal and an ingot
  g.rect(3, 16, 26, 1, 'k');
  g.rect(3, 17, 26, 1, 'W');
  g.rect(3, 18, 26, 1, 'k');
  g.stamp(6, 15, ['.kkk.', 'kqQqk']);
  g.stamp(20, 15, ['kkkkkk']);
  g.rect(3, 12, 1, 1, 'w');
  // soot under it
  g.rect(3, 19, 26, 1, 'z');
  return g;
}

// ------------------------------------------------------------------ floor 16 x 16 (tiles both ways)
function floor(): Grid {
  const g = new Grid(16, 16);
  // two courses of flagstones, joints staggered; the join at x 0 / 16 and y 0 / 16 repeats
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const course = y < 8 ? 0 : 1;
      const row = y % 8;
      const joint = course === 0 ? [0, 10] : [5, 13];
      let c = 'f';
      if (row === 7) c = 'F';
      else if (joint.includes(x)) c = 'F';
      else if (row === 0) c = 'h';
      else if (joint.includes((x + 15) % 16) && row < 5) c = 'h';
      g.px(x, y, c);
    }
  // soot and cracks
  for (const [x, y] of [
    [3, 3],
    [4, 3],
    [12, 5],
    [8, 11],
    [9, 11],
    [9, 12],
    [2, 13],
    [14, 10],
  ] as const)
    g.px(x, y, 'z');
  return g;
}

// ------------------------------------------------------------------ furnace-glow 128 x 40 (a floor overlay)
/**
 * The furnace's light lying on the flagstones: stepped, dithered rings, brightest at the mouth, reaching across
 * the front third of the floor and fading to the right. The overlay carries the floor's own flagstone pattern in
 * lit colours, so it sits on the floor tiles' grid (its origin on a tile corner). By day the two outer rings are
 * the plain floor colours, so only a smaller warm patch at the mouth shows.
 */
function furnaceGlow(): Grid {
  const g = new Grid(128, 40);
  const tile = floor().rows();
  const cx = 25;
  const cy = 6;
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 128; x++) {
      const rx = x < cx ? 26 : 104;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / 38) ** 2;
      const odd = (x + y) % 2 === 1;
      let ring = 0;
      if (d < 0.045 || (d < 0.075 && !odd)) ring = 4;
      else if (d < 0.16 || (d < 0.22 && !odd)) ring = 3;
      else if (d < 0.45 || (d < 0.53 && !odd)) ring = 2;
      else if (d < 0.82 || (d < 0.92 && !odd)) ring = 1;
      if (ring === 0) continue;
      const t = (tile[y % 16] as string)[x % 16] as string;
      if (t === 'z') g.px(x, y, 'z');
      else {
        const set = t === 'F' ? '5678' : t === 'h' ? '9!@#' : '1234';
        g.px(x, y, set[ring - 1] as string);
      }
    }
  return g;
}

// ------------------------------------------------------------------ props
function barrel(): Grid {
  const g = new Grid(12, 16);
  const half = [4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4];
  half.forEach((h, y) => {
    for (let x = 6 - h; x < 6 + h; x++) {
      const e = x === 6 - h || x === 5 + h || y === 0 || y === 15;
      const rel = x - (6 - h);
      let c = rel < h * 0.5 ? 'w' : rel < h * 1.4 ? 'W' : 'V';
      if (!e && (x === 2 || x === 6 || x === 9)) c = 'V';
      g.px(x, y, e ? 'k' : c);
    }
  });
  // the lid's rim
  g.rect(3, 1, 6, 1, 'w');
  // two iron hoops
  for (const y of [4, 11]) {
    const h = half[y] ?? 6;
    for (let x = 6 - h; x < 6 + h; x++) {
      g.px(x, y, x === 6 - h || x === 5 + h ? 'k' : 'I');
      g.px(x, y + 1, x === 6 - h || x === 5 + h ? 'k' : 'i');
    }
  }
  g.px(4, 4, 'j');
  g.px(5, 4, 'j');
  g.px(4, 11, 'j');
  g.px(5, 11, 'j');
  return g;
}

function quenchTrough(): Grid {
  const g = new Grid(24, 12);
  g.rect(1, 0, 22, 1, 'k');
  g.rect(0, 1, 24, 3, 'k');
  g.rect(1, 1, 22, 1, 'w');
  g.rect(2, 2, 20, 2, 'a');
  for (const x of [5, 6, 13, 17, 18]) g.px(x, 2, 'A');
  g.px(9, 3, 'A');
  g.rect(0, 4, 24, 7, 'k');
  g.rect(1, 4, 22, 6, 'W');
  g.rect(1, 4, 22, 1, 'w');
  for (const x of [8, 15]) g.rect(x, 5, 1, 5, 'V');
  for (const x of [3, 20]) {
    g.rect(x, 4, 2, 6, 'i');
    g.rect(x, 4, 1, 6, 'I');
  }
  g.rect(1, 9, 22, 1, 'V');
  g.rect(1, 11, 4, 1, 'k');
  g.rect(19, 11, 4, 1, 'k');
  g.rect(2, 10, 3, 1, 'V');
  g.rect(19, 10, 3, 1, 'V');
  return g;
}

function hangingTools(): Grid {
  const g = new Grid(24, 16);
  // a short timber with three hooks; it is nailed to the beam above
  g.rect(0, 0, 24, 3, 'k');
  g.rect(1, 0, 22, 1, 'w');
  g.rect(1, 1, 22, 1, 'W');
  g.px(3, 1, 'i');
  g.px(20, 1, 'i');
  // tongs
  g.stamp(3, 3, [
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
    'kIk',
  ]);
  g.px(4, 3, 'i');
  g.stamp(2, 14, ['kI.Ik', '.kkk.']);
  // a hammer: handle then a heavy head
  g.rect(10, 3, 3, 8, 'k');
  g.rect(11, 3, 1, 8, 'w');
  g.rect(8, 10, 8, 5, 'k');
  g.rect(9, 11, 6, 3, 'I');
  g.rect(9, 11, 6, 1, 'j');
  // a ladle: a long handle and a round bowl
  g.rect(19, 3, 3, 7, 'k');
  g.rect(20, 3, 1, 7, 'I');
  g.stamp(17, 9, ['.kkkkk.', 'kiiIiik', 'kiiiiik', '.kiiik.', '..kkk..']);
  return g;
}

function coalHeap(): Grid {
  const g = new Grid(16, 10);
  const half = [2, 3, 4, 5, 6, 7, 7, 8, 8, 8];
  half.forEach((h, i) => {
    const y = i;
    for (let x = 8 - h; x < 8 + h; x++) {
      const e = x === 8 - h || x === 7 + h || y === 9;
      g.px(x, y, e ? 'k' : 'q');
    }
  });
  g.rect(8 - 8, 9, 16, 1, 'k');
  // lumps with a lit corner, and two embers
  for (const [x, y] of [
    [6, 3],
    [8, 2],
    [4, 5],
    [10, 5],
    [7, 6],
    [12, 7],
    [3, 8],
    [9, 8],
  ] as const) {
    g.px(x, y, 'Q');
    g.px(x + 1, y, 'q');
  }
  g.px(9, 4, 'o');
  g.px(5, 7, 'o');
  g.px(11, 6, 'y');
  return g;
}

// ------------------------------------------------------------------ the clickable props (bold: ink outline, lit edges, a glint)
/** The way out: a plank door with iron strap hinges and a ring handle, in a timber frame on a stone step. 20 x 32. */
function door(): Grid {
  const g = new Grid(20, 32);
  g.rect(0, 0, 20, 32, 'k');
  // the timber frame: posts and a lintel, lit on the top and the left
  g.rect(1, 1, 18, 30, 'W');
  g.rect(1, 1, 18, 1, 'w');
  g.rect(1, 1, 1, 30, 'w');
  g.rect(18, 2, 1, 29, 'V');
  // the leaf: four planks with dark seams
  g.rect(3, 3, 14, 27, 'k');
  for (let y = 4; y < 30; y++)
    for (let x = 4; x < 16; x++) {
      const col = x - 4;
      let c = col % 3 === 2 ? 'V' : col < 3 ? 'w' : 'W';
      if (y === 4) c = col % 3 === 2 ? 'V' : 'w';
      g.px(x, y, c);
    }
  for (const [x, y] of [
    [5, 12],
    [6, 13],
    [9, 20],
    [12, 9],
    [13, 25],
    [8, 27],
  ] as const)
    g.px(x, y, 'V');
  // two iron straps from the hinge side, each with a lit edge and nail heads
  for (const y of [7, 23]) {
    g.rect(4, y, 9, 3, 'k');
    g.rect(4, y, 8, 1, 'I');
    g.rect(4, y + 1, 8, 1, 'i');
    g.px(5, y, 'j');
    g.px(9, y, 'j');
    g.px(4, y + 1, 'j');
  }
  // the ring handle and its plate on the right
  g.rect(12, 15, 3, 6, 'k');
  g.rect(13, 16, 1, 4, 'i');
  g.px(13, 16, 'I');
  g.stamp(12, 19, ['kIIk', 'kjjk', '.kk.']);
  // the stone step
  g.rect(1, 30, 18, 2, 'k');
  g.rect(2, 30, 16, 1, 'L');
  return g;
}

/** A woven mat in front of the door. 20 x 4. */
function doorMat(): Grid {
  const g = new Grid(20, 4);
  g.rect(1, 0, 18, 1, 'k');
  g.rect(0, 1, 20, 2, 'k');
  g.rect(1, 1, 18, 1, 't');
  for (let x = 1; x < 19; x += 2) g.px(x, 2, 'T');
  for (let x = 2; x < 19; x += 2) g.px(x, 2, 'L');
  g.rect(1, 3, 18, 1, 'k');
  for (const x of [0, 19]) g.px(x, 3, 'T');
  return g;
}

/** A drafting table: a board with blue plans pinned to it, a pencil on the paper, trestle legs. 24 x 24. */
function plansBoard(): Grid {
  const g = new Grid(24, 24);
  // the board and its frame
  g.rect(0, 0, 24, 15, 'k');
  g.rect(1, 1, 22, 13, 'W');
  g.rect(1, 1, 22, 1, 'w');
  g.rect(1, 13, 22, 1, 'V');
  // the paper: blue, with white lines
  g.rect(2, 2, 20, 11, '0');
  g.rect(2, 12, 20, 1, '-');
  g.rect(21, 2, 1, 11, '-');
  // a helmet's plan (left): a dome over a base line, with a dimension line under it
  g.stamp(3, 3, ['...````...', '..`....`..', '.`......`.', '`........`', '``````````']);
  g.rect(3, 10, 9, 1, '`');
  g.rect(3, 9, 1, 3, '`');
  g.rect(11, 9, 1, 3, '`');
  // a ruled grid (right)
  for (let x = 14; x < 21; x += 2) g.rect(x, 3, 1, 9, '`');
  for (let y = 4; y < 12; y += 3) g.rect(14, y, 7, 1, '`');
  // pins and a pencil
  g.px(2, 2, 'r');
  g.px(21, 2, 'r');
  g.stamp(16, 10, ['..yk', '.yy.', 'kk..']);
  // trestle legs and a cross bar
  for (let y = 15; y < 24; y++) {
    const lx = 3 - Math.floor((y - 15) / 4);
    const rx = 17 + Math.floor((y - 15) / 4);
    g.px(lx, y, 'k');
    g.px(lx + 1, y, 'W');
    g.px(lx + 2, y, 'k');
    g.px(rx, y, 'k');
    g.px(rx + 1, y, 'W');
    g.px(rx + 2, y, 'k');
  }
  g.rect(3, 19, 18, 3, 'k');
  g.rect(4, 19, 16, 1, 'W');
  g.rect(4, 20, 16, 1, 'V');
  // a rolled plan lying on the bar
  g.rect(8, 16, 8, 4, 'k');
  g.rect(9, 16, 6, 2, '`');
  g.rect(9, 17, 6, 1, '0');
  g.px(12, 17, 'r');
  return g;
}

/** An open crate of finished gear: a helmet, a charm on a ring and a scarf over the side. 20 x 16. */
function finishedCrate(): Grid {
  const g = new Grid(20, 16);
  // the helmet, brim to the front
  g.stamp(1, 0, ['..kkkk..', '.kIIjjk.', 'kIIIjIIk', 'kIiIIIik', 'kjjjjjjk']);
  // the charm: a cyan gem on a gold ring, with a glint
  g.stamp(9, 2, ['.kkk.', 'kyuyk', 'kyuyk', '.kyk.']);
  g.px(14, 1, 'c');
  g.px(13, 0, 'c');
  g.px(7, 1, 'c');
  // the scarf's top, bunched at the right rim
  g.stamp(
    14,
    3,
    ['.kkkk', 'krrr,k', 'k,rrrk'].map((r) => r.slice(0, 6)),
  );
  // the crate
  g.rect(0, 5, 20, 11, 'k');
  g.rect(1, 6, 18, 9, 'W');
  g.rect(1, 6, 18, 1, 'w');
  g.rect(1, 9, 18, 1, 'V');
  g.rect(1, 12, 18, 1, 'V');
  g.rect(1, 6, 1, 9, 'V');
  g.rect(18, 6, 1, 9, 'V');
  g.px(1, 7, 'w');
  for (const [x, y] of [
    [3, 7],
    [16, 7],
    [3, 13],
    [16, 13],
  ] as const)
    g.px(x, y, 'j');
  // the scarf's end hangs over the front, striped, with a fringe
  g.rect(13, 6, 5, 8, 'k');
  g.rect(14, 6, 3, 7, 'r');
  for (const y of [8, 10, 12]) g.rect(14, y, 3, 1, ',');
  g.stamp(14, 13, ['y.y']);
  return g;
}

// ------------------------------------------------------------------ edge dressing (quiet: soft outline, mid tones, no glint)
/** A drawn grid recoloured quietly: the ink becomes the soot colour, the lit tones step down, glints go dull. */
function quiet(g: Grid): Grid {
  const map: Record<string, string> = { k: 'z', w: 'W', L: 's', j: 'i', I: 'i', c: 'y', m: 'g' };
  const q = new Grid(g.w, g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const c = g.at(x, y);
      if (c !== '.') q.px(x, y, map[c] ?? c);
    }
  return q;
}

/** Two barrels in front and one behind them. 24 x 24. */
function barrelStack(): Grid {
  const g = new Grid(24, 24);
  const b = barrel().rows();
  g.stamp(6, 0, b);
  g.stamp(0, 8, b);
  g.stamp(12, 8, b);
  return quiet(g);
}

/** Three burlap sacks, tied at the neck: two on the floor and one on top. 18 x 13. */
function sacks(): Grid {
  const sack = [
    '...zzz...',
    '..z|||z..',
    '...z}z...',
    '..z|||z..',
    '.z||||}z.',
    'z||||||}z',
    'z||||||}z',
    'z|||||}}z',
    '.z}}}}}z.',
    '..zzzzz..',
  ];
  const g = new Grid(18, 13);
  g.stamp(4, 0, sack);
  g.stamp(0, 3, sack);
  g.stamp(9, 3, sack);
  // a patch on each front sack
  g.px(3, 8, 'W');
  g.px(4, 8, 'W');
  g.px(13, 7, 'W');
  g.px(14, 7, 'W');
  return g;
}

/** A free standing rack with hats on its upper pegs and scarves on the lower bar. 22 x 26. */
function gearRack(): Grid {
  const g = new Grid(22, 26);
  // uprights and feet
  for (const x of [0, 19]) {
    g.rect(x, 0, 3, 25, 'z');
    g.rect(x + 1, 1, 1, 23, 'V');
  }
  g.rect(0, 24, 5, 2, 'z');
  g.rect(17, 24, 5, 2, 'z');
  // top bar and the peg bar
  g.rect(0, 0, 22, 3, 'z');
  g.rect(1, 1, 20, 1, 'W');
  g.rect(0, 10, 22, 2, 'z');
  g.rect(1, 10, 20, 1, 'W');
  // hats on pegs: a blue one, a red one and a green one
  g.stamp(3, 3, ['.zzz.', 'ziiiz', 'ziiiz', 'zzzzz']);
  g.stamp(9, 3, ['.zzz.', 'zSSSz', 'zSSSz', 'zzzzz']);
  g.stamp(15, 3, ['.zzz.', 'z"""z', 'z"""z', 'zzzzz']);
  // scarves hanging from the lower bar, striped, fringed
  const scarf = (x: number, c: string): void => {
    for (let y = 12; y < 21; y++) {
      g.px(x, y, 'z');
      g.px(x + 4, y, 'z');
      for (let i = 1; i < 4; i++) g.px(x + i, y, y % 3 === 0 ? 'W' : c);
    }
    g.stamp(x, 21, ['zzzzz', 'z.z.z']);
  };
  scarf(3, 'S');
  scarf(9, '"');
  scarf(15, 'i');
  return g;
}

/** A worn woven rug, a fixed oval with a border, a band and a diamond pattern. 48 x 16. */
function rug(): Grid {
  const g = new Grid(48, 16);
  const inside = (x: number, y: number): boolean => {
    const dx = (x - 23.5) / 24;
    const dy = (y - 7.5) / 8;
    return dx * dx + dy * dy <= 1;
  };
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 48; x++) {
      if (!inside(x, y)) continue;
      const dx = (x - 23.5) / 24;
      const dy = (y - 7.5) / 8;
      const d = dx * dx + dy * dy;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let c = 't';
      if (edge) c = 'z';
      else if (d > 0.72) c = 'T';
      else if (d > 0.6) c = 'S';
      else if (((Math.abs(x - 24) >> 1) + Math.abs(y - 8)) % 4 === 0) c = 'T';
      else if ((x * 7 + y * 13) % 17 === 0) c = 'S';
      g.px(x, y, c);
    }
  return g;
}

/** A lantern on a chain from the beam, with the warm stepped light it throws on the wall below. 24 x 40. */
function lanternHanging(): Grid {
  const g = new Grid(24, 40);
  // the light first (dithered, so the wall's stones still show through), then the lantern over it
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 24; x++) {
      const dx = (x - 11.5) / 12;
      const dy = (y - 14) / 24;
      const d = dx * dx + dy * dy;
      const even = (x + y) % 2 === 0;
      if (d < 0.1 && even) g.px(x, y, '{');
      else if (d < 0.32 && even) g.px(x, y, ']');
      else if (d < 0.8 && x % 2 === 0 && y % 2 === 0) g.px(x, y, '[');
    }
  // the chain
  for (let y = 0; y < 9; y++) {
    g.px(11, y, y % 2 === 0 ? 'I' : 'k');
    g.px(12, y, y % 2 === 0 ? 'k' : 'i');
  }
  // the lantern: cap, lit glass, base
  g.stamp(8, 9, [
    '..kkkk..',
    '.kIIIIk.',
    'kiiiiiik',
    'koyyyyok',
    'koyccyok',
    'koyccyok',
    'koyyyyok',
    'kiiiiiik',
    '.kIIIIk.',
    '..kkkk..',
  ]);
  return g;
}

/** A second, narrower window for the side wall, to repeat along it. 12 x 31 (lintel 4, opening 22, sill 5). */
function window2(): Grid {
  const w = 12;
  const g = new Grid(w, 31);
  g.rect(0, 0, w, 4, 'k');
  g.rect(1, 1, w - 2, 1, 'w');
  g.rect(1, 2, w - 2, 1, 'W');
  g.rect(1, 4, w - 2, 22, 'k');
  g.rect(2, 5, w - 4, 20, 'W');
  g.rect(3, 6, w - 6, 18, 'g');
  g.rect(3, 19, w - 6, 5, 'G');
  g.rect(3, 13, w - 6, 2, 'W');
  g.rect(3, 6, w - 6, 1, 'V');
  for (const [x, y] of [
    [4, 8],
    [5, 9],
    [6, 10],
    [5, 17],
  ] as const)
    g.px(x, y, 'm');
  g.rect(0, 26, w, 5, 'k');
  g.rect(1, 27, w - 2, 1, 'L');
  g.rect(1, 28, w - 2, 1, 's');
  g.rect(1, 29, w - 2, 1, 'S');
  return g;
}

/** Split logs stacked in a pyramid, end grain to the front. 28 x 19. */
function woodpile(): Grid {
  const g = new Grid(28, 19);
  const log = ['..zzz..', '.zsssz.', 'zssVssz', 'zsVsVsz', 'zssVssz', '.zsssz.', '..zzz..'];
  for (const x of [7, 14]) g.stamp(x, 0, log);
  for (const x of [3, 10, 17]) g.stamp(x, 6, log);
  for (const x of [0, 7, 14, 21]) g.stamp(x, 12, log);
  return g;
}

/** A small cat curled up asleep, head on its paws at the left, tail round the front. 12 x 8. */
function cat(): Grid {
  const g = new Grid(12, 8);
  g.stamp(0, 0, [
    '..z.z.......',
    '.z(z(zzzz...',
    'z((((((((zz.',
    'z(zz(()))))z',
    'zz((((((()z.',
    'z____((()))z',
    '.z_____)))z.',
    '..zzzzzzzz..',
  ]);
  return g;
}

/** A wooden bucket with an iron hoop. 10 x 10. */
function bucket(): Grid {
  const g = new Grid(10, 10);
  g.stamp(0, 0, [
    '.zz....zz.',
    'z..zzzz..z',
    'zzzzzzzzzz',
    'zWWWWWWWWz',
    'ziiiiiiiiz',
    '.zWWWWWWz.',
    '.zWVWWVWz.',
    '.ziiiiiiz.',
    '.zVVVVVVz.',
    '..zzzzzz..',
  ]);
  return g;
}

/** The chest (`CHEST_PROP` in `valley/forge-props.ts`, the bag) copied rect for rect for the preview, in the room's keys. */
function chestProp(): Grid {
  const g = new Grid(16, 16);
  g.rect(1, 8, 14, 8, 'k');
  g.rect(2, 9, 12, 6, 'V');
  g.rect(2, 9, 12, 1, 'W');
  g.rect(2, 12, 12, 1, 'V');
  g.rect(7, 9, 2, 3, 'y');
  g.rect(1, 3, 14, 6, 'k');
  g.rect(2, 4, 12, 4, 'W');
  g.rect(2, 4, 12, 1, 'w');
  g.rect(7, 6, 2, 3, 'y');
  return g;
}

/**
 * The Forge's anvil prop (`ANVIL_PROP` in `valley/forge-props.ts`), copied rect for rect: the studio runs concept
 * files with Node's type stripping, which cannot load `games/art/pixel.ts` that file imports.
 */
const ANVIL_PROP: SpriteDef = (() => {
  const g = new Grid(16, 16);
  g.rect(0, 5, 15, 1, 'k');
  g.rect(1, 6, 14, 3, 'k');
  g.rect(2, 6, 12, 2, 'b');
  g.rect(2, 6, 12, 1, 'a');
  g.rect(0, 6, 2, 1, 'k');
  g.rect(5, 9, 6, 3, 'k');
  g.rect(6, 9, 4, 3, 'c');
  g.rect(3, 12, 10, 1, 'k');
  g.rect(3, 13, 10, 2, 'k');
  g.rect(4, 13, 8, 1, 'c');
  g.rect(2, 15, 12, 1, 'k');
  return {
    rows: g.rows(),
    palette: { a: '#c4bcd8', b: '#6e6490', c: '#463e66', k: '#0d0a1a' },
  };
})();

// ------------------------------------------------------------------ preview 128 x 96, composed from the pieces
/** Characters the borrowed creature palettes are renamed to, so they never clash with the room's keys. */
const BORROWED = 'delnpvxCEHJKUXYZ$%^&*+=?<>~;:/';

interface Borrowed {
  rows: string[];
  night: Record<string, string>;
}

/** A shipped sprite with its palette keys renamed to unused characters (the ink stays `k`). */
function borrow(
  def: SpriteDef,
  pool: { next: number },
  keep: Readonly<Record<string, string>>,
): Borrowed {
  const rows = expandRows(def);
  const rename = new Map<string, string>();
  const night: Record<string, string> = {};
  for (const [key, colour] of Object.entries(def.palette)) {
    if (key === 'k') {
      rename.set(key, 'k');
      continue;
    }
    const kept = keep[key];
    if (kept !== undefined) {
      rename.set(key, kept);
      continue;
    }
    const to = BORROWED[pool.next++] ?? '?';
    rename.set(key, to);
    night[to] = colour;
  }
  return { rows: rows.map((r) => [...r].map((c) => rename.get(c) ?? c).join('')), night };
}

/** Draws a piece onto the room: `.` is transparent. */
function put(room: Grid, x: number, y: number, rows: readonly string[]): void {
  room.stamp(x, y, rows);
}

/** The room's size on a phone, and where the back wall ends and the floor begins. */
const ROOM_W = 128;
const ROOM_H = 176;
const FLOOR_TOP = 56;

/** The layout, as the notes say: [x, y] of each piece's top-left. */
const LAYOUT = {
  // on the wall
  window2: [46, 9],
  shelf: [56, 24],
  lantern: [79, 6],
  hangingTools: [98, 6],
  door: [98, 26],
  doorMat: [98, 58],
  furnace: [2, 11],
  // the floor, back to front
  benchA: [60, 52],
  benchB: [96, 82],
  coal: [6, 66],
  cat: [32, 66],
  anvilA: [24, 86],
  anvilB: [66, 86],
  chest: [6, 110],
  plans: [36, 106],
  crate: [74, 112],
  trough: [98, 110],
  woodpile: [2, 136],
  rug: [40, 146],
  barrelStack: [100, 124],
  gearRack: [102, 150],
  sacks: [4, 160],
  bucket: [30, 164],
} as const;

interface Composed {
  rows: string[];
  night: Record<string, string>;
  day: Record<string, string>;
}

/** Firelight on the fire side (left) of a prop: its leftmost body pixel on each row from `y0` to `y1` turns warm. */
function warmLeft(room: Grid, x0: number, y0: number, y1: number, w: number): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x0 + w; x++) {
      const c = room.at(x, y);
      if (c === '.' || c === 'k') continue;
      if (room.at(x - 1, y) === 'k' || room.at(x - 1, y) === '.') room.px(x, y, 'O');
      break;
    }
}

function composePreview(): Composed {
  const room = new Grid(ROOM_W, ROOM_H);
  // the back wall, moved 40 right so the furnace hides one window and the other stays in view
  const wall = backWall()
    .rows()
    .map((r) => r.slice(88) + r.slice(0, 88));
  put(room, 0, 0, wall);
  // the floor, from y 56 to the bottom edge, with daylight under the window (x 60 to 83) falling on it
  const tile = floor().rows();
  for (let y = FLOOR_TOP; y < ROOM_H; y++)
    for (let x = 0; x < ROOM_W; x++)
      room.px(x, y, (tile[(y - FLOOR_TOP) % 16] as string)[x % 16] as string);
  room.stamp(0, FLOOR_TOP, furnaceGlow().rows());
  const PATCH: Record<string, string> = {
    f: 'B',
    h: 'B',
    F: 'D',
    '1': 'N',
    '2': 'M',
    '5': 'P',
    '6': 'R',
    '9': 'N',
    '!': 'M',
  };
  for (let y = 57; y < 125; y++) {
    const sx = 64 - Math.floor((y - 57) / 2);
    for (let x = sx; x < sx + 24; x++) {
      const to = PATCH[room.at(x, y)];
      if (to !== undefined) room.px(x, y, to);
    }
  }
  const place = (g: Grid, p: readonly [number, number]): void => put(room, p[0], p[1], g.rows());
  // wall pieces: a second window, the shelf on the first window's sill, the lantern with its light, tools, the door
  place(window2(), LAYOUT.window2);
  place(furnace(), LAYOUT.furnace);
  place(lanternHanging(), LAYOUT.lantern);
  place(hangingTools(), LAYOUT.hangingTools);
  place(door(), LAYOUT.door);
  place(shelf(), LAYOUT.shelf);
  place(doorMat(), LAYOUT.doorMat);
  // floor dressing that lies flat goes first, so everything stands on it
  place(rug(), LAYOUT.rug);
  // the smiths behind the benches: shipped creatures at 1x, their lower rows hidden by the bench
  const pool = { next: 0 };
  const night: Record<string, string> = {};
  const behind = ['tidewing', 'sproutle'] as const;
  const benchTops = [LAYOUT.benchA, LAYOUT.benchB];
  behind.forEach((id, i) => {
    const spriteDef = BUNDLED_CREATURE_SPRITES[id];
    const bench = benchTops[i];
    if (spriteDef === undefined || bench === undefined) return;
    const b = borrow(spriteDef, pool, {});
    Object.assign(night, b.night);
    put(room, bench[0] + 8, bench[1] - 8, b.rows);
  });
  place(workbench(), LAYOUT.benchA);
  place(workbench(), LAYOUT.benchB);
  place(coalHeap(), LAYOUT.coal);
  place(cat(), LAYOUT.cat);
  place(woodpile(), LAYOUT.woodpile);
  place(sacks(), LAYOUT.sacks);
  place(bucket(), LAYOUT.bucket);
  place(barrelStack(), LAYOUT.barrelStack);
  // the anvils, each with a creature at it
  const anvil = borrow(ANVIL_PROP, { next: 0 }, { a: 'j', b: 'I', c: 'i' });
  put(room, ...LAYOUT.anvilA, anvil.rows);
  put(room, ...LAYOUT.anvilB, anvil.rows);
  const front = ['cindle', 'zipmouse'] as const;
  const anvils = [LAYOUT.anvilA, LAYOUT.anvilB];
  front.forEach((id, i) => {
    const spriteDef = BUNDLED_CREATURE_SPRITES[id];
    const a = anvils[i];
    if (spriteDef === undefined || a === undefined) return;
    const b = borrow(spriteDef, pool, {});
    Object.assign(night, b.night);
    put(room, a[0] + 14, a[1] + 1, b.rows);
  });
  // the fire side of what stands in the light: the first anvil, its creature, the coal heap and the cat
  warmLeft(room, LAYOUT.anvilA[0], LAYOUT.anvilA[1] + 5, LAYOUT.anvilA[1] + 15, 16);
  warmLeft(room, LAYOUT.anvilA[0] + 14, LAYOUT.anvilA[1] + 5, LAYOUT.anvilA[1] + 15, 16);
  warmLeft(room, LAYOUT.coal[0], LAYOUT.coal[1] + 2, LAYOUT.coal[1] + 9, 16);
  // the clickable props: the bag, the plans, the finished pieces, and the anvils (above)
  place(chestProp(), LAYOUT.chest);
  place(plansBoard(), LAYOUT.plans);
  place(finishedCrate(), LAYOUT.crate);
  place(quenchTrough(), LAYOUT.trough);
  place(gearRack(), LAYOUT.gearRack);
  const rows = room.rows();
  const used = new Set(rows.join(''));
  const palette: Record<string, string> = {};
  const day: Record<string, string> = {};
  for (const key of used) {
    if (key === '.') continue;
    palette[key] = NIGHT[key] ?? night[key] ?? '#ff00ff';
    day[key] = DAY[key] ?? night[key] ?? '#ff00ff';
  }
  return { rows, night: palette, day };
}

// ------------------------------------------------------------------ the set
const wall = build(backWall());
const WALL_ROWS = wall.sprite.rows;
const SEAM_ROWS = WALL_ROWS.map((r) => r.slice(96) + r.slice(0, 32));
const preview = composePreview();

/** Rows `from` to `to` of the composed room, with only the colours they use. */
function half(c: Composed, from: number, to: number): { sprite: SpriteDef; day: Pal } {
  const rows = c.rows.slice(from, to);
  const used = new Set(rows.join(''));
  const keep = (p: Pal): Record<string, string> =>
    Object.fromEntries(Object.entries(p).filter(([k]) => used.has(k)));
  return { sprite: { palette: keep(c.night), rows }, day: keep(c.day) };
}

/** The lantern: by day its glass is dull (the light on the wall is already the plain wall's colour). */
function lanternBuild(): { sprite: SpriteDef; day: Pal } {
  const b = build(lanternHanging());
  return {
    sprite: b.sprite,
    day: { ...b.day, o: '#c8985a', y: '#dcb070', c: '#ecd098' },
  };
}

// ------------------------------------------------------------------ variations (2026-11-15): B and C for door, finished-crate, cat
/** Door B: an arched plank door in a dressed-stone frame, a lantern on an iron bracket at the right. 20 x 32. */
function doorArch(): Grid {
  const g = new Grid(20, 32);
  // outline: an arch (x 0-15), then the step
  const arch = [5, 3, 2, 1, 1];
  for (let y = 0; y < 30; y++) {
    const x0 = y < arch.length ? arch[y]! : 0;
    g.rect(x0, y, 16 - 2 * x0, 1, 'k');
  }
  // dressed stone: courses of blocks, mortar lines, lit on the left edge
  const edge = new Set<string>();
  for (let y = 1; y < 30; y++)
    for (let x = 0; x < 16; x++)
      if (
        g.at(x, y) === 'k' &&
        g.at(x - 1, y) === 'k' &&
        g.at(x + 1, y) === 'k' &&
        g.at(x, y - 1) === 'k'
      )
        edge.add(`${x},${y}`);
  for (const key of edge) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    g.px(x, y, (y + (x >> 1)) % 4 === 0 ? 'S' : 's');
  }
  for (let y = 1; y < 30; y++) if (g.at(1, y) === 's') g.px(1, y, 'L');
  g.rect(7, 1, 2, 2, 'L');
  // the opening: ink, then planks
  const open = [5, 4, 3, 3];
  for (let y = 3; y < 30; y++) {
    const x0 = y - 3 < open.length ? open[y - 3]! : 3;
    g.rect(x0, y, 16 - 2 * x0, 1, 'k');
  }
  for (let y = 4; y < 30; y++) {
    const x0 = y - 4 < open.length ? open[y - 4]! + 1 : 4;
    for (let x = x0; x < 16 - x0; x++) {
      const col = x - 4;
      g.px(x, y, col % 3 === 2 ? 'V' : col % 3 === 0 ? 'w' : 'W');
    }
  }
  // iron straps with nails, ring handle on the right
  for (const y of [9, 22]) {
    g.rect(4, y, 8, 3, 'k');
    g.rect(4, y, 8, 1, 'I');
    g.rect(4, y + 1, 8, 1, 'i');
    g.px(5, y, 'j');
    g.px(9, y, 'j');
  }
  g.rect(10, 14, 2, 4, 'k');
  g.px(10, 15, 'I');
  g.stamp(9, 16, ['kIIk', 'kjjk', '.kk.']);
  // the lantern bracket and the lantern, right of the frame
  g.stamp(16, 6, ['kkkk', 'IIIk', '.kIk', '..k.']);
  g.stamp(16, 10, ['.kk.', 'kyyk', 'kcyk', 'kyyk', 'kook', '.kk.']);
  // the stone step
  g.rect(0, 30, 16, 2, 'k');
  g.rect(1, 30, 14, 1, 'L');
  return g;
}

/** Door C: a heavy plank door with a small barred window (warm light inside) and a painted anvil sign. 20 x 32. */
function doorWindow(): Grid {
  const g = new Grid(20, 32);
  // the sign: a board on the wall above the door, an anvil painted on it
  g.rect(3, 0, 14, 8, 'k');
  g.rect(4, 1, 12, 6, 'L');
  g.rect(4, 6, 12, 1, 's');
  g.stamp(5, 2, ['IIIIIIIIII', '.iIIIIIIi.', '...iiii...', '..iiiiii..']);
  // the door: thick planks in a heavy ink outline
  g.rect(1, 8, 18, 22, 'k');
  for (let y = 9; y < 30; y++)
    for (let x = 2; x < 18; x++) {
      const col = (x - 2) % 4;
      g.px(x, y, col === 3 ? 'V' : col === 0 ? 'w' : 'W');
    }
  g.rect(2, 9, 16, 1, 'V');
  // the window: a barred slot with the room's light behind it
  g.rect(6, 12, 8, 7, 'k');
  g.rect(7, 13, 6, 5, 'y');
  g.rect(7, 16, 6, 2, 'o');
  g.rect(7, 13, 6, 1, 'c');
  for (const x of [8, 10, 12]) g.rect(x, 13, 1, 5, 'k');
  g.rect(6, 19, 8, 1, 'L');
  // one heavy band across with studs, and a big ring handle below it
  g.rect(2, 21, 16, 3, 'k');
  g.rect(2, 21, 16, 1, 'I');
  g.rect(2, 22, 16, 1, 'i');
  for (const x of [3, 7, 11, 16]) g.px(x, 21, 'j');
  g.stamp(13, 25, ['.kkk.', 'kIIIk', 'kj.jk', 'kIIIk', '.kkk.']);
  // the step
  g.rect(0, 30, 20, 2, 'k');
  g.rect(1, 30, 18, 1, 'L');
  return g;
}

/** Finished-crate B: a low display stand with a helmet and a charm on it and a striped scarf draped over the end. 20 x 16. */
function finishedStand(): Grid {
  const g = new Grid(20, 16);
  g.stamp(1, 4, ['..kkkk..', '.kIIjjk.', 'kIIIjIIk', 'kIiIIIik', 'kjjjjjjk']);
  g.stamp(10, 5, ['.kkk.', 'kyuyk', 'kyuyk', '.kyk.']);
  g.px(15, 4, 'c');
  g.px(14, 3, 'c');
  g.px(8, 3, 'c');
  g.px(9, 4, 'c');
  // the stand: a top board and two trestles with a back panel
  g.rect(0, 9, 20, 4, 'k');
  g.rect(1, 10, 18, 1, 'w');
  g.rect(1, 11, 18, 1, 'W');
  g.rect(2, 13, 3, 3, 'k');
  g.rect(15, 13, 3, 3, 'k');
  g.rect(3, 13, 1, 2, 'W');
  g.rect(16, 13, 1, 2, 'W');
  g.rect(5, 13, 10, 1, 'k');
  g.rect(5, 14, 10, 1, 'V');
  g.rect(5, 15, 10, 1, 'k');
  // the scarf, draped over the right end: bunched on top, hanging down the front with a fringe
  g.stamp(13, 6, ['.kkkk.', 'krrr,k', 'k,rrrk']);
  g.rect(14, 9, 5, 7, 'k');
  g.rect(15, 9, 3, 6, 'r');
  for (const y of [10, 12]) g.rect(15, y, 3, 1, ',');
  g.stamp(15, 15, ['y.y']);
  return g;
}

/** Finished-crate C: an open chest heaped with gear (helmet, charm, coins, a scarf spilling out) and a glint. 20 x 16. */
function finishedChest(): Grid {
  const g = new Grid(20, 16);
  // the lid, thrown back: only its dark inside shows behind the gear
  g.rect(3, 0, 14, 8, 'k');
  g.rect(4, 1, 12, 1, 'W');
  g.rect(4, 2, 12, 5, 'V');
  // the heap
  g.stamp(2, 2, ['..kkkk..', '.kIIjjk.', 'kIIIjIIk', 'kIiIIIik', 'kjjjjjjk']);
  g.stamp(11, 4, ['.kkk.', 'kyuyk', 'kyuyk', '.kyk.']);
  g.rect(1, 7, 18, 1, 'k');
  g.rect(2, 7, 16, 1, 'y');
  g.px(9, 6, 'y');
  g.px(10, 6, 'o');
  g.px(8, 7, 'o');
  g.px(14, 7, 'o');
  g.px(5, 7, 'c');
  // the scarf spilling over the right
  g.stamp(15, 4, ['.kkk', 'krrk', 'k,rk']);
  g.rect(15, 7, 4, 1, 'k');
  g.rect(16, 7, 2, 1, 'r');
  // the chest: ink box, planks, iron corners and a lock plate
  g.rect(0, 8, 20, 8, 'k');
  g.rect(1, 8, 18, 1, 'w');
  g.rect(1, 9, 18, 5, 'W');
  g.rect(1, 14, 18, 1, 'V');
  g.rect(1, 12, 18, 1, 'V');
  for (const x of [1, 17]) {
    g.rect(x, 9, 2, 6, 'I');
    g.rect(x + 1, 9, 1, 6, 'i');
  }
  g.px(1, 9, 'j');
  g.px(17, 9, 'j');
  g.rect(8, 9, 4, 5, 'k');
  g.rect(9, 10, 2, 3, 'I');
  g.px(9, 10, 'j');
  g.px(10, 11, 'k');
  g.px(10, 12, 'k');
  // glints
  g.px(0, 3, 'c');
  g.px(1, 2, 'c');
  g.px(18, 1, 'c');
  g.px(19, 2, 'c');
  g.px(10, 0, 'c');
  return g;
}

/** Cat B: a cat curled up, big ears, closed eyes, a striped tail wrapped round the front. 12 x 8. */
function catCurled(): Grid {
  const g = new Grid(12, 8);
  g.stamp(0, 0, [
    '.z...z......',
    'z_z.z_z.....',
    'z((((((z....',
    'z))(())(z...',
    'z(((__(((((z',
    'z(((((()(()z',
    '.z))()()()(z',
    '..zzzzzzzzz.',
  ]);
  return g;
}

/** Cat C: a cat sitting upright, side on, facing the fire at the left. 12 x 10 (two rows taller than the lying cat). */
function catSitting(): Grid {
  const g = new Grid(12, 10);
  g.stamp(0, 0, [
    '..z...z.....',
    '.z_z.z_z....',
    '.z((((((z...',
    '.z()(()(z...',
    '.z((__((zzz.',
    '..z((((((z)z',
    '.z__(((((()z',
    '.z__((()(()z',
    '.z__(((((((z',
    '.zzzzzzzzzz.',
  ]);
  return g;
}

const free = (
  note: string,
  b: { sprite: SpriteDef; day: Pal },
  variants?: Record<string, Grid>,
) => ({
  kind: 'free' as const,
  note,
  sprite: b.sprite,
  alts: { day: b.day },
  ...(variants
    ? {
        variants: Object.fromEntries(
          Object.entries(variants).map(([name, v]) => [name, build(v).sprite]),
        ),
      }
    : {}),
});

export const VALLEY_FORGE_INTERIOR_CONCEPTS: ConceptSet = {
  id: 'valley-forge-interior',
  title: 'The Forge, inside',
  requested:
    '2026-11-11 (via the valley session): clicking the Forge goes inside, into a workshop interior. "It would be cool to have the same stuff there (my creatures working at the anvils) but also see some other creatures working in the background, a fire going, etc. Basically make it look like the interior of a workshop."',
  status: 'draft',
  notes: [
    'Pieces the game lays out behind its existing props (`valley/forge-props.ts`: anvil, chest, crate, plans table; creatures stand in front at the anvils). Level 3 look: sandstone, timber, black iron, terracotta. Same ink and woods as the props. Night is the main palette (fire is the light, windows dark blue with a moon glint); `alts.day` recolours the same pixels (windows bright, daylight patches `b` on the wall and `B` on the floor).',
    '`back-wall` 128 x 56 tiles sideways (column 0 continues column 127; a timber post crosses the seam; see `seam` and `seam-day`). Beam on rows 0-5, terracotta frieze 6-8, windows at x 20 and x 84 (opening 13-34, sill 35-39), plinth 48-55. Stand it on the floor line: its bottom row is the base.',
    '`furnace` 48 x 52: body base on row 51, mouth fire at x 14-33 (mouth centre x 24). Place it so the base row sits a few rows below the wall bottom.',
    "`furnace-glow` 128 x 40, a floor overlay the game draws over the floor tiles and under the props. It carries the flagstone pattern in lit colours, so its origin (0, 0) must sit on a floor tile corner (x and y multiples of 16 from the floor's own origin). Anchor: the pool centre is at x 25, y 6 in the overlay, which is the furnace mouth centre (furnace x + 23) and the furnace base line (furnace y + 51) when the overlay's top row is the floor's top row. In the preview: furnace (2, 11), overlay (0, 56). Night: four warm tones, brightest at the mouth, reaching right to about x 128 and fading. By day the two outer rings are the plain floor colours, so only a small warm patch (about 40 px wide) shows at the mouth.",
    '`shelf` 32 x 16 and `tool-rack` 32 x 24 hang on the wall; `hanging-tools` 24 x 16 hangs from the beam (its top row touches the beam bottom, row 5 of the wall).',
    '`workbench` 32 x 20: the top surface starts at row 4; rows 0-3 are clear except a vise at x 1-5 and ingots at x 26-31, so a creature (drawn smaller, behind) stands at x 8-24 and its lower rows hide behind the bench.',
    '`floor` 16 x 16 tiles both ways. `barrel` 12 x 16, `quench-trough` 24 x 12, `coal-heap` 16 x 10 stand on the floor (bottom row = base).',
    "New pieces (2026-11-14, from Misa's staging notes). Clickable, drawn bold (ink outline, lit edges, a glint): `door` 20 x 32 (plank leaf in a timber frame, two iron strap hinges, a ring handle, a stone step; the base row is the floor line), `door-mat` 20 x 4 (lies in front of the door), `plans-board` 24 x 24 (a drafting board with blue plans, white lines, pins and a pencil on trestle legs, a rolled plan on the bar), `finished-crate` 20 x 16 (an open crate with a steel helmet, a charm on a gold ring with a glint, and a striped scarf end over the side). They replace the plank, the 16 x 16 table and the stick crate of `valley/forge-props.ts`.",
    'Edge dressing (not clickable; quieter: soft soot outline `z` instead of ink, mid tones, no lit edges, no glint): `barrel-stack` 24 x 24 (three barrels), `sacks` 18 x 13, `gear-rack` 22 x 26 (a free standing rack with hats on pegs and scarves on a bar), `rug` 48 x 16 (a fixed worn oval; lies flat on the floor, drawn before everything that stands on it), `woodpile` 28 x 19, `cat` 12 x 8 (an ordinary cat asleep, by the furnace; warm on its fire side), `bucket` 10 x 10, `window-2` 12 x 31 (a narrow window for the side wall: lintel rows 0-3, opening 4-25, sill 26-30; repeat it with a 4 px gap), `lantern-hanging` 24 x 40 (a chain from the beam, row 0 touches the beam bottom, the lantern at x 8-15; the warm light on the wall is dithered, so the stones show through, at night in three warm steps; by day the light colours are the plain wall and only the glass stays lit).',
    'The room, 128 x 176 for a phone (a tall phone shows about 130 x 281 world px at 3x, so the room is meant to be scaled to the screen width and, if there is spare height, shown from the top with the front zone cut off or the room centred): the back wall stays 56 tall (y 0-55), the floor tiles run from y 56 to 175 (7.5 tiles; tiles start at y 56), then bands. Wall band y 0-55; furnace and bench band y 56-85 (the furnace light, the cat, the coal, the door and its mat); work band y 86-135 (anvils, chest, plans, finished crate, trough); front zone y 136-175 (rug, woodpile, sacks, barrels, gear rack, bucket). On desktop the room widens by tiling `back-wall` and `floor` sideways and by adding wall pieces on the new wall (window-2, tool-rack, hanging-tools, a second lantern, shelves) and floor dressing at the new left and right edges (barrel-stack, sacks, woodpile, gear-rack); the clickable pieces and the furnace stay centred on x 64 (the middle of the phone room), so nothing clickable moves apart.',
    'The 128 x 176 preview is taller than the studio allows (64), so it is three sprites that stack: `preview-top` (rows 0-63), `preview-middle` (rows 64-127), `preview-bottom` (rows 128-175). The room has more than 16 colours (borrowed creature colours). Layout (x, y of the top-left; [C] = clickable): back wall (0, 0) moved 40 to the right (the furnace hides one window); floor from y 56; window-2 (46, 9); furnace (2, 11); lantern-hanging (79, 6); hanging-tools (98, 6); [C] door (98, 26) with door-mat (98, 58); shelf (56, 24) on the first window sill; rug (40, 146) is drawn first on the floor; creatures behind the benches at (68, 44) and (104, 74), 1x, lower rows hidden; workbench A (60, 52), workbench B (96, 82); coal-heap (6, 66); cat (32, 66); woodpile (2, 136); sacks (4, 160); bucket (30, 164); barrel-stack (98, 130); [C] ANVIL_PROP at (24, 86) and (66, 86) with a creature at (anvil x + 14, anvil y + 1); [C] chest (the bag, `CHEST_PROP`) (6, 110); [C] plans-board (36, 106); [C] finished-crate (74, 112); quench-trough (98, 114); gear-rack (102, 156). `furnace-glow` (0, 56) is drawn over the floor and the daylight patch (x 60-84 under the window, slanting left, to y 125), under every prop. Not placed on the phone width: `tool-rack`, `barrel` (the barrel-stack replaces it); both are for the desktop sides. Drawn in the order above, then the clickable props, then the gear-rack. The first anvil, its creature, the coal heap get a warm pixel along their fire (left) side.',
  ],
  sprites: {
    'back-wall': {
      ...free(
        'A sandstone wall with a terracotta frieze, timber posts, a beam and two windows. Tiles sideways.',
        wall,
      ),
      variants: {
        seam: { palette: wall.sprite.palette, rows: SEAM_ROWS },
        'seam-day': { palette: { ...wall.sprite.palette, ...wall.day }, rows: SEAM_ROWS },
      },
    },
    'furnace-glow': {
      ...free(
        'Firelight on the flagstones: a wide pool of stepped warm rings, brightest at the mouth, fading to the right. A floor overlay. By day only the inner rings stay warm.',
        build(furnaceGlow()),
      ),
    },
    furnace: free(
      'A big sandstone furnace with a terracotta hood and a stack, the fire going; warm light on the floor in front.',
      build(furnace()),
    ),
    shelf: free('A plank shelf with a red and a blue jar and stacked ingots.', build(shelf())),
    'tool-rack': free(
      'A timber rack with a hammer, tongs, a file and a small hammer.',
      build(toolRack()),
    ),
    workbench: free(
      'A background bench; the top edge is clear for a creature to stand behind it.',
      build(workbench()),
    ),
    floor: free('Flagstones with soot, tiles both ways.', build(floor())),
    barrel: free('A hooped barrel.', build(barrel())),
    'quench-trough': free('A trough of water for quenching.', build(quenchTrough())),
    'hanging-tools': free('Tongs, a hammer and a ladle hung from the beam.', build(hangingTools())),
    'coal-heap': free('A heap of coal with two embers.', build(coalHeap())),
    door: free(
      'CLICKABLE. A plank door in a timber frame with iron strap hinges, a ring handle and a stone step: the way out. Variations: A (main) the timber-framed plank door, B an arched plank door in a dressed-stone frame with a lantern on an iron bracket at the right (the sprite uses 16 of the 20 columns for the door, the rest is the lantern), C a heavier door with a small barred window (warm light inside at night, plain bars by day) and a painted anvil sign above. Pick: C, because the lit window and the anvil sign say "the forge door" at 1x, and a lit slot is the clearest tap target.',
      build(door()),
      { 'B arched stone': doorArch(), 'C heavy, window and sign': doorWindow() },
    ),
    'door-mat': free(
      'CLICKABLE with the door. A woven mat in front of the door.',
      build(doorMat()),
    ),
    'plans-board': free(
      'CLICKABLE. A drafting board with blue plans (white lines, pins, a pencil) on trestle legs: the blueprints.',
      build(plansBoard()),
    ),
    'finished-crate': free(
      'CLICKABLE. An open crate of finished gear: a steel helmet, a charm on a gold ring, a striped scarf over the side: the floor. Variations: A (main) the open crate, B a low display stand with a helmet and a charm on it and the striped scarf draped over the end, C an open chest heaped with a helmet, a charm and coins, the scarf spilling out and glints round it. Pick: C, because the heap and the glints read as "treasure waiting" at 1x, where the stand looks like a plain table.',
      build(finishedCrate()),
      { 'B display stand': finishedStand(), 'C heaped chest': finishedChest() },
    ),
    'barrel-stack': free('Dressing. Three barrels, quiet colours.', build(barrelStack())),
    sacks: free('Dressing. Three burlap sacks.', build(sacks())),
    'gear-rack': free(
      'Dressing. A free standing rack with finished hats and scarves.',
      build(gearRack()),
    ),
    rug: free('Dressing. A worn woven oval rug for the floor.', build(rug())),
    'lantern-hanging': free(
      'Dressing. A lantern on a chain from the beam; warm stepped light on the wall below at night.',
      lanternBuild(),
    ),
    'window-2': free('Dressing. A narrow window for the side wall, to repeat.', build(window2())),
    woodpile: free('Dressing. Split logs in a pyramid.', build(woodpile())),
    cat: free(
      'Dressing. A cat curled up asleep (by the furnace). Variations: A (main) the loaf-shaped sleeper, B a curled cat with bigger ears (cream inside), closed-eye lines and a striped tail wrapped round the front (12 x 8; no "z", a 3 x 3 z read as an I at this size), C a cat sitting upright facing the fire at the left (12 x 10: two rows taller than the others, so it stands on the same base row and reaches 2 px higher). Pick: B, because it keeps the 12 x 8 footprint and the ears and striped tail stop it reading as bread.',
      build(cat()),
      {
        'B curled, ears and tail': catCurled(),
        'C sitting (12 x 10)': catSitting(),
      },
    ),
    bucket: free('Dressing. A wooden bucket.', build(bucket())),
    'preview-top': free(
      'The whole room, 128 x 176, top 64 rows (see the notes for the layout).',
      half(preview, 0, 64),
    ),
    'preview-middle': free('The whole room, rows 64-127.', half(preview, 64, 128)),
    'preview-bottom': free('The whole room, rows 128-175.', half(preview, 128, 176)),
  },
};
