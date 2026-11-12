/**
 * The Schoolhouse style (`docs/design/housing-workshop.md`): the Valley's School (`docs/design/valley/systems/school.md`):
 * warm oak desks, a slate-green board with chalk, brass and one red apple. The apple is the accent: the motif is a
 * red heart-shaped apple, and the desk carries a real one.
 */
import { type Canvas, put } from '../../draw/canvas';
import { INK, box, hline } from '../../draw/shapes';
import type { PartDraw, Style } from '../style';

/** Draws rows of palette keys (`.` skips) from (x, y); `map` turns a letter into a key. */
function stamp(
  c: Canvas,
  x: number,
  y: number,
  rows: readonly string[],
  map: Record<string, string> = {},
): void {
  for (const [dy, row] of rows.entries()) {
    for (const [dx, ch] of [...row].entries()) {
      if (ch !== '.') put(c, x + dx, y + dy, map[ch] ?? ch);
    }
  }
}

/** The one red apple of the set, 6x6, with a leaf: it stands on the board's ledge. */
export const APPLE: readonly string[] = [
  '..kn..',
  '.krrrk',
  'krwrrk',
  'krrrrk',
  '.kttk.',
  '..kk..',
];

/** The frame is a small blackboard: an oak frame, a slate-green face with chalk, a ledge with a stub and the apple. */
const blackboard: PartDraw = ({ c, style }) => {
  box(c, 0, 0, 24, 13, style.wood, { shade: 'tl' });
  box(c, 2, 2, 20, 9, style.cloth, { shade: 'flat' });
  hline(c, 4, 4, 9, style.linen.mid);
  hline(c, 4, 6, 6, style.linen.mid);
  hline(c, 4, 8, 4, style.linen.light);
  put(c, 9, 8, style.linen.light);
  put(c, 12, 6, style.linen.light);
  put(c, 14, 4, style.linen.light);
  box(c, 0, 13, 24, 3, style.wood, { shade: 'rows' });
  put(c, 3, 12, style.linen.light);
  put(c, 4, 12, style.linen.mid);
  stamp(c, 16, 7, APPLE, { n: style.cloth.light });
  hline(c, 1, 15, 22, INK);
};

export const SCHOOLHOUSE: Style = {
  id: 'schoolhouse',
  name: 'Schoolhouse',
  palette: {
    k: '#0d0a1a',
    o: '#e8b878',
    l: '#c88a4c',
    m: '#a8672f',
    d: '#7a4521',
    e: '#4d2a14',
    g: '#5f8a78',
    n: '#3f6657',
    s: '#2a473d',
    w: '#f6f4ea',
    c: '#d9d8c8',
    h: '#aeb0a0',
    y: '#ffe28a',
    b: '#e0a83c',
    u: '#9a6a1e',
    r: '#d9342b',
    t: '#8f1d24',
  },
  wood: { hi: 'o', light: 'l', mid: 'm', dark: 'd', deep: 'e' },
  cloth: { hi: 'g', light: 'g', mid: 'n', dark: 's' },
  linen: { hi: 'w', light: 'w', mid: 'c', dark: 'h' },
  metal: { hi: 'y', light: 'y', mid: 'b', dark: 'u' },
  glass: { hi: 'w', light: 'c', mid: 'g', dark: 'n' },
  accent: { hi: 'w', light: 'r', mid: 'r', dark: 't' },
  leg: 'straight',
  foot: 'block',
  trim: 'dentil',
  top: 'peaked',
  motif: 'heart',
  weave: 'checks',
  lamp: 'dome',
  lampMaterial: 'linen',
  glow: { kind: 'ring', inner: 'y', outer: 'b' },
  rug: { shape: 'fringe', weave: 'checks', border: 'band', motifs: 'row' },
  picture: 'hills',
  shelf: ['books', 'bottle', 'scroll', 'plant'],
  shapes: {
    bed: { head: 'ladder', foot: 'low', blanket: 'hem', mark: true },
    cupboard: { top: 'crest', doors: 'slatted', base: 'plinth' },
    table: { kind: 'four-leg', skirt: 'drawer' },
    shelf: { bracket: 'block', board: 'thick' },
    stool: { kind: 'two-leg', mark: true },
    frame: { kind: 'picture' },
    curtains: { kind: 'cafe', pane: 'grid', valance: 'none' },
  },
  parts: {
    frame: { frame: blackboard, picture: () => undefined },
  },
};
