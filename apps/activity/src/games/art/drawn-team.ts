/**
 * Code-drawn art of the at-once team events: the Bucket Brigade's barrel (its glass front filling row
 * by row), the Crate Tower's crate, the Kite Flight's kite (two flying frames and a tumbling one, upside down) and
 * its string, a one-pixel line from the holder's paws to the kite. Kit style: an ink outline, light
 * from the top left, the material in the primary ramp (`a b c d`) and the team's colour in the
 * secondary ramp (`e f g h`), so one drawing is tinted per team (`propSprite(name, f, undefined, team)`).
 *
 * Pure and deterministic; the string pieces are memoised by their size.
 */
import type { SpriteDef } from '../../sprites/sprite-data';
import { rampPalette } from './data/games-tiles';
import { PixelGrid, flipY, type Placement } from './pixel';
import { RAMPS } from './tint';

const INK = '#0d0a1a';
const WHITE = '#ffffff';
const WATER = { w: '#d8f6ff', v: '#6cd0f4', u: '#3aa6e0', n: '#2f2a5c' } as const;

// ---------------------------------------------------------------------------------------------
// The barrel (9x18): wooden staves at the sides, three hoops in the team's colour and a glass front
// that shows the water rising

export const BARREL_WIDTH = 9;
export const BARREL_HEIGHT = 18;
/** Rows of water the front shows (a frame per filled row, 0 to this). */
export const BARREL_GAUGE_ROWS = 13;
const GAUGE_BOTTOM = 15;

function barrelFrame(rows: number): SpriteDef {
  const w = BARREL_WIDTH;
  const h = BARREL_HEIGHT;
  const g = new PixelGrid(w, h);
  g.rect(1, 0, w - 2, h, 'k');
  g.rect(0, 1, w, h - 2, 'k');
  // The staves down the sides, lit from the left.
  for (let y = 1; y < h - 1; y++) {
    g.set(1, y, 'a');
    g.set(w - 2, y, 'd');
  }
  // The glass front: dark when empty, the water rising row by row with a bright surface.
  for (let i = 0; i < BARREL_GAUGE_ROWS; i++) {
    const y = GAUGE_BOTTOM - i;
    const key = i < rows ? (i === rows - 1 ? 'w' : i % 4 === 1 ? 'u' : 'v') : 'n';
    g.rect(2, y, w - 4, 1, key);
  }
  // Hoops in the team's colour: the rim, the middle and the foot.
  for (const y of [1, 8, h - 2]) {
    g.rect(1, y, w - 2, 1, 'f');
    g.set(1, y, 'e');
    g.set(w - 2, y, 'g');
  }
  return g.toSprite(rampPalette(RAMPS.wood, RAMPS.red, { k: INK, ...WATER }));
}

/** The barrel by its gauge: frame `rows` (0 empty to `BARREL_GAUGE_ROWS` full). */
export const BARREL_FRAMES: readonly SpriteDef[] = Array.from(
  { length: BARREL_GAUGE_ROWS + 1 },
  (_, rows) => barrelFrame(rows),
);

/** A barrel's frame for a level of 0 to 100 percent (a sliver shows as soon as there is water). */
export function barrelFrameOf(level: number): number {
  const v = Math.max(0, Math.min(100, level));
  if (v <= 0) return 0;
  return Math.max(1, Math.min(BARREL_GAUGE_ROWS, Math.round((v * BARREL_GAUGE_ROWS) / 100)));
}

// ---------------------------------------------------------------------------------------------
// The crate (8x6): planks with a band in the team's colour; stacked 5 px apart, the outlines overlap

export const CRATE_WIDTH = 8;
export const CRATE_HEIGHT = 6;

function crate(): SpriteDef {
  const w = CRATE_WIDTH;
  const h = CRATE_HEIGHT;
  const g = new PixelGrid(w, h);
  g.rect(0, 0, w, h, 'k');
  g.rect(1, 1, w - 2, 1, 'a');
  g.rect(1, 2, w - 2, 1, 'f');
  g.set(1, 2, 'e');
  g.set(w - 2, 2, 'g');
  g.rect(1, 3, w - 2, 1, 'b');
  g.rect(1, 4, w - 2, 1, 'c');
  g.set(w - 2, 3, 'c');
  g.set(w - 2, 4, 'd');
  // A nail at each end of the band.
  g.set(2, 1, 'b');
  g.set(w - 3, 1, 'b');
  return g.toSprite(rampPalette(RAMPS.pine, RAMPS.red, { k: INK }));
}

export const CRATE = crate();

// ---------------------------------------------------------------------------------------------
// The kite (9x13): a diamond in the team's colour on a pale spar cross, a tail of bows

export const KITE_WIDTH = 9;
export const KITE_HEIGHT = 13;
/** Where the string ties on, from the sprite's top-left. */
export const KITE_TIE = { x: 4, y: 8 } as const;

function kiteFrame(tail: 0 | 1, tumble: boolean): SpriteDef {
  const w = KITE_WIDTH;
  const h = KITE_HEIGHT;
  const g = new PixelGrid(w, h);
  const c = 4;
  // A diamond: widest a third of the way down.
  const half = [0, 1, 2, 3, 4, 3, 2, 1, 0];
  for (let y = 0; y < 9; y++) {
    const r = half[y] ?? 0;
    for (let x = c - r; x <= c + r; x++) {
      const edge = x === c - r || x === c + r || y === 0 || y === 8;
      const key = edge ? 'k' : x < c ? (y < 4 ? 'e' : 'f') : y < 4 ? 'f' : 'g';
      g.set(x, y, key);
    }
  }
  // The spars.
  for (let y = 1; y < 8; y++) g.set(c, y, 'a');
  for (let x = 1; x < w - 1; x++) g.set(x, 4, x === c ? 'a' : 'b');
  // The tail: bows that swing from side to side.
  const sway = tail === 0 ? [0, 1, 0, -1] : [0, -1, 0, 1];
  for (let i = 0; i < 4; i++) {
    const x = c + (sway[i] ?? 0);
    g.set(x, 9 + i, i % 2 === 1 ? 'h' : 'd');
  }
  const pal = rampPalette(RAMPS.cream, RAMPS.red, { k: INK, w: WHITE });
  // Tumbling: the kite upside down, its tail in the air.
  return tumble ? flipY(g.toSprite(pal)) : g.toSprite(pal);
}

/** Flying (two tail frames) and tumbling (struck, gusted or tangled). */
export const KITE_FRAMES: readonly SpriteDef[] = [
  kiteFrame(0, false),
  kiteFrame(1, false),
  kiteFrame(0, true),
];

// ---------------------------------------------------------------------------------------------
// The kite string

const STRING_INK = '#463f82';
const MAX_PIECE = 64;
const stringCache = new Map<string, Placement[]>();

/**
 * A one-pixel string from (`x0`, `y0`) to (`x1`, `y1`) in scene pixels, as placements of sprites of at
 * most 64 px a side (a long string is cut into pieces). Memoised by its size and direction; the
 * placements are relative to the first point, so add it when drawing.
 */
export function kiteString(dx: number, dy: number): Placement[] {
  const ix = Math.round(dx);
  const iy = Math.round(dy);
  const key = `${String(ix)},${String(iy)}`;
  const hit = stringCache.get(key);
  if (hit !== undefined) return hit;
  const steps = Math.max(Math.abs(ix), Math.abs(iy), 1);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    // A slight sag in the middle, so it reads as a string in the wind.
    const u = i / steps;
    const sag = Math.round(Math.sin(Math.PI * u) * Math.min(3, steps / 20));
    points.push({ x: Math.round(ix * u) + sag, y: Math.round(iy * u) });
  }
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const out: Placement[] = [];
  for (let top = minY; top <= maxY; top += MAX_PIECE) {
    const inPiece = points.filter((p) => p.y >= top && p.y < top + MAX_PIECE);
    if (inPiece.length === 0) continue;
    const left = Math.min(...inPiece.map((p) => p.x));
    const right = Math.max(...inPiece.map((p) => p.x));
    const g = new PixelGrid(right - left + 1, Math.min(MAX_PIECE, maxY - top + 1));
    for (const p of inPiece) g.set(p.x - left, p.y - top, 's');
    out.push({ sprite: g.toSprite({ s: STRING_INK }), x: left, y: top });
  }
  stringCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The pail (5x5) a Bucket Brigade member carries: empty, or full to the brim

function pail(full: boolean): SpriteDef {
  const g = new PixelGrid(5, 5);
  g.rect(1, 0, 3, 1, 'k');
  g.rect(0, 1, 5, 4, 'k');
  g.rect(1, 1, 3, 1, full ? 'v' : 'n');
  if (full) g.set(1, 1, 'w');
  g.rect(1, 2, 3, 2, 'b');
  g.set(3, 2, 'c');
  g.set(3, 3, 'd');
  return g.toSprite(rampPalette(RAMPS.silver, undefined, { k: INK, ...WATER }));
}

export const PAIL_FRAMES: readonly SpriteDef[] = [pail(false), pail(true)];
