/**
 * The Fairground style (`docs/design/housing-workshop.md`): the Valley Games meadow: striped awnings, bunting and
 * prize-stall paint. Blue painted wood (the booths), red and cream stripes (cloth and awnings), brass and sunny yellow
 * (bulbs, medals). The part hooks draw the stripes and the outlines no other set has: the bed's awning with a scalloped
 * hem, the cupboard's tent roof with a pennant, the stall table's striped cloth, a string of pennants for a frame, a
 * string of bulbs for the lamp and the striped awning over the window.
 */
import { type Canvas, put } from '../../draw/canvas';
import { INK, box, hline } from '../../draw/shapes';
import type { PartDraw, Style } from '../style';

/** Stripe width in pixels: red, cream, red, cream. */
const STRIPE = 3;

/** The red or cream key of a stripe at column `n`, lit on the first row and dark on the last. */
function stripeKey(style: Style, n: number, row: 'top' | 'mid' | 'low'): string {
  const red = Math.floor(n / STRIPE) % 2 === 0;
  if (red) {
    return row === 'top' ? style.cloth.light : row === 'low' ? style.cloth.dark : style.cloth.mid;
  }
  if (row === 'top') return style.linen.hi ?? style.linen.light;
  return row === 'low' ? style.linen.dark : style.linen.mid;
}

/** A red and cream striped cloth, `h` rows, with an ink line above and at both ends; stripes start at column 0. */
function stripes(c: Canvas, style: Style, x: number, y: number, w: number, h: number): void {
  for (let yy = 0; yy < h; yy++) {
    const row = yy === 0 ? 'top' : yy === h - 1 ? 'low' : 'mid';
    for (let xx = 0; xx < w; xx++) put(c, x + xx, y + yy, stripeKey(style, xx, row));
  }
  hline(c, x - 1, y - 1, w + 2, INK);
  for (let yy = 0; yy < h; yy++) {
    put(c, x - 1, y + yy, INK);
    put(c, x + w, y + yy, INK);
  }
}

/** Scallops hanging under a striped cloth: each stripe ends in a round tab, ink-edged. */
function scallops(c: Canvas, style: Style, x: number, y: number, w: number): void {
  for (let xx = 0; xx < w; xx++) {
    const mid = xx % STRIPE === 1;
    put(c, x + xx, y, stripeKey(style, xx, 'low'));
    put(c, x + xx, y + 1, mid ? stripeKey(style, xx, 'low') : INK);
    if (mid) put(c, x + xx, y + 2, INK);
  }
}

/** Draws rows of palette keys (`.` skips) from (x, y); `map` turns a letter into a key. */
function stamp(
  c: Canvas,
  x: number,
  y: number,
  rows: readonly string[],
  map: Record<string, string>,
): void {
  for (const [dy, row] of rows.entries()) {
    for (const [dx, ch] of [...row].entries()) {
      if (ch !== '.') put(c, x + dx, y + dy, map[ch] ?? ch);
    }
  }
}

/** The bed's awning: striped cloth between the posts with a scalloped hem; then the headboard under it. */
const awning: PartDraw = ({ c, style }) => {
  stripes(c, style, 3, 2, 42, 4);
  scallops(c, style, 3, 6, 42);
  box(c, 2, 9, 8, 13, style.wood, { shade: 'cols' });
  box(c, 3, 10, 6, 11, style.wood, { shade: 'tl' });
  stamp(c, 4, 12, ['.gg.', 'gyyg', 'gygg', '.gg.'], {});
};

/** The cupboard's roof: a striped tent with a pennant on its pole. */
const tent: PartDraw = ({ c, style, at }) => {
  const mx = at.x + Math.floor(at.w / 2);
  const top = 4;
  const base = 10;
  for (let y = top; y <= base; y++) {
    const half = 1 + Math.floor(((y - top) * (at.w / 2 - 2)) / (base - top));
    for (let x = mx - half; x < mx + half; x++) {
      const edge = x === mx - half || x === mx + half - 1;
      const row = y === base ? 'low' : y === top ? 'top' : 'mid';
      put(c, x, y, edge ? INK : stripeKey(style, x - at.x, row));
    }
  }
  stamp(c, mx - 1, 0, ['kkkkk', 'krrsk', 'kkkk.', 'k....'], {
    r: style.cloth.light,
    s: style.cloth.mid,
  });
  box(c, at.x + 1, 11, at.w - 2, 3, style.wood, { shade: 'rows' });
};

/** The stall table's cloth: stripes over the whole top, a scalloped hem. */
const stallCloth: PartDraw = ({ c, style, at }) => {
  stripes(c, style, 0, 0, 44, at.y + 3);
  hline(c, 1, at.y + 2, 42, style.accent.light);
  scallops(c, style, 0, at.y + 3, 44);
};

/** A string of three pennants for the frame. */
const bunting: PartDraw = ({ c, style }) => {
  const flags = [
    { x: 1, hi: style.cloth.light, mid: style.cloth.mid },
    { x: 9, hi: style.wood.light, mid: style.wood.mid },
    { x: 17, hi: style.accent.hi ?? style.accent.light, mid: style.accent.light },
  ];
  for (let x = 0; x < 24; x++) {
    const sag = Math.round(2 * Math.sin((Math.PI * x) / 23));
    put(c, x, 1 + sag, style.linen.mid);
  }
  for (const f of flags) {
    const sag = Math.round(2 * Math.sin((Math.PI * (f.x + 2.5)) / 23));
    stamp(c, f.x, 2 + sag, ['kkkkkk', 'khmmmk', 'khmmmk', 'kmmmmk', '.kmmk.', '.kmmk.', '..kk..'], {
      h: f.hi,
      m: f.mid,
    });
  }
};

/** A string of three bulbs on a brass bar, hanging from the ceiling. */
const bulbs: PartDraw = ({ c, style }) => {
  for (let y = 0; y < 3; y++) put(c, 10, y, INK);
  box(c, 2, 3, 16, 4, style.metal, { shade: 'rows' });
  for (const x of [2, 8, 14]) {
    stamp(c, x, 7, ['kkkk', 'kyyk', 'kyyk', 'kygk', '.kk.'], {
      y: style.accent.hi ?? style.accent.light,
      g: style.accent.light,
    });
  }
};

/** The stool's seat: a flat striped cushion with the star. */
const seat: PartDraw = ({ c, style }) => {
  stripes(c, style, 1, 1, 14, 3);
  put(c, 7, 2, style.accent.hi ?? style.accent.light);
  put(c, 8, 2, style.accent.light);
};

/** The curtains' valance: the stall awning over the window. */
const awningValance: PartDraw = ({ c, style }) => {
  stripes(c, style, 1, 3, 34, 3);
  scallops(c, style, 1, 6, 34);
};

export const FAIRGROUND: Style = {
  id: 'fairground',
  name: 'Fairground',
  palette: {
    k: '#0d0a1a',
    p: '#cfeaff',
    b: '#79c4f4',
    c: '#3f95dc',
    d: '#2b62b4',
    r: '#ff9a86',
    s: '#e2443c',
    t: '#a32c38',
    w: '#fffaf0',
    i: '#fff0d2',
    j: '#f0dcae',
    q: '#c9aa78',
    y: '#fff2a0',
    g: '#ffd23f',
    o: '#e89a1e',
    u: '#a8661a',
  },
  wood: { hi: 'p', light: 'b', mid: 'c', dark: 'd' },
  cloth: { hi: 'r', light: 'r', mid: 's', dark: 't' },
  linen: { hi: 'w', light: 'w', mid: 'i', dark: 'j' },
  metal: { hi: 'y', light: 'g', mid: 'o', dark: 'u' },
  glass: { hi: 'w', light: 'p', mid: 'b', dark: 'c' },
  accent: { hi: 'y', light: 'g', mid: 'o', dark: 'u' },
  leg: 'tapered',
  foot: 'ball',
  trim: 'scallop',
  top: 'peaked',
  motif: 'star',
  weave: 'stripes',
  lamp: 'cage',
  lampMaterial: 'metal',
  glow: { kind: 'ring', inner: 'y', outer: 'g' },
  rug: { shape: 'runner', weave: 'stripes', border: 'stripe', motifs: 'row' },
  picture: 'sun',
  shelf: ['trophy', 'toy', 'bottle', 'bowl'],
  shapes: {
    bed: { head: 'canopy', foot: 'post', blanket: 'quilt', mark: true },
    cupboard: { top: 'domed', doors: 'round', base: 'bun' },
    table: { kind: 'trestle', skirt: 'cloth' },
    shelf: { bracket: 'chain', board: 'plank' },
    stool: { kind: 'three-leg', mark: true },
    frame: { kind: 'banner' },
    curtains: { kind: 'shutters', pane: 'arched', valance: 'scallop' },
  },
  parts: {
    bed: { headboard: awning },
    cupboard: { crown: tent },
    table: { apron: stallCloth },
    frame: { frame: bunting, picture: () => undefined },
    lamp: { lamp: bulbs },
    stool: { seat },
    curtains: { valance: awningValance },
  },
};
