/**
 * The Builders' corner, concept art (not in the game): a kit for every valley place that has a building project.
 * The helper spot and the project board live here, apart from the place's own art (Misa, 2026-11-15). Outdoor
 * valley look like `valley-glow`: ink `#0d0a1a`, night is the main palette and `alts.day` recolours the same
 * pixels. Materials come from `valley-tiers`: wood, rope and planks (levels 1 and 2), cut stone (level 3), the
 * cream canvas and teal pennant (level 4), so the kit matches the buildings. One shared key set (`KIT`) keeps
 * every piece, and the composed preview, within 16 colours; each sprite lists only the keys it uses.
 * Pieces are drawn with the small helpers below (interior shapes, then the ink outline is added around them),
 * and the result is plain pixel data. Every piece stands on its own bottom row (its base row).
 */
import type { SpriteDef } from '../sprite-data';
import { tierPalette, INK } from './valley-tiers';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { ConceptSet } from './index';

const t1 = tierPalette(1, { o: 'log', O: 'logShade', r: 'rope' });
const t2 = tierPalette(2, { p: 'plank', P: 'plankShade' });
const t3 = tierPalette(3, { s: 'stone', S: 'stoneShade', L: 'stoneLight' });
const t4 = tierPalette(4, { c: 'cream', t: 'teal' });

/** Night colours by key. `k` ink; `p P` planks; `o O` logs; `r` rope (also canvas folds); `c` cream (lit edges, canvas). */
const NIGHT: Record<string, string> = {
  k: INK,
  ...t1.palette,
  ...t2.palette,
  ...t3.palette,
  ...t4.palette,
  b: '#3f6fb8', // blue paper
  B: '#2a4a8c', // paper shade
  w: '#f4f8ff', // the plan's white lines, the glint
  y: '#ffd966', // pencil, lantern light
  W: '#9a98c8', // paper under lantern light (variant C)
  '1': '#55703f', // light spill on the ground
  '2': '#8a8a40',
  '3': '#d09a3c',
};
const DAY: Record<string, string> = {
  k: INK,
  ...t1.day,
  ...t2.day,
  ...t3.day,
  ...t4.day,
  b: '#4f86d0',
  B: '#3562aa',
  w: '#ffffff',
  y: '#f6c64e',
  W: '#4f86d0',
  '1': '#467a4c',
  '2': '#3b6b43',
  '3': '#3b6b43',
};

type Grid = string[][];
const grid = (w: number, h: number): Grid =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
const put = (g: Grid, x: number, y: number, c: string): void => {
  const row = g[y];
  if (row !== undefined && x >= 0 && x < row.length) row[x] = c;
};
const rect = (g: Grid, x: number, y: number, w: number, h: number, c: string): void => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
};
const hline = (g: Grid, x0: number, x1: number, y: number, c: string): void =>
  rect(g, x0, y, x1 - x0 + 1, 1, c);
/** A line of pixels (a leg or a strut), `thick` pixels wide. */
const line = (
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: string,
  thick = 1,
): void => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(n, 1));
    const y = Math.round(y0 + ((y1 - y0) * i) / Math.max(n, 1));
    for (let j = 0; j < thick; j++) put(g, x + j, y, c);
  }
};
const stamp = (g: Grid, x: number, y: number, rows: readonly string[]): void => {
  rows.forEach((row, j) =>
    [...row].forEach((c, i) => {
      if (c !== '.') put(g, x + i, y + j, c);
    }),
  );
};

/** Adds the ink outline (one pixel, 4-neighbour) around the drawn shapes and returns the sprite and its day alt. */
function finish(g: Grid): { sprite: SpriteDef; day: Record<string, string> } {
  const h = g.length + 2;
  const w = (g[0]?.length ?? 0) + 2;
  const out = grid(w, h);
  const at = (x: number, y: number): string => g[y]?.[x] ?? '.';
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < w - 2; x++) if (at(x, y) !== '.') put(out, x + 1, y + 1, at(x, y));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((out[y]?.[x] ?? '.') !== '.') continue;
      const near = (dx: number, dy: number): boolean => at(x - 1 + dx, y - 1 + dy) !== '.';
      if (near(-1, 0) || near(1, 0) || near(0, -1) || near(0, 1)) put(out, x, y, 'k');
    }
  const rows = out.map((r) => r.join(''));
  const used = new Set(rows.join(''));
  used.delete('.');
  const palette: Record<string, string> = {};
  const day: Record<string, string> = {};
  for (const key of used) {
    palette[key] = NIGHT[key] ?? '#ff00ff';
    day[key] = DAY[key] ?? '#ff00ff';
  }
  return { sprite: { palette, rows }, day };
}

// ---------------------------------------------------------------------------------------------------------
// The table. Interior w x 18: a plank top with a lit back edge, a blue plan rolled out on it (white lines, a
// curled left end), a stone weight holding the right corner (with a glint), a pencil, trestle legs.

function drawTable(g: Grid, ox: number, oy: number, w: number, lit = false): void {
  const px = (x: number, y: number, c: string): void => put(g, ox + x, oy + y, c);
  const r = (x: number, y: number, ww: number, hh: number, c: string): void =>
    rect(g, ox + x, oy + y, ww, hh, c);
  // top: lit back edge, plank rim, plan, front edge
  r(0, 0, w, 1, 'c');
  r(0, 1, w, 8, 'p');
  r(1, 1, w - 2, 8, 'b');
  r(0, 9, w, 1, 'p');
  r(0, 10, w, 1, 'P');
  // the plan's lower rows are in shade, near the front edge
  r(1, 8, w - 2, 1, 'B');
  // rolled-up left end
  r(1, 1, 1, 8, 'B');
  r(2, 1, 1, 7, 'w');
  r(3, 1, 1, 7, 'b');
  // drawing: two text-like lines, a box with a cross, a dotted line
  hline(g, ox + 5, ox + 13, oy + 3, 'w');
  hline(g, ox + 5, ox + 10, oy + 5, 'w');
  for (let x = 5; x <= 13; x += 2) px(x, 7, 'w');
  const bx = Math.min(16, w - 12);
  r(bx, 2, 6, 5, 'w');
  r(bx + 1, 3, 4, 3, 'b');
  px(bx + 2, 4, 'w');
  px(bx + 3, 5, 'w');
  // pencil, lying across the lower right of the plan
  hline(g, ox + w - 14, ox + w - 9, oy + 7, 'y');
  px(w - 8, 7, 'o');
  px(w - 15, 7, 'O');
  // weight: a small stone with a lit top, holding the top right corner of the plan
  r(w - 5, 1, 4, 1, 'L');
  r(w - 5, 2, 4, 1, 's');
  r(w - 5, 3, 4, 1, 'S');
  // glint: a cross of white with a cream halo, on the weight
  px(w - 4, 1, 'w');
  px(w - 4, 0, 'w');
  px(w - 5, 1, 'c');
  px(w - 3, 1, 'c');
  if (lit) {
    // warm light from the lantern on the plan
    r(8, 2, w - 9, 5, 'W');
    hline(g, ox + 5, ox + 13, oy + 3, 'w');
    hline(g, ox + 5, ox + 10, oy + 5, 'w');
    r(bx, 2, 6, 5, 'w');
    r(bx + 1, 3, 4, 3, 'W');
    px(bx + 2, 4, 'w');
    px(bx + 3, 5, 'w');
    for (let x = 5; x <= 13; x += 2) px(x, 7, 'w');
    hline(g, ox + w - 14, ox + w - 9, oy + 7, 'y');
    px(w - 8, 7, 'o');
    px(w - 15, 7, 'O');
    r(w - 5, 1, 4, 1, 'L');
    r(w - 5, 2, 4, 1, 's');
    r(w - 5, 3, 4, 1, 'S');
    px(w - 4, 1, 'w');
  }
  // trestle legs: an A-frame under each end, a stretcher between
  for (const left of [true, false]) {
    const m = (x: number): number => (left ? x : w - 1 - x);
    const lx = (x: number): number => ox + m(x);
    line(g, lx(3), oy + 11, lx(1), oy + 17, 'p');
    line(g, lx(4), oy + 11, lx(7), oy + 17, 'P');
    hline(g, Math.min(lx(2), lx(6)), Math.max(lx(2), lx(6)), oy + 15, 'P');
  }
  hline(g, ox + 5, ox + w - 6, oy + 12, 'P');
}

function table(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(30, 18);
  drawTable(g, 0, 0, 30);
  return finish(g);
}

/** B: a slanted drafting table on a single stand, with a ledge for the pencil. */
function tableSlanted(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(30, 20);
  const top = (x: number): number => Math.floor((x * 4) / 29);
  for (let x = 0; x < 30; x++) {
    const y = top(x);
    put(g, x, y, 'c');
    for (let j = 1; j <= 6; j++) put(g, x, y + j, x === 0 || x === 29 ? 'p' : j === 6 ? 'B' : 'b');
    put(g, x, y + 7, 'p');
    put(g, x, y + 8, 'P');
  }
  for (let x = 2; x <= 12; x++) {
    put(g, x, top(x) + 3, x < 9 ? 'w' : 'b');
  }
  for (let x = 2; x <= 7; x++) put(g, x, top(x) + 5, 'w');
  // a box drawing with a cross
  for (let x = 16; x <= 22; x++)
    for (let j = 2; j <= 5; j++) {
      const edge = x === 16 || x === 22 || j === 2 || j === 5;
      if (edge) put(g, x, top(x) + j, 'w');
    }
  put(g, 18, top(18) + 3, 'w');
  put(g, 19, top(19) + 4, 'w');
  // pencil on the lower ledge, weight at the corner
  for (let x = 22; x <= 26; x++) put(g, x, top(x) + 6, 'y');
  put(g, 27, top(27) + 6, 'o');
  put(g, 1, top(1) + 1, 'B');
  put(g, 1, top(1) + 2, 'B');
  rect(g, 24, 3, 4, 1, 'L');
  rect(g, 24, 4, 4, 1, 's');
  put(g, 25, 3, 'w');
  put(g, 25, 2, 'w');
  put(g, 24, 3, 'c');
  put(g, 26, 3, 'c');
  // single stand: a post, a diagonal prop to the board, a splayed foot
  rect(g, 14, 12, 2, 5, 'p');
  rect(g, 15, 12, 1, 5, 'P');
  line(g, 15, 14, 21, 10, 'P');
  rect(g, 8, 17, 14, 1, 'p');
  rect(g, 8, 18, 14, 1, 'P');
  rect(g, 6, 19, 4, 1, 'P');
  rect(g, 20, 19, 4, 1, 'P');
  return finish(g);
}

/** C: the table under a small lantern on a pole; warm light on the plan and on the ground at night. */
function tableLantern(): { sprite: SpriteDef; day: Record<string, string> } {
  const tw = 26;
  const g = grid(34, 32);
  // warm ground spill under the table (night only; by day it turns into the grass)
  rect(g, 4, 29, 26, 1, '1');
  rect(g, 8, 28, 18, 1, '2');
  rect(g, 11, 30, 12, 1, '2');
  for (let x = 6; x < 28; x += 2) put(g, x, 31, '1');
  rect(g, 12, 31, 10, 1, '3');
  drawTable(g, 0, 12, tw, true);
  // the pole at the right end of the table, with an arm and a hanging lantern
  const px = 30;
  rect(g, px, 2, 2, 28, 'o');
  rect(g, px + 1, 2, 1, 28, 'O');
  rect(g, px - 7, 1, 9, 1, 'o');
  rect(g, px - 1, 29, 4, 1, 'S');
  put(g, px - 5, 2, 'O');
  stamp(g, px - 7, 3, ['PPPP', 'ycyy', 'yyyy', 'ycyy', 'PPPP']);
  put(g, px - 6, 2, 'P');
  put(g, px - 5, 2, 'P');
  return finish(g);
}

// ---------------------------------------------------------------------------------------------------------
// Decoration: quieter, mid tones, no white and no cream edge.

function sawhorse(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(14, 10);
  // a plank on top of the beam, then the beam, then the legs
  rect(g, 0, 0, 14, 1, 'p');
  rect(g, 0, 1, 14, 2, 'P');
  rect(g, 4, 0, 1, 1, 'P');
  for (const left of [true, false]) {
    const m = (x: number): number => (left ? x : 13 - x);
    line(g, m(2), 3, m(0), 9, 'p');
    line(g, m(3), 3, m(5), 9, 'P');
    hline(g, Math.min(m(1), m(4)), Math.max(m(1), m(4)), 7, 'P');
  }
  return finish(g);
}

function planks(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(18, 6);
  // bearers underneath, then three planks of different lengths
  rect(g, 2, 5, 3, 1, 'O');
  rect(g, 13, 5, 3, 1, 'O');
  rect(g, 0, 3, 18, 2, 'p');
  rect(g, 0, 4, 18, 1, 'P');
  rect(g, 1, 1, 15, 2, 'p');
  rect(g, 1, 2, 15, 1, 'P');
  rect(g, 4, 0, 11, 1, 'p');
  for (const x of [5, 9, 14]) put(g, x, 3, 'P');
  put(g, 17, 3, 'o');
  return finish(g);
}

function toolbox(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(10, 6);
  hline(g, 3, 6, 0, 'O');
  put(g, 3, 1, 'O');
  put(g, 6, 1, 'O');
  rect(g, 0, 1, 10, 2, 'p');
  rect(g, 0, 3, 10, 3, 'P');
  rect(g, 0, 3, 10, 1, 'O');
  put(g, 4, 3, 'r');
  put(g, 5, 3, 'r');
  put(g, 9, 0, 'O');
  return finish(g);
}

// ---------------------------------------------------------------------------------------------------------
// Material piles: three sizes on the same base row (bottom row), each growing in both width and height.

function stoneBlock(g: Grid, x: number, y: number, w: number, h: number): void {
  rect(g, x, y, w, h, 's');
  rect(g, x, y, w, 1, 'L');
  rect(g, x + w - 1, y + 1, 1, h - 1, 'S');
  if (h > 2) rect(g, x, y + h - 1, w, 1, 'S');
}

function pileStone(size: 's' | 'm' | 'l'): { sprite: SpriteDef; day: Record<string, string> } {
  if (size === 's') {
    const g = grid(8, 4);
    stoneBlock(g, 0, 2, 4, 2);
    stoneBlock(g, 4, 2, 4, 2);
    stoneBlock(g, 2, 0, 4, 2);
    return finish(g);
  }
  if (size === 'm') {
    const g = grid(14, 8);
    stoneBlock(g, 0, 5, 5, 3);
    stoneBlock(g, 5, 5, 4, 3);
    stoneBlock(g, 9, 5, 5, 3);
    stoneBlock(g, 2, 2, 5, 3);
    stoneBlock(g, 7, 2, 5, 3);
    stoneBlock(g, 4, 0, 5, 2);
    return finish(g);
  }
  const g = grid(22, 12);
  stoneBlock(g, 0, 9, 6, 3);
  stoneBlock(g, 6, 9, 5, 3);
  stoneBlock(g, 11, 9, 6, 3);
  stoneBlock(g, 17, 9, 5, 3);
  stoneBlock(g, 2, 6, 6, 3);
  stoneBlock(g, 8, 6, 6, 3);
  stoneBlock(g, 14, 6, 6, 3);
  stoneBlock(g, 5, 3, 6, 3);
  stoneBlock(g, 11, 3, 6, 3);
  stoneBlock(g, 8, 0, 6, 3);
  return finish(g);
}

/** A horizontal log: shaded underside, lit cut end on the left. */
function log(g: Grid, x: number, y: number, w: number): void {
  rect(g, x, y, w, 1, 'o');
  rect(g, x, y + 1, w, 1, 'P');
  put(g, x, y, 'c');
  put(g, x + 1, y, 'p');
  put(g, x, y + 1, 'p');
}

function pileTimber(size: 's' | 'm' | 'l'): { sprite: SpriteDef; day: Record<string, string> } {
  if (size === 's') {
    const g = grid(8, 4);
    log(g, 0, 0, 6);
    log(g, 0, 2, 8);
    return finish(g);
  }
  if (size === 'm') {
    const g = grid(14, 8);
    log(g, 0, 0, 11);
    log(g, 0, 2, 13);
    log(g, 0, 4, 14);
    log(g, 0, 6, 12);
    rect(g, 10, 2, 1, 6, 'r');
    return finish(g);
  }
  const g = grid(22, 12);
  log(g, 0, 0, 15);
  log(g, 0, 2, 19);
  log(g, 0, 4, 22);
  log(g, 0, 6, 21);
  log(g, 0, 8, 22);
  log(g, 0, 10, 18);
  rect(g, 15, 2, 1, 10, 'r');
  rect(g, 6, 2, 1, 10, 'r');
  return finish(g);
}

/** A sack: a rope-tied neck, lit left, shaded right. 6 wide, 4 tall. */
const SACK: readonly string[] = ['..oo..', '.cbbb.', 'cbbbbB', '.BBBB.'];
function sack(g: Grid, x: number, y: number): void {
  stamp(g, x, y, SACK);
}

function pileBags(size: 's' | 'm' | 'l'): { sprite: SpriteDef; day: Record<string, string> } {
  // sack body in cream (lit) and rope (body), shade in log shade: swap the paper keys for the sack's own
  const swap = (g: Grid): Grid =>
    g.map((r) => r.map((c) => (c === 'b' ? 'r' : c === 'B' ? 'P' : c)));
  if (size === 's') {
    const g = grid(8, 4);
    sack(g, 0, 0);
    sack(g, 2, 0);
    return finish(swap(g));
  }
  if (size === 'm') {
    const g = grid(14, 8);
    sack(g, 8, 4);
    sack(g, 0, 4);
    sack(g, 4, 4);
    sack(g, 2, 1);
    sack(g, 7, 1);
    return finish(swap(g));
  }
  const g = grid(22, 12);
  sack(g, 0, 8);
  sack(g, 5, 8);
  sack(g, 10, 8);
  sack(g, 16, 8);
  sack(g, 2, 5);
  sack(g, 8, 5);
  sack(g, 13, 5);
  sack(g, 5, 2);
  sack(g, 11, 2);
  sack(g, 8, 0);
  return finish(swap(g));
}

// ---------------------------------------------------------------------------------------------------------
// Tarp and flag.

function tarp(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(38, 22);
  // two poles with a stone at each foot
  for (const x of [0, 36]) {
    rect(g, x, 1, 2, 21, 'o');
    rect(g, x + 1, 1, 1, 21, 'P');
    rect(g, x, 20, 2, 2, 'S');
  }
  // the canvas: a low sloping roof so the table fits under it; lit ridge, a darker fold band, a scalloped hem
  hline(g, 3, 34, 0, 'c');
  hline(g, 1, 36, 1, 'c');
  hline(g, 0, 37, 2, 'c');
  hline(g, 0, 37, 3, 'r');
  for (const x of [8, 15, 22, 29]) {
    put(g, x, 1, 'r');
    put(g, x - 1, 2, 'r');
  }
  for (let x = 0; x < 38; x += 2) put(g, x, 4, 'r');
  for (let x = 1; x < 38; x += 4) put(g, x, 4, 'c');
  return finish(g);
}

function helpFlag(): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid(6, 14);
  // a stake with a teal flag with a cream rim and a swallow tail
  rect(g, 0, 0, 1, 14, 'o');
  stamp(g, 1, 0, ['tttc', 'tttt', 'ttcc', 'tt..']);
  put(g, 0, 13, 'O');
  put(g, 1, 13, 'S');
  put(g, 1, 12, 'S');
  return finish(g);
}

// ---------------------------------------------------------------------------------------------------------
// The composed preview.

function compose(): { sprite: SpriteDef; day: Record<string, string> } {
  const W = 96;
  const H = 48;
  const g = grid(W, H);
  const place = (piece: { sprite: SpriteDef }, x: number, base: number): void => {
    const rows = piece.sprite.rows;
    const top = base - rows.length + 1;
    rows.forEach((row, j) =>
      [...row].forEach((c, i) => {
        if (c !== '.') put(g, x + i, top + j, c);
      }),
    );
  };
  // back row: stone pile, the tarp with the table under it, timber pile
  place(pileStone('l'), 2, 32);
  place(tarp(), 28, 32);
  place(table(), 31, 32);
  place(pileTimber('l'), 70, 32);
  // front row: sawhorse, planks, toolbox, bags, the help flag
  place(sawhorse(), 2, 46);
  place(planks(), 20, 46);
  place(toolbox(), 44, 46);
  place(pileBags('l'), 58, 46);
  place(helpFlag(), 86, 46);
  const rows = g.map((r) => r.join(''));
  const used = new Set(rows.join(''));
  used.delete('.');
  const palette: Record<string, string> = {};
  const day: Record<string, string> = {};
  for (const key of used) {
    palette[key] = NIGHT[key] ?? '#ff00ff';
    day[key] = DAY[key] ?? '#ff00ff';
  }
  return { sprite: { palette, rows }, day };
}

const alt = (p: { sprite: SpriteDef; day: Record<string, string> }): Concept => ({
  kind: 'free',
  note: '',
  sprite: p.sprite,
  alts: { day: p.day },
});
type Concept = import('./index').Concept;

const piece = (note: string, p: { sprite: SpriteDef; day: Record<string, string> }): Concept => ({
  ...alt(p),
  note,
});

const TABLE = table();
const TABLE_B = tableSlanted();
const TABLE_C = tableLantern();

const b = VALLEY_GLOW_CONCEPTS.backdrop;

export const VALLEY_BUILDERS_CORNER_CONCEPTS: ConceptSet = {
  id: 'valley-builders-corner',
  title: "Builders' corner",
  requested:
    '2026-11-15 (valley session): every valley place moves to a "picture you click" layout. On the Bonfire the fire is only where creatures chill; building work happens apart: "The helper spot should be something that\'s clearly separate, perhaps next to a construction table or something near the bottom of the screen ... the construction workers can do their own thing elsewhere."',
  status: 'draft',
  notes: [
    "A reusable kit for every place with a building project: the corner where the project board and the helper spot stand, apart from the place's own art. Outdoor valley look: ink, night as the main palette and `alts.day` for the same pixels, materials from `valley-tiers` (wood, rope and planks of levels 1 and 2, cut stone of level 3, cream canvas and the teal pennant of level 4), so it matches the buildings. One key set for the kit, so a composed corner stays within 16 colours.",
    'Every piece stands on its own bottom row (its base row, the lowest ink row); place pieces by that row. Sizes include the 1 px ink outline. Piles: s 10x6, m 16x10, l 24x14, all on the same base row, so a project that grows swaps the sprite in place.',
    '`table` 32x20, base row 19 (the feet), is the clickable piece: it opens the project board. It has a lit cream top edge and a small white glint on the weight, so it stands out from the decoration. Variations: B a slanted drafting table on one stand (32x22, base row 21), C the table under a lantern on a pole (36x34, base row 33; warm light on the plan and on the ground at night, plain by day). Pick: see the table note.',
    '`sawhorse` 16x12, base row 11, and `planks` 20x8, base row 7: decoration, mid tones, no glint.',
    '`toolbox` 12x8, base row 7. `pile-stone-s/m/l`, `pile-timber-s/m/l`, `pile-bags-s/m/l`: base row = last row.',
    '`tarp` 40x24, base row 23 (the pole feet): a canvas canopy on two poles; the table stands between the poles (clear width 34, table 32 at x 3 of the tarp, same base row).',
    '`help-flag` 8x16, base row 15: a stake with a small teal flag, marks the empty helper spot.',
    '`preview` 96x48 (the corner composed, base rows 32 and 46): tarp x 28, y 9; table x 31, y 13 (under the tarp); stone pile l x 2, y 19; timber pile l x 70, y 19; sawhorse x 2, y 35; planks x 20, y 39; toolbox x 44, y 39; bags pile l x 58, y 33; help flag x 86, y 31. Tops left, in sprite pixels.',
    'The content needs the project board (the click target) and a helper spot before this art is used.',
  ],
  ...(b === undefined ? {} : { backdrop: b }),
  sprites: {
    table: {
      ...piece(
        'The clickable piece: a construction table on trestle legs with a blue plan rolled out on it (white lines, a curled end), a pencil and a stone weight on the corner. The top has a lit cream edge and a small glint, so it reads as the place to look at the project. Variations: B a slanted drafting table on a single stand, C a table under a small lantern on a pole (warm light on the plan at night). Pick: A, because it reads at 1x as a table with a plan, is the widest and flattest so it sits under the tarp and next to any place, and keeps the plan itself the brightest thing in the corner; B reads as an easel, C is the best at night but is tall and ties the table to a lantern the places already have.',
        TABLE,
      ),
      variants: { B: TABLE_B.sprite, C: TABLE_C.sprite },
    },
    sawhorse: piece(
      'A sawhorse with a plank across it: decoration, mid tones, no glint.',
      sawhorse(),
    ),
    planks: piece('A stack of sawn planks on two bearers: decoration, quiet.', planks()),
    toolbox: piece('A small wooden toolbox with a handle and a rope strap.', toolbox()),
    'pile-stone-s': piece('A few dressed stone blocks (3).', pileStone('s')),
    'pile-stone-m': piece('A stack of dressed stone blocks (6).', pileStone('m')),
    'pile-stone-l': piece('A tall pyramid of dressed stone blocks (10).', pileStone('l')),
    'pile-timber-s': piece('Two short logs.', pileTimber('s')),
    'pile-timber-m': piece('A stack of four logs.', pileTimber('m')),
    'pile-timber-l': piece('A high stack of logs, roped, with a plank.', pileTimber('l')),
    'pile-bags-s': piece('Two sacks.', pileBags('s')),
    'pile-bags-m': piece('Five sacks in two layers.', pileBags('m')),
    'pile-bags-l': piece('Ten sacks in three layers.', pileBags('l')),
    tarp: piece(
      'A canvas canopy on two poles over the corner, drawn so the table stands under it.',
      tarp(),
    ),
    'help-flag': piece('A stake with a small teal flag marking the empty helper spot.', helpFlag()),
    preview: piece(
      'The corner composed once, as a starting layout: tarp, table under it, sawhorse, planks, toolbox, an l pile of each material and the help flag.',
      compose(),
    ),
  },
};
