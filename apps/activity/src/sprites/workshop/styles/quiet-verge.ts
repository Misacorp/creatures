/**
 * The Quiet Verge style (`docs/design/housing-workshop.md`): dusk-violet stone edged in pale rim light, arches with a
 * warm star inside, chips of stone that float. The palette is the Void place's banner (`concepts/void-place.ts`):
 * the dusk sky, the lilac dust, the pale rim, the window dark, the warm star and the cool glint.
 */
import { type Canvas, put } from '../../draw/canvas';
import { motif } from '../../draw/parts';
import { INK, box, type Ramp } from '../../draw/shapes';
import { type Shape, inArch, inEllipse, shrink, solid } from '../../draw/solid';
import type { Area, PartDraw, Style } from '../style';

/** A loose chip of stone, ink-edged, that floats just clear of whatever is under it. */
function chip(c: Canvas, x: number, y: number, w: number, h: number, ramp: Ramp): void {
  box(c, x, y, w, h, ramp, { shade: 'tl', round: w > 4 ? 1 : 0 });
}

/**
 * The Verge's window: a shape filled with the window dark, a pale rim just inside the ink, a few cool stars and the
 * one warm star (the arch in the banner).
 */
function verge(
  c: Canvas,
  style: Style,
  a: Area,
  shape: Shape,
  star: { x: number; y: number },
): void {
  const rim = shrink(shape, 1);
  const deep = shrink(shape, 2);
  for (let y = a.y; y < a.y + a.h; y++) {
    for (let x = a.x; x < a.x + a.w; x++) {
      if (!shape(x, y)) continue;
      put(c, x, y, deep(x, y) ? style.glass.mid : rim(x, y) ? style.metal.mid : INK);
    }
  }
  for (const [dx, dy] of [
    [3, 3],
    [a.w - 4, 6],
    [2, a.h - 5],
  ] as const) {
    if (deep(a.x + dx, a.y + dy)) put(c, a.x + dx, a.y + dy, style.metal.light);
  }
  motif(c, star.x - 1, star.y - 1, 'star', style.accent);
}

/** The headboard: two standing stones, the tall one with the star, and a chip floating over the short one. */
const headboard: PartDraw = ({ c, style }) => {
  solid(c, { x: 0, y: 0, w: 7, h: 22 }, inArch(0, 0, 7, 21, 3), style.wood, { shade: 'cols' });
  solid(c, { x: 5, y: 8, w: 5, h: 14 }, inArch(5, 8, 5, 21, 2), style.wood, { shade: 'cols' });
  motif(c, 2, 5, 'star', style.accent);
  chip(c, 6, 3, 4, 3, style.wood);
};

/** The bed floats: two flat stones under it and a row of air between. */
const bedLegs: PartDraw = ({ c, style }) => {
  chip(c, 1, 23, 9, 3, style.wood);
  chip(c, 37, 23, 9, 3, style.wood);
};

/** The banner's dusk sky and its horizon glow (palette keys of this style, used by the window). */
const SKY = 'a';

/** A few stars in the window dark of a shape: pale ones, one cool glint. */
function stars(
  c: Canvas,
  style: Style,
  shape: Shape,
  at: readonly (readonly [number, number])[],
): void {
  for (const [i, [x, y]] of at.entries()) {
    if (shape(x, y))
      put(c, x, y, i === 1 ? (style.glass.hi ?? style.glass.light) : style.metal.light);
  }
}

export const QUIET_VERGE: Style = {
  id: 'quiet-verge',
  name: 'Quiet Verge',
  palette: {
    k: '#0d0a1a',
    p: '#c5bdee',
    h: '#9d92dc',
    b: '#6f62b8',
    s: '#4a4090',
    c: '#352d68',
    n: '#100c22',
    t: '#fff1b8',
    y: '#f2c86a',
    o: '#b07c3a',
    g: '#9fe8ff',
    l: '#9a6ab4',
    m: '#74509c',
    d: '#4d2d62',
    a: '#262050',
    e: '#5a4f9e',
  },
  wood: { hi: 'p', light: 'h', mid: 'b', dark: 's', deep: 'c' },
  cloth: { hi: 'h', light: 'l', mid: 'm', dark: 'd' },
  linen: { hi: 'p', light: 'p', mid: 'h', dark: 'b' },
  metal: { hi: 'p', light: 'p', mid: 'h', dark: 's' },
  glass: { hi: 'g', light: 'c', mid: 'n', dark: 'n' },
  accent: { hi: 't', light: 't', mid: 'y', dark: 'o' },
  leg: 'straight',
  foot: 'block',
  trim: 'bead',
  top: 'arched',
  motif: 'star',
  weave: 'dots',
  lamp: 'globe',
  lampMaterial: 'linen',
  glow: { kind: 'ring', inner: 't', outer: 'y' },
  rug: { shape: 'oval', weave: 'dots', border: 'band', motifs: 'centre' },
  picture: 'moon',
  shelf: ['crystal', 'candle', 'books', 'jar'],
  shapes: {
    bed: { head: 'arched', foot: 'low', blanket: 'sheet', mark: true },
    cupboard: { top: 'arched', doors: 'single', base: 'plinth', narrow: true },
    table: { kind: 'pedestal', skirt: 'none' },
    shelf: { bracket: 'none', board: 'thick' },
    stool: { kind: 'drum', mark: true },
    frame: { kind: 'round' },
    curtains: { kind: 'straight', pane: 'arched', valance: 'none' },
  },
  parts: {
    bed: { headboard, legs: bedLegs },
    cupboard: {
      // the single door is the Verge's arch: window dark, a pale rim, the warm star
      doors: ({ c, style, at }) => {
        const a: Area = { x: at.x - 1, y: at.y - 2, w: at.w + 2, h: at.h + 3 };
        verge(c, style, a, inArch(a.x, a.y, a.w, a.y + a.h - 1, 6), {
          x: a.x + Math.floor(a.w / 2),
          y: a.y + 8,
        });
      },
    },
    frame: {
      // the dark moon of the banner: a disc of window dark with a bright rim on its lit side
      frame: ({ c, style }) => {
        const disc = inEllipse(4, 0, 16, 16);
        const inner = shrink(disc, 1);
        const lit = shrink(disc, 2);
        for (let y = 0; y < 16; y++) {
          for (let x = 4; x < 20; x++) {
            if (!disc(x, y)) continue;
            const side = x + y < 18;
            const rim = inner(x, y) && (!lit(x, y) || (side && !shrink(disc, 3)(x, y)));
            const key = !inner(x, y)
              ? INK
              : rim
                ? side
                  ? style.metal.light
                  : style.metal.dark
                : style.glass.mid;
            put(c, x, y, key);
          }
        }
      },
      picture: ({ c, style }) => {
        stars(c, style, shrink(inEllipse(4, 0, 16, 16), 3), [
          [14, 4],
          [10, 10],
          [15, 11],
        ]);
        motif(c, 11, 5, 'star', style.accent);
      },
    },
    curtains: {
      // an arched window onto the Verge itself: the dusk sky, the pale horizon and the dust, with a few stars
      window: ({ c, style }) => {
        const frame = inArch(6, 1, 24, 22, 8);
        solid(c, { x: 0, y: 0, w: 36, h: 23 }, frame, style.wood, { shade: 'tl' });
        const pane = shrink(frame, 2);
        for (let y = 0; y < 23; y++) {
          for (let x = 0; x < 36; x++) {
            if (!pane(x, y)) continue;
            let k = y < 9 ? SKY : y < 15 ? style.glass.light : y < 17 ? 'e' : y === 17 ? 'h' : 'b';
            if (y === 8 && (x + y) % 2 === 0) k = style.glass.light;
            if (y === 15 && (x + y) % 2 === 0) k = 'e';
            if (y === 16 && (x + y) % 2 === 0) k = style.glass.light;
            put(c, x, y, k);
          }
        }
        stars(c, style, pane, [
          [11, 7],
          [24, 11],
          [21, 5],
          [13, 12],
        ]);
        for (let y = 2; y < 21; y++) if (pane(18, y)) put(c, 18, y, style.wood.dark);
      },
    },
    rug: {
      // the still pool that holds the stars, in a rim of lilac dust
      rug: ({ c, style, at }) => {
        const pool = inEllipse(at.x, at.y, at.w, at.h);
        solid(c, at, pool, style.wood, { shade: 'rows' });
        const water = shrink(pool, 2);
        for (let y = at.y; y < at.y + at.h; y++) {
          for (let x = at.x; x < at.x + at.w; x++) {
            if (water(x, y)) put(c, x, y, water(x, y - 1) ? style.glass.mid : INK);
          }
        }
        stars(c, style, shrink(pool, 3), [
          [12, 5],
          [19, 4],
          [36, 6],
          [44, 4],
          [24, 6],
        ]);
        motif(c, 29, 3, 'star', style.accent);
      },
    },
    table: {
      // the top hovers over a short standing stone on a flat slab; two chips hang beside it
      legs: ({ c, style }) => {
        box(c, 7, 15, 30, 3, style.wood, { shade: 'rows', round: 1 });
        solid(c, { x: 15, y: 6, w: 14, h: 10 }, inArch(15, 6, 14, 15, 2), style.wood, {
          shade: 'cols',
        });
        motif(c, 21, 9, 'star', style.accent);
        chip(c, 3, 7, 5, 3, style.wood);
        chip(c, 36, 7, 5, 3, style.wood);
      },
    },
    shelf: {
      // no brackets: the board floats, with two chips drifting under it
      brackets: ({ c, style, at }) => {
        chip(c, at.x + 3, at.y + 1, 6, 3, style.wood);
        chip(c, at.x + at.w - 9, at.y + 1, 6, 3, style.wood);
      },
    },
    stool: {
      // a squat standing stone, its seat a flat slab, floating over a chip
      legs: ({ c, style }) => {
        box(c, 3, 3, 10, 6, style.wood, { shade: 'cols' });
        chip(c, 5, 9, 6, 3, style.wood);
      },
      seat: ({ c, style }) => {
        box(c, 0, 0, 16, 4, style.wood, { shade: 'rows', round: 1 });
        motif(c, 7, 4, 'star', style.accent);
      },
    },
  },
};
