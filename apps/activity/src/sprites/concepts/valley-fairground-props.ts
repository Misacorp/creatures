/**
 * Props for the Fairground canvas (valley session, direction A: every game is a stall you tap), concept art
 * (not in the game): the grandstand strip for the back of the scene, the tent with its flaps closed for the
 * locked state, a rules board, three rosettes that hang on the tent and three loungers on the grass. Glow
 * style of `valley-glow-camp` (its `fairground` tent is the reference): ink, night as the main palette and
 * `alts.day` for the same pixels, materials from `valley-tiers.ts` where they fit, no text on any sign.
 * Drawn with the small helpers below (a grid, a head stamp), then kept as the rows they make.
 */
import type { SpriteDef } from '../sprite-data';
import { INK, tierPalette } from './valley-tiers';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import { VALLEY_GLOW_CAMP_CONCEPTS } from './valley-glow-camp';
import type { ConceptSet } from './index';

type Grid = string[][];
type Pal = Record<string, string>;
interface Parts {
  night: Pal;
  day: Pal;
}

const grid = (w: number, h: number): Grid =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
/** Sets a pixel; with `wrap` the x wraps around the width (so a strip tiles sideways). */
const put = (g: Grid, x: number, y: number, c: string, wrap = false): void => {
  const row = g[y];
  if (row === undefined) return;
  const w = row.length;
  const xx = wrap ? ((x % w) + w) % w : x;
  if (xx >= 0 && xx < w) row[xx] = c;
};
const at = (g: Grid, x: number, y: number, wrap = false): string => {
  const row = g[y];
  if (row === undefined) return '.';
  const w = row.length;
  return row[wrap ? ((x % w) + w) % w : x] ?? '.';
};
const rowsOf = (g: Grid): string[] => g.map((r) => r.join(''));
/** Draws `rows` with its top left at (x, y); `.` keeps what is there, `c` in the rows becomes `body`. */
const stamp = (
  g: Grid,
  x: number,
  y: number,
  rows: readonly string[],
  body = 'c',
  wrap = false,
): void => {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch !== '.') put(g, x + i, y + j, ch === 'c' ? body : ch, wrap);
    });
  });
};

/** A sprite from its rows: palette keys the rows never use are dropped (so the lint's "unused key" stays quiet). */
function finish(rows: string[], parts: Parts[]): { sprite: SpriteDef; day: Pal } {
  const used = new Set(rows.join(''));
  const night: Pal = {};
  const day: Pal = {};
  for (const part of parts) {
    for (const key of Object.keys(part.night)) {
      if (used.has(key)) {
        night[key] = part.night[key] ?? '';
        day[key] = part.day[key] ?? part.night[key] ?? '';
      }
    }
  }
  return { sprite: { palette: night, rows }, day };
}

/** Materials of the valley tiers as one parts record (night colours and their day versions). */
const fromTier = (t: { palette: Pal; day: Pal }): Parts => ({ night: t.palette, day: t.day });

const BASE: Parts = {
  night: { k: INK, x: '#112430' },
  day: { k: INK, x: '#2f5a38' },
};
const WOOD = fromTier(tierPalette(1, { l: 'log', w: 'logShade', r: 'rope' }));
const PLANK = fromTier(tierPalette(2, { p: 'plank', P: 'plankShade' }));
const CANVAS = fromTier(tierPalette(4, { t: 'teal', T: 'tealShade', c: 'cream' }));

/** Body colours of the crowd (night, day): red, blue, green, yellow, purple. */
const CROWD: Parts = {
  night: { a: '#e0705a', b: '#6a9ae8', g: '#7ad070', y: '#f0d060', q: '#b88ae0' },
  day: { a: '#d8482e', b: '#3a78d0', g: '#4aa850', y: '#f0b830', q: '#9058c8' },
};

// ---------------------------------------------------------------- grandstand

/** A crowd head, 8x7: two ear tufts, a round face, two one-pixel eyes (two rows tall). `c` is the body colour. */
const HEADS: readonly (readonly string[])[] = [
  ['.k....k.', 'kckkkkck', 'kcccccck', 'kckcckck', 'kckcckck', 'kcccccck', '.kkkkkk.'],
  ['kk....kk', 'kckkkkck', 'kcccccck', 'kckcckck', 'kckcckck', 'kcccccck', '.kkkkkk.'],
];
/** The shoulders under a head, 8x2. */
const SHOULDERS = ['kcccccck', 'kcccccck'];

const TIER_PEOPLE: readonly string[] = [
  'agbq.ybgqa.bygqb', // back row, 16 seats of 8 px (a letter is a body colour, `.` an empty seat)
  'qy.bagqbyg.abqyg',
  'bgyqa.bqgy.gbyaq',
];

/** Row kinds under a tier's shoulders: board top, board face, ink line, dark riser, open leg gap. */
type Kind = 'p' | 'P' | 'k' | 'w' | 'L';

interface Stand {
  top: number;
  kinds: readonly Kind[];
  /** Posts holding an awning (x of the post's left pixel), drawn in front of the crowd. */
  posts?: readonly number[];
  awning?: boolean;
  bunting?: boolean;
}

const W = 128;
const H = 48;

function boardRow(g: Grid, y: number, kind: Kind): void {
  for (let x = 0; x < W; x++) {
    if (kind === 'p') put(g, x, y, 'p');
    else if (kind === 'P') put(g, x, y, x % 16 === 0 ? 'w' : 'P');
    else if (kind === 'k') put(g, x, y, 'k');
    else if (kind === 'w') put(g, x, y, 'w');
    else {
      const m = x % 16;
      if (m === 7 || m === 9) put(g, x, y, 'k');
      else if (m === 8) put(g, x, y, 'l');
    }
  }
}

/** The sagging rope with flags that hang from it; every length divides 128, so it tiles. */
function bunting(g: Grid): void {
  const sag = (x: number): number => 1 + Math.round(2 * Math.sin((Math.PI * (x % 32)) / 32));
  for (let x = 0; x < W; x++) put(g, x, sag(x), 'r');
  const flags = ['a', 't', 'y', 'c', 'b', 'g', 'q', 'c'];
  for (let i = 0; i < 16; i++) {
    const cx = 4 + i * 8;
    const col = flags[i % flags.length] ?? 'a';
    const y = sag(cx) + 1;
    stamp(g, cx - 2, y, ['ccccc', '.ccc.', '..c..'], col);
  }
}

/** A striped awning over the whole strip with a scalloped hem, ink around it. */
function awning(g: Grid): void {
  const stripe = (x: number): string => (Math.floor(x / 8) % 2 === 0 ? 't' : 'c');
  for (let x = 0; x < W; x++) {
    put(g, x, 1, 'k');
    for (let y = 2; y <= 8; y++) put(g, x, y, y === 8 && stripe(x) === 't' ? 'T' : stripe(x));
    const m = x % 8;
    put(g, x, 9, stripe(x));
    if (m >= 1 && m <= 6) put(g, x, 10, stripe(x));
    if (m >= 2 && m <= 5) put(g, x, 11, stripe(x));
  }
  // ink under the hem
  const snap = g.map((r) => [...r]);
  for (let y = 9; y <= 12; y++) {
    for (let x = 0; x < W; x++) {
      if (at(snap, x, y, true) !== '.') continue;
      const around = [at(snap, x, y - 1, true), at(snap, x - 1, y, true), at(snap, x + 1, y, true)];
      if (around.some((c) => c === 't' || c === 'c' || c === 'T')) put(g, x, y, 'k');
    }
  }
}

function grandstand(stand: Stand): string[] {
  const g = grid(W, H);
  const pitch = 9 + stand.kinds.length;
  const tops = [0, 1, 2].map((i) => stand.top + i * pitch);
  // the crowd, back row first
  tops.forEach((top, t) => {
    const people = TIER_PEOPLE[t] ?? '';
    if (people.length !== 16) throw new Error('a tier has 16 seats');
    const shift = t === 1 ? 4 : 0;
    [...people].forEach((body, i) => {
      if (body === '.') return;
      const x = shift + i * 8;
      const dy = (i + t) % 3 === 0 ? 1 : 0;
      stamp(g, x, top + dy, HEADS[(i + t) % 2] ?? [], body, true);
      stamp(g, x, top + dy + 7, SHOULDERS, body, true);
    });
  });
  for (const px of stand.posts ?? []) {
    for (let y = 12; y < H - 1; y++) {
      put(g, px, y, 'k', true);
      put(g, px + 1, y, 'l', true);
      put(g, px + 2, y, 'k', true);
    }
  }
  tops.forEach((top) => {
    stand.kinds.forEach((kind, j) => boardRow(g, top + 9 + j, kind));
  });
  // the ground sill
  const sill = stand.kinds.includes('L') ? 'L' : 'k';
  if (sill === 'k') boardRow(g, H - 1, 'k');
  else
    for (let x = 0; x < W; x++) {
      const m = x % 16;
      if (m >= 7 && m <= 9) put(g, x, H - 1, 'k');
    }
  if (stand.bunting) bunting(g);
  if (stand.awning) awning(g);
  return rowsOf(g);
}

const GRAND_A = grandstand({ top: 8, kinds: ['p', 'P', 'k', 'w'], bunting: true });
const GRAND_B = grandstand({
  top: 11,
  kinds: ['p', 'P', 'k'],
  awning: true,
  posts: [30, 62, 94, 126],
});
const GRAND_C = grandstand({ top: 5, kinds: ['p', 'P', 'k', 'L', 'L'] });

const GRAND_PARTS = [BASE, WOOD, PLANK, CROWD, CANVAS];
const gA = finish(GRAND_A, GRAND_PARTS);
const gB = finish(GRAND_B, GRAND_PARTS);
const gC = finish(GRAND_C, GRAND_PARTS);

/** The join of a strip that tiles: the right quarter, then the left quarter. */
const seam = (rows: readonly string[]): string[] => rows.map((r) => r.slice(96) + r.slice(0, 32));
const dayOf = (s: { sprite: SpriteDef; day: Pal }): SpriteDef => ({
  ...s.sprite,
  palette: { ...s.sprite.palette, ...s.day },
});

// ---------------------------------------------------------------- the closed tent

const FAIR = VALLEY_GLOW_CAMP_CONCEPTS.sprites['fairground'];
if (FAIR === undefined) throw new Error('valley-glow-camp has no fairground');

/** The tent's rows with the doorway shut: two teal flaps, an ink seam, two ties; no light spill. */
function closeTent(rows: readonly string[]): string[] {
  const g = rows.map((r) => [...r]);
  const tie = [33, 37];
  for (let y = 0; y < g.length; y++) {
    const row = g[y];
    if (row === undefined) continue;
    // lanterns and the spill are unlit: no light rings on the ground
    for (let x = 0; x < row.length; x++)
      if (row[x] === '1' || row[x] === '2' || row[x] === '3') row[x] = '.';
    if (y < 30 || y > 39) continue;
    const xs = row.map((c, x) => (c === 'i' || c === 'y' ? x : -1)).filter((x) => x >= 0);
    const first = xs[0];
    const last = xs[xs.length - 1];
    if (first === undefined || last === undefined) continue;
    const mid = Math.round((first + last) / 2);
    for (let x = first; x <= last; x++) row[x] = 'T';
    row[first] = 'k';
    row[last] = 'k';
    row[mid] = 'k';
    if (tie.includes(y)) {
      for (let x = mid - 2; x <= mid + 2; x++) if (x > first && x < last) row[x] = 'j';
    }
    if (tie.includes(y - 1)) row[mid] = 'j';
  }
  return g.map((r) => r.join(''));
}

const TENT_ROWS = closeTent(FAIR.sprite.rows);
const TENT_NIGHT: Pal = { ...FAIR.sprite.palette, G: '#3a5a66', H: '#6a8a92', y: '#566a72' };
const TENT_DAY: Pal = {
  ...(FAIR.alts?.['day'] ?? {}),
  G: '#a8b8b0',
  H: '#dce8e4',
  y: '#b8c8c0',
};
const tent = (() => {
  const used = new Set(TENT_ROWS.join(''));
  const keep = (p: Pal): Pal => Object.fromEntries(Object.entries(p).filter(([k]) => used.has(k)));
  return {
    sprite: { palette: keep(TENT_NIGHT), rows: TENT_ROWS } satisfies SpriteDef,
    day: keep(TENT_DAY),
  };
})();

// ---------------------------------------------------------------- rules board

function rulesBoard(): string[] {
  const g = grid(24, 32);
  // legs
  for (const lx of [3, 18]) {
    for (let y = 20; y < 32; y++) {
      put(g, lx, y, 'k');
      put(g, lx + 1, y, 'l');
      put(g, lx + 2, y, 'w');
      put(g, lx + 3, y, 'k');
    }
  }
  // feet
  for (const lx of [2, 17]) for (let i = 0; i < 6; i++) put(g, lx + i, 31, 'k');
  // frame and face
  for (let y = 0; y < 21; y++) for (let x = 0; x < 24; x++) put(g, x, y, 'k');
  for (let y = 1; y < 20; y++) for (let x = 1; x < 23; x++) put(g, x, y, 'l');
  for (let y = 3; y < 18; y++) for (let x = 3; x < 21; x++) put(g, x, y, 'p');
  for (let x = 1; x < 23; x++) put(g, x, 1, 'u');
  // the cast shadow between the legs
  for (let x = 8; x < 17; x++) put(g, x, 31, 'x');
  // sheets (cream), each pinned with a red pin; marks only
  stamp(g, 4, 4, [
    'ccccccc',
    'ccccccc',
    'ccwwwcc',
    'ccccccc',
    'ccwwcwc',
    'ccccccc',
    'ccccccc',
    'ccccccc',
  ]);
  stamp(g, 12, 5, ['cccccc', 'ccttcc', 'cttttc', 'ccttcc', 'cccccc', 'cccccc', 'cccccc']);
  stamp(g, 15, 12, ['ccccc', 'cwcwc', 'ccwcc', 'cccwc', 'ccccc']);
  stamp(g, 7, 12, ['cccccc', 'cwwwcc', 'cccccc', 'cwcwcc']);
  put(g, 7, 4, 'a');
  put(g, 15, 5, 'a');
  put(g, 17, 12, 'a');
  put(g, 9, 12, 'a');
  return rowsOf(g);
}

const BOARD_PARTS: Parts[] = [
  BASE,
  WOOD,
  PLANK,
  CANVAS,
  {
    night: { u: '#e0954a', a: '#e0705a' },
    day: { u: '#c99a58', a: '#d8482e' },
  },
];
const board = finish(rulesBoard(), BOARD_PARTS);

// ---------------------------------------------------------------- rosettes

interface Metal {
  L: string;
  m: string;
  d: string;
}
const CREAM = { night: '#fff6dc', day: '#fff1c8' };

/** A pleated rosette, 12x16: twelve pleats round a cream centre, two ribbon tails with notched ends. */
function rosette(): string[] {
  const g = grid(12, 16);
  const cx = 5.5;
  const cy = 5.5;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > 5.6) continue;
      if (d < 2.3) put(g, x, y, 'c');
      else if (d < 3.2) put(g, x, y, 'L');
      else {
        const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 12);
        const lit = sector % 2 === 0;
        put(g, x, y, d > 4.7 ? (lit ? 'm' : 'd') : lit ? 'L' : 'm');
      }
    }
  }
  // two airy tails, 3 px wide, spreading a little, with a notch at the end
  const tails: [number, number][] = [
    [2, -1],
    [7, 1],
  ];
  for (const [x0, dir] of tails) {
    for (let y = 10; y < 16; y++) {
      const off = dir < 0 ? -Math.floor((y - 10) / 3) : Math.floor((y - 10) / 3);
      const notch = y === 15;
      put(g, x0 + off, y, 'd');
      put(g, x0 + off + 1, y, notch ? '.' : 'm');
      put(g, x0 + off + 2, y, 'L');
    }
    put(g, x0 + (dir < 0 ? -1 : 1), 15, 'd');
  }
  // redraw the lower rim so the tails tuck behind the disc
  for (let x = 4; x < 8; x++) if (at(g, x, 10) === '.') put(g, x, 10, 'd');
  return rowsOf(g);
}

function rosetteSprite(metal: Metal, day: Metal): { sprite: SpriteDef; day: Pal } {
  return {
    sprite: { palette: { ...metal, c: CREAM.night }, rows: ROSETTE_ROWS },
    day: { ...day, c: CREAM.day },
  };
}
const ROSETTE_ROWS = rosette();
const gold = rosetteSprite(
  { L: '#ffe27a', m: '#f0bc38', d: '#a87818' },
  { L: '#ffd848', m: '#e0a420', d: '#8a5a10' },
);
const silver = rosetteSprite(
  { L: '#f4f8ff', m: '#b8c2d6', d: '#788098' },
  { L: '#e8eef8', m: '#a0aac0', d: '#5a6278' },
);
const bronze = rosetteSprite(
  { L: '#f0b088', m: '#c8804a', d: '#84502e' },
  { L: '#e49a64', m: '#b06a34', d: '#6a3a1c' },
);

// ---------------------------------------------------------------- loungers

/** A lounger: the crowd's blob on the grass, 16x10 (the waving one 16x10 too, its arm up). */
function lounger(pose: 1 | 2 | 3): string[] {
  const g = grid(16, 10);
  if (pose === 1) {
    // sitting, hugging its knees
    stamp(g, 4, 0, HEADS[0] ?? []);
    stamp(g, 3, 7, ['.kcccccccck.', 'kcccccccccck']);
    for (let x = 2; x < 14; x++) put(g, x, 9, 'k');
    for (const x of [2, 3, 12, 13]) put(g, x, 8, 'c');
    put(g, 1, 8, 'k');
    put(g, 14, 8, 'k');
    for (let x = 0; x < 16; x++) if (at(g, x, 9) === '.' && (x < 2 || x > 13)) put(g, x, 9, 'x');
  } else if (pose === 2) {
    // lying back, head up on the left, feet in the air on the right
    stamp(g, 0, 3, HEADS[1] ?? []);
    // torso, a long low blob
    for (let x = 7; x < 14; x++) {
      put(g, x, 5, 'k');
      put(g, x, 9, 'k');
      for (let y = 6; y < 9; y++) put(g, x, y, 'c');
    }
    put(g, 14, 6, 'k');
    put(g, 14, 7, 'k');
    put(g, 14, 8, 'k');
    // feet up
    stamp(g, 9, 2, ['.kk.kk.', 'kcckcck', 'kcckcck', 'kcckcck']);
    for (let x = 7; x < 16; x++) if (at(g, x, 9) === '.') put(g, x, 9, 'x');
  } else {
    // sitting and waving: one arm up
    stamp(g, 3, 0, HEADS[0] ?? []);
    stamp(g, 2, 7, ['kcccccccccck', 'kcccccccccck', 'kkkkkkkkkkkk']);
    stamp(g, 11, 1, ['.kk..', 'kcck.', 'kcck.', 'kcck.', 'kcck.', 'kcck.']);
    for (let x = 0; x < 16; x++) if (at(g, x, 9) === '.') put(g, x, 9, 'x');
  }
  return rowsOf(g);
}

const lounge = (pose: 1 | 2 | 3, night: string, day: string): { sprite: SpriteDef; day: Pal } => {
  const rows = lounger(pose);
  return finish(rows, [BASE, { night: { c: night }, day: { c: day } }]);
};
const l1 = lounge(1, '#e0705a', '#d8482e');
const l2 = lounge(2, '#6a9ae8', '#3a78d0');
const l3 = lounge(3, '#7ad070', '#4aa850');

// ---------------------------------------------------------------- the set

const backdrop = VALLEY_GLOW_CONCEPTS.backdrop;

export const VALLEY_FAIRGROUND_PROPS_CONCEPTS: ConceptSet = {
  id: 'valley-fairground-props',
  title: 'Fairground: the grandstand and props',
  requested:
    '2026-11-20: for the Fairground canvas (direction A, each game is a stall you tap): a grandstand strip of tiered benches with a small crowd that tiles sideways, the tent with its flaps closed for the locked state, a rules board, gold, silver and bronze rosettes that hang on the tent (light and airy), and optional loungers on the grass. Glow style of valley-glow-camp, day and night, no text on signs.',
  status: 'draft',
  notes: [
    'Glow style of `valley-glow-camp` (the `fairground` tent is the reference): ink outline, night as the main palette and `alts.day` for the same pixels, materials from `valley-tiers` (rope and log of level 1, plank of level 2, the teal and cream of level 4), a cast shadow `x`. Backdrop as in `valley-glow`. Each sprite stays under 16 colours. No text on any sign or sheet, only marks.',
    "`grandstand` 128x48, base row 47 (the bottom ink row), tiles sideways: column 0 continues column 127 (the crowd's heads and the bunting wrap, and every pattern repeats at a divisor of 128). The `seam` and `seam-day` variants (64 wide) show the join in the middle: the right quarter, then the left quarter. Three rows of benches (plank seat, face with a joint every 16 px, a dark riser) with 16 seats a row, 3 of them empty, and a crowd of round creature-ish blobs (not real creatures): ear tufts, two one-pixel eyes, five body colours (red, blue, green, yellow, purple), a few sitting a pixel lower. A rope of flags sags in four swings above. For the back of the scene; no ground spill.",
    'Variations of the grandstand: B (`B`, `B-day`) has a teal and cream striped awning with a scalloped hem over the stands, held by four posts, instead of the bunting; the back row sits a little lower under it. C (`C`, `C-day`) is an open wooden bleacher with no roof and no bunting: seat boards on legs every 16 px with open gaps under each row so the grass shows through.',
    "`tent-closed` 64x54, base row 40 (the tent's bottom ink row; the shadow and ground marks run to row 51): the same canvas and base row as `valley-glow-camp/fairground`, whose rows it copies with only the doorway and the light changed. The doorway is shut with two teal flaps, an ink seam and two rope ties; the lantern glass is dull (unlit) and the light rings on the ground are gone, so the ground is the plain grass of the backdrop (the pebbles and flowers stay). By day the same, with the lantern glass pale.",
    '`rules-board` 24x32, base row 31 (the feet): a notice board on two legs, a log frame with a lit top edge and a plank face, four cream sheets pinned with red pins (marks only: bars, a teal tab with a star, a tick-like mark, dashes). Wood matches the Market props (log, log shade, orange lit edge).',
    "`rosette-gold`, `rosette-silver`, `rosette-bronze`, 12x16 each (the disc is 12x12 at the top, two ribbon tails under it to row 15; hang point is the disc centre at x 5.5, y 5.5): a pleated disc of twelve alternating light and mid pleats round a cream centre, two thin ribbon tails with a notch, outlined in the metal's dark shade instead of ink so they stay light on the tent. Day versions are a little deeper so they hold against the cream stripes.",
    '`lounger-1`, `lounger-2`, `lounger-3`, 16x10 each, base row 9: the crowd blob on the grass, sitting hugging its knees, lying back with its feet in the air, and sitting waving one arm. One body colour each (red, blue, green); a cast shadow on the grass. For the locked state.',
    'Variations on the grandstand: A bunting and closed risers, B striped awning, C open bleacher. Pick: A, because the bunting and the closed risers give the strip a solid back for the scene, the crowd fills the whole height and reads at 1x, and its top is a flat enough line to sit behind the stalls; B hides the back row under the awning and is taller-looking, C is open so the crowd floats against the grass.',
  ],
  ...(backdrop === undefined ? {} : { backdrop }),
  sprites: {
    grandstand: {
      kind: 'free',
      note: 'A strip of three tiered plank benches with a crowd of small round creature-ish heads (ear tufts, two-pixel eyes, five colours) and a rope of bunting above. Tiles sideways: column 0 continues column 127. Variations: B a striped awning over the stands, C an open wooden bleacher with no roof. Pick: A, because the bunting and the closed risers give the back of the scene a solid strip.',
      sprite: gA.sprite,
      alts: { day: gA.day },
      variants: {
        seam: { ...gA.sprite, rows: seam(gA.sprite.rows) },
        'seam-day': { ...dayOf(gA), rows: seam(gA.sprite.rows) },
        B: gB.sprite,
        'B-day': dayOf(gB),
        C: gC.sprite,
        'C-day': dayOf(gC),
      },
    },
    'tent-closed': {
      kind: 'free',
      note: 'The fairground tent with its flaps closed: the doorway is two teal flaps with an ink seam and two rope ties, the lanterns are unlit and there is no light on the grass. For the locked state.',
      sprite: tent.sprite,
      alts: { day: tent.day },
    },
    'rules-board': {
      kind: 'free',
      note: 'A small notice board on two legs with four pinned sheets, marks only (no text), in the Market props wood.',
      sprite: board.sprite,
      alts: { day: board.day },
    },
    'rosette-gold': {
      kind: 'free',
      note: 'A light pleated rosette with a cream centre and two hanging ribbon tails, gold. Hangs on the tent.',
      sprite: gold.sprite,
      alts: { day: gold.day },
    },
    'rosette-silver': {
      kind: 'free',
      note: 'The same rosette in silver.',
      sprite: silver.sprite,
      alts: { day: silver.day },
    },
    'rosette-bronze': {
      kind: 'free',
      note: 'The same rosette in bronze.',
      sprite: bronze.sprite,
      alts: { day: bronze.day },
    },
    'lounger-1': {
      kind: 'free',
      note: 'A crowd blob sitting on the grass, hugging its knees (red). For the locked state.',
      sprite: l1.sprite,
      alts: { day: l1.day },
    },
    'lounger-2': {
      kind: 'free',
      note: 'A crowd blob lying back with its feet in the air (blue).',
      sprite: l2.sprite,
      alts: { day: l2.day },
    },
    'lounger-3': {
      kind: 'free',
      note: 'A crowd blob sitting and waving one arm (green).',
      sprite: l3.sprite,
      alts: { day: l3.day },
    },
  },
};
