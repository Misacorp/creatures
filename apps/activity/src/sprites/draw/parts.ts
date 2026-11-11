/**
 * Furniture parts, the shapes the housing artists kept re-inventing (`docs/design/housing-workshop.md`): legs and feet,
 * panels and doors, trims and crests, cushions, mattresses, pillows and blankets, drapes, window panes, shelf things,
 * lamp shades and their night glow, rug fields, small motifs and framed pictures. Each draws at a box on a canvas in
 * the game's style: an ink edge, light from the top left, two or three keys of one ramp per thing.
 *
 * Coordinates are the part's outer box, ink included. Parts draw over what is under them, so a recipe draws back to
 * front. Every part is deterministic.
 */
import { type Canvas, CLEAR, get, put } from './canvas';
import {
  INK,
  type Ramp,
  box,
  dither,
  ellipsePixels,
  fill,
  hline,
  rect,
  tile,
  vline,
} from './shapes';

/** The materials a piece is made of, each a ramp of palette keys. */
export interface Materials {
  /** The frame: wood, stone, bone, lacquer. */
  wood: Ramp;
  /** Upholstery, blankets, curtains. */
  cloth: Ramp;
  /** Sheets, pillows, paper, the pale cloth. */
  linen: Ramp;
  /** Handles, chains, rivets, rods. */
  metal: Ramp;
  /** Window sky, lamp light, a jar, a picture's sky. */
  glass: Ramp;
  /** The set's motif colour. */
  accent: Ramp;
}

// ---------------------------------------------------------------------------------------------------------------
// Legs and feet

export type LegKind = 'straight' | 'turned' | 'tapered' | 'splayed';

export interface LegOptions {
  /** Outer width, ink included (default 5). */
  w?: number;
  /** The side of the piece the leg stands on: a tapered leg narrows towards the middle, a splayed one leans out. */
  side?: 'left' | 'right';
  /** Draws an ink cap under the last row (default true). */
  cap?: boolean;
}

/** One row of a leg: ink, light, mid ..., dark, ink, starting at x with `w` outer pixels. */
function legRow(c: Canvas, x: number, y: number, w: number, ramp: Ramp, hi = false): void {
  put(c, x, y, INK);
  put(c, x + w - 1, y, INK);
  for (let i = 1; i < w - 1; i++) {
    const key = i === 1 ? (hi ? (ramp.hi ?? ramp.light) : ramp.light) : i === w - 2 ? ramp.dark : ramp.mid;
    put(c, x + i, y, key);
  }
}

/** A leg from y down `h` rows, its top left at x (the cap row, when drawn, is the last of the `h`). */
export function leg(
  c: Canvas,
  x: number,
  y: number,
  h: number,
  kind: LegKind,
  ramp: Ramp,
  options: LegOptions = {},
): void {
  const w = Math.max(3, options.w ?? 5);
  const side = options.side ?? 'left';
  const cap = options.cap ?? true;
  const body = cap ? h - 1 : h;
  let lastX = x;
  let lastW = w;
  for (let r = 0; r < body; r++) {
    let rx = x;
    let rw = w;
    let hi = false;
    if (kind === 'turned') {
      // A slimmer post with a bead every fourth row.
      const bead = r % 4 === 1;
      rw = bead ? w : Math.max(3, w - 2);
      rx = bead ? x : x + Math.floor((w - rw) / 2);
      hi = bead;
    } else if (kind === 'tapered') {
      const lose = Math.min(w - 3, Math.floor((r * (w - 2)) / Math.max(1, body)));
      rw = w - lose;
      rx = side === 'left' ? x : x + lose;
    } else if (kind === 'splayed') {
      const lean = Math.floor(r / 2);
      rx = side === 'left' ? x - lean : x + lean;
    }
    legRow(c, rx, y + r, rw, ramp, hi);
    lastX = rx;
    lastW = rw;
  }
  if (cap) hline(c, lastX + 1, y + body, lastW - 2, INK);
}

export type FootKind = 'none' | 'block' | 'ball' | 'paw';

/** A foot under a leg: `w` outer pixels wide, top at y. Returns the rows it used. */
export function foot(c: Canvas, x: number, y: number, w: number, kind: FootKind, ramp: Ramp): number {
  if (kind === 'none') return 0;
  if (kind === 'block') {
    legRow(c, x, y, w, { light: ramp.light, mid: ramp.light, dark: ramp.light });
    legRow(c, x, y + 1, w, { light: ramp.dark, mid: ramp.dark, dark: ramp.dark });
    hline(c, x + 1, y + 2, w - 2, INK);
    return 3;
  }
  if (kind === 'ball') {
    legRow(c, x, y, w, ramp, true);
    hline(c, x + 1, y + 1, w - 2, INK);
    return 2;
  }
  // paw: a wider pad with toes
  legRow(c, x - 1, y, w + 2, ramp);
  put(c, x + 1, y, ramp.dark);
  put(c, x + w - 2, y, ramp.dark);
  hline(c, x, y + 1, w, INK);
  return 2;
}

// ---------------------------------------------------------------------------------------------------------------
// Panels, doors, trims and crests

export interface PanelOptions {
  /** How far the recess sits inside the panel (default 2). */
  inset?: number;
  /** Fills the recess with this ramp instead (a glass door, a painted field). */
  field?: Ramp;
  /** A handle of the metal ramp: where it sits. */
  knob?: 'left' | 'right' | 'centre' | 'none';
  metal?: Ramp;
  /** The recess has an arched top. */
  arch?: boolean;
}

/**
 * A door or drawer front without its own ink: the panel in the ramp's mid, a recessed frame (dark on its top and
 * left, light on its bottom and right, as a recess catches light) and an optional handle.
 */
export function panel(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  ramp: Ramp,
  options: PanelOptions = {},
): void {
  const inset = options.inset ?? 2;
  fill(c, x, y, w, h, ramp.mid);
  const rx = x + inset;
  const ry = y + inset;
  const rw = w - 2 * inset;
  const rh = h - 2 * inset;
  if (rw >= 3 && rh >= 3) {
    if (options.field !== undefined) {
      box(c, rx, ry, rw, rh, options.field, { ink: ramp.dark, shade: 'tl' });
    } else {
      hline(c, rx, ry, rw, ramp.dark);
      vline(c, rx, ry, rh, ramp.dark);
      hline(c, rx + 1, ry + rh - 1, rw - 1, ramp.light);
      vline(c, rx + rw - 1, ry + 1, rh - 1, ramp.light);
    }
    if (options.arch === true && rw >= 5) {
      put(c, rx, ry, ramp.mid);
      put(c, rx + rw - 1, ry, ramp.mid);
      put(c, rx + 1, ry + 1, ramp.dark);
      put(c, rx + rw - 2, ry + 1, ramp.dark);
    }
  }
  const knob = options.knob ?? 'none';
  if (knob !== 'none') {
    const metal = options.metal ?? ramp;
    const ky = y + Math.floor(h / 2) - 1;
    const kx = knob === 'left' ? x + 1 : knob === 'right' ? x + w - 2 : x + Math.floor(w / 2);
    put(c, kx, ky, metal.hi ?? metal.light);
    put(c, kx, ky + 1, metal.dark);
  }
}

export type TrimKind =
  'plain' | 'bead' | 'rivets' | 'zigzag' | 'dentil' | 'scallop' | 'reed' | 'rope' | 'leaf';

/** How many rows a trim takes. */
export function trimHeight(kind: TrimKind): number {
  return kind === 'zigzag' || kind === 'rope' || kind === 'leaf' ? 2 : kind === 'scallop' ? 3 : 1;
}

/**
 * A decorative band `w` wide at y (between the piece's own ink sides): plain, bead, rivets of the accent, zigzag,
 * dentil blocks, a scallop of hanging tabs (it overhangs into the row below with ink), reed binding, rope, or leaves.
 */
export function trim(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  kind: TrimKind,
  ramp: Ramp,
  accent: Ramp,
): number {
  const l = ramp.light;
  const m = ramp.mid;
  const d = ramp.dark;
  const a = accent.light;
  switch (kind) {
    case 'plain':
      hline(c, x, y, w, l);
      break;
    case 'bead':
      tile(c, x, y, w, 1, [l + d]);
      break;
    case 'rivets':
      hline(c, x, y, w, m);
      for (let i = 2; i < w - 1; i += 5) put(c, x + i, y, accent.hi ?? a);
      break;
    case 'zigzag':
      tile(c, x, y, w, 2, [`${a}${a}${d}${d}`, `${d}${a}${a}${d}`]);
      break;
    case 'dentil':
      tile(c, x, y, w, 1, [`${l}${l}${l}${d}`], 1);
      break;
    case 'scallop':
      hline(c, x, y, w, l);
      tile(c, x, y + 1, w, 1, [`${l}${l}${INK}${INK}`]);
      tile(c, x, y + 2, w, 1, [`${INK}${INK}..`]);
      break;
    case 'reed':
      tile(c, x, y, w, 1, [`${m}${m}${accent.dark}`]);
      break;
    case 'rope':
      tile(c, x, y, w, 2, [`${l}${m}${d}`, `${m}${d}${l}`]);
      break;
    case 'leaf':
      tile(c, x, y, w, 2, [`${a}${a}${m}${m}`, `${m}${accent.dark}${a}${m}`]);
      break;
  }
  return trimHeight(kind);
}

export type CrestKind =
  'square' | 'rounded' | 'scallop' | 'arched' | 'stepped' | 'peaked' | 'curl' | 'spikes';

/** How many rows a crest rises above the top edge it sits on. */
export function crestHeight(kind: CrestKind, w: number): number {
  switch (kind) {
    case 'square':
    case 'rounded':
      return 0;
    case 'scallop':
    case 'curl':
    case 'spikes':
      return 2;
    case 'arched':
      return Math.min(5, Math.max(2, Math.floor(w / 6)));
    case 'stepped':
      return 4;
    case 'peaked':
      return Math.min(6, Math.max(2, Math.floor(w / 5)));
  }
}

/**
 * The silhouette above a piece's top edge (the edge's own ink row is at `top`): scallop bumps, an arch, a stepped
 * crown, a gable, leaf curls at the corners or little spikes. Returns the rows it rose.
 */
export function crest(
  c: Canvas,
  x: number,
  top: number,
  w: number,
  kind: CrestKind,
  ramp: Ramp,
  accent: Ramp,
): number {
  const h = crestHeight(kind, w);
  const l = ramp.light;
  if (kind === 'scallop') {
    for (let i = 1; i < w - 1; i++) {
      const p = i % 4;
      put(c, x + i, top - 1, p === 0 || p === 1 ? INK : l);
      if (p === 2 || p === 3) put(c, x + i, top - 2, INK);
    }
    // the top edge under the bumps becomes the light face
    for (let i = 1; i < w - 1; i++) put(c, x + i, top, l);
    put(c, x + 1, top - 1, INK);
    put(c, x + w - 2, top - 1, INK);
  } else if (kind === 'arched') {
    const aw = w - 4;
    const ah = h * 2;
    const cells = ellipsePixels(x + 2, top - h, aw, ah);
    for (const p of cells) if (p.y < top) put(c, p.x, p.y, l);
    for (const p of cells) {
      if (p.y >= top) continue;
      const edge =
        get(c, p.x, p.y - 1) === CLEAR || get(c, p.x - 1, p.y) === CLEAR || get(c, p.x + 1, p.y) === CLEAR;
      if (edge) put(c, p.x, p.y, INK);
    }
    for (const p of cells) if (p.y === top - 1 && get(c, p.x, p.y) !== INK) put(c, p.x, p.y, ramp.mid);
    hline(c, x + 1, top, w - 2, l);
  } else if (kind === 'stepped') {
    for (let s = 0; s < 2; s++) {
      const inset = 3 + s * 4;
      const sw = w - 2 * inset;
      if (sw < 4) break;
      const sy = top - 2 * (s + 1);
      hline(c, x + inset, sy, sw, INK);
      put(c, x + inset, sy + 1, INK);
      put(c, x + inset + sw - 1, sy + 1, INK);
      hline(c, x + inset + 1, sy + 1, sw - 2, s === 0 ? l : accent.light);
    }
    hline(c, x + 1, top, w - 2, l);
  } else if (kind === 'peaked') {
    const mid = x + (w - 1) / 2;
    for (let r = 1; r <= h; r++) {
      const half = ((w - 2) / 2) * (1 - r / (h + 1));
      const x0 = Math.ceil(mid - half);
      const x1 = Math.floor(mid + half);
      if (x1 < x0) continue;
      hline(c, x0, top - r, x1 - x0 + 1, l);
      put(c, x0, top - r, INK);
      put(c, x1, top - r, INK);
      if (r === h) hline(c, x0, top - r, x1 - x0 + 1, INK);
    }
    hline(c, x + 1, top, w - 2, l);
  } else if (kind === 'curl') {
    for (const cx of [x, x + w - 3]) {
      const flip = cx !== x;
      put(c, cx + (flip ? 2 : 0), top - 2, INK);
      put(c, cx + 1, top - 2, INK);
      put(c, cx + (flip ? 0 : 2), top - 1, INK);
      put(c, cx + 1, top - 1, accent.light);
      put(c, cx + (flip ? 2 : 0), top - 1, accent.dark);
    }
  } else if (kind === 'spikes') {
    for (let i = 2; i < w - 2; i += 4) {
      put(c, x + i, top - 2, INK);
      put(c, x + i - 1, top - 1, INK);
      put(c, x + i + 1, top - 1, INK);
      put(c, x + i, top - 1, accent.light);
    }
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------------
// Soft things

/** A cushion or seat pad: soft corners, a light top, a dark underside and a highlight. */
export function cushion(c: Canvas, x: number, y: number, w: number, h: number, ramp: Ramp): void {
  box(c, x, y, w, h, ramp, { round: 1, shade: 'rows' });
  if (w > 5 && h > 3) put(c, x + 2, y + 1, ramp.hi ?? ramp.light);
}

/** A pillow: a cushion with a dent in its middle. */
export function pillow(c: Canvas, x: number, y: number, w: number, h: number, ramp: Ramp): void {
  box(c, x, y, w, h, ramp, { round: 1, shade: 'tl' });
  if (w > 4 && h > 3) put(c, x + Math.floor(w / 2), y + h - 2, ramp.dark);
  if (w > 5 && h > 3) put(c, x + 1, y + 1, ramp.hi ?? ramp.light);
}

/** A mattress: a long box, light along its top, the sheet's edge dark along its bottom. */
export function mattress(c: Canvas, x: number, y: number, w: number, h: number, ramp: Ramp): void {
  box(c, x, y, w, h, ramp, { shade: 'rows' });
}

export type ClothPattern = 'plain' | 'stripes' | 'checks' | 'dots' | 'waves' | 'diamonds' | 'zigzag';

/** Fills a box with a cloth pattern of the ramp's mid and the accent (no ink). */
export function pattern(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: ClothPattern,
  ramp: Ramp,
  accent: Ramp,
): void {
  const m = ramp.mid;
  const a = accent.light;
  fill(c, x, y, w, h, m);
  switch (kind) {
    case 'plain':
      break;
    case 'stripes':
      tile(c, x, y, w, h, [`${m}${m}${a}${m}${m}${m}`]);
      break;
    case 'checks':
      tile(c, x, y, w, h, [`${a}${a}${m}${m}`, `${a}${a}${m}${m}`, `${m}${m}${a}${a}`, `${m}${m}${a}${a}`]);
      break;
    case 'dots':
      tile(c, x, y, w, h, [`${m}${m}${m}${m}`, `${m}${a}${m}${m}`, `${m}${m}${m}${m}`, `${m}${m}${m}${a}`], 0, 1);
      break;
    case 'waves':
      tile(c, x, y, w, h, [`${m}${a}${a}${m}${m}${m}`, `${a}${m}${m}${a}${m}${m}`, `${m}${m}${m}${m}${m}${m}`]);
      break;
    case 'diamonds':
      tile(c, x, y, w, h, [`${m}${m}${a}${m}${m}${m}`, `${m}${a}${m}${a}${m}${m}`, `${m}${m}${a}${m}${m}${m}`], 0, 0);
      break;
    case 'zigzag':
      tile(c, x, y, w, h, [`${a}${m}${m}${m}`, `${m}${a}${m}${a}`, `${m}${m}${a}${m}`]);
      break;
  }
}

/** A blanket: an ink box with a light folded top (two rows), a patterned field and a dark hem. */
export function blanket(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  ramp: Ramp,
  accent: Ramp,
  kind: ClothPattern = 'plain',
): void {
  rect(c, x, y, w, h, INK);
  put(c, x, y, CLEAR);
  put(c, x + w - 1, y, CLEAR);
  put(c, x, y + h - 1, CLEAR);
  put(c, x + w - 1, y + h - 1, CLEAR);
  hline(c, x + 1, y + 1, w - 2, ramp.hi ?? ramp.light);
  hline(c, x + 1, y + 2, w - 2, ramp.light);
  pattern(c, x + 1, y + 3, w - 2, h - 5, kind, ramp, accent);
  hline(c, x + 1, y + h - 2, w - 2, ramp.dark);
}

/**
 * A curtain drape `w` wide: vertical folds (light, mid, dark), gathered at the tie row (`tie`, rows from the top)
 * towards its outer side, and flaring out under it. Ink on both edges and the hem.
 */
export function drape(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  ramp: Ramp,
  options: { side?: 'left' | 'right'; tie?: number; band?: Ramp; fold?: number } = {},
): void {
  const side = options.side ?? 'left';
  const fold = Math.max(2, options.fold ?? 3);
  for (let r = 0; r < h; r++) {
    let rw = w;
    if (options.tie !== undefined) {
      const t = options.tie;
      const pinch = Math.max(3, w - 3);
      if (r === t) rw = pinch;
      else if (r > t) rw = Math.min(w, pinch + Math.floor((r - t) / 2));
      else if (r > t - 3) rw = Math.max(pinch, w - (r - (t - 3)));
    }
    const rx = side === 'left' ? x : x + w - rw;
    put(c, rx, y + r, INK);
    put(c, rx + rw - 1, y + r, INK);
    for (let i = 1; i < rw - 1; i++) {
      const p = (i - 1) % fold;
      const k = r === h - 1 ? INK : p === 0 ? ramp.light : p === fold - 1 ? ramp.dark : ramp.mid;
      put(c, rx + i, y + r, k);
    }
    if (options.tie !== undefined && r === options.tie && options.band !== undefined) {
      for (let i = 1; i < rw - 1; i++) put(c, rx + i, y + r, i === 1 ? options.band.light : options.band.mid);
    }
  }
}

/** A window's glass: the sky (light at the top), a small cloud, and the frame's bars (a cross when big enough). */
export function windowPane(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  glass: Ramp,
  frame: Ramp,
  options: { cross?: boolean; cloud?: boolean } = {},
): void {
  fill(c, x, y, w, h, glass.mid);
  hline(c, x, y, w, glass.light);
  if (options.cloud !== false && w >= 8 && h >= 5) {
    const cx = x + 2;
    const cy = y + 2;
    const cloud = glass.hi ?? glass.light;
    hline(c, cx + 1, cy, 2, cloud);
    hline(c, cx, cy + 1, 4, cloud);
  }
  if (options.cross !== false) {
    const mx = x + Math.floor(w / 2);
    vline(c, mx, y, h, frame.dark);
    if (h >= 9) hline(c, x, y + Math.floor(h / 2), w, frame.dark);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Things on a shelf

export type ShelfItem = 'books' | 'jar' | 'plant' | 'shell' | 'candle' | 'bottle' | 'bowl' | 'crystal';

/** How wide a shelf thing is. */
export function shelfItemWidth(kind: ShelfItem): number {
  return { books: 7, jar: 5, plant: 6, shell: 6, candle: 3, bottle: 4, bowl: 7, crystal: 5 }[kind];
}

/** A thing standing on a shelf: its bottom row is `base - 1`. Returns its width. */
export function shelfItem(c: Canvas, x: number, base: number, kind: ShelfItem, m: Materials): number {
  const w = shelfItemWidth(kind);
  const b = base - 1;
  switch (kind) {
    case 'books': {
      const heights = [6, 7, 5];
      const ramps = [m.cloth, m.accent, m.linen];
      for (const [i, bh] of heights.entries()) {
        const bx = x + i * 2;
        const ramp = ramps[i] ?? m.cloth;
        vline(c, bx, b - bh + 1, bh, INK);
        vline(c, bx + 1, b - bh + 2, bh - 1, ramp.mid);
        put(c, bx + 1, b - bh + 1, INK);
        put(c, bx + 1, b - bh + 3, ramp.light);
      }
      vline(c, x + 6, b - 4, 5, INK);
      return w;
    }
    case 'jar':
      box(c, x, b - 5, 5, 6, m.glass, { round: 1 });
      hline(c, x + 1, b - 6, 3, INK);
      hline(c, x + 1, b - 5, 3, m.wood.mid);
      put(c, x + 1, b - 3, m.glass.hi ?? m.glass.light);
      return w;
    case 'plant': {
      box(c, x + 1, b - 2, 4, 3, m.wood, { shade: 'cols' });
      const leaves = ['.kk..k', 'kaakka', '.kaaak', '..kak.'];
      for (const [r, row] of leaves.entries()) {
        for (const [i, ch] of [...row].entries()) {
          if (ch === 'k') put(c, x + i, b - 6 + r, INK);
          if (ch === 'a') put(c, x + i, b - 6 + r, (i + r) % 3 === 0 ? m.accent.dark : m.accent.light);
        }
      }
      return w;
    }
    case 'shell':
      for (const p of ellipsePixels(x, b - 3, 6, 8)) {
        if (p.y > b) continue;
        put(c, p.x, p.y, (p.x - x) % 2 === 0 ? m.linen.light : m.linen.mid);
      }
      for (const p of ellipsePixels(x, b - 3, 6, 8, 'ring')) if (p.y <= b - 0) put(c, p.x, p.y, INK);
      hline(c, x, b, 6, INK);
      return w;
    case 'candle':
      box(c, x, b - 4, 3, 5, m.linen, { shade: 'cols' });
      put(c, x + 1, b - 5, m.glass.hi ?? m.glass.light);
      put(c, x + 1, b - 6, m.accent.light);
      return w;
    case 'bottle':
      box(c, x, b - 4, 4, 5, m.glass, { round: 1 });
      vline(c, x + 1, b - 6, 2, INK);
      vline(c, x + 2, b - 6, 2, INK);
      put(c, x + 1, b - 3, m.glass.hi ?? m.glass.light);
      return w;
    case 'bowl':
      hline(c, x, b - 2, 7, INK);
      hline(c, x + 1, b - 3, 5, m.accent.light);
      put(c, x + 2, b - 4, m.accent.light);
      put(c, x + 4, b - 4, m.accent.dark);
      box(c, x, b - 2, 7, 3, m.wood, { round: 1, shade: 'rows' });
      return w;
    case 'crystal':
      for (let r = 0; r < 5; r++) {
        const half = r < 2 ? r : 4 - r;
        for (let i = -half; i <= half; i++) put(c, x + 2 + i, b - 4 + r, i === -half || i === half ? INK : i < 0 ? m.accent.light : m.accent.mid);
      }
      put(c, x + 2, b - 5, INK);
      return w;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Lamps and light

export type ShadeKind = 'dome' | 'cone' | 'lantern' | 'bell' | 'cage';

/**
 * A ceiling lamp's shade hanging from a cord or chain that starts at the top row: centred on `cx` (the middle
 * between two pixels for an even width), `w` wide. Returns the bottom row the lamp reaches.
 */
export function lamp(
  c: Canvas,
  cx: number,
  w: number,
  kind: ShadeKind,
  shade: Ramp,
  metal: Ramp,
  light: Ramp,
  drop = 4,
): number {
  const x0 = Math.round(cx - w / 2);
  // the cord: two pixels of metal with ink sides
  for (let y = 0; y < drop; y++) {
    put(c, Math.floor(cx) - 2, y, INK);
    put(c, Math.floor(cx) - 1, y, y % 2 === 0 ? metal.light : metal.dark);
    put(c, Math.floor(cx), y, y % 2 === 0 ? metal.dark : metal.light);
    put(c, Math.floor(cx) + 1, y, INK);
  }
  let y = drop;
  if (kind === 'dome' || kind === 'bell') {
    const h = kind === 'dome' ? 7 : 8;
    for (let r = 0; r < h; r++) {
      const t = (r + 1) / h;
      const half = kind === 'dome' ? Math.round((w / 2) * Math.sqrt(1 - (1 - t) * (1 - t))) : Math.round(w / 2 * (r < h - 2 ? 0.45 + 0.08 * r : 1));
      const hw = Math.max(2, Math.min(Math.floor(w / 2), half));
      const rx = Math.round(cx) - hw;
      const rw = hw * 2;
      hline(c, rx, y + r, rw, r === 0 ? shade.light : shade.mid);
      put(c, rx, y + r, INK);
      put(c, rx + rw - 1, y + r, INK);
      if (r > 0 && rw > 4) put(c, rx + 1, y + r, shade.light);
      if (r > 0 && rw > 4) put(c, rx + rw - 2, y + r, shade.dark);
      if (r === 0) hline(c, rx, y, rw, INK);
    }
    hline(c, Math.round(cx) - Math.floor(w / 2), y + h, w, INK);
    hline(c, Math.round(cx) - Math.floor(w / 2) + 1, y + h - 1, w - 2, shade.dark);
    y += h + 1;
  } else if (kind === 'cone') {
    const h = 6;
    for (let r = 0; r < h; r++) {
      const hw = Math.max(2, Math.round(2 + ((Math.floor(w / 2) - 2) * r) / (h - 1)));
      const rx = Math.round(cx) - hw;
      hline(c, rx, y + r, hw * 2, shade.mid);
      put(c, rx + 1, y + r, shade.light);
      put(c, rx + hw * 2 - 2, y + r, shade.dark);
      put(c, rx, y + r, INK);
      put(c, rx + hw * 2 - 1, y + r, INK);
    }
    hline(c, Math.round(cx) - 2, y, 4, INK);
    hline(c, Math.round(cx) - Math.floor(w / 2), y + h, w, INK);
    y += h + 1;
  } else {
    // lantern and cage: a box of light in a frame, with a cap
    const lw = Math.min(w, 10);
    const lx = Math.round(cx) - Math.floor(lw / 2);
    hline(c, lx + 2, y, lw - 4, INK);
    box(c, lx + 1, y + 1, lw - 2, 2, shade, { shade: 'rows' });
    box(c, lx, y + 3, lw, 7, light, { shade: 'flat' });
    if (kind === 'cage') {
      for (let i = lx + 2; i < lx + lw - 1; i += 2) vline(c, i, y + 4, 5, metal.dark);
    } else {
      vline(c, lx + Math.floor(lw / 2), y + 4, 5, shade.dark);
      vline(c, lx + Math.floor(lw / 2) - 1, y + 4, 5, shade.dark);
      put(c, lx + 2, y + 5, light.hi ?? light.light);
    }
    box(c, lx + 1, y + 10, lw - 2, 2, shade, { shade: 'rows' });
    y += 12;
  }
  // the light under the shade
  put(c, Math.round(cx) - 1, y, INK);
  put(c, Math.round(cx), y, INK);
  put(c, Math.round(cx) - 2, y - 1, INK);
  put(c, Math.round(cx) + 1, y - 1, INK);
  put(c, Math.round(cx) - 1, y - 1, light.hi ?? light.light);
  put(c, Math.round(cx), y - 1, light.light);
  return y;
}

export type GlowKind = 'ring' | 'dither';

/**
 * A night glow layer of `w` x `h`: two soft rings of light (`ring`: an outer ring of `outer`, an inner one of
 * `inner`), or a dithered halo that thins out from the middle (`dither`). Hard pixels, no alpha.
 */
export function glow(
  w: number,
  h: number,
  kind: GlowKind,
  inner: string,
  outer: string,
): Canvas {
  const c: Canvas = { w, h, px: new Array<string>(w * h).fill(CLEAR) };
  if (kind === 'ring') {
    for (const p of ellipsePixels(0, 0, w, Math.min(h, 10), 'ring', false)) put(c, p.x, p.y, outer);
    for (const p of ellipsePixels(3, 3, w - 6, Math.min(h, 10) - 6, 'ring', false)) put(c, p.x, p.y, inner);
    return c;
  }
  const rings = [
    { inset: 0, key: outer },
    { inset: 2, key: inner },
  ];
  for (const ring of rings) {
    for (const p of ellipsePixels(ring.inset, ring.inset, w - 2 * ring.inset, h - 2 * ring.inset, 'ring', true)) {
      if ((p.x + p.y) % 2 === 0) put(c, p.x, p.y, ring.key);
    }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------------------------
// Rugs, motifs and pictures

export type RugShape = 'rounded' | 'oval' | 'square' | 'fringe';

/**
 * A rug lying on the floor line: the shape's ink edge, a border band of `border`, a dark inner line and a field in a
 * pattern. `fringe` adds tassels on the short ends.
 */
export function rug(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: RugShape,
  border: Ramp,
  field: Ramp,
  accent: Ramp,
  kind: ClothPattern,
): void {
  const fx = shape === 'fringe' ? x + 2 : x;
  const fw = shape === 'fringe' ? w - 4 : w;
  if (shape === 'oval') {
    for (const p of ellipsePixels(fx, y, fw, h)) put(c, p.x, p.y, border.mid);
    for (const p of ellipsePixels(fx + 3, y + 2, fw - 6, h - 4)) put(c, p.x, p.y, field.mid);
    pattern(c, fx + 6, y + 3, fw - 12, h - 6, kind, field, accent);
    for (const p of ellipsePixels(fx + 3, y + 2, fw - 6, h - 4, 'ring')) put(c, p.x, p.y, border.dark);
    for (const p of ellipsePixels(fx, y, fw, h, 'ring', true)) put(c, p.x, p.y, INK);
    return;
  }
  box(c, fx, y, fw, h, border, { round: shape === 'rounded' ? 2 : 0, shade: 'rows' });
  rect(c, fx + 3, y + 2, fw - 6, h - 4, border.dark);
  pattern(c, fx + 4, y + 3, fw - 8, h - 6, kind, field, accent);
  if (shape === 'fringe') {
    for (let r = 1; r < h - 1; r += 2) {
      put(c, x, y + r, accent.light);
      put(c, x + 1, y + r, accent.dark);
      put(c, x + w - 1, y + r, accent.light);
      put(c, x + w - 2, y + r, accent.dark);
    }
  }
}

export type MotifKind =
  'none' | 'shell' | 'crescent' | 'rivet' | 'leaf' | 'bolt' | 'opal' | 'spiral' | 'tassel' | 'knot' | 'star';

/** The tiny ornaments, as rows: `a` the accent's light, `b` its mid, `c` its dark, `k` ink. */
const MOTIFS: Readonly<Record<Exclude<MotifKind, 'none'>, readonly string[]>> = {
  shell: ['.kak.', 'kabak', 'abcba'],
  crescent: ['.ka', 'kb.', 'kb.', '.ka'],
  rivet: ['a'],
  leaf: ['.ka', 'kab', 'kc.'],
  bolt: ['.ak', 'ab.', '.ba', 'ka.'],
  opal: ['.k.', 'kak', 'kbk', '.k.'],
  spiral: ['kkkk', 'k..k', 'k.kk', 'k...'],
  tassel: ['.k.', '.a.', 'kbk', 'bcb'],
  knot: ['ab', 'ba'],
  star: ['.a.', 'aba', '.a.'],
};

/** The size of a motif. */
export function motifSize(kind: MotifKind): { w: number; h: number } {
  if (kind === 'none') return { w: 0, h: 0 };
  const rows = MOTIFS[kind];
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/** Draws a motif with its top left at x, y in the accent ramp. */
export function motif(c: Canvas, x: number, y: number, kind: MotifKind, accent: Ramp): void {
  if (kind === 'none') return;
  for (const [r, row] of MOTIFS[kind].entries()) {
    for (const [i, ch] of [...row].entries()) {
      const key =
        ch === 'k' ? INK : ch === 'a' ? (accent.hi ?? accent.light) : ch === 'b' ? accent.mid : ch === 'c' ? accent.dark : CLEAR;
      if (key !== CLEAR) put(c, x + i, y + r, key);
    }
  }
}

/** Centres a motif in a box. */
export function motifAt(c: Canvas, x: number, y: number, w: number, h: number, kind: MotifKind, accent: Ramp): void {
  const s = motifSize(kind);
  motif(c, x + Math.floor((w - s.w) / 2), y + Math.floor((h - s.h) / 2), kind, accent);
}

export type PictureKind = 'sea' | 'hills' | 'moon' | 'flame' | 'storm' | 'reeds' | 'sun';

/** A small framed picture (no frame): a sky of the glass ramp over a scene. */
export function picture(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: PictureKind,
  m: Materials,
): void {
  const g = m.glass;
  fill(c, x, y, w, h, g.mid);
  hline(c, x, y, w, g.light);
  const ground = y + Math.ceil(h * 0.6);
  switch (kind) {
    case 'sea':
      fill(c, x, ground, w, y + h - ground, m.cloth.mid);
      tile(c, x, ground, w, 1, [`${m.cloth.light}${m.cloth.light}${m.cloth.mid}${m.cloth.mid}`]);
      hline(c, x, y + h - 1, w, m.cloth.dark);
      break;
    case 'hills':
      for (let i = 0; i < w; i++) {
        const top = ground - Math.round(2 * Math.abs(Math.sin((i + 2) / 4)));
        vline(c, x + i, top, y + h - top, i % 7 < 4 ? m.cloth.mid : m.cloth.dark);
        put(c, x + i, top, m.cloth.light);
      }
      break;
    case 'moon':
      fill(c, x, y, w, h, g.dark);
      put(c, x + w - 5, y + 2, g.hi ?? g.light);
      put(c, x + w - 4, y + 2, g.hi ?? g.light);
      put(c, x + w - 5, y + 3, g.hi ?? g.light);
      put(c, x + w - 5, y + 4, g.hi ?? g.light);
      put(c, x + w - 4, y + 4, g.hi ?? g.light);
      put(c, x + 3, y + 3, g.light);
      put(c, x + 7, y + 2, g.light);
      fill(c, x, ground + 1, w, y + h - ground - 1, m.accent.dark);
      break;
    case 'flame':
      fill(c, x, y, w, h, g.dark);
      dither(c, x, y + h - 3, w, 3, m.accent.dark, m.accent.mid, 'checker');
      for (let r = 0; r < 4; r++) hline(c, x + Math.floor(w / 2) - 2 + Math.floor(r / 2), y + h - 2 - r, 4 - r, m.accent.light);
      break;
    case 'storm':
      fill(c, x, y, w, h, g.dark);
      hline(c, x, y, w, g.mid);
      motif(c, x + Math.floor(w / 2) - 1, y + 1, 'bolt', m.accent);
      break;
    case 'reeds':
      fill(c, x, ground, w, y + h - ground, m.cloth.mid);
      for (let i = 1; i < w - 1; i += 3) {
        vline(c, x + i, ground - 3, 4, m.accent.dark);
        put(c, x + i, ground - 4, m.accent.light);
      }
      break;
    case 'sun':
      fill(c, x, ground, w, y + h - ground, m.accent.mid);
      hline(c, x, ground, w, m.accent.light);
      fill(c, x + Math.floor(w / 2) - 1, ground - 3, 3, 2, m.linen.hi ?? m.linen.light);
      break;
  }
}
