/**
 * The School in five levels (docs/design/art-levels.md), concept art (not in the game), "valley glow" style
 * (`valley-glow.ts`): night is the main palette with warm window light lying on the grass, `alts.day` is the
 * same pixels with plain glass. Every level is 64x64 and stands on the same base row; materials come from
 * `valley-tiers.ts` so a level reads like the same level of the other buildings.
 *
 * 1 Humble: a one-room log hut, thatch roof, one window, the bell on a rope-lashed post beside it.
 * 2 Settled: a plank schoolhouse, shingle roof, two windows, a plank sign, the bell on a small timber frame.
 * 3 Stone: stone walls, slate roof, a stone bell tower over the door replaces the side bell, black iron.
 * 4 Valley: cream trim, teal shutters and pennant on the tower, brass lamps by the door, glass windows.
 * 5 Crystal: a crystal on the tower spire, gold eave trim, a wider hall, a crystal inlay on the tower.
 *
 * The pixels are drawn by the small functions below (shapes, textures, an automatic ink outline) and kept as
 * data like any other sprite; the door and the bell boxes are exported for the game and the test.
 */
import type { SpriteDef } from '../sprite-data';
import { INK, tierPalette } from './valley-tiers';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { ConceptSet } from './index';

export const SCHOOL_SIZE = 64;
/** The door: always these two columns, rows `top` to `bottom` inclusive (the base row), key `d`. */
export const SCHOOL_DOOR = { x0: 31, x1: 32, top: 51, bottom: 57 } as const;
/** Top-left of the 6x6 box around the bell at rest, per level (the bell overlay is drawn here). */
export const SCHOOL_BELL_BOXES: Readonly<
  Record<1 | 2 | 3 | 4 | 5, readonly [x: number, y: number]>
> = {
  1: [53, 37],
  2: [52, 38],
  3: [29, 18],
  4: [29, 18],
  5: [29, 18],
};
/** The pixels of the bell (and nothing else) use these keys. */
export const SCHOOL_BELL_KEYS = 'bB';

type Level = 1 | 2 | 3 | 4 | 5;
const BASE = 57; // the last wall row; the outline is row 58

interface Canvas {
  obj: string[][];
  gnd: string[][];
}

function newCanvas(): Canvas {
  const grid = (): string[][] =>
    Array.from({ length: SCHOOL_SIZE }, () => Array<string>(SCHOOL_SIZE).fill('.'));
  return { obj: grid(), gnd: grid() };
}

type Tex = string | ((x: number, y: number) => string);

function drawer(c: Canvas) {
  const p = (x: number, y: number, ch: string): void => {
    const row = c.obj[y];
    if (row === undefined || x < 0 || x >= SCHOOL_SIZE) throw new Error(`off canvas ${x},${y}`);
    row[x] = ch;
  };
  const g = (x: number, y: number, ch: string): void => {
    const row = c.gnd[y];
    if (row !== undefined && x >= 0 && x < SCHOOL_SIZE) row[x] = ch;
  };
  const tex = (t: Tex, x: number, y: number): string => (typeof t === 'string' ? t : t(x, y));
  const rect = (x0: number, y0: number, x1: number, y1: number, t: Tex): void => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) p(x, y, tex(t, x, y));
  };
  /** A symmetric trapezoid about the door axis (x 31.5), width w0 at y0 growing to w1 at y1. */
  const hip = (y0: number, y1: number, w0: number, w1: number, t: Tex): void => {
    for (let y = y0; y <= y1; y += 1) {
      const f = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
      const w = 2 * Math.round((w0 + (w1 - w0) * f) / 2);
      for (let x = 32 - w / 2; x <= 31 + w / 2; x += 1) p(x, y, tex(t, x, y));
    }
  };
  const window = (x: number, y: number, w: number, h: number, frame: string): void => {
    for (let yy = y; yy < y + h; yy += 1)
      for (let xx = x; xx < x + w; xx += 1) {
        const edge = xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1;
        const bar =
          (w >= 5 && xx === x + Math.floor(w / 2)) || (h >= 5 && yy === y + Math.floor(h / 2));
        p(xx, yy, edge || bar ? frame : 'y');
      }
  };
  /** Warm light on the grass below a window or lamp: ellipse, bright core, dithered rim. */
  const spill = (cx: number, rx: number, rows = 6): void => {
    for (let dy = 0; dy < rows; dy += 1)
      for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x += 1) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (dy + 0.2) / rows);
        const y = 58 + dy;
        if (d < 0.55) g(x, y, '3');
        else if (d < 0.8) g(x, y, '2');
        else if (d < 1.05) g(x, y, '1');
        else if (d < 1.25 && (x + dy) % 2 === 0) g(x, y, '1');
      }
  };
  const shadow = (x0: number, x1: number): void => {
    for (let x = x0; x <= x1 + 2; x += 1) g(x, 59, 'x');
    for (let x = x0 + 3; x <= x1 + 1; x += 1) g(x, 60, 'x');
  };
  /** The door key `d` (rows top to bottom, x 31-32) and a frame in `frame` on both sides and above. */
  const door = (frame: string): void => {
    rect(SCHOOL_DOOR.x0, SCHOOL_DOOR.top, SCHOOL_DOOR.x1, SCHOOL_DOOR.bottom, 'd');
    rect(30, SCHOOL_DOOR.top - 1, 33, SCHOOL_DOOR.top - 1, frame);
    rect(30, SCHOOL_DOOR.top, 30, SCHOOL_DOOR.bottom, frame);
    rect(33, SCHOOL_DOOR.top, 33, SCHOOL_DOOR.bottom, frame);
  };
  /** The bell in its 6x6 box (rest pose). `hang` is the key of the two hanger pixels. */
  const bell = (bx: number, by: number, hang: string): void => {
    const rows = ['..HH..', '.kbbk.', 'kbbbBk', 'kbbbBk', 'kBBBBk', '.kkkk.'];
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== '.') p(bx + dx, by + dy, ch === 'H' ? hang : ch);
      }),
    );
  };
  const outline = (): void => {
    const copy = c.obj.map((r) => [...r]);
    for (let y = 0; y < SCHOOL_SIZE; y += 1)
      for (let x = 0; x < SCHOOL_SIZE; x += 1) {
        if (copy[y]?.[x] !== '.') continue;
        const n = [copy[y - 1]?.[x], copy[y + 1]?.[x], copy[y]?.[x - 1], copy[y]?.[x + 1]];
        if (n.some((v) => v !== undefined && v !== '.')) p(x, y, 'k');
      }
  };
  return { p, g, rect, hip, window, spill, shadow, door, bell, outline };
}

const stoneTex = (x: number, y: number): string =>
  y % 4 === 0 ? 'T' : (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0 ? 'T' : 't';
const slateTex = (x: number, y: number): string =>
  y % 3 === 0 ? 'A' : (x + (y % 2) * 2) % 4 === 0 ? 'A' : 'a';
const shingleTex = (x: number, y: number): string =>
  y % 3 === 0 ? 'S' : (x + (y % 2) * 2) % 4 === 0 ? 'S' : 's';
const plankTex = (x: number, y: number): string =>
  x % 4 === 0 ? 'P' : x % 4 === 2 && y % 7 === 3 ? 'n' : 'p';
const logTex = (_x: number, y: number): string => (y % 3 === 2 ? 'L' : 'l');
const thatchTex = (x: number, y: number): string => ((x * 2 + y * 3) % 7 === 0 ? 'r' : 's');

/** Level 1: a log hut, thatch, one window, the bell on a rope-lashed post. */
function level1(c: Canvas): void {
  const d = drawer(c);
  d.shadow(21, 52);
  d.spill(26.5, 8);
  for (let x = 29; x <= 34; x += 1) for (let y = 58; y <= 60; y += 1) d.g(x, y, 'e');
  d.g(28, 59, 'e');
  d.g(35, 59, 'e');
  // the post: a leaning log, a bare arm, rope lashings
  d.rect(50, 46, 51, BASE, logTex);
  d.rect(51, 36, 52, 45, logTex);
  d.rect(51, 35, 58, 36, (_x, y) => (y === 36 ? 'L' : 'l'));
  d.rect(51, 38, 52, 38, 'r');
  d.rect(50, 50, 51, 50, 'r');
  d.p(57, 35, 'r');
  d.p(58, 36, 'r');
  d.bell(53, 37, 'r');
  for (const x of [48, 49, 52]) d.p(x, BASE, 'f');
  d.p(49, BASE - 1, 'f');
  // the hut: stacked logs with ends sticking out, a thatch roof
  d.rect(22, 44, 41, BASE, logTex);
  for (const y of [47, 53]) {
    d.p(21, y, 'l');
    d.p(42, y, 'L');
    d.p(21, y + 1, 'L');
    d.p(42, y + 3, 'l');
  }
  d.p(21, 50, 'l');
  d.hip(31, 43, 8, 28, thatchTex);
  for (const x of [18, 20, 23, 41, 43, 45]) d.p(x, 43, 'r');
  d.rect(26, 31, 37, 31, 'r');
  d.window(25, 47, 4, 4, 'L');
  d.door('L');
  d.rect(30, 44, 33, 44, 'L');
  for (const [x, y] of [
    [22, BASE],
    [23, BASE],
    [41, BASE],
    [40, BASE],
    [41, BASE - 1],
  ] as const)
    d.p(x, y, 'f');
  d.outline();
}

/** Level 2: a plank schoolhouse, shingles, a plank sign, a timber frame for the bell on the side. */
function level2(c: Canvas): void {
  const d = drawer(c);
  d.shadow(15, 60);
  d.spill(22.5, 9);
  d.spill(41.5, 9);
  d.rect(30, 58, 33, 58, 'p');
  // the bell frame: two posts, a beam, a little shingled cap
  d.rect(50, 36, 51, BASE, plankTex);
  d.rect(58, 36, 59, BASE, plankTex);
  d.rect(49, 36, 60, 37, (_x, y) => (y === 37 ? 'P' : 'p'));
  d.rect(52, 33, 57, 35, shingleTex);
  d.p(50, 40, 'n');
  d.p(59, 40, 'n');
  d.bell(52, 38, 'P');
  // the school
  d.rect(16, 41, 47, BASE, plankTex);
  d.rect(16, 41, 47, 41, 'P');
  d.hip(27, 39, 12, 36, shingleTex);
  d.rect(14, 40, 49, 40, 'S');
  d.rect(26, 27, 37, 27, 'S');
  d.window(20, 46, 5, 6, 'P');
  d.window(39, 46, 5, 6, 'P');
  d.door('P');
  // the plank sign over the door
  d.rect(27, 43, 36, 45, 'p');
  d.rect(27, 45, 36, 45, 'P');
  d.p(27, 43, 'n');
  d.p(36, 43, 'n');
  d.rect(29, 44, 34, 44, 'P');
  d.outline();
}

/** Levels 3 to 5: the stone hall and the bell tower over the door. */
function hall(c: Canvas, level: 3 | 4 | 5): void {
  const d = drawer(c);
  const wide = level === 5;
  const x0 = wide ? 8 : 14;
  const x1 = 63 - x0;
  const trim = level === 3 ? 'T' : level === 4 ? 'm' : 'G';
  const lamp = level === 4 ? 'g' : 'G';
  // level 5 is out of colours: its slate shade is the stone shade
  const slate: Tex = (x, y) => (level === 5 && slateTex(x, y) === 'A' ? 'T' : slateTex(x, y));
  d.shadow(x0 - 1, x1);
  const wins = wide ? [11, 19] : [18];
  const winFrame = level === 3 ? 'k' : 'm';
  for (const wx of wins) {
    d.spill(wx + 2.5, 8);
    d.spill(63 - wx - 2.5, 8);
  }
  if (level >= 4) {
    d.spill(28.5, 4.5, 4);
    d.spill(35.5, 4.5, 4);
  }
  d.rect(29, 58, 34, 60, (x, y) => ((x + y) % 3 === 0 ? 'T' : 't'));
  // hall
  d.rect(x0, 42, x1, BASE, stoneTex);
  d.hip(28, 40, wide ? 30 : 24, wide ? 52 : 40, slate);
  d.rect(x0 - 2, 41, x1 + 2, 41, trim);
  if (level === 5) for (let x = x0 - 2; x <= x1 + 2; x += 4) d.p(x, 40, 'G');
  d.rect(x0, 42, x1, 42, 'T');
  for (const wx of wins) {
    const mx = 63 - wx - 4;
    d.window(wx, 46, 5, 6, winFrame);
    d.window(mx, 46, 5, 6, winFrame);
    if (level === 4) {
      d.rect(wx - 2, 46, wx - 1, 51, 'e');
      d.rect(wx + 5, 46, wx + 6, 51, 'e');
      d.rect(mx - 2, 46, mx - 1, 51, 'e');
      d.rect(mx + 5, 46, mx + 6, 51, 'e');
    }
  }
  // the tower
  d.rect(26, 15, 37, BASE, stoneTex);
  d.hip(8, 14, 2, 14, slate);
  d.rect(25, 15, 38, 15, trim);
  d.rect(26, 16, 37, 16, 'T');
  d.rect(29, 17, 34, 25, 'T');
  d.bell(29, 18, 'k');
  d.rect(26, 28, 37, 28, 'k');
  d.rect(26, 38, 37, 38, 'k');
  for (const x of [27, 36]) {
    d.p(x, 29, 'k');
    d.p(x, 39, 'k');
  }
  d.door(trim);
  d.rect(30, 50, 33, 50, trim);
  if (level >= 4) {
    for (const x of [28, 35]) {
      d.p(x, 47, lamp);
      d.rect(x, 48, x, 49, 'y');
      d.p(x, 50, lamp);
    }
    // the teal-and-cream pennant on a pole on the hall roof
    const px = wide ? 48 : 45;
    d.rect(px, 19, px, 34, lamp);
    [9, 7, 5, 3, 1].forEach((w, i) =>
      d.rect(px + 1, 19 + i, px + w, 19 + i, i % 2 === 0 ? 'e' : 'm'),
    );
  }
  if (level === 5) {
    // the crystal on the spire, and an inlay on the tower face
    d.rect(31, 1, 32, 1, 'm');
    d.rect(30, 2, 33, 7, (x) => (x === 30 ? 'm' : 'C'));
    d.rect(31, 8, 32, 8, 'C');
    d.rect(31, 31, 32, 34, 'C');
    d.rect(30, 32, 33, 33, 'C');
    d.p(31, 32, 'm');
    d.p(31, 31, 'm');
  }
  d.outline();
}

const OWN = {
  night: {
    k: INK,
    d: '#5a3a2e',
    b: '#e0a838',
    B: '#9a6a24',
    x: '#112430',
    y: '#ffd966',
    '1': '#5c7442',
    '2': '#a08c3e',
    '3': '#dca83c',
  },
  day: {
    k: INK,
    d: '#6a4630',
    b: '#c8902c',
    B: '#8a5a20',
    x: '#2f5a38',
    y: '#9cc8e0',
    '1': '#467a4c',
    '2': '#a8945a',
    '3': '#cdb078',
  },
};

function build(
  level: Level,
  parts: readonly { palette: Record<string, string>; day: Record<string, string> }[],
  draw: (c: Canvas) => void,
): { sprite: SpriteDef; day: Record<string, string> } {
  const c = newCanvas();
  draw(c);
  const rows = c.obj.map((row, y) =>
    row.map((ch, x) => (ch !== '.' ? ch : (c.gnd[y]?.[x] ?? '.'))).join(''),
  );
  const used = new Set(rows.join(''));
  const night: Record<string, string> = { ...OWN.night };
  const day: Record<string, string> = { ...OWN.day };
  for (const part of parts) {
    Object.assign(night, part.palette);
    Object.assign(day, part.day);
  }
  const keep = (src: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(src).filter(([k]) => used.has(k)));
  const palette = keep(night);
  for (const k of used) {
    if (k !== '.' && palette[k] === undefined)
      throw new Error(`school-${String(level)}: no colour for ${k}`);
  }
  return { sprite: { palette, rows }, day: keep(day) };
}

const L1 = build(
  1,
  [tierPalette(1, { l: 'log', L: 'logShade', r: 'rope', s: 'straw', e: 'earth', f: 'fieldstone' })],
  level1,
);
const L2 = build(
  2,
  [tierPalette(2, { p: 'plank', P: 'plankShade', s: 'shingle', S: 'shingleShade', n: 'nail' })],
  level2,
);
const STONE = tierPalette(3, { t: 'stone', T: 'stoneShade', a: 'slate', A: 'slateShade' });
const L3 = build(3, [STONE], (c) => hall(c, 3));
const L4 = build(4, [STONE, tierPalette(4, { e: 'teal', m: 'cream', g: 'brass' })], (c) =>
  hall(c, 4),
);
const L5 = build(
  5,
  [STONE, tierPalette(4, { e: 'teal', m: 'cream' }), tierPalette(5, { C: 'crystal', G: 'gold' })],
  (c) => hall(c, 5),
);

export const VALLEY_LEVELS_SCHOOL_CONCEPTS: ConceptSet = {
  id: 'valley-levels-school',
  title: 'The School, level by level',
  requested:
    '2026-11-09 (Misa): "Each building can absolutely change building material as it upgrades in levels, and I\'m thinking we might even want to tweak the earlier levels to be less elaborate. Think the school for example. Its bell could be just on the side of the building until a bell tower replaces it in later levels. If you change materials, there needs to be a common motif between buildings of the same level... Think of how Clash of Clans brings a new look with each new town hall level."',
  status: 'draft',
  notes: [
    'Canvas 64x64 at every level, the art centred on the door axis (between x 31 and 32) and standing on the same base row: the last wall row is y 57, the ink edge y 58.',
    `What the game relies on: the door is the two columns x 31-32, rows ${String(SCHOOL_DOOR.top)}-${String(SCHOOL_DOOR.bottom)} (bottom row 57, key d), the same at every level, so the visiting teacher's yard (80x24, drawn with x 31 and 32 under the door) fits all five. A test checks it.`,
    'The bell is drawn at rest in a 6x6 box (4 wide with an ink rim; the old `school-bell` overlay frames need redrawing for it). Bell box top-left (x, y): level 1 (53, 37) on the post arm; level 2 (52, 38) in the timber frame; levels 3, 4 and 5 (29, 18) in the tower opening. The same numbers are `SCHOOL_BELL_BOXES` in the set file.',
    'Level 1 Humble (log hut, thatch, one window, bell on a rope-lashed post beside it); 2 Settled (planks, shingles, two windows, plank sign, bell on a timber frame); 3 Stone (stone walls, slate roof, bell tower over the door, black iron bands); 4 Valley (cream trim, teal shutters, a teal-and-cream pennant on the tower, brass lamps by the door, glass windows); 5 Crystal (a crystal on the tower spire and an inlay on its face, gold eaves, a wider hall with four windows).',
    'Window light spills on the grass at night; by day the windows are plain glass (the lamps too). Crystal stays teal by day.',
    'Needs the School building levels (V-COM-1) before this art is used.',
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  levels: {
    school: [
      'valley-levels-school/school-1',
      'valley-levels-school/school-2',
      'valley-levels-school/school-3',
      'valley-levels-school/school-4',
      'valley-levels-school/school-5',
    ],
  },
  sprites: {
    'school-1': {
      kind: 'free',
      note: 'Level 1, Humble: a small log hut with a thatch roof, one window and a door on packed earth; the bell hangs from a rope-lashed post beside it. Bell box (53, 37).',
      sprite: L1.sprite,
      alts: { day: L1.day },
    },
    'school-2': {
      kind: 'free',
      note: 'Level 2, Settled: a plank schoolhouse with a red-brown shingle roof, two windows and a plank sign over the door; the bell on a little timber frame at the side. Bell box (52, 38).',
      sprite: L2.sprite,
      alts: { day: L2.day },
    },
    'school-3': {
      kind: 'free',
      note: 'Level 3, Stone: cut stone walls, a slate roof, black iron bands and window bars; a stone bell tower over the door replaces the side bell. Bell box (29, 18).',
      sprite: L3.sprite,
      alts: { day: L3.day },
    },
    'school-4': {
      kind: 'free',
      note: 'Level 4, Valley: cream trim and teal shutters, brass lamps by the door, glass windows, a teal-and-cream pennant on the tower. Bell box (29, 18).',
      sprite: L4.sprite,
      alts: { day: L4.day },
    },
    'school-5': {
      kind: 'free',
      note: 'Level 5, Crystal: a glowing crystal on the tower spire and an inlay on its face, gold trim on the eaves and door, a wider hall with four windows. Bell box (29, 18).',
      sprite: L5.sprite,
      alts: { day: L5.day },
    },
  },
};
