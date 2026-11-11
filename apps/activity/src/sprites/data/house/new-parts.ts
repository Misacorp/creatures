/**
 * The art of the four parts built after the first night (`docs/design/housing-next.md` C1): the tower, the balcony, the
 * orchard and the pond with its bridge. Everything here is drawn by code from the drawing library (`sprites/draw/`), so a
 * piece can be changed and drawn again; nothing is hand-set pixel by pixel.
 *
 * - **Tower** (cutaway: the observatory's round window and its telescope; the spire's finial; the landing's and the
 *   observatory's wallpaper and floor). The spire itself is the scene's roof sprite (`house-scene.ts`), steeper than a gable.
 * - **Balcony**: the railing that stands in front of the spots, the corbel under the slab.
 * - **Orchard**: three fruit trees (apple, plum, pear: the ground skin picks which), a ladder and a basket. A ground skin's
 *   `scenery` is what stands on it, left to right.
 * - **Pond**: the muddy bank and the water of the basin sunk under the ground line, reeds, lily pads and a small arched bridge.
 *
 * Day palette, ink `k` #0d0a1a, light from the upper left, like the rest of the house. One palette for the file; a sprite keeps
 * only the keys it uses. The postcard's small versions of all of these are in `postcard.ts`.
 */
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack, SkinArt } from '../../../housing/house-art';
import { canvas, flipX, get, put, toSprite } from '../../draw/canvas';
import { fill, hline, line, outline, type Ramp } from '../../draw/shapes';
import { inEllipse, inRect, solid, union, type Shape } from '../../draw/solid';
import { HOUSE_ART as SHELL } from './shell';

export const PAL: Readonly<Record<string, string>> = {
  k: '#0d0a1a',
  // foliage (apple); the plum and the pear swap these
  h: '#a6ee8a',
  i: '#6fc062',
  j: '#43924f',
  l: '#2f6a3c',
  // fruit: highlight, body, shade
  F: '#ff9a8a',
  G: '#d83a4a',
  H: '#9a2438',
  // wood
  r: '#e4b27a',
  s: '#bc8050',
  t: '#915d42',
  u: '#6c4734',
  // straw, cream
  w: '#d5caa9',
  p: '#f5eedb',
  x: '#8a6a3a',
  // brass
  m: '#ffd25a',
  y: '#c8952b',
  z: '#fff0a8',
  // glass: sky, cloud
  e: '#9cc8e0',
  f: '#6fb2d6',
  g: '#b8dcee',
  c: '#f6f0e0',
  // stone
  a: '#e8e2d4',
  b: '#bdb6a6',
  d: '#8c8678',
  // water, pond
  A: '#79d0b4',
  B: '#3f9c8c',
  C: '#2b7a78',
  D: '#1f5a60',
  // mud, bank
  M: '#8a6a4a',
  N: '#6a4c36',
  O: '#4a3626',
  // pink, reed
  S: '#ff8fab',
  R: '#d0455a',
  T: '#7a5a34',
  U: '#c8a860',
};

const WOOD: Ramp = { hi: 'r', light: 'r', mid: 's', dark: 't', deep: 'u' };
const BRASS: Ramp = { hi: 'z', light: 'm', mid: 'y', dark: 'y' };

/** A deterministic number from a pixel, for leaf clumps (never random: the same tree every time). */
function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function palOf(extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { ...PAL, ...extra };
}

// ---------------------------------------------------------------------------------------------
// The tower

/** The observatory's round window: a frame, four panes of sky (the lighting pass turns them into the night sky) and a cross. 26 x 26. */
function towerWindow(): SpriteDef {
  const c = canvas(26, 26);
  solid(c, { x: 0, y: 0, w: 26, h: 26 }, inEllipse(0, 0, 26, 26), WOOD);
  const glass = inEllipse(3, 3, 20, 20);
  for (let y = 3; y < 23; y++) {
    for (let x = 3; x < 23; x++) {
      if (!glass(x, y)) continue;
      put(c, x, y, y < 9 ? 'g' : y < 17 ? 'e' : 'f');
    }
  }
  // a cloud and the sun's glint
  for (const [x, y] of [
    [6, 7],
    [7, 6],
    [8, 6],
    [9, 7],
    [7, 7],
    [8, 7],
    [10, 8],
    [9, 8],
    [6, 8],
    [7, 8],
    [8, 8],
  ] as const) {
    put(c, x, y, 'c');
  }
  // the cross
  for (let i = 3; i < 23; i++) {
    if (glass(i, 12)) {
      put(c, i, 12, 's');
      put(c, i, 13, 't');
    }
    if (glass(12, i)) {
      put(c, 12, i, 's');
      put(c, 13, i, 't');
    }
  }
  // ink round the glass
  for (let y = 2; y < 24; y++) {
    for (let x = 2; x < 24; x++) {
      if (glass(x, y)) continue;
      if (glass(x - 1, y) || glass(x + 1, y) || glass(x, y - 1) || glass(x, y + 1))
        put(c, x, y, 'k');
    }
  }
  return toSprite(c, palOf());
}

/** A brass telescope on a tripod, aimed up to the left (at the window): 26 x 34. */
function telescope(): SpriteDef {
  const c = canvas(26, 34);
  // legs
  for (const [x1, y1, x2, y2] of [
    [12, 20, 5, 33],
    [13, 20, 13, 33],
    [14, 20, 21, 33],
  ] as const) {
    line(c, x1, y1, x2, y2, 't');
  }
  line(c, 12, 20, 5, 33, 't');
  line(c, 11, 20, 4, 33, 's');
  line(c, 15, 20, 22, 33, 't');
  // the head
  fill(c, 10, 18, 7, 3, 'y');
  hline(c, 10, 18, 7, 'm');
  // the tube: a thick diagonal, lit on its upper edge
  for (let i = 0; i < 16; i++) {
    const x = 6 + i;
    const y = 19 - Math.floor((i * 14) / 15);
    for (let k = -2; k <= 2; k++) {
      put(c, x, y + k, k === -2 ? 'z' : k === -1 ? 'm' : k === 0 ? 'm' : k === 1 ? 'y' : 'y');
    }
  }
  // bands on the tube
  for (const i of [4, 10]) {
    const x = 6 + i;
    const y = 19 - Math.floor((i * 14) / 15);
    for (let k = -2; k <= 2; k++) put(c, x, y + k, 'u');
  }
  // the lens end, and the eyepiece
  for (let k = -3; k <= 3; k++) put(c, 22, 5 + k + 1, k === -3 || k === 3 ? 'y' : 'e');
  fill(c, 3, 21, 4, 3, 'u');
  outline(c, 'k', true);
  // drawn aimed to the right; it stands to the right of the window, so it is turned to look at it
  return toSprite(flipX(c), palOf());
}

/** The spire's finial: a brass ball under a small red pennant: 9 x 15. */
function finial(): SpriteDef {
  const c = canvas(9, 15);
  // the pennant
  fill(c, 3, 0, 5, 3, 'G');
  put(c, 8, 1, 'G');
  hline(c, 3, 0, 5, 'F');
  hline(c, 3, 2, 5, 'H');
  // the pole and the ball
  fill(c, 3, 3, 1, 6, 'u');
  solid(c, { x: 1, y: 8, w: 5, h: 5 }, inEllipse(1, 8, 5, 5), BRASS);
  put(c, 3, 13, 'u');
  put(c, 3, 14, 'u');
  outline(c, 'k');
  return toSprite(c, palOf());
}

function plain(rows: readonly string[], pal: Readonly<Record<string, string>>): SpriteDef {
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(pal).filter(([key]) => used.has(key))),
  };
}

/** A wallpaper tile 16 x 52 from a pattern of its rows above a wainscot of `dado` rows. */
function wallTile(
  pal: Readonly<Record<string, string>>,
  top: (x: number, y: number) => string,
  dado: readonly string[],
): SpriteDef {
  const rows: string[] = [];
  const bodyRows = 52 - dado.length;
  for (let y = 0; y < bodyRows; y++) {
    rows.push(Array.from({ length: 16 }, (_, x) => top(x, y)).join(''));
  }
  rows.push(...dado);
  return plain(rows, pal);
}

const LANDING_PAL = {
  a: '#efe4cf',
  b: '#e2d3b6',
  c: '#cdb893',
  d: '#7a5a46',
  e: '#9a7258',
  f: '#b8906c',
  g: '#5a4030',
};
const LANDING_DADO: readonly string[] = [
  'gggggggggggggggg',
  'ffffffffffffffff',
  'eeeeeeeeeeeeeeee',
  'dddddddddddddddd',
  'efffffffefffffff',
  'efeeeeefefeeeeef',
  'efeeeeefefeeeeef',
  'efeeeeefefeeeeef',
  'efeeeeefefeeeeef',
  'edddddddedddddde',
  'dddddddddddddddd',
  'gggggggggggggggg',
];
const LANDING_WALL = wallTile(
  LANDING_PAL,
  (x, y) => {
    if (y === 0) return 'c';
    // limewash: faint vertical boards and a few rubbed patches
    if (x === 7 || x === 15) return 'b';
    return hash(x, y) < 0.05 ? 'b' : 'a';
  },
  LANDING_DADO,
);
const LANDING_FLOOR = plain(
  [
    'bbbbbbbbbbbbbbbb',
    'bddddddebddddddd',
    'bdbbbbdebdbbbbbd',
    'bdbbbbdebdbbbbbd',
    'bdbbbbdebdbbbbbd',
    'bdddddddbdddddde',
    'bbbbbbbbbbbbbbbb',
    'eeeeeeeeeeeeeeee',
  ].map((row) => row),
  { b: '#c8c0b4', d: '#9a92a0', e: '#6e6678' },
);

const OBS_PAL = {
  a: '#2f2a5e',
  b: '#3a3470',
  c: '#262250',
  d: '#ffd25a',
  e: '#f4eedc',
  f: '#b79cf0',
  g: '#1b183c',
  h: '#5a3a5a',
  i: '#7a4e6a',
  j: '#3e2640',
  k: '#0d0a1a',
};
const OBS_DADO: readonly string[] = [
  'gggggggggggggggg',
  'ijjjjjjjijjjjjjj',
  'iiiiiiiiiiiiiiii',
  'hhhhhhhhhhhhhhhh',
  'ihhhhhhhihhhhhhh',
  'ihhhhhhhihhhhhhh',
  'ihhhhhhhihhhhhhh',
  'ihhhhhhhihhhhhhh',
  'ihhhhhhhihhhhhhh',
  'ijjjjjjjijjjjjjj',
  'hhhhhhhhhhhhhhhh',
  'gggggggggggggggg',
];
/** Night-blue paper with a scatter of stars: gold and lilac points and two small crosses. */
const STARS: readonly (readonly [number, number, string])[] = [
  [2, 3, 'd'],
  [11, 6, 'e'],
  [6, 11, 'f'],
  [14, 14, 'd'],
  [4, 19, 'e'],
  [10, 23, 'd'],
  [1, 28, 'f'],
  [13, 31, 'e'],
  [7, 35, 'd'],
  [3, 40, 'e'],
  [12, 8, 'f'],
  [9, 17, 'f'],
];
const OBS_WALL = wallTile(
  OBS_PAL,
  (x, y) => {
    if (y === 0) return 'c';
    for (const [sx, sy, key] of STARS) if (sx === x && sy === y) return key;
    // two small four-point stars
    if (
      (x === 6 && y === 4) ||
      (x === 5 && y === 5) ||
      (x === 7 && y === 5) ||
      (x === 6 && y === 6)
    )
      return 'd';
    if (
      (x === 13 && y === 25) ||
      (x === 12 && y === 26) ||
      (x === 14 && y === 26) ||
      (x === 13 && y === 27)
    )
      return 'e';
    return (x + y * 3) % 11 === 0 ? 'b' : 'a';
  },
  OBS_DADO,
);
const OBS_FLOOR = plain(
  [
    'hhhhhhhhhhhhhhhh',
    'hiiiiiiihiiiiiii',
    'hiijiiiihiiiiiji',
    'hiiiiiiihiiijiii',
    'hjjjjjjjhjjjjjjj',
    'jjjjjjjjjjjjjjjj',
    'mmjjjjjjjjjmmjjj',
    'gggggggggggggggg',
  ],
  { h: '#7a4e6a', i: '#5a3a5a', j: '#3e2640', g: '#241628', m: '#c8952b' },
);

// ---------------------------------------------------------------------------------------------
// The balcony

/** The railing along the front of the deck: a top rail, a post at each end and a baluster every six pixels. 112 x 14. */
function balconyRail(): SpriteDef {
  const c = canvas(112, 14);
  // the top rail
  hline(c, 0, 0, 112, 'k');
  hline(c, 0, 1, 112, 'r');
  hline(c, 0, 2, 112, 's');
  hline(c, 0, 3, 112, 'k');
  // balusters
  for (let x = 7; x < 108; x += 6) {
    fill(c, x, 4, 1, 8, 'k');
    fill(c, x + 1, 4, 1, 8, 'r');
    fill(c, x + 2, 4, 1, 8, 'k');
  }
  // the toe rail
  hline(c, 0, 12, 112, 'k');
  hline(c, 0, 13, 112, 's');
  // a post at each end, a little taller than the rail
  for (const x of [0, 108]) {
    fill(c, x, 0, 4, 14, 'k');
    fill(c, x + 1, 0, 2, 14, 's');
    fill(c, x + 1, 0, 1, 14, 'r');
  }
  return toSprite(c, palOf());
}

/** The bracket that holds the slab up against the wall: 12 x 12. */
function corbel(): SpriteDef {
  const c = canvas(12, 12);
  solid(c, { x: 0, y: 0, w: 12, h: 12 }, (x, y) => x + y <= 11, WOOD);
  return toSprite(c, palOf());
}

// ---------------------------------------------------------------------------------------------
// The orchard

const TREES = {
  apple: {},
  plum: {
    h: '#8ee0a8',
    i: '#58b07a',
    j: '#388a62',
    l: '#27604f',
    F: '#c9a0e8',
    G: '#8a5cad',
    H: '#5e3d82',
  },
  pear: {
    h: '#c8f08a',
    i: '#8cd062',
    j: '#5aa850',
    l: '#3a7a3c',
    F: '#f4f09a',
    G: '#d6d04a',
    H: '#a8a02e',
  },
} as const;

export type Fruit = keyof typeof TREES;

const FRUIT_AT: readonly (readonly [number, number])[] = [
  [9, 12],
  [20, 6],
  [32, 8],
  [41, 15],
  [14, 21],
  [26, 16],
  [35, 24],
  [6, 24],
  [22, 28],
  [43, 28],
  [28, 3],
];

/** One fruit tree, 50 x 54: a short trunk with roots, a wide crown of clumped leaves, a few pieces of fruit. */
function fruitTree(fruit: Fruit): SpriteDef {
  const c = canvas(50, 54);
  // the trunk, with roots, drawn first so the crown overlaps it
  const trunk = (x: number, y: number): boolean => {
    if (y < 32) return false;
    const half = y < 44 ? 3 : y < 50 ? 3.5 : 5.5;
    return Math.abs(x + 0.5 - 25) <= half;
  };
  solid(c, { x: 14, y: 32, w: 22, h: 22 }, trunk, WOOD, { shade: 'cols' });
  // the crown: four overlapping blobs
  const crown: Shape = union(
    inEllipse(10, 0, 30, 22),
    inEllipse(0, 8, 28, 26),
    inEllipse(22, 8, 28, 26),
    inEllipse(7, 16, 36, 22),
  );
  solid(c, { x: 0, y: 0, w: 50, h: 40 }, crown, { light: 'i', mid: 'j', dark: 'l' });
  for (let y = 1; y < 39; y++) {
    for (let x = 1; x < 49; x++) {
      if (get(c, x, y) === 'k' || !crown(x, y)) continue;
      // light from the upper left, with leaf clumps three pixels across
      const clump = hash(Math.floor(x / 3), Math.floor(y / 3)) - 0.5;
      const t = (x / 50) * 0.5 + (y / 40) * 0.85 + clump * 0.7;
      put(c, x, y, t < 0.3 ? 'h' : t < 0.55 ? 'i' : t < 0.98 ? 'j' : 'l');
    }
  }
  // the fruit: 3 x 3, lit top left
  for (const [fx, fy] of FRUIT_AT) {
    if (get(c, fx, fy) === 'k' || get(c, fx + 2, fy + 2) === 'k') continue;
    put(c, fx, fy, 'F');
    put(c, fx + 1, fy, 'G');
    put(c, fx + 2, fy, 'G');
    put(c, fx, fy + 1, 'G');
    put(c, fx + 1, fy + 1, 'G');
    put(c, fx + 2, fy + 1, 'H');
    put(c, fx + 1, fy + 2, 'H');
    put(c, fx + 2, fy + 2, 'H');
    put(c, fx, fy + 2, 'H');
  }
  return toSprite(c, palOf(TREES[fruit]));
}

/** A ladder leaning to the right, 10 x 40. */
function ladder(): SpriteDef {
  const c = canvas(10, 40);
  line(c, 1, 39, 4, 0, 's');
  line(c, 2, 39, 5, 0, 'r');
  line(c, 6, 39, 9, 0, 's');
  line(c, 7, 39, 10, 0, 'r');
  for (let y = 6; y < 39; y += 7) {
    const from = 2 + Math.round(((39 - y) * 3) / 39);
    hline(c, from, y, 5, 't');
  }
  outline(c, 'k');
  return toSprite(c, palOf());
}

/** A woven basket with apples heaped in it, 14 x 10. */
function basket(): SpriteDef {
  const c = canvas(14, 10);
  for (const [x, y] of [
    [3, 1],
    [6, 0],
    [9, 1],
    [5, 2],
    [8, 2],
  ] as const) {
    put(c, x, y, 'F');
    put(c, x + 1, y, 'G');
    put(c, x, y + 1, 'G');
    put(c, x + 1, y + 1, 'H');
  }
  solid(c, { x: 0, y: 3, w: 14, h: 7 }, inRect(0, 3, 14, 7), { light: 'r', mid: 's', dark: 't' });
  for (let y = 4; y < 9; y++) {
    for (let x = 1; x < 13; x++) put(c, x, y, (x + y) % 2 === 0 ? 's' : 'r');
  }
  hline(c, 1, 8, 12, 't');
  return toSprite(c, palOf());
}

/** The lawn with a few windfalls in it, in the fruit of the variety. */
function orchardTile(fruit: Fruit): SpriteDef {
  const lawn = SHELL.skins?.['lawn']?.tile;
  if (lawn === undefined) throw new Error('The lawn skin is not in the shell pack.');
  const rows = lawn.rows.map((row) => row.split(''));
  const key = fruit === 'apple' ? 'F' : fruit === 'plum' ? 'G' : 'F';
  for (const [x, y] of [
    [3, 3],
    [11, 5],
  ] as const) {
    const row = rows[y];
    if (row !== undefined) row[x] = key;
  }
  const fruitColours = palOf(TREES[fruit]);
  return {
    rows: rows.map((r) => r.join('')),
    palette: {
      ...lawn.palette,
      F: fruitColours['F'] ?? '#ff9a8a',
      G: fruitColours['G'] ?? '#d83a4a',
    },
  };
}

/** The standing things of an orchard in a variety: three trees, a ladder against the right one and a basket at its foot. */
function orchardScenery(fruit: Fruit): NonNullable<SkinArt['scenery']> {
  return [
    { sprite: fruitTree(fruit), x: 0 },
    { sprite: fruitTree(fruit), x: 87 },
    { sprite: fruitTree(fruit), x: 174 },
    { sprite: ladder(), x: 160 },
    { sprite: basket(), x: 144 },
  ];
}

// ---------------------------------------------------------------------------------------------
// The pond

/** The pond basin's width and depth below the ground line, scene pixels (`house-scene.ts` places it at x + 34). */
export const POND_W = 156;
export const POND_D = 26;

/** The muddy bank round the water: a half ellipse sunk under the ground line, ink on its outer edge. */
function pondRim(): SpriteDef {
  const c = canvas(POND_W, POND_D);
  const shape = inEllipse(0, -POND_D, POND_W, 2 * POND_D);
  solid(c, { x: 0, y: 0, w: POND_W, h: POND_D }, shape, { light: 'M', mid: 'N', dark: 'O' });
  // the lip of the bank at the ground line: a lighter edge of turf either end
  for (let x = 0; x < POND_W; x++) {
    if (get(c, x, 0) === 'k') put(c, x, 0, 'k');
  }
  return toSprite(c, palOf());
}

/** The water, a smaller half ellipse with ripples; the lighting pass tints it (`water`). */
function pondWater(): SpriteDef {
  const c = canvas(POND_W, POND_D);
  const inner = inEllipse(3, -(POND_D - 3), POND_W - 6, 2 * (POND_D - 3));
  for (let y = 0; y < POND_D; y++) {
    for (let x = 0; x < POND_W; x++) {
      if (!inner(x, y)) continue;
      let key = y < 10 ? 'B' : y < 17 ? 'C' : 'D';
      if (y === 0) key = 'A';
      // ripples: short light dashes, further apart as the water deepens
      if (y % 5 === 2 && (x * 7 + y * 3) % 23 < 3 && y < 14) key = 'A';
      else if (y % 6 === 4 && (x * 5 + y) % 29 < 2) key = y < 10 ? 'C' : 'D';
      put(c, x, y, key);
    }
  }
  return toSprite(c, palOf());
}

/** A stand of reeds: tall blades in three greens and two brown cattails. 14 x 22. */
function reeds(): SpriteDef {
  const c = canvas(14, 22);
  const blades: readonly (readonly [number, number, number, string])[] = [
    [2, 21, 6, 'i'],
    [4, 21, 3, 'j'],
    [6, 21, 8, 'h'],
    [8, 21, 1, 'j'],
    [10, 21, 5, 'i'],
    [12, 21, 9, 'j'],
  ];
  for (const [x, from, to, key] of blades) {
    for (let y = from; y >= to; y--) {
      put(c, x + (y < to + 5 && x < 7 ? 0 : 0), y, key);
      if (y > to + 12) put(c, x + 1, y, 'l');
    }
  }
  // the cattails
  for (const x of [6, 4]) {
    fill(c, x, x === 6 ? 2 : 5, 2, 5, 'T');
    put(c, x, x === 6 ? 2 : 5, 'U');
    put(c, x + 1, x === 6 ? 1 : 4, 'T');
  }
  return toSprite(c, palOf());
}

/** Three lily pads on the water, one with a pink flower. 34 x 5. */
function lilyPads(): SpriteDef {
  const c = canvas(34, 5);
  for (const x of [0, 13, 25]) {
    solid(
      c,
      { x, y: 1, w: 9, h: 4 },
      inEllipse(x, 1, 9, 4),
      { light: 'h', mid: 'i', dark: 'j' },
      { ink: false },
    );
    put(c, x + 6, 2, '.');
    put(c, x + 7, 2, '.');
  }
  fill(c, 15, 0, 3, 2, 'S');
  put(c, 16, 0, 'z');
  return toSprite(c, palOf());
}

/** The bridge: a small wooden arch across the whole pond, planks on top, a railing, a stone footing at each end. 168 x 30. */
const BRIDGE_W = 168;
const BRIDGE_H = 30;
function bridge(): SpriteDef {
  const c = canvas(BRIDGE_W, BRIDGE_H);
  const ground = BRIDGE_H - 1;
  const half = BRIDGE_W / 2;
  const rise = 15;
  const topAt = (x: number): number => {
    const t = (x + 0.5 - half) / half;
    return ground - 3 - Math.round(rise * (1 - t * t));
  };
  // the deck's body: five rows thick; the arch under it is left clear
  const deck: Shape = (x, y) => y >= topAt(x) && y < topAt(x) + 5;
  solid(c, { x: 0, y: 0, w: BRIDGE_W, h: BRIDGE_H }, deck, WOOD, { shade: 'rows' });
  // planks: a seam every eight pixels
  for (let x = 4; x < BRIDGE_W; x += 8) {
    const y = topAt(x);
    if (get(c, x, y + 1) !== 'k') put(c, x, y + 1, 't');
    if (get(c, x, y + 2) !== 'k') put(c, x, y + 2, 't');
  }
  // the railing: posts every 14 px and a rail following the deck
  for (let x = 6; x < BRIDGE_W - 4; x += 14) {
    const y = topAt(x);
    fill(c, x, y - 8, 2, 8, 'k');
    fill(c, x, y - 8, 1, 7, 's');
    put(c, x, y - 8, 'r');
  }
  for (let x = 6; x < BRIDGE_W - 5; x++) {
    const y = topAt(x) - 7;
    put(c, x, y - 1, 'k');
    put(c, x, y, 'r');
    put(c, x, y + 1, 's');
    put(c, x, y + 2, 'k');
  }
  // the footings: a block of stone either end, down to the ground
  for (const x0 of [0, BRIDGE_W - 10]) {
    solid(
      c,
      { x: x0, y: topAt(x0 + 5) + 2, w: 10, h: ground + 1 - (topAt(x0 + 5) + 2) },
      inRect(x0, 0, 10, BRIDGE_H),
      { light: 'a', mid: 'b', dark: 'd' },
    );
  }
  return toSprite(c, palOf());
}

/** Water for the pond's own tile (the postcard and a room that borrows it). */
const POND_WATER_TILE: SpriteDef = {
  rows: [
    'MMMMMMMMMMMMMMMM',
    'MLLLMMMMMMMLLMMM',
    'MMMMMMMMMMMMMMMM',
    'MMMMMDDDMMMMMMMM',
    'MMMMMMMMMMMMMMMM',
    'LLMMMMMMMMMMMMLL',
    'MMMMMMMMMMAMMMMM',
    'DDMMMMMMMMMMMMMD',
  ],
  palette: { L: PAL['A'] ?? '', M: PAL['B'] ?? '', D: PAL['C'] ?? '', A: PAL['D'] ?? '' },
};

// ---------------------------------------------------------------------------------------------
// The pack

export const HOUSE_ART: HouseArtPack = {
  skins: {
    'landing-wall': { tile: LANDING_WALL },
    'landing-floor': { tile: LANDING_FLOOR },
    'observatory-wall': { tile: OBS_WALL },
    'observatory-floor': { tile: OBS_FLOOR },
    'orchard-apple': { tile: orchardTile('apple'), scenery: orchardScenery('apple') },
    'orchard-plum': { tile: orchardTile('plum'), scenery: orchardScenery('plum') },
    'orchard-pear': { tile: orchardTile('pear'), scenery: orchardScenery('pear') },
    'pond-water': { tile: POND_WATER_TILE },
  },
  shell: {
    finial: finial(),
    'balcony-rail': balconyRail(),
    corbel: corbel(),
    'tower-window': towerWindow(),
    telescope: telescope(),
    bridge: bridge(),
    reeds: reeds(),
    'lily-pads': lilyPads(),
    'pond-rim': pondRim(),
    'pond-water': pondWater(),
  },
};
