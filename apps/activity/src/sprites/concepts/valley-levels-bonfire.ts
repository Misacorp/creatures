/**
 * The Bonfire, level by level (docs/design/art-levels.md): the valley's communal hearth drawn new at five levels,
 * 64x56 each, the hearth always at the same spot and the art standing on the same base row.
 *
 * Every level is built from small shape helpers (`paint` fills a list of pixels and outlines it in ink), so a
 * level reads as a short list of parts. Materials come from `valley-tiers`; the fire, the firelight on the ground
 * (the glow style's stepped rings `1 2 3`) and the lamp glass are this building's own colours.
 */

import type { SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import { INK, tierPalette } from './valley-tiers';

const W = 64;
const H = 56;

type Grid = string[][];
type Pt = readonly [number, number];
type Colour = (x: number, y: number) => string;

const GROUND = '.123';

const GLOW = {
  night: { '1': '#7a6a34', '2': '#b08a38', '3': '#e8a83c' },
  day: { '1': '#467a4c', '2': '#8e7e4c', '3': '#5e4a3a' },
};
const FIRE = {
  night: { r: '#e8502a', o: '#ff9a2e', y: '#ffd966', c: '#fff6c8' },
  day: { r: '#c8441e', o: '#ee8a2a', y: '#f6c64e', c: '#fff0b4' },
};

function grid(): Grid {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
}

function put(g: Grid, x: number, y: number, ch: string): void {
  const row = g[y];
  if (row !== undefined && x >= 0 && x < W) row[x] = ch;
}

function at(g: Grid, x: number, y: number): string {
  return g[y]?.[x] ?? '#';
}

function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  const out: Pt[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}

function ellPts(cx: number, cy: number, rx: number, ry: number): Pt[] {
  const out: Pt[] = [];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) out.push([x, y]);
    }
  }
  return out;
}

/** Fill the pixels, then ink the empty/ground pixels that touch them (4-neighbours). */
function paint(g: Grid, pts: readonly Pt[], colour: Colour | string, outline = true): void {
  const set = new Set(pts.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of pts) put(g, x, y, typeof colour === 'string' ? colour : colour(x, y));
  if (!outline) return;
  for (const [x, y] of pts) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!set.has(`${nx},${ny}`) && GROUND.includes(at(g, nx, ny))) put(g, nx, ny, 'k');
    }
  }
}

/** A block lit from above: light top row, main body, shade bottom row. */
function block(
  g: Grid,
  x: number,
  y: number,
  w: number,
  h: number,
  main: string,
  light: string,
  shade: string,
): void {
  paint(g, rectPts(x, y, w, h), (_px, py) => (py === y ? light : py === y + h - 1 ? shade : main));
}

/** Stepped firelight on the ground, outermost ring first. */
function glow(g: Grid, cx: number, cy: number, rx: number, ry: number): void {
  paint(g, ellPts(cx, cy, rx, ry), '1', false);
  paint(g, ellPts(cx, cy, rx * 0.72, ry * 0.72), '2', false);
  paint(g, ellPts(cx, cy, rx * 0.46, ry * 0.46), '3', false);
}

/** A flame standing on row `by`, `h` tall, about `w` wide, with a gentle lean. */
function flame(g: Grid, cx: number, by: number, h: number, w: number): void {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const hw = Math.max(0, Math.round((w / 2) * (1 - t) ** 0.8 * (1 + 0.25 * Math.sin(i * 1.3))));
    const mid = cx + Math.round(Math.sin(i * 0.7) * 1.2 * t);
    const y = by - i;
    const span = (r: number, ch: string): void => {
      for (let x = mid - r; x <= mid + r; x++) put(g, x, y, ch);
    };
    span(hw, 'r');
    if (hw >= 2) span(hw - 1, 'o');
    if (hw >= 3 && i < h * 0.75) span(hw - 2, 'y');
    if (hw >= 3 && i < h * 0.45) span(hw - 3, 'c');
  }
  put(g, cx - Math.round(w / 2) - 1, by - h - 1, 'y');
  put(g, cx + Math.round(w / 2), by - h - 3, 'y');
}

/** Two small logs laid under a fire, centred on `cx`, top at `y`. */
function fireLogs(g: Grid, cx: number, y: number, w: number, shade = 'w'): void {
  paint(g, rectPts(cx - Math.floor(w / 2) + 1, y, w - 2, 3), (_x, py) =>
    py === y + 2 ? shade : 'v',
  );
  paint(g, rectPts(cx - Math.floor(w / 2), y + 2, w, 3), (_x, py) => (py === y + 4 ? shade : 'v'));
}

/** Items placed round an ellipse; the back half (above the centre) or the front half, drawn back to front. */
function ringItems(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  half: 'back' | 'front',
  draw: (x: number, y: number) => void,
): void {
  const items: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / n;
    const y = cy + ry * Math.sin(a);
    if ((half === 'front') === y >= cy)
      items.push([Math.round(cx + rx * Math.cos(a)), Math.round(y)]);
  }
  items.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of items) draw(x, y);
}

/** A pavement of laid stones inside an ellipse, brighter close to the fire. */
function paving(g: Grid, cx: number, cy: number, rx: number, ry: number, lit: number): void {
  paint(
    g,
    ellPts(cx, cy, rx, ry),
    (x, y) => {
      const off = Math.floor(y / 3) % 2 === 0 ? 0 : 3;
      const joint = y % 3 === 2 || (x + off) % 6 === 5;
      const near = ((x - cx) / lit) ** 2 + ((y - cy) / ((lit * ry) / rx)) ** 2 < 1;
      const hot = ((x - cx) / (lit * 0.7)) ** 2 + ((y - cy) / ((lit * 0.7 * ry) / rx)) ** 2 < 1;
      if (hot) return joint ? '2' : '3';
      if (near) return joint ? '1' : '2';
      return joint ? 'k' : 'S';
    },
    false,
  );
}

/** A stone bench: blocks along the front half of an ellipse. */
function arcBench(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  top: (x: number, y: number) => string,
): void {
  const pts: Pt[] = [];
  for (const deg of [160, 125, 90, 55, 20]) {
    const a = (deg * Math.PI) / 180;
    pts.push([Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))]);
  }
  pts.sort((a, b) => a[1] - b[1]);
  // separate low slabs: a lit top, a darker front face, a shadowed foot (the ink outline is the shadow beneath)
  for (const [x, y] of pts) {
    paint(g, rectPts(x - 4, y - 2, 8, 5), (px, py) =>
      py === y - 2 ? top(px, py) : py === y - 1 ? 'L' : py === y + 2 ? 'S' : 'T',
    );
  }
}

interface Parts {
  readonly palette: Record<string, string>;
  readonly day: Record<string, string>;
}

function build(
  fill: (g: Grid) => void,
  parts: readonly Parts[],
  own: { night: Record<string, string>; day: Record<string, string> },
): { sprite: SpriteDef; day: Record<string, string> } {
  const g = grid();
  fill(g);
  const rows = g.map((r) => r.join(''));
  const used = new Set(rows.join(''));
  const night: Record<string, string> = { ...FIRE.night, ...GLOW.night, k: INK, ...own.night };
  const day: Record<string, string> = { ...FIRE.day, ...GLOW.day, ...own.day };
  for (const p of parts) {
    Object.assign(night, p.palette);
    Object.assign(day, p.day);
  }
  const palette: Record<string, string> = {};
  const dayOut: Record<string, string> = {};
  for (const key of used) {
    if (key === '.') continue;
    const n = night[key];
    if (n === undefined) throw new Error(`bonfire: no colour for "${key}"`);
    palette[key] = n;
    const d = day[key];
    if (d !== undefined) dayOut[key] = d;
  }
  return { sprite: { palette, rows }, day: dayOut };
}

const none = { night: {}, day: {} };

// ---- Level 1: Humble ----------------------------------------------------------------------------------------
const L1 = build(
  (g) => {
    glow(g, 32, 46, 22, 8);
    paint(g, ellPts(32, 45, 10, 4), 'e', false);
    const rock = (x: number, y: number): void => paint(g, rectPts(x - 2, y - 1, 4, 3), 't');
    ringItems(32, 45, 9, 3.5, 8, 'back', rock);
    fireLogs(g, 32, 41, 10);
    flame(g, 32, 41, 9, 6);
    ringItems(32, 45, 9, 3.5, 8, 'front', rock);
    // the seat log, with a rope lashing and pale cut ends
    paint(g, rectPts(40, 48, 15, 4), (_x, y) => (y === 51 ? 'w' : 'v'));
    for (const y of [49, 50]) put(g, 54, y, 'q');
    for (const y of [48, 49, 50, 51]) put(g, 47, y, 'q');
    // sticks
    for (let i = 0; i < 6; i++) put(g, 12 + i, 51 - Math.floor(i / 2), 'v');
    for (let i = 0; i < 4; i++) put(g, 20 + i, 38 + Math.floor(i / 2), 'v');
  },
  [tierPalette(1, { v: 'log', w: 'logShade', e: 'earth', t: 'fieldstone', q: 'rope' })],
  none,
);

// ---- Level 2: Settled ---------------------------------------------------------------------------------------
function plankBench(g: Grid, x: number, y: number, w: number): void {
  for (const lx of [x + 1, x + w - 3]) paint(g, rectPts(lx, y + 3, 2, 4), 'P');
  paint(g, rectPts(x, y, w, 3), (_x, py) => (py === y + 2 ? 'P' : 'p'));
  for (const nx of [x + 2, x + w - 3]) put(g, nx, y, 'k');
}

function shingleRoof(g: Grid, x: number, y: number, w: number, rows: number): void {
  for (let r = 0; r < rows; r++) {
    const inset = rows - 1 - r;
    // one light from the upper left, like the posts: the left half of the roof is the lit plane
    paint(g, rectPts(x + inset, y + r, w - 2 * inset, 1), (px) => {
      const tick = (px + r * 2) % 4 === 0;
      return px < x + w / 2 ? (tick ? 's' : 'h') : tick ? 'S' : 's';
    });
  }
}

const L2 = build(
  (g) => {
    glow(g, 32, 46, 27, 9);
    // wood store at the back right: two posts, a shingle roof, a stack of logs
    for (const px of [46, 58]) paint(g, rectPts(px, 28, 2, 11), 'P');
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4 - (r > 1 ? 1 : 0); i++) {
        const lx = 48 + i * 3 + (r === 2 ? 1 : 0);
        paint(g, rectPts(lx, 33 + r * 2, 3, 2), 'v', false);
      }
    }
    shingleRoof(g, 44, 21, 17, 7);
    // a plank sign on a post, back left
    paint(g, rectPts(10, 28, 2, 10), 'P');
    paint(g, rectPts(3, 22, 14, 6), (_x, y) => (y === 27 ? 'P' : 'p'));
    for (const sx of [6, 9, 12]) put(g, sx, 24, 'k');
    // fire ring
    paint(g, ellPts(32, 43, 12, 4.5), 'e', false);
    const rock = (x: number, y: number): void => paint(g, rectPts(x - 2, y - 1, 5, 3), 't');
    ringItems(32, 43, 11, 4, 10, 'back', rock);
    fireLogs(g, 32, 38, 12);
    flame(g, 32, 38, 12, 8);
    ringItems(32, 43, 11, 4, 10, 'front', rock);
    // benches: left, right and front
    plankBench(g, 5, 42, 16);
    plankBench(g, 43, 42, 16);
    plankBench(g, 23, 50, 18);
  },
  [
    tierPalette(1, { v: 'log', w: 'logShade', e: 'earth', t: 'fieldstone', q: 'rope' }),
    tierPalette(2, {
      p: 'plank',
      P: 'plankShade',
      h: 'shingleLight',
      s: 'shingle',
      S: 'shingleShade',
    }),
  ],
  none,
);

// ---- Level 3: Stone -----------------------------------------------------------------------------------------
function stonePit(g: Grid, fireTop: (g: Grid) => void): void {
  paint(g, ellPts(32, 40, 11, 4.5), 'S', false);
  const blk = (x: number, y: number): void => block(g, x - 3, y - 2, 6, 5, 'T', 'L', 'S');
  ringItems(32, 40, 10, 4, 10, 'back', blk);
  paint(g, ellPts(32, 40, 7, 2.5), 'S', false);
  fireTop(g);
  ringItems(32, 40, 10, 4, 10, 'front', blk);
}

const L3 = build(
  (g) => {
    glow(g, 32, 46, 29, 11);
    // firewood pile at the back right
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4 - r; i++) {
        paint(g, rectPts(47 + i * 4 + r * 2, 34 + r * 3, 4, 3), (_x, y) =>
          y === 36 + r * 3 ? 'w' : 'v',
        );
      }
    }
    // iron crane at the back left with a hanging cauldron
    block(g, 9, 37, 8, 4, 'T', 'L', 'S');
    paint(g, rectPts(12, 21, 2, 16), 'i');
    paint(g, rectPts(12, 21, 14, 2), 'i');
    for (let y = 23; y < 28; y++) put(g, 25, y, 'i');
    paint(g, ellPts(25, 31, 4, 3.5), 'i');
    for (let x = 22; x <= 28; x++) put(g, x, 28, 'S');
    put(g, 22, 31, 'S');
    put(g, 23, 33, 'S');
    // a bail handle over the pot
    for (const x of [22, 28]) put(g, x, 27, 'i');
    for (let x = 23; x <= 27; x++) put(g, x, 26, 'i');
    stonePit(g, (gg) => {
      fireLogs(gg, 32, 36, 10);
      flame(gg, 32, 36, 16, 9);
      // iron grate bar over the logs
      paint(gg, rectPts(26, 39, 12, 1), 'i', false);
    });
    arcBench(g, 32, 43, 25, 9, () => 'L');
    // iron bands on the benches' ends
    for (const bx of [4, 59]) paint(g, rectPts(bx, 44, 1, 4), 'i', false);
  },
  [
    tierPalette(1, { v: 'log', w: 'logShade' }),
    tierPalette(3, { T: 'stone', S: 'stoneShade', L: 'stoneLight', i: 'iron' }),
  ],
  none,
);

// ---- Level 4: Valley ----------------------------------------------------------------------------------------
function lampPost(g: Grid, x: number): void {
  paint(g, rectPts(x - 1, 22, 2, 22), 'k', false);
  paint(g, rectPts(x - 3, 15, 6, 7), (px, py) =>
    py === 15 || py === 21 || px === x - 3 || px === x + 2 ? 'b' : 'G',
  );
  paint(g, rectPts(x - 2, 13, 4, 2), 'b');
  // a banner hung from the post, teal with a cream edge and a swallow tail
  const x0 = x < 32 ? x + 2 : x - 7;
  for (let j = 0; j < 11; j++) {
    for (let i = 0; i < 5; i++) {
      if (j >= 9 && i === 2) continue;
      if (j === 10 && i !== 0 && i !== 4) continue;
      put(g, x0 + i, 24 + j, i === 0 || i === 4 || j === 0 ? 'm' : 't');
    }
  }
}

const L4 = build(
  (g) => {
    glow(g, 32, 46, 30, 11);
    paving(g, 32, 46, 27, 9, 25);
    lampPost(g, 6);
    lampPost(g, 58);
    stonePit(g, (gg) => {
      fireLogs(gg, 32, 36, 10, 'k');
      flame(gg, 32, 36, 20, 11);
    });
    arcBench(g, 32, 43, 25, 9, () => 'L');
    // teal cushions with a cream edge on the three seats
    for (const [x, y] of [
      [9, 46],
      [32, 52],
      [55, 46],
    ] as const) {
      paint(g, rectPts(x - 3, y - 3, 6, 2), (_x, py) => (py === y - 3 ? 'm' : 't'), false);
    }
  },
  [
    tierPalette(1, { v: 'log' }),
    tierPalette(3, { T: 'stone', S: 'stoneShade', L: 'stoneLight' }),
    tierPalette(4, { t: 'teal', m: 'cream', b: 'brass' }),
  ],
  { night: { G: '#ffd966' }, day: { G: '#8fa8b8' } },
);

// ---- Level 5: Crystal ---------------------------------------------------------------------------------------
function shard(g: Grid, x: number, by: number, h: number, w: number, lean: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const half = Math.max(0, Math.round((w / 2) * (1 - t * 0.9)));
    const mid = x + Math.round(lean * t);
    for (let px = mid - half; px <= mid + half; px++) pts.push([px, by - i]);
  }
  paint(g, pts, (px, py) => {
    const mid = x + Math.round((lean * (by - py)) / h);
    return px < mid ? 'l' : px === mid ? 'C' : 'D';
  });
}

function crystalPost(g: Grid, x: number): void {
  paint(g, rectPts(x - 3, 38, 7, 6), (_x, py) => (py === 38 ? 'L' : py === 43 ? 'S' : 'T'));
  paint(g, rectPts(x - 3, 36, 7, 1), 'g');
  shard(g, x, 35, 10, 5, 0);
}

const L5 = build(
  (g) => {
    glow(g, 32, 46, 31, 12);
    paving(g, 32, 46, 28, 10, 27);
    for (const [x, y] of [
      [12, 48],
      [20, 52],
      [44, 52],
      [52, 48],
    ] as const) {
      put(g, x, y, 'C');
      put(g, x + 1, y, 'l');
    }
    crystalPost(g, 5);
    crystalPost(g, 59);
    // the brazier: stone plinth, gold band, a bowl crowned with crystal
    shard(g, 25, 36, 15, 4, -2);
    shard(g, 39, 36, 17, 4, 2);
    paint(g, ellPts(32, 44, 10, 3.5), (_x, py) => (py > 45 ? 'S' : 'T'));
    paint(g, rectPts(26, 41, 13, 4), (_x, py) => (py === 41 ? 'L' : 'T'));
    paint(g, rectPts(26, 43, 13, 1), 'g', false);
    paint(g, ellPts(32, 38, 11, 4), 'T');
    paint(g, ellPts(32, 38, 9, 3), 'S', false);
    for (let x = 22; x <= 42; x++) {
      const dy = Math.round(4 * Math.sqrt(Math.max(0, 1 - ((x - 32) / 11) ** 2)));
      put(g, x, 38 + dy, 'g');
      put(g, x, 38 - dy, 'g');
    }
    flame(g, 32, 38, 26, 13);
    // gold-edged benches with crystal inlay
    arcBench(g, 32, 43, 25, 9, () => 'g');
    for (const [x, y] of [
      [9, 46],
      [32, 52],
      [55, 46],
    ] as const) {
      put(g, x - 1, y, 'C');
      put(g, x, y, 'l');
      put(g, x + 1, y, 'C');
    }
  },
  [
    tierPalette(3, { T: 'stone', S: 'stoneShade', L: 'stoneLight' }),
    tierPalette(5, {
      C: 'crystal',
      l: 'crystalLight',
      D: 'crystalShade',
      g: 'gold',
    }),
  ],
  none,
);

const LEVELS = [
  { l: L1, note: 'A small campfire in a loose ring of fieldstones, a log to sit on, two sticks.' },
  {
    l: L2,
    note: 'A fire ring with sawn plank benches, a plank sign and a shingle-roofed wood store.',
  },
  { l: L3, note: 'A dressed-stone pit, curved stone bench, black iron grate and cauldron crane.' },
  {
    l: L4,
    note: 'The stone pit on a paved floor, teal and cream cushions, brass lamps with banners.',
  },
  {
    l: L5,
    note: 'A crystal-crowned stone brazier with gold trim, gold-edged benches, crystal posts.',
  },
] as const;

export const VALLEY_LEVELS_BONFIRE_CONCEPTS: ConceptSet = {
  id: 'valley-levels-bonfire',
  title: 'The Bonfire, level by level',
  requested:
    '2026-11-09 (Misa): "The campfire could also get better, not just more decorative. Think from a humble campfire to a fire pit with cool stone benches and the sort. Each building can absolutely change building material as it upgrades in levels, and I\'m thinking we might even want to tweak the earlier levels to be less elaborate... If you change materials, there needs to be a common motif between buildings of the same level... Think of how Clash of Clans brings a new look with each new town hall level."',
  status: 'draft',
  notes: [
    'All five levels are 64x56 with the hearth at the same spot (fire centred on x 32) and the art on one base row; smaller levels leave the top and sides empty. Night is the main palette with the firelight in stepped rings on the ground; alts.day keeps the fire lit.',
    'Level 1 Humble: a small fire in a loose ring of fieldstones on packed earth, one log to sit on (rope lashing, pale cut ends) and two sticks. Seat: (47, 52).',
    'Level 2 Settled: a neater fire ring, two sawn plank benches and a front bench, a plank sign, and a wood store with the red-brown shingle roof. Seats: (13, 48), (51, 48), (32, 54).',
    'Level 3 Stone: a pit of dressed grey stone, an arc of five separate dressed-stone slab seats, black iron: a grate over the logs, a crane with a hanging cauldron, bands on the bench ends, and a firewood pile. Seats: (9, 49), (32, 55), (55, 49).',
    'Level 4 Valley: the stone pit on a paved floor lit by the fire, teal-and-cream cushions on the three seats, brass lamps on posts with teal banners (lamp glass lit at night, plain by day). Seats as level 3.',
    'Level 5 Crystal: a stone brazier with a gold band and gold rim, crowned with four crystal shards (the crystal glows by day too), crystal posts with gold caps, gold-edged benches with crystal inlay, crystal inlay in the paving. Seats as level 3. The 16-colour limit leaves no room for the level 4 pennants here; the crystal posts replace the lamps.',
  ],
  ...(VALLEY_GLOW_CONCEPTS.backdrop === undefined
    ? {}
    : { backdrop: VALLEY_GLOW_CONCEPTS.backdrop }),
  levels: {
    bonfire: [
      'valley-levels-bonfire/bonfire-1',
      'valley-levels-bonfire/bonfire-2',
      'valley-levels-bonfire/bonfire-3',
      'valley-levels-bonfire/bonfire-4',
      'valley-levels-bonfire/bonfire-5',
    ],
  },
  sprites: Object.fromEntries(
    LEVELS.map(({ l, note }, i) => [
      `bonfire-${String(i + 1)}`,
      { kind: 'free' as const, note, sprite: l.sprite, alts: { day: l.day } },
    ]),
  ),
};
