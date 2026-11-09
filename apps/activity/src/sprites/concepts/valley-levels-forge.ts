/**
 * The Forge (the Workshop), five levels on one 56x60 canvas, all standing on row 51 with the ember glow lying on the
 * ground in front of the fire (rows 52 to 58). Every material comes from `valley-tiers` (docs/design/art-levels.md):
 * 1 Humble (logs, rope, straw, fieldstone), 2 Settled (planks, shingles), 3 Stone (cut stone, slate, black iron),
 * 4 Valley (teal-and-cream awning, brass lamps, glass), 5 Crystal (crystal finial and inlay, gold trim).
 * A forge stays stone from level 1 up; the wood is a frame, a roof, a sign. Pixels are drawn by the small helpers
 * below, so each level is a list of parts, and the result is plain pixel data like any sprite.
 */
import type { SpriteDef } from '../sprite-data';
import { tierPalette } from './valley-tiers';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { ConceptSet } from './index';

const W = 56;
const H = 60;

type Grid = string[][];
type Built = { sprite: SpriteDef; day: Record<string, string> };
const blank = (): Grid => Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
const px = (g: Grid, x: number, y: number, c: string): void => {
  if (x >= 0 && x < W && y >= 0 && y < H) (g[y] as string[])[x] = c;
};
const at = (g: Grid, x: number, y: number): string => g[y]?.[x] ?? '.';
const rect = (g: Grid, x: number, y: number, w: number, h: number, c: string): void => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c);
};
const stamp = (g: Grid, x: number, y: number, rows: readonly string[]): void => {
  rows.forEach((row, j) =>
    [...row].forEach((c, i) => {
      if (c !== '.') px(g, x + i, y + j, c);
    }),
  );
};
/** A filled trapezoid (a roof or a mound): half widths at the top and bottom row, centred on cx. */
const trap = (
  g: Grid,
  cx: number,
  y0: number,
  y1: number,
  h0: number,
  h1: number,
  c: string,
): void => {
  for (let y = y0; y <= y1; y++) {
    const t = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
    const half = Math.round(h0 + t * (h1 - h0));
    for (let x = cx - half; x <= cx + half; x++) px(g, x, y, c);
    px(g, cx - half, y, 'k');
    px(g, cx + half, y, 'k');
  }
};
const box = (g: Grid, x: number, y: number, w: number, h: number, fill: string): void => {
  rect(g, x, y, w, h, 'k');
  rect(g, x + 1, y + 1, w - 2, h - 2, fill);
};

/** The ember glow on the ground: stepped rings, dithered at each step, in front of the fire at column fx. */
function glow(g: Grid, fx: number, rx: number, ry: number): void {
  const cy = 54;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = ((x - fx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const odd = (x + y) % 2 === 1;
      let c = '.';
      if (d < 0.1 || (d < 0.15 && !odd)) c = '4';
      else if (d < 0.28 || (d < 0.36 && !odd)) c = '3';
      else if (d < 0.58 || (d < 0.68 && !odd)) c = '2';
      else if (d < 0.9 || (d < 1 && !odd)) c = '1';
      if (c !== '.') px(g, x, y, c);
    }
}

const FLAME = [
  '...o...',
  '..oyo..',
  '..oyo..',
  '.ooyoo.',
  '.oyyyo.',
  '.oycyo.',
  'oyyccyo',
  'oyccccy',
  'ooyyyoo',
];
/** The fire, bottom row on `bottom`, centred on cx; small = the shorter level 1 flame. */
const fire = (g: Grid, cx: number, bottom: number, small = false): void => {
  const rows = small ? FLAME.slice(2) : FLAME;
  stamp(g, cx - 3, bottom - rows.length + 1, rows);
};
const dots = (g: Grid, pts: readonly (readonly [number, number, string])[]): void => {
  for (const [x, y, c] of pts) px(g, x, y, c);
};

/** Cut-stone courses on a wall block: base colour, mortar shade, staggered joints. */
function masonry(
  g: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  mortar: string,
  course: number,
): void {
  rect(g, x, y, w, h, base);
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / course);
    if (j % course === course - 1) rect(g, x, y + j, w, 1, mortar);
    else for (let i = (row % 2) * 4 + 3; i < w; i += 8) px(g, x + i, y + j, mortar);
  }
}
/** A gable roof of courses: a shade line every `course` rows and staggered ticks between. */
function roof(
  g: Grid,
  cx: number,
  y0: number,
  y1: number,
  h0: number,
  h1: number,
  c: string,
  shade: string,
  course = 3,
): void {
  trap(g, cx, y0, y1, h0, h1, c);
  for (let y = y0 + 1; y <= y1; y++) {
    const k = (y - y0) % course;
    const half = Math.round(h0 + ((y - y0) / Math.max(1, y1 - y0)) * (h1 - h0));
    for (let x = cx - half + 1; x < cx + half; x++) {
      if (k === course - 1) px(g, x, y, shade);
      else if (k === 1 && (x + (Math.floor((y - y0) / course) % 2) * 2) % 4 === 0)
        px(g, x, y, shade);
    }
  }
}

const OWN_NIGHT = {
  k: '#0d0a1a',
  o: '#ff9a2e',
  y: '#ffd966',
  c: '#fff6c8',
  '1': '#6a7a3a',
  '2': '#a8742c',
  '3': '#e8923a',
  '4': '#ffc860',
};
const OWN_DAY = {
  o: '#ff9a2e',
  y: '#ffd966',
  c: '#fff6c8',
  '1': '#3e6a44',
  '2': '#4a4038',
  '3': '#2e2828',
  '4': '#242020',
};
type Part = { palette: Record<string, string>; day: Record<string, string> };
const IRON: Part = { palette: { i: '#1c1a2c' }, day: { i: '#2e2c3a' } };

/** The palette of the keys the grid really uses (at most 16), night and day. */
const finish = (
  g: Grid,
  parts: readonly Part[],
  extraNight: Record<string, string> = {},
  extraDay: Record<string, string> = {},
): Built => {
  const palette: Record<string, string> = { ...OWN_NIGHT, ...extraNight };
  const day: Record<string, string> = { ...OWN_DAY, ...extraDay };
  for (const p of parts) {
    Object.assign(palette, p.palette);
    Object.assign(day, p.day);
  }
  const used = new Set(g.flat());
  for (const key of Object.keys(palette)) {
    if (!used.has(key)) {
      delete palette[key];
      delete day[key];
    }
  }
  return { sprite: { palette, rows: g.map((r) => r.join('')) }, day };
};

// ---------------------------------------------------------------- level 1: Humble
function forge1(): Built {
  const g = blank();
  const FX = 24;
  glow(g, FX, 22, 5.5);
  // lean-to: two crooked posts, a crossbeam, a straw roof
  rect(g, 11, 28, 3, 24, 'L');
  rect(g, 13, 28, 1, 24, 'M');
  rect(g, 41, 29, 3, 23, 'L');
  rect(g, 43, 29, 1, 23, 'M');
  rect(g, 9, 27, 37, 2, 'L');
  rect(g, 9, 29, 37, 1, 'M');
  trap(g, 27, 20, 26, 9, 18, 'S');
  for (let y = 21; y <= 26; y++)
    for (let x = 9; x <= 46; x += 3) if (at(g, x + (y % 2), y) === 'S') px(g, x + (y % 2), y, 'L');
  for (const x of [10, 14, 19, 25, 31, 36, 41, 45]) px(g, x, 27, 'S');
  // rope lashings
  dots(g, [
    [11, 27, 'R'],
    [12, 28, 'R'],
    [13, 27, 'R'],
    [41, 28, 'R'],
    [42, 29, 'R'],
    [43, 28, 'R'],
  ]);
  rect(g, 11, 35, 3, 1, 'R');
  rect(g, 41, 36, 3, 1, 'R');
  // a hammer and tongs on the beam
  dots(g, [
    [30, 30, 'M'],
    [30, 31, 'M'],
    [29, 32, 'k'],
    [31, 32, 'k'],
    [38, 30, 'R'],
    [38, 31, 'k'],
    [38, 32, 'k'],
  ]);
  // the fieldstone hearth: a mound with the fire in its mouth
  trap(g, FX, 36, 51, 3, 9, 'F');
  for (const [x, y] of [
    [20, 39],
    [25, 38],
    [17, 43],
    [29, 42],
    [18, 47],
    [31, 47],
    [22, 36],
    [27, 41],
    [16, 50],
    [32, 50],
  ] as const)
    px(g, x, y, 'k');
  for (const [x, y] of [
    [21, 38],
    [26, 40],
    [19, 45],
    [30, 45],
    [23, 49],
  ] as const)
    px(g, x, y, 'M');
  rect(g, FX - 4, 44, 9, 8, 'k');
  rect(g, FX - 3, 43, 7, 1, 'k');
  px(g, FX - 4, 44, 'F');
  px(g, FX + 4, 44, 'F');
  rect(g, FX - 3, 50, 7, 1, 'o');
  fire(g, FX, 50, true);
  dots(g, [
    [22, 33, 'o'],
    [27, 31, 'y'],
    [25, 28, 'o'],
    [29, 35, 'y'],
  ]);
  // the stump anvil
  rect(g, 33, 47, 7, 5, 'L');
  rect(g, 38, 47, 2, 5, 'M');
  rect(g, 33, 47, 7, 1, 'R');
  rect(g, 32, 43, 9, 1, 'F');
  rect(g, 34, 44, 6, 1, 'k');
  rect(g, 35, 45, 4, 1, 'k');
  rect(g, 34, 46, 6, 1, 'k');
  dots(g, [
    [41, 43, 'F'],
    [31, 43, 'k'],
    [42, 43, 'k'],
    [31, 51, 'F'],
    [30, 51, 'F'],
    [31, 50, 'F'],
  ]);
  return finish(g, [
    tierPalette(1, { L: 'log', M: 'logShade', R: 'rope', S: 'straw', F: 'fieldstone' }),
  ]);
}

// ---------------------------------------------------------------- level 2: Settled
function forge2(): Built {
  const g = blank();
  const FX = 22;
  glow(g, FX, 24, 5.5);
  // fieldstone walls with a timber frame
  masonry(g, 8, 32, 31, 20, 'F', 'k', 5);
  rect(g, 7, 31, 33, 1, 'k');
  rect(g, 7, 32, 1, 20, 'k');
  rect(g, 39, 32, 1, 20, 'k');
  rect(g, 8, 32, 3, 20, 'p');
  rect(g, 36, 32, 3, 20, 'p');
  rect(g, 10, 32, 1, 20, 'q');
  rect(g, 38, 32, 1, 20, 'q');
  rect(g, 8, 33, 31, 2, 'p');
  rect(g, 8, 35, 31, 1, 'q');
  for (let i = 0; i < 4; i++) {
    px(g, 11 + i, 36 + i, 'q');
    px(g, 35 - i, 36 + i, 'q');
  }
  // the shingle roof
  roof(g, 23, 20, 31, 6, 18, 's', 'h');
  rect(g, 4, 31, 39, 1, 'p');
  px(g, 5, 30, 'p');
  px(g, 41, 30, 'p');
  // a stone chimney
  rect(g, 30, 8, 7, 14, 'F');
  rect(g, 29, 8, 9, 1, 'k');
  for (const y of [11, 14, 17, 20]) rect(g, 30, y, 7, 1, 'k');
  for (const [x, y] of [
    [33, 9],
    [31, 12],
    [35, 12],
    [33, 15],
    [31, 18],
    [35, 18],
  ] as const)
    px(g, x, y, 'k');
  dots(g, [
    [33, 5, 'o'],
    [35, 3, 'y'],
    [31, 2, 'o'],
    [34, 0, 'y'],
  ]);
  // the hearth mouth and fire
  rect(g, FX - 6, 41, 13, 11, 'k');
  rect(g, FX - 5, 40, 11, 1, 'k');
  rect(g, FX - 4, 39, 9, 1, 'k');
  rect(g, FX - 5, 40, 1, 1, 'F');
  rect(g, FX - 7, 51, 15, 1, 'F');
  rect(g, FX - 4, 50, 9, 1, 'o');
  fire(g, FX, 50);
  // the bellows pointing at the fire, hung by a rope
  stamp(g, 9, 43, ['..qqq..', '.qppq..', 'qpppqkk', 'qpppqkk', '.qppq..', '..qqq..']);
  rect(g, 10, 49, 1, 2, 'q');
  dots(g, [
    [9, 41, 'R'],
    [9, 42, 'R'],
    [10, 42, 'R'],
  ]);
  // plank sign with a hammer
  rect(g, 47, 33, 2, 19, 'p');
  rect(g, 48, 33, 1, 19, 'q');
  rect(g, 41, 34, 7, 1, 'q');
  box(g, 41, 36, 11, 8, 'p');
  dots(g, [
    [44, 41, 'k'],
    [45, 40, 'k'],
    [46, 39, 'k'],
    [47, 38, 'k'],
    [46, 38, 'k'],
    [47, 39, 'k'],
    [48, 38, 'k'],
    [43, 36, 'R'],
    [50, 36, 'R'],
  ]);
  // a fieldstone footing
  dots(g, [
    [5, 51, 'F'],
    [6, 51, 'F'],
    [5, 50, 'F'],
    [42, 51, 'F'],
    [43, 51, 'F'],
    [44, 51, 'F'],
  ]);
  return finish(g, [
    tierPalette(1, { F: 'fieldstone', R: 'rope' }),
    tierPalette(2, { p: 'plank', q: 'plankShade', s: 'shingle', h: 'shingleShade' }),
  ]);
}

// ---------------------------------------------------------------- level 3: Stone
/** The cut-stone smithy of levels 3 to 5: walls, quoins, slate roof, tall chimney, big arch with an iron lintel. */
function stoneSmithy(g: Grid, FX: number, slateShade = 'V', iron = 'i'): void {
  const top = 18;
  masonry(g, 6, 31, 42, 21, 'g', 'G', 4);
  rect(g, 5, 30, 44, 1, 'k');
  rect(g, 5, 31, 1, 21, 'k');
  rect(g, 48, 31, 1, 21, 'k');
  rect(g, 6, 49, 42, 3, 'G');
  for (let x = 6; x < 48; x += 7) px(g, x + 3, 50, 'k');
  for (let y = 31; y < 49; y += 4) {
    rect(g, 6, y, 3, 3, 'w');
    rect(g, 45, y, 3, 3, 'w');
  }
  roof(g, 27, top, 29, 8, 22, 'v', slateShade);
  rect(g, 4, 29, 46, 2, iron);
  rect(g, 4, 31, 46, 1, 'k');
  // chimney
  rect(g, 37, 4, 9, top - 1, 'g');
  rect(g, 44, 4, 2, top - 1, 'G');
  rect(g, 37, 4, 1, top - 1, 'w');
  for (let y = 8; y < top; y += 4) rect(g, 37, y, 9, 1, 'G');
  rect(g, 36, 3, 11, 2, 'k');
  rect(g, 36, 5, 11, 1, iron);
  // the arch with an iron lintel
  rect(g, FX - 8, 37, 17, 1, iron);
  rect(g, FX - 8, 36, 17, 1, 'k');
  for (let x = FX - 7; x <= FX + 7; x += 3) px(g, x, 36, 'w');
  rect(g, FX - 7, 38, 15, 14, 'k');
  px(g, FX - 7, 38, 'G');
  px(g, FX + 7, 38, 'G');
  rect(g, FX - 8, 51, 17, 1, 'w');
  rect(g, FX - 5, 50, 11, 1, 'o');
  fire(g, FX, 50);
}
const BIG_ANVIL = [
  '.kkkkkkkkkk.',
  'kkwwwkkkkkkk',
  '.kkkkkkkkk..',
  '...kkkkk....',
  '...kkkkk....',
  '..kkkkkkk...',
];
function forge3(): Built {
  const g = blank();
  const FX = 22;
  glow(g, FX, 27, 5.5);
  stoneSmithy(g, FX);
  dots(g, [
    [40, 1, 'o'],
    [43, 0, 'y'],
    [38, 2, 'y'],
  ]);
  // a plank door with black iron hinges
  box(g, 38, 37, 8, 14, 'p');
  for (const x of [41, 43]) rect(g, x, 38, 1, 12, 'q');
  rect(g, 39, 39, 6, 1, 'k');
  rect(g, 39, 47, 6, 1, 'k');
  px(g, 44, 44, 'w');
  // the big iron anvil on a stone block
  rect(g, 4, 47, 9, 5, 'G');
  rect(g, 4, 47, 9, 1, 'w');
  rect(g, 4, 51, 9, 1, 'k');
  stamp(g, 1, 41, BIG_ANVIL);
  return finish(g, [
    tierPalette(2, { p: 'plank', q: 'plankShade' }),
    tierPalette(3, { g: 'stone', G: 'stoneShade', w: 'stoneLight', v: 'slate', V: 'slateShade' }),
    IRON,
  ]);
}

// ---------------------------------------------------------------- level 4: Valley
function forge4(): Built {
  const g = blank();
  const FX = 22;
  glow(g, FX, 27, 5.5);
  stoneSmithy(g, FX, 'G', 'k');
  dots(g, [
    [40, 1, 'o'],
    [43, 0, 'y'],
    [38, 2, 'y'],
  ]);
  // the teal-and-cream awning over the fire
  for (let i = 0; i < 20; i++) {
    const c = Math.floor(i / 2) % 2 === 0 ? 't' : 'm';
    rect(g, FX - 10 + i, 31, 1, 5, c);
    if (i % 2 === 0) px(g, FX - 10 + i, 36, c);
  }
  rect(g, FX - 11, 30, 22, 1, 'k');
  rect(g, FX - 11, 31, 1, 5, 'k');
  rect(g, FX + 10, 31, 1, 5, 'k');
  // brass lamps on brackets, lit by night
  for (const lx of [FX - 13, FX + 13]) {
    px(g, lx, 37, 'k');
    stamp(g, lx - 1, 38, ['bbb', 'byb', 'bbb']);
    px(g, lx, 41, 'b');
  }
  // a glass window in a brass frame
  box(g, 37, 36, 10, 10, 'b');
  rect(g, 38, 37, 8, 8, 'z');
  rect(g, 41, 37, 1, 8, 'b');
  rect(g, 38, 40, 8, 1, 'b');
  px(g, 39, 38, 'm');
  // a quench trough
  box(g, 38, 48, 14, 4, 'G');
  rect(g, 39, 49, 12, 1, 'z');
  rect(g, 39, 50, 12, 1, 'k');
  // the anvil on a stone block
  rect(g, 4, 47, 9, 5, 'G');
  rect(g, 4, 47, 9, 1, 'w');
  rect(g, 4, 51, 9, 1, 'k');
  stamp(g, 1, 41, BIG_ANVIL);
  // the pennant on a pole above the roof
  rect(g, 19, 3, 1, 16, 'k');
  px(g, 19, 2, 'b');
  stamp(g, 20, 3, [
    'tttttttttt',
    'ttmmmmmmtt',
    'tmmttttmmt',
    'ttmmmmmmt.',
    'tttttttt..',
    'ttmmmmt...',
    'tttttt....',
    'tttt......',
  ]);
  return finish(
    g,
    [
      tierPalette(3, { g: 'stone', G: 'stoneShade', w: 'stoneLight', v: 'slate', V: 'slateShade' }),
      tierPalette(4, { t: 'teal', m: 'cream', b: 'brass' }),
      IRON,
    ],
    { z: '#f0d8a0' },
    { z: '#a8d4e0' },
  );
}

// ---------------------------------------------------------------- level 5: Crystal
function forge5(): Built {
  const g = blank();
  const FX = 22;
  glow(g, FX, 28, 5.5);
  stoneSmithy(g, FX, 'G', 'k');
  // a crystal finial on the chimney, with sparks
  stamp(g, 38, 0, ['..DD....', '.DCCd...', '.DCCCd..', 'DCCDCCd.', 'DCCCCCd.', '.dCCCd..']);
  dots(g, [
    [37, 1, 'y'],
    [47, 2, 'o'],
    [36, 4, 'o'],
    [48, 0, 'y'],
    [46, 5, 'y'],
  ]);
  // gold trim on the eaves, the lintel and the arch
  rect(g, 4, 29, 46, 1, 'Z');
  rect(g, FX - 8, 36, 17, 1, 'Z');
  rect(g, FX - 8, 37, 1, 15, 'Z');
  rect(g, FX + 8, 37, 1, 15, 'Z');
  for (let x = 5; x < 49; x += 4) px(g, x, 31, 'Z');
  dots(g, [
    [26, 17, 'Z'],
    [27, 16, 'Z'],
    [28, 17, 'Z'],
  ]);
  // gold bands round the chimney and a gold ridge cap, crystal shards at the eave ends
  for (const y of [9, 14]) rect(g, 37, y, 9, 1, 'Z');
  rect(g, 24, 18, 7, 1, 'Z');
  for (const sx of [3, 48]) stamp(g, sx, 25, ['.D.', 'DCd', 'dCd', '.d.']);
  // crystal inlays in the wall either side of the arch
  for (const cx of [10, 34]) stamp(g, cx, 40, ['.D.', 'DCd', 'DCd', 'dCd', '.d.']);
  // a second crystal spire on the ridge, gold-footed
  stamp(g, 25, 8, ['..D..', '.DCd.', '.DCd.', 'DCCCd', 'DCDCd', 'dCCCd', '.dCd.']);
  rect(g, 24, 15, 7, 1, 'Z');
  rect(g, 25, 16, 5, 2, 'Z');
  dots(g, [
    [23, 9, 'y'],
    [31, 6, 'o'],
    [27, 5, 'y'],
  ]);
  // a crystal pane in a gold frame, lit by day too
  box(g, 38, 36, 9, 9, 'Z');
  rect(g, 39, 37, 7, 7, 'C');
  rect(g, 40, 38, 2, 2, 'D');
  rect(g, 42, 40, 3, 3, 'd');
  // a gold-banded iron door and a lit crystal trough
  rect(g, 38, 46, 9, 5, 'k');
  rect(g, 39, 47, 7, 1, 'Z');
  rect(g, 39, 49, 7, 1, 'Z');
  box(g, 38, 49, 14, 3, 'G');
  rect(g, 39, 50, 12, 1, 'C');
  // the anvil on a gold-edged block
  rect(g, 4, 47, 9, 5, 'G');
  rect(g, 4, 47, 9, 1, 'Z');
  rect(g, 4, 51, 9, 1, 'k');
  stamp(g, 1, 41, BIG_ANVIL);
  // gold lamps
  for (const lx of [FX - 12, FX + 12]) stamp(g, lx - 1, 38, ['ZZZ', 'ZyZ', 'ZZZ']);
  return finish(g, [
    tierPalette(3, { g: 'stone', G: 'stoneShade', w: 'stoneLight', v: 'slate', V: 'slateShade' }),
    tierPalette(5, { C: 'crystal', D: 'crystalLight', d: 'crystalShade', Z: 'gold' }),
    IRON,
  ]);
}

const make = (note: string, built: Built): ConceptSet['sprites'][string] => ({
  kind: 'free',
  status: 'draft',
  note,
  sprite: built.sprite,
  alts: { day: built.day },
});

export const VALLEY_LEVELS_FORGE_CONCEPTS: ConceptSet = {
  id: 'valley-levels-forge',
  title: 'The Forge, level by level',
  requested:
    '2026-11-09 (Misa): "Each building can absolutely change building material as it upgrades in levels ... Naturally a forge can\'t be made of wood, but it can have wooden elements on it ... Think of how Clash of Clans brings a new look with each new town hall level."',
  status: 'draft',
  notes: [
    'Five levels on one 56x60 canvas, all standing on row 51, centred; smaller levels leave the top and sides empty. Colours from valley-tiers, 16 or fewer per sprite.',
    'Night is the main palette with the ember glow lying on the ground in stepped rings in front of the fire; alts.day is the same pixels with the fire still lit and a soot-dark yard.',
    'Level 1 Humble: an open-air smithy: a fieldstone hearth mound with a small fire, a stump with a small anvil, a crooked rope-lashed log frame under a straw roof.',
    'Level 2 Settled: a small fieldstone forge in a sawn-timber frame under a red-brown shingle roof, a stone chimney, a bellows, a plank sign with a hammer.',
    'Level 3 Stone: a cut-stone smithy with a slate roof, black iron eave band and lintel, a tall stone chimney, a plank door with iron hinges and a big iron anvil.',
    'Level 4 Valley: the stone forge with a teal-and-cream awning over the fire, a teal pennant, brass lamps, a glass window and a quench trough.',
    'Level 5 Crystal: the master forge: a glowing crystal finial on the chimney, crystal inlays and pane, gold trim on eaves and lintel, gold lamps, sparks. The crystal glows by day too.',
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  sprites: {
    'forge-1': make(
      'Level 1: open-air smithy, stone hearth, stump anvil, rope-lashed frame.',
      forge1(),
    ),
    'forge-2': make('Level 2: fieldstone forge, timber frame, shingles, bellows, sign.', forge2()),
    'forge-3': make('Level 3: cut stone, slate, black iron, tall chimney, big anvil.', forge3()),
    'forge-4': make(
      'Level 4: teal-and-cream awning, pennant, brass lamps, glass, trough.',
      forge4(),
    ),
    'forge-5': make('Level 5: crystal finial and inlays, gold trim, sparks.', forge5()),
  },
  levels: {
    forge: [
      'valley-levels-forge/forge-1',
      'valley-levels-forge/forge-2',
      'valley-levels-forge/forge-3',
      'valley-levels-forge/forge-4',
      'valley-levels-forge/forge-5',
    ],
  },
};
