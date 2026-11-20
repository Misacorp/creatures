/**
 * The Fairground's stalls, concept art (not in the game): each game is a stall you tap and your creature
 * stands at its stall (Misa picked direction A, 2026-11-20). Glow style of `valley-glow-camp`'s fairground
 * tent (striped red-and-cream canvas, lit lanterns): ink `#0d0a1a`, night is the main palette and `alts.day`
 * recolours the same pixels. Wood, cream, teal, brass and iron come from `valley-tiers`; the canvas red, the
 * poster fill and the gift colours are the stall's own. No text anywhere: marks only.
 * Pieces are drawn with the small helpers below on a canvas of the final size (shapes inside a 1 px margin, the
 * ink outline is added around them), and the result is plain pixel data. Every piece stands on its bottom
 * ink row (its base row).
 */
import type { SpriteDef } from '../sprite-data';
import { tierPalette, INK } from './valley-tiers';
import { VALLEY_GLOW_CONCEPTS } from './valley-glow';
import type { Concept, ConceptSet } from './index';

const t1 = tierPalette(1, { W: 'logShade' });
const t2 = tierPalette(2, {
  p: 'plank',
  P: 'plankShade',
  l: 'shingleLight',
  m: 'shingle',
  d: 'shingleShade',
});
const t3 = tierPalette(3, { i: 'iron' });
const t4 = tierPalette(4, { C: 'cream', T: 'teal', t: 'tealShade', b: 'brass' });

const NIGHT: Record<string, string> = {
  k: INK,
  ...t1.palette,
  ...t2.palette,
  ...t3.palette,
  ...t4.palette,
  R: '#a8403a', // striped canvas red (the camp fairground tent's)
  S: '#7a2e30', // canvas shade
  f: '#3a4a78', // the poster slot: one flat colour
  y: '#ffd966', // lantern glass, lit
  H: '#fff6c8', // lantern flame
  u: '#5a5470', // lantern glass, unlit
  n: '#e07aa0', // ribbon pink
  v: '#7a5ac0', // wrapped prize, violet
};
const DAY: Record<string, string> = {
  k: INK,
  ...t1.day,
  ...t2.day,
  ...t3.day,
  ...t4.day,
  R: '#c8441e',
  S: '#a0341a',
  f: '#9ab8c8',
  y: '#a8b8b0', // lanterns are plain by day
  H: '#dce8e4',
  u: '#8f9a98',
  n: '#e8789a',
  v: '#8a6ad0',
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
/** The 4-neighbour ink outline around every drawn pixel, and the sprite with its day palette. */
function finish(g: Grid): { sprite: SpriteDef; day: Record<string, string> } {
  const h = g.length;
  const w = g[0]?.length ?? 0;
  const at = (x: number, y: number): string => g[y]?.[x] ?? '.';
  const out = g.map((r) => [...r]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== '.') continue;
      if (
        at(x - 1, y) !== '.' ||
        at(x + 1, y) !== '.' ||
        at(x, y - 1) !== '.' ||
        at(x, y + 1) !== '.'
      )
        put(out, x, y, 'k');
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

interface Stall {
  w: number;
  /** Stripe width and shift, so the stripes are symmetric (red at both ends). */
  cell: number;
  shift: number;
  /** Top left x of the 44x24 poster frame (its 40x20 slot is 2 px in). */
  frameX: number;
  lanterns: readonly number[];
}

const SOLO: Stall = { w: 80, cell: 6, shift: 0, frameX: 18, lanterns: [6, 71] };
const TEAM: Stall = { w: 112, cell: 5, shift: 2, frameX: 34, lanterns: [6, 24, 87, 105] };
const H = 56;
/** Wall, counter and poster rows (final coordinates, shared by every stall). */
const WALL_TOP = 12;
const FRAME_Y = 14;
const SLOT_Y = 16;
const LEDGE_Y = 44;

const stripe = (s: Stall, x: number): 'R' | 'C' =>
  Math.floor((x - 1 + s.shift) / s.cell) % 2 === 0 ? 'R' : 'C';

/** Posts, back wall, counter and its teal cloth: the same under every awning. */
function body(g: Grid, s: Stall): void {
  const right = s.w - 2;
  rect(g, 1, WALL_TOP, s.w - 2, 32, 'P'); // back wall, then plank seams
  for (let x = 9; x < right - 4; x += 8) rect(g, x, WALL_TOP, 1, LEDGE_Y - WALL_TOP, 'W');
  rect(g, 4, LEDGE_Y - 1, s.w - 8, 1, 'W'); // wall shadow above the counter
  rect(g, 1, WALL_TOP, 3, H - 2 - WALL_TOP, 'p'); // posts
  rect(g, 3, WALL_TOP, 1, H - 2 - WALL_TOP, 'P');
  rect(g, right - 2, WALL_TOP, 3, H - 2 - WALL_TOP, 'p');
  rect(g, right - 2, WALL_TOP, 1, H - 2 - WALL_TOP, 'P');
  rect(g, 1, LEDGE_Y, s.w - 2, 1, 'C'); // the ledge: a flat lit counter top
  rect(g, 1, LEDGE_Y + 1, s.w - 2, 1, 'p');
  rect(g, 1, LEDGE_Y + 2, s.w - 2, 10, 'P');
  rect(g, 1, H - 3, s.w - 2, 2, 'W'); // plinth
  // teal cloth hanging from the counter, scalloped, with a lit cream edge
  for (let x = 5; x < right - 3; x++) {
    const hang = x % 6 === 0 || x % 6 === 5 ? 6 : 8;
    rect(g, x, LEDGE_Y + 2, 1, hang, Math.floor(x / 6) % 2 === 0 ? 'T' : 't');
  }
  rect(g, 5, LEDGE_Y + 2, s.w - 10, 1, 'C');
}

/** The framed poster slot: a 40x20 flat panel in a two-line wooden frame. */
function poster(g: Grid, s: Stall): void {
  rect(g, s.frameX, FRAME_Y, 44, 24, 'p');
  rect(g, s.frameX + 1, FRAME_Y + 1, 42, 22, 'W');
  rect(g, s.frameX + 2, SLOT_Y, 40, 20, 'f');
}

function lantern(g: Grid, x: number, y: number, lit: boolean): void {
  put(g, x + 1, y, 'W'); // hook
  rect(g, x, y + 1, 3, 1, 'b');
  rect(g, x, y + 2, 3, 3, lit ? 'y' : 'u');
  if (lit) put(g, x + 1, y + 3, 'H');
  rect(g, x, y + 5, 3, 1, 'b');
}

/** Direction A: a straight sloping striped awning. */
function awningA(g: Grid, s: Stall): void {
  for (let y = 1; y <= 11; y++) {
    const inset = Math.max(0, 6 - y);
    for (let x = 1 + inset; x <= s.w - 2 - inset; x++) {
      put(g, x, y, y === 11 ? (stripe(s, x) === 'R' ? 'S' : 'C') : stripe(s, x));
    }
  }
}

/** Direction B: a scalloped edge, pennants on top. */
function awningB(g: Grid, s: Stall): void {
  for (let y = 4; y <= 11; y++) {
    for (let x = 1; x <= s.w - 2; x++) {
      const local = (x - 1 + s.shift) % s.cell;
      const depth = [1, 2, 3, 3, 2, 1][Math.min(5, Math.floor((local * 6) / s.cell))] ?? 1;
      if (y <= 8 + depth) put(g, x, y, stripe(s, x));
    }
  }
  for (const [x, c] of [
    [6, 'T'],
    [Math.floor(s.w / 2) - 1, 'b'],
    [s.w - 11, 'T'],
  ] as const) {
    rect(g, x, 1, 1, 3, 'W');
    rect(g, x + 1, 1, 4, 1, c);
    rect(g, x + 1, 2, 3, 1, c);
    put(g, x + 1, 3, c);
  }
}

/** Direction C: a peaked shingle roof with a flag. */
function roofC(g: Grid, s: Stall): void {
  const mid = s.w / 2;
  for (let y = 5; y <= 11; y++) {
    const half = Math.round(2 + ((y - 5) * (mid - 3)) / 6);
    for (let x = Math.ceil(mid - half); x <= Math.floor(mid + half) - 1; x++) {
      const lit = x < mid;
      put(g, x, y, y === 11 || (y - 5) % 3 === 2 ? 'd' : lit ? 'l' : 'm');
    }
  }
  rect(g, mid - 1, 1, 1, 4, 'W');
  rect(g, mid, 1, 5, 2, 'R');
  rect(g, mid, 3, 3, 1, 'R');
}

/** Furled awning: a rolled striped bolt tied with rope. */
function furled(g: Grid, s: Stall): void {
  for (let x = 1; x <= s.w - 2; x++) {
    put(g, x, 1, 'C');
    for (let y = 2; y <= 5; y++) put(g, x, y, stripe(s, x));
    put(g, x, 6, stripe(s, x) === 'R' ? 'S' : 'C');
  }
  for (const x of [Math.floor(s.w * 0.2), Math.floor(s.w * 0.8)]) rect(g, x, 1, 2, 6, 'W');
  for (let y = 1; y <= 6; y++) put(g, 1, y, 'S');
  for (let y = 1; y <= 6; y++) put(g, s.w - 2, y, 'S');
}

/** A small dark padlock (5x6: a rounded shackle over a square body with a keyhole), the closed mark on a tag. */
function padlock(g: Grid, x: number, y: number): void {
  rect(g, x + 1, y, 3, 1, 'i');
  rect(g, x, y + 1, 1, 1, 'i');
  rect(g, x + 4, y + 1, 1, 1, 'i');
  rect(g, x, y + 2, 5, 4, 'i');
  put(g, x + 2, y + 3, 'C');
  put(g, x + 2, y + 4, 'C');
}

/** Shutters down over the front and the poster slot: slats, iron bands, a latch and a hanging tag. */
function shutters(g: Grid, s: Stall): void {
  const x0 = 4;
  const w = s.w - 8;
  for (let y = WALL_TOP; y < LEDGE_Y; y++) {
    rect(g, x0, y, w, 1, (y - WALL_TOP) % 4 === 3 ? 'W' : (y - WALL_TOP) % 4 === 0 ? 'p' : 'P');
  }
  for (const bx of [x0 + 8, x0 + w - 10]) rect(g, bx, WALL_TOP, 2, LEDGE_Y - WALL_TOP, 'i');
  const mid = Math.floor(s.w / 2);
  rect(g, mid - 4, 38, 8, 4, 'i'); // latch plate
  rect(g, mid - 1, 39, 2, 2, 'b');
  // hanging closed tag: a cream tag on a rope with a padlock mark
  rect(g, mid, WALL_TOP, 1, 6, 'W');
  rect(g, mid - 3, WALL_TOP + 6, 7, 9, 'C');
  padlock(g, mid - 2, WALL_TOP + 8);
}

type Style = 'A' | 'B' | 'C';
function stall(s: Stall, style: Style, locked: boolean): ReturnType<typeof finish> {
  const g = grid(s.w, H);
  body(g, s);
  if (locked) {
    // the furled roll sits on the posts: wall and posts continue up to it
    rect(g, 1, 7, s.w - 2, 5, 'P');
    rect(g, 1, 7, 3, 5, 'p');
    rect(g, s.w - 4, 7, 3, 5, 'p');
    shutters(g, s);
    furled(g, s);
    for (const x of s.lanterns) {
      rect(g, x + 1, 7, 1, 2, 'W');
      lantern(g, x, 9, false);
    }
  } else {
    poster(g, s);
    if (style === 'A') awningA(g, s);
    else if (style === 'B') awningB(g, s);
    else roofC(g, s);
    for (const x of s.lanterns) lantern(g, x, 12, true);
  }
  return finish(g);
}

/** The prize stall: 64x48, base row 47. */
const PW = 64;
const PH = 48;
const P_LEDGE = 36;
function prize(shuttered: boolean): ReturnType<typeof finish> {
  const g = grid(PW, PH);
  const right = PW - 2;
  rect(g, 1, 12, PW - 2, 24, 'P');
  for (let x = 9; x < right - 4; x += 8) rect(g, x, 12, 1, 24, 'W');
  rect(g, 1, 12, 3, PH - 2 - 12, 'p');
  rect(g, 3, 12, 1, PH - 2 - 12, 'P');
  rect(g, right - 2, 12, 3, PH - 2 - 12, 'p');
  rect(g, right - 2, 12, 1, PH - 2 - 12, 'P');
  // counter and its teal cloth
  rect(g, 1, P_LEDGE, PW - 2, 1, 'C');
  rect(g, 1, P_LEDGE + 1, PW - 2, 1, 'p');
  rect(g, 1, P_LEDGE + 2, PW - 2, 8, 'P');
  rect(g, 1, PH - 3, PW - 2, 2, 'W');
  for (let x = 5; x < right - 3; x++) {
    const hang = x % 6 === 0 || x % 6 === 5 ? 4 : 6;
    rect(g, x, P_LEDGE + 2, 1, hang, Math.floor(x / 6) % 2 === 0 ? 'T' : 't');
  }
  rect(g, 5, P_LEDGE + 2, PW - 10, 1, 'C');
  // teal and cream striped awning, a big pink bow on top
  for (let y = 4; y <= 11; y++) {
    const inset = Math.max(0, 5 - y);
    for (let x = 1 + inset; x <= PW - 2 - inset; x++) {
      const c = Math.floor((x - 1) / 6) % 2 === 0 ? 'T' : 'C';
      put(g, x, y, y === 11 ? (c === 'T' ? 't' : 'C') : c);
    }
  }
  const mx = PW / 2;
  rect(g, mx - 5, 1, 4, 3, 'n');
  rect(g, mx + 1, 1, 4, 3, 'n');
  rect(g, mx - 1, 2, 2, 2, 'W');
  rect(g, mx - 5, 3, 1, 1, 'W');
  rect(g, mx + 4, 3, 1, 1, 'W');
  if (shuttered) {
    for (let y = 12; y < P_LEDGE; y++) {
      rect(g, 4, y, PW - 8, 1, (y - 12) % 4 === 3 ? 'W' : (y - 12) % 4 === 0 ? 'p' : 'P');
    }
    for (const bx of [10, PW - 12]) rect(g, bx, 12, 2, P_LEDGE - 12, 'i');
    rect(g, mx - 3, 29, 6, 4, 'i');
    rect(g, mx - 1, 30, 2, 2, 'b');
    rect(g, mx, 12, 1, 4, 'W');
    rect(g, mx - 3, 16, 7, 9, 'C');
    padlock(g, mx - 2, 18);
  } else {
    // streamers under the awning
    for (const x of [8, mx - 1, PW - 10]) rect(g, x, 12, 1, 3, 'n');
    // two shelves of wrapped prizes
    const bodies = ['R', 'T', 'v', 'C', 'n'];
    for (const [shelf, off] of [
      [21, 0],
      [30, 2],
    ] as const) {
      rect(g, 4, shelf, PW - 8, 1, 'p');
      rect(g, 4, shelf + 1, PW - 8, 1, 'W');
      for (let i = 0; i < 5; i++) {
        const bx = 6 + i * 11;
        const c = bodies[(i + off) % bodies.length] ?? 'R';
        const tie = c === 'C' || c === 'n' ? 'R' : 'y';
        rect(g, bx, shelf - 5, 7, 5, c);
        rect(g, bx + 3, shelf - 5, 1, 5, tie);
        rect(g, bx, shelf - 3, 7, 1, tie);
        rect(g, bx + 2, shelf - 6, 3, 1, tie);
      }
    }
    // the bell on the counter: brass, a clapper and a lit top edge
    rect(g, 45, P_LEDGE - 5, 6, 4, 'b');
    rect(g, 46, P_LEDGE - 6, 4, 1, 'b');
    rect(g, 44, P_LEDGE - 2, 8, 1, 'b');
    rect(g, 47, P_LEDGE - 1, 2, 1, 'W');
    put(g, 46, P_LEDGE - 5, 'C');
    put(g, 46, P_LEDGE - 4, 'C');
  }
  return finish(g);
}

const mk = (p: ReturnType<typeof finish>, note: string, extra: Partial<Concept> = {}): Concept => ({
  kind: 'free',
  note,
  sprite: p.sprite,
  alts: { day: p.day },
  ...extra,
});

const b = VALLEY_GLOW_CONCEPTS.backdrop;

export const VALLEY_FAIRGROUND_STALLS_CONCEPTS: ConceptSet = {
  id: 'valley-fairground-stalls',
  title: 'Fairground: the stalls',
  requested:
    '2026-11-20 (valley session): Misa picked direction A for the Fairground canvas: each game is a stall you tap and your creature stands at its stall. Glow style of the camp fairground tent (striped red-and-cream canvas, pennants, lanterns), night and day, no text on signs.',
  status: 'draft',
  notes: [
    'Glow style of `valley-glow-camp`; night main palette, `alts.day` the same pixels; wood, cream, teal, brass and iron from `valley-tiers`. No text on any sign. Backdrop as in `valley-glow`.',
    '`stall` 80x56, base row 55 (the lowest ink row). Poster slot: x 20, y 16, w 40, h 20 (rows 16 to 35, columns 20 to 59), one flat colour `f` inside a two-line frame (frame x 18 to 61, y 14 to 37): the code paints the event strip over it. Counter ledge: the flat lit top row is row 44, columns 4 to 75 between the posts (the lit row runs x 1 to 78); a creature stands with its feet on row 43. `stall-locked` has the same canvas, posts, ledge and base row: shutters down over the wall and the poster slot (rows 12 to 43; the poster must not be painted on it), awning furled into a tied roll, lanterns unlit, a hanging cream tag with a dark padlock mark; closed for now, tidy and latched, not broken.',
    '`team-stall` 112x56, base row 55. Poster slot: x 36, y 16, w 40, h 20 (columns 36 to 75; frame x 34 to 77, y 14 to 37). Counter ledge: row 44, columns 4 to 107 (lit row x 1 to 110). `team-stall-locked`: same canvas, shutters rows 12 to 43. Four lanterns.',
    '`prize-stall` 64x48, base row 47 (open on Wednesdays): teal-and-cream awning with a pink bow, streamers, two shelves of wrapped prizes with ribbons and a brass bell on the counter (counter ledge row 36, columns 4 to 59). `prize-stall-shuttered`: same canvas, plank shutters over the shelves (rows 12 to 35), iron bands and latch, a hanging cream tag with a dark padlock mark, the bell put away.',
    'Light: no ground light is drawn (the canvas is the stall only), so the game may add the lantern glow on the ground itself.',
    'Variations of the stall awning, same body, ledge and slot (variants are shown at night): B a scalloped awning edge with three pennants, C a peaked shingle roof (tier 2 shingles) with a red flag. Pick: A, because its straight striped canvas is the fairground tent Misa already likes, stays the quietest above the poster and gives the widest clear band for the lanterns; B is the liveliest but the scallops and pennants crowd the poster at 1x, C reads as a cottage more than a fair.',
  ],
  ...(b === undefined ? {} : { backdrop: b }),
  sprites: {
    stall: mk(
      stall(SOLO, 'A', false),
      'An open stall: red-and-cream striped awning, lit lanterns at night, shutters up, a back wall with the framed poster slot (flat colour) and a flat lit counter ledge, teal cloth on the counter front.',
      {
        variants: { B: stall(SOLO, 'B', false).sprite, C: stall(SOLO, 'C', false).sprite },
      },
    ),
    'stall-locked': mk(
      stall(SOLO, 'A', true),
      'The same stall closed for now: shutters down over the front and the poster slot, awning furled, lanterns unlit, a hanging closed tag.',
    ),
    'team-stall': mk(
      stall(TEAM, 'A', false),
      'The wider stall for team events: the same parts, a longer ledge and four lanterns.',
    ),
    'team-stall-locked': mk(stall(TEAM, 'A', true), 'The wide stall closed for now.'),
    'prize-stall': mk(
      prize(false),
      'The Prize Stall: a gift stall with a pink bow, ribbons, wrapped prizes on two shelves and a brass bell.',
    ),
    'prize-stall-shuttered': mk(
      prize(true),
      'The Prize Stall shuttered: plank shutters and a hanging closed tag (a dark padlock, no text).',
    ),
  },
};
