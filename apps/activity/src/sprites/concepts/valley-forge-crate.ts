/**
 * The sealed gear crate (concept art, not in the game): collecting gear in the Forge is a big moment. Common
 * pieces come home on their own; rare and epic pieces wait in a sealed crate until the player opens it, and the
 * reveal shows them one by one, best last. Ink, woods and iron are the Forge's (`valley/forge-props.ts`,
 * `valley-forge-interior`); the glow uses the game's own rarity colours (`--rarity-rare #4da3ff`,
 * `--rarity-epic #ff6fbf`, text tints `#7ebcff`, `#f397ff`; common `#a8a8b8`, `#c2c2d0`) in stepped light.
 *
 * Crate keys: `k` ink, `a b c` wood light, mid, dark, `i I j` iron dark, mid, light, `l L` padlock brass and its
 * shade, `g G h` seam glow (bright, mid, dim wash), `s` hot core / spark, `d` dust. Burst keys: `a` light, `b`
 * mid, `c` dark rim (the dark rim keeps them readable on a light background).
 */
import type { SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';

type Pal = Readonly<Record<string, string>>;

const W = 20;
const H = 18;
const OX = 3; // the crate body is 14 wide, at x 3-16, leaving 3 px each side for dust, shear and the leaning lid

const BASE_NIGHT: Pal = {
  k: '#0d0a1a',
  a: '#b07a45',
  b: '#8a5a34',
  c: '#5e3b22',
  i: '#463e66',
  I: '#6e6490',
  j: '#c4bcd8',
  l: '#e0b84a',
  L: '#9a6e2a',
  d: '#b8a890',
};
const GLOW_RARE: Pal = { g: '#7ebcff', G: '#4da3ff', h: '#2f5fa0', s: '#e8f4ff' };
const GLOW_EPIC: Pal = { g: '#f397ff', G: '#ff6fbf', h: '#9a3a8a', s: '#ffe8fa' };
// by day the wood is lighter and the glow gets deeper so it still reads on pale ground
const DAY_BASE: Pal = {
  a: '#c48c52',
  b: '#9c6c3c',
  c: '#6e4628',
  i: '#5a5278',
  I: '#8a82b0',
  j: '#d6d0e6',
  d: '#ebe0c4',
};
const DAY_RARE: Pal = { g: '#a6d2ff', G: '#3b8ae6', h: '#3a6fb8', s: '#ffffff' };
const DAY_EPIC: Pal = { g: '#f8b4ff', G: '#ee52b0', h: '#b04a9c', s: '#ffffff' };

class Grid {
  private cells: string[][];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }
  set(x: number, y: number, ch: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y]![x] = ch;
  }
  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? '.';
  }
  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
  }
  pts(ch: string, list: readonly (readonly [number, number])[]): void {
    for (const [x, y] of list) this.set(x, y, ch);
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}

/**
 * The crate in local coordinates (x 0-13), its last row at `yBase`. Sealed: lid (lifted `lift` px), glowing gap,
 * body. Open: just the body, from the rim row.
 */
function drawBody(g: Grid, opts: { lift: number; yBase: number; open: boolean }): void {
  const { lift, yBase, open } = opts;
  const top = yBase - 13; // lid top row (sealed)
  const bt = top + 6; // first body row (a glow gap row lies above it)
  const band = (y0: number, y1: number): void => {
    for (const bx of [2, 10]) {
      for (let y = y0; y <= y1; y++) {
        g.set(bx, y, 'I');
        g.set(bx + 1, y, 'i');
      }
    }
  };
  if (!open) {
    const lt = top - lift;
    // lid
    g.rect(1, lt, 12, 1, 'k');
    g.rect(0, lt + 1, 14, 4, 'k');
    g.rect(1, lt + 1, 12, 1, 'a');
    g.rect(1, lt + 2, 12, 2, 'b');
    g.rect(1, lt + 4, 12, 1, 'c');
    // glowing gap between lid and body (two rows when the lid is lifted)
    for (let y = lt + 5; y < bt; y++) g.rect(1, y, 12, 1, y === bt - 1 ? 'g' : 'G');
    if (lift === 0) {
      g.set(0, bt - 1, 'k');
      g.set(13, bt - 1, 'k');
      for (const x of [1, 4, 5, 8, 9, 12]) g.set(x, bt, 'h'); // dim wash on the wood below
    }
    band(lt + 1, bt - 1);
  }
  // body
  const first = open ? bt : bt;
  g.rect(0, first, 14, yBase - first + 1, 'k');
  g.rect(1, bt, 12, 1, 'a');
  if (lift === 0 && !open) for (const x of [1, 4, 5, 8, 9, 12]) g.set(x, bt, 'h');
  g.rect(1, bt + 1, 12, 2, 'b');
  g.rect(1, bt + 3, 12, 1, 'G'); // the plank joint, glowing
  g.rect(1, bt + 4, 12, 3, 'b');
  g.rect(1, yBase - 1, 12, 1, 'c');
  for (const x of [1, 4, 5, 8, 9, 12]) g.set(x, bt + 2, 'h');
  for (const x of [4, 9]) {
    g.set(x, bt + 4, 'G');
    g.set(x, bt + 5, 'h');
  }
  band(bt, yBase - 1);
  if (!open) {
    // hasp across the gap and a brass padlock below it
    g.rect(5, top + 4, 4, 3, 'I');
    g.rect(5, top + 6, 4, 1, 'i');
    g.rect(6, bt, 2, 1, 'j');
    g.rect(5, bt + 1, 4, 5, 'l');
    g.rect(5, bt + 5, 4, 1, 'L');
    g.rect(6, bt + 3, 2, 1, 'k');
    // rivets
    g.set(2, top + 1, 'j');
    g.set(11, top + 1, 'j');
    g.set(2, yBase - 2, 'j');
    g.set(11, yBase - 2, 'j');
  }
}

function sealed(opts: {
  lift?: number;
  shear?: number;
  dust?: 'l' | 'r' | 'both' | null;
  sparks?: boolean;
}): string[] {
  const lift = opts.lift ?? 0;
  const shear = opts.shear ?? 0;
  const body = new Grid(14, H);
  drawBody(body, { lift, yBase: H - 1, open: false });
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++) {
    const off = shear === 0 ? 0 : Math.round((shear * (H - 1 - y)) / 13);
    for (let x = 0; x < 14; x++) {
      const ch = body.get(x, y);
      if (ch !== '.') g.set(x + OX + off, y, ch);
    }
  }
  if (opts.dust === 'l' || opts.dust === 'both')
    g.pts('d', [
      [1, 16],
      [2, 16],
      [1, 17],
      [2, 17],
      [0, 15],
    ]);
  if (opts.dust === 'r' || opts.dust === 'both')
    g.pts('d', [
      [17, 16],
      [18, 16],
      [17, 17],
      [18, 17],
      [19, 15],
    ]);
  if (opts.sparks)
    g.pts('s', [
      [8, 0],
      [11, 1],
    ]);
  return g.rows();
}

function openCrate(): string[] {
  const OH = 27;
  const g = new Grid(W, OH);
  // the lid, leaning against the left wall
  for (let y = 13; y <= 26; y++) {
    const x0 = Math.floor(((26 - y) * 2) / 13);
    g.rect(x0, y, 4, 1, 'k');
    g.set(x0 + 1, y, 'a');
    g.set(x0 + 2, y, y % 5 === 0 ? 'i' : 'b');
  }
  g.rect(0, 26, 4, 1, 'k');
  // the light, behind the box
  const cx = OX + 7;
  for (let y = 4; y <= 17; y++) {
    const t = 17 - y; // 0 at the rim
    const dither = (x: number): boolean => (x + y) % 2 === 0;
    const outer = t < 5 ? 5 : t < 9 ? 4 : 3;
    for (let x = cx - outer; x < cx + outer; x++) {
      const edge = x === cx - outer || x === cx + outer - 1;
      if (t > 8 && !dither(x)) continue;
      if (t > 11 && edge) continue;
      g.set(x, y, edge || t > 6 ? 'h' : 'G');
    }
    const mid = t < 7 ? 3 : 2;
    if (t <= 11)
      for (let x = cx - mid; x < cx + mid; x++)
        if (t < 9 || dither(x)) g.set(x, y, t < 9 ? 'G' : 'g');
    const core = t < 5 ? 2 : 1;
    if (t <= 8) for (let x = cx - core; x < cx + core; x++) g.set(x, y, t < 5 ? 's' : 'g');
  }
  g.pts('s', [
    [cx - 5, 5],
    [cx + 4, 3],
    [cx, 1],
    [cx + 2, 8],
    [cx - 3, 10],
    [cx + 5, 11],
  ]);
  g.pts('g', [
    [cx - 4, 2],
    [cx + 3, 0],
    [cx - 6, 8],
    [cx + 6, 6],
    [cx - 1, 4],
  ]);
  g.pts('h', [
    [cx + 1, 3],
    [cx - 2, 6],
    [cx + 5, 9],
  ]);
  // the box, opened
  const box = new Grid(14, 15);
  drawBody(box, { lift: 0, yBase: 14, open: true });
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 14; x++) {
      const ch = box.get(x, y);
      if (ch !== '.') g.set(x + OX, y + 12, ch);
    }
  // mouth: ink rim, a glowing lip
  g.rect(OX + 1, 17, 12, 1, 'k');
  g.rect(OX + 1, 18, 12, 1, 'g');
  g.rect(OX + 2, 18, 10, 1, 's');
  g.rect(OX + 1, 19, 12, 1, 'G');
  // the hasp hangs open with the padlock on it
  g.rect(OX + 5, 21, 4, 1, 'I');
  g.rect(OX + 6, 22, 2, 1, 'j');
  g.rect(OX + 5, 23, 4, 3, 'l');
  g.rect(OX + 5, 25, 4, 1, 'L');
  g.rect(OX + 6, 24, 2, 1, 'k');
  return g.rows();
}

// ------------------------------------------------------------------ bursts
const C = 23.5;
function burst(f: (x: number, y: number, r: number, a: number) => string): string[] {
  const g = new Grid(48, 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      if (x >= 16 && x < 32 && y >= 16 && y < 32) continue; // the item sits here
      const dx = x - C;
      const dy = y - C;
      g.set(x, y, f(x, y, Math.hypot(dx, dy), Math.atan2(dy, dx)));
    }
  return g.rows();
}
/** Distance across a ray at angle `ang` (px) if the point lies along it, else a big number. */
function across(r: number, a: number, ang: number): number {
  let d = a - ang;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(Math.sin(d)) * r * (Math.cos(d) > 0 ? 1 : 99);
}

const hasPoint = (list: readonly (readonly [number, number])[], x: number, y: number): boolean =>
  list.some(([px, py]) => px === x && py === y);

const burstCommon = burst((x, y, r, a) => {
  const seg = Math.floor((a + Math.PI) / (Math.PI / 6)) % 3;
  if (r >= 13 && r < 17 && seg !== 2) return r < 14.6 ? 'a' : r < 16 ? 'b' : 'c';
  const specks: [number, number][] = [
    [10, 12],
    [36, 11],
    [38, 34],
    [9, 33],
    [23, 8],
    [24, 39],
  ];
  return hasPoint(specks, x, y) ? 'b' : '.';
});

const burstRare = burst((_x, _y, r, a) => {
  if (r >= 13 && r < 14) return 'a';
  if (r >= 14 && r < 15.2) return 'b';
  if (r >= 15.2 && r < 16.2) return 'c';
  // eight rays: four long (cardinal), four short (diagonal)
  for (let k = 0; k < 8; k++) {
    const ang = -Math.PI + (k * Math.PI) / 4;
    const long = k % 2 === 0;
    const len = long ? 22 : 18;
    if (r < 16.2 || r > len) continue;
    const w = (long ? 2.6 : 1.9) * (1 - (r - 16.2) / (len - 14));
    const d = across(r, a, ang);
    if (d < w * 0.45) return 'a';
    if (d < w * 0.8) return 'b';
    if (d < w) return 'c';
  }
  return '.';
});

const burstEpic = burst((x, y, r, a) => {
  if (r >= 12.8 && r < 13.8) return 'a';
  if (r >= 13.8 && r < 15) return 'b';
  if (r >= 15 && r < 16.2) return 'c';
  // sixteen rays, alternating long (to the edge) and short
  for (let k = 0; k < 16; k++) {
    const ang = -Math.PI + (k * Math.PI) / 8;
    const long = k % 2 === 0;
    const len = long ? 24.5 : 19;
    if (r < 16.2 || r > len) continue;
    const w = (long ? 3.4 : 2.2) * (1 - (r - 16.2) / (len - 12));
    const d = across(r, a, ang);
    if (d < w * 0.4) return 'a';
    if (d < w * 0.75) return 'b';
    if (d < w) return 'c';
  }
  // sparkles: four-point stars between the rays, and loose sparks
  const stars: [number, number][] = [
    [7, 9],
    [39, 8],
    [41, 38],
    [6, 39],
    [24, 4],
    [24, 43],
  ];
  for (const [sx, sy] of stars) {
    const ddx = Math.abs(x - sx);
    const ddy = Math.abs(y - sy);
    if (ddx + ddy === 0) return 'a';
    if (ddx + ddy === 1) return 'b';
    if ((ddx === 0 && ddy === 2) || (ddy === 0 && ddx === 2)) return 'c';
  }
  const sparks: [number, number][] = [
    [3, 22],
    [44, 25],
    [14, 3],
    [34, 44],
    [10, 28],
    [38, 19],
  ];
  return hasPoint(sparks, x, y) ? 'a' : '.';
});

// ------------------------------------------------------------------ the set
/** The palette for rows: only the keys they use. */
function pal(rows: readonly string[], full: Pal): Record<string, string> {
  const used = new Set(rows.join(''));
  return Object.fromEntries(Object.entries(full).filter(([k]) => used.has(k)));
}
const NIGHT_RARE: Pal = { ...BASE_NIGHT, ...GLOW_RARE };
const mk = (rows: string[]): SpriteDef => ({ palette: pal(rows, NIGHT_RARE), rows });
const alts = (rows: string[]): Record<string, Record<string, string>> => ({
  epic: pal(rows, GLOW_EPIC),
  day: pal(rows, { ...DAY_BASE, ...DAY_RARE }),
  'epic-day': pal(rows, { ...DAY_BASE, ...DAY_EPIC }),
});

const SEALED = sealed({});
const SHAKE1 = sealed({ lift: 1, shear: -1, dust: 'r', sparks: true });
const SHAKE2 = sealed({ lift: 1, shear: 1, dust: 'l', sparks: true });
const SHAKE3 = sealed({ lift: 0, shear: 0, dust: 'both' });
const OPEN = openCrate();
const STRIP = [SEALED, SHAKE1, SHAKE2, SHAKE3].reduce<string[]>(
  (acc, r) => r.map((row, i) => (acc[i] ?? '') + row),
  [],
);

const crate = (note: string, rows: string[]) => ({
  kind: 'free' as const,
  note,
  sprite: mk(rows),
  alts: alts(rows),
});

const BURST_RARITY = {
  common: { a: '#c2c2d0', b: '#a8a8b8', c: '#5a5a70' },
  rare: { a: '#cfe6ff', b: '#4da3ff', c: '#1f4f9a' },
  epic: { a: '#ffd6fb', b: '#ff6fbf', c: '#8a2a90' },
};
const burstSprite = (note: string, rows: string[], p: Record<string, string>) => ({
  kind: 'free' as const,
  note,
  sprite: { palette: pal(rows, p), rows } as SpriteDef,
});

export const VALLEY_FORGE_CRATE_CONCEPTS: ConceptSet = {
  id: 'valley-forge-crate',
  title: 'The sealed gear crate',
  requested:
    '2026-11-14 (via the valley session): collecting gear should be a "big moment": common pieces come home on their own; rare and epic pieces wait in a sealed crate inside the Forge until the player opens it; opening reveals them one by one, best last.',
  status: 'draft',
  notes: [
    'Crate pieces are `free`, night palette main plus `alts`: `day` (lighter wood, deeper glow so it reads on pale ground), `epic` (pink-violet glow) and `epic-day`. The main palette is the RARE one (blue seam glow); `epic` swaps only the glow keys `g G h s`. Glow colours are the game rarity colours (`--rarity-rare #4da3ff`, `--rarity-epic #ff6fbf`, tints `#7ebcff`, `#f397ff`). Ink, woods and iron are the Forge props (`valley/forge-props.ts`).',
    '`crate-sealed` 20 x 18: the 14-wide crate body sits at x 3-16 (3 px of margin each side), base row 17. Iron bands, a brass padlock on an iron hasp, a glowing lid gap, a glowing plank joint and glowing vertical joints. CRATE_PROP is 16 x 16; this one is 14 wide and 14 tall inside a 20 x 18 canvas that leaves room for the shake.',
    '`crate-shake-1`, `-2`, `-3` share the 20 x 18 canvas and base row 17, so they swap in place of the sealed crate: 1 and 2 lean opposite ways (top shifted 1 px) with the lid lifted 1 px (a double glow gap), dust at one foot and two sparks; 3 is upright with dust at both feet. Play sealed, 1, 2, 1, 3 as a rattle. `shake-strip` (80 x 18) shows sealed, 1, 2, 3 side by side.',
    '`crate-open` 20 x 27: the box takes the bottom 10 rows (y 17-26), its base row 26 sits on the sealed crate base row (row 17): align the bottom rows; the sprite reaches 9 px higher than the sealed canvas. The lid leans against the left wall (x 0-3) and the padlock hangs open; a stepped column of rarity glow rises from the mouth with sparks. Same glow keys, so `epic` and the days work.',
    '`burst-common`, `burst-rare`, `burst-epic` are 48 x 48 UI overlays, one palette each (no night/day), drawn with a dark rim so they read on dark and on light. The centre 16 x 16 (x 16-31, y 16-31) is empty: draw the revealed item there. Escalation: common is a broken grey ring (radius to 17), rare is a blue ring with eight rays (to 22), epic is a pink-violet ring, sixteen rays to the edge, four-point sparkles and loose sparks.',
  ],
  sprites: {
    'crate-sealed': crate(
      'A sturdy iron-banded crate with a brass padlock, light seeping from the lid gap and plank joints.',
      SEALED,
    ),
    'crate-shake-1': crate('Rattling: leaning left, lid lifted, dust at the right foot.', SHAKE1),
    'crate-shake-2': crate('Rattling: leaning right, lid lifted, dust at the left foot.', SHAKE2),
    'crate-shake-3': crate('Rattling: upright hop, dust at both feet.', SHAKE3),
    'shake-strip': crate('Sequence: sealed, shake 1, 2, 3 side by side.', STRIP),
    'crate-open': crate(
      'Lid off and leaning on the left, padlock hanging open, a column of light pouring out.',
      OPEN,
    ),
    'burst-common': burstSprite(
      'A small grey puff ring; the item sits in the clear centre.',
      burstCommon,
      BURST_RARITY.common,
    ),
    'burst-rare': burstSprite('A blue ring with eight rays.', burstRare, BURST_RARITY.rare),
    'burst-epic': burstSprite(
      'A big pink-violet starburst with sparkles.',
      burstEpic,
      BURST_RARITY.epic,
    ),
  },
};
