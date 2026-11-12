/**
 * Bed, 48x26: a tall headboard on the left, a low footboard on the right, the side rail, the mattress and the
 * pillow on the back layer; the blanket on the front layer, drawn over the sleeping housemate. The sleeper's 16x16
 * box has its top left at 10, 0, so it lies on the mattress (top at row 14) with the pillow under its head.
 *
 * Variants (`Style.shapes.bed`): the headboard's outline (panel, arched, pointed, posts, ladder, shell, canopy), the
 * footboard (board, low, none, post; its top follows the headboard's), the blanket's fold and the motif on it.
 */
import { canvas, put, toSprite } from '../../draw/canvas';
import {
  blanket,
  crest,
  crestHeight,
  leg,
  mattress,
  motifAt,
  motifSize,
  panel,
  pillow,
} from '../../draw/parts';
import { INK, box, fill, hline } from '../../draw/shapes';
import { type Shape, inArch, inPoint, inRect, recess, solid } from '../../draw/solid';
import type { Area, Style } from '../style';
import type { BedShape } from '../variants';
import { type FormDef, part } from './kit';

const W = 48;
const H = 26;
/** The headboard's and footboard's last row. */
const BOTTOM = 21;

/** A small round knob on top of a post three pixels wide, its top at y. */
function finial(c: ReturnType<typeof canvas>, x: number, y: number, style: Style): void {
  put(c, x + 1, y, INK);
  put(c, x, y + 1, INK);
  put(c, x + 2, y + 1, INK);
  put(c, x + 1, y + 1, style.accent.light);
}

/** A post three pixels wide from y to the board's bottom, with a knob on top. */
function post(c: ReturnType<typeof canvas>, x: number, y: number, style: Style): void {
  box(c, x, y + 2, 3, BOTTOM - y - 1, style.wood, { shade: 'flat' });
  finial(c, x, y, style);
}

/** The outline of a board (head or foot) of the shaped kinds, in its area. */
function boardShape(kind: BedShape['head'], a: Area, rise: number): Shape {
  const bottom = a.y + a.h - 1;
  switch (kind) {
    case 'arched':
    case 'shell':
      return inArch(a.x, a.y, a.w, bottom, rise);
    case 'pointed':
      return inPoint(a.x, a.y, a.w, bottom, rise);
    default:
      return inRect(a.x, a.y, a.w, a.h);
  }
}

/** A shaped board: the outline, a sunk field following it, and the motif (for a shell, ribs in the round top). */
function shapedBoard(
  c: ReturnType<typeof canvas>,
  style: Style,
  kind: BedShape['head'],
  a: Area,
  rise: number,
): void {
  const shape = boardShape(kind, a, rise);
  solid(c, a, shape, style.wood, { shade: 'cols' });
  if (kind === 'shell') {
    // the fan: light ribs in the round top, meeting in a dark hinge
    for (let y = a.y + 1; y < a.y + rise + 1; y++) {
      for (let x = a.x + 1; x < a.x + a.w - 1; x++) {
        if (!shape(x, y) || !shape(x, y - 1)) continue;
        put(c, x, y, (x - a.x) % 2 === 1 ? style.wood.light : style.wood.mid);
      }
    }
    hline(c, a.x + 2, a.y + rise + 1, a.w - 4, style.wood.dark);
  }
  if (a.w >= 7 && a.h >= 9) {
    const field: Area = {
      x: a.x,
      y: kind === 'shell' ? a.y + rise + 1 : a.y,
      w: a.w,
      h: kind === 'shell' ? a.h - rise - 1 : a.h,
    };
    const inner = kind === 'shell' ? inRect(field.x, field.y, field.w, field.h) : shape;
    recess(c, field, (x, y) => inner(x, y) && y < a.y + a.h - 2, style.wood, 2);
    const s = motifSize(style.motif);
    const my = (kind === 'shell' ? field.y : a.y + rise) + 1;
    if (s.h <= a.h - rise - 4) motifAt(c, a.x + 2, my, a.w - 4, s.h + 2, style.motif, style.accent);
  }
}

function headboard(c: ReturnType<typeof canvas>, style: Style, kind: BedShape['head']): void {
  switch (kind) {
    case 'arched':
      shapedBoard(c, style, kind, { x: 0, y: 1, w: 10, h: BOTTOM }, 5);
      return;
    case 'shell':
      shapedBoard(c, style, kind, { x: 0, y: 0, w: 10, h: BOTTOM + 1 }, 5);
      return;
    case 'pointed':
      shapedBoard(c, style, kind, { x: 0, y: 0, w: 10, h: BOTTOM + 1 }, 5);
      put(c, 4, 0, style.accent.light);
      put(c, 5, 0, style.accent.light);
      put(c, 4, -1, INK);
      return;
    case 'posts':
    case 'canopy': {
      box(c, 2, 7, 8, BOTTOM - 6, style.wood, { shade: 'cols' });
      panel(c, 3, 8, 6, BOTTOM - 9, style.wood, { inset: 1 });
      motifAt(c, 3, 9, 6, 6, style.motif, style.accent);
      post(c, 0, 0, style);
      return;
    }
    case 'ladder': {
      for (const y of [3, 8, 13]) box(c, 2, y, 6, 3, style.wood, { shade: 'rows' });
      box(c, 2, 16, 6, BOTTOM - 15, style.wood, { shade: 'rows' });
      post(c, 0, 0, style);
      post(c, 7, 0, style);
      return;
    }
    default:
      return;
  }
}

function footboard(
  c: ReturnType<typeof canvas>,
  style: Style,
  head: BedShape['head'],
  foot: NonNullable<BedShape['foot']>,
): void {
  const at = { x: 41, w: 7 };
  if (foot === 'none') return;
  if (foot === 'post' || head === 'canopy') {
    if (head === 'canopy') box(c, at.x, 13, 6, BOTTOM - 12, style.wood, { shade: 'cols' });
    post(c, at.x + 4, head === 'canopy' ? 0 : 6, style);
    return;
  }
  if (head === 'posts' || head === 'ladder') {
    const top = foot === 'low' ? 14 : 11;
    box(c, at.x, top, 5, BOTTOM - top + 1, style.wood, { shade: 'cols' });
    post(c, at.x + 4, top - 5, style);
    return;
  }
  const y = foot === 'low' ? 13 : 7;
  const rise = foot === 'low' ? 2 : 3;
  shapedBoard(c, style, head, { x: at.x, y, w: at.w, h: BOTTOM - y + 1 }, rise);
}

/** The canopy: a cloth band over the bed between the two tall posts, with a scalloped edge. */
function canopy(c: ReturnType<typeof canvas>, style: Style): void {
  box(c, 1, 2, W - 2, 4, style.cloth, { shade: 'rows' });
  for (let x = 2; x < W - 2; x++) {
    const p = (x - 2) % 4;
    if (p === 1 || p === 2) {
      put(c, x, 5, style.cloth.dark);
      put(c, x, 6, INK);
    }
  }
  hline(c, 2, 3, W - 4, style.accent.light);
  post(c, 0, 0, style);
  post(c, W - 3, 0, style);
}

/** The blanket's fold and pattern beyond the plain band. */
function blanketKind(c: ReturnType<typeof canvas>, style: Style, at: Area, shape: BedShape): void {
  const kind = shape.blanket ?? 'band';
  if (kind === 'sheet') {
    hline(c, at.x + 1, at.y + 1, at.w - 2, style.linen.hi ?? style.linen.light);
    hline(c, at.x + 1, at.y + 2, at.w - 2, style.linen.light);
    hline(c, at.x + 1, at.y + 3, at.w - 2, style.linen.dark);
  } else if (kind === 'quilt') {
    // patches of the cloth and the accent, with dark seams
    for (let y = at.y + 3; y < at.y + at.h - 2; y++) {
      for (let x = at.x + 1; x < at.x + at.w - 1; x++) {
        const px = Math.floor((x - at.x - 1) / 5);
        const py = Math.floor((y - at.y - 3) / 3);
        const seam = (x - at.x - 1) % 5 === 4 || (y - at.y - 3) % 3 === 2;
        put(
          c,
          x,
          y,
          seam ? style.cloth.dark : (px + py) % 2 === 0 ? style.cloth.mid : style.accent.light,
        );
      }
    }
  } else if (kind === 'hem') {
    hline(c, at.x + 1, at.y + at.h - 4, at.w - 2, style.accent.light);
    hline(c, at.x + 1, at.y + at.h - 3, at.w - 2, style.accent.mid);
  }
  if (shape.mark === true) {
    const s = motifSize(style.motif);
    const fx = at.x + Math.floor((at.w - s.w) / 2) + 2;
    const fy = at.y + 3 + Math.floor((at.h - 5 - s.h) / 2);
    fill(c, fx - 1, fy - 1, s.w + 2, s.h + 2, style.cloth.mid);
    motifAt(c, fx, fy, s.w, s.h, style.motif, style.accent);
  }
}

export const BED: FormDef = {
  id: 'bed',
  box: { w: W, h: H },
  parts: ['legs', 'headboard', 'footboard', 'rail', 'mattress', 'pillow', 'blanket'],
  note: 'Headboard x0-9, footboard x41-47 from row 8, rail rows 18-21, mattress rows 14-18, legs rows 22-25; blanket in front.',
  draw(style) {
    const shape = style.shapes?.bed ?? {};
    const head = shape.head ?? 'panel';
    const c = canvas(W, H);
    part(c, style, 'bed', 'legs', { x: 0, y: 21, w: W, h: 5 }, ({ c, style, at }) => {
      leg(c, at.x + 1, at.y, at.h, style.leg, style.wood, { side: 'left' });
      leg(c, at.x + at.w - 6, at.y, at.h, style.leg, style.wood, { side: 'right' });
    });
    if (head === 'canopy') canopy(c, style);
    const top = Math.max(crestHeight(style.top, 10), 2);
    part(c, style, 'bed', 'headboard', { x: 0, y: top, w: 10, h: 22 - top }, ({ c, style, at }) => {
      if (head !== 'panel') {
        headboard(c, style, head);
        return;
      }
      box(c, at.x, at.y, at.w, at.h, style.wood, {
        shade: 'cols',
        round: style.top === 'rounded' ? 2 : 0,
      });
      panel(c, at.x + 2, at.y + 3, at.w - 4, at.h - 7, style.wood, { inset: 1 });
      motifAt(c, at.x + 2, at.y + 3, at.w - 4, 6, style.motif, style.accent);
      if (style.top !== 'rounded') crest(c, at.x, at.y, at.w, style.top, style.wood, style.accent);
    });
    part(c, style, 'bed', 'footboard', { x: 41, y: 8, w: 7, h: 14 }, ({ c, style, at }) => {
      if (head !== 'panel' || (shape.foot ?? 'board') !== 'board') {
        footboard(c, style, head, shape.foot ?? 'board');
        return;
      }
      box(c, at.x, at.y, at.w, at.h, style.wood, {
        shade: 'cols',
        round: style.top === 'rounded' ? 1 : 0,
      });
      motifAt(c, at.x + 1, at.y + 2, at.w - 2, 5, style.motif, style.accent);
    });
    part(c, style, 'bed', 'rail', { x: 9, y: 18, w: 33, h: 4 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
    });
    part(c, style, 'bed', 'mattress', { x: 9, y: 14, w: 33, h: 5 }, ({ c, style, at }) => {
      mattress(c, at.x, at.y, at.w, at.h, style.linen);
    });
    part(c, style, 'bed', 'pillow', { x: 9, y: 11, w: 9, h: 5 }, ({ c, style, at }) => {
      pillow(c, at.x, at.y, at.w, at.h, style.linen);
    });
    // the rail's ink meets the boards
    hline(c, 9, 21, 33, INK);
    const front = canvas(W, H);
    part(front, style, 'bed', 'blanket', { x: 15, y: 11, w: 27, h: 11 }, ({ c, style, at }) => {
      blanket(c, at.x, at.y, at.w, at.h, style.cloth, style.accent, style.weave);
      blanketKind(c, style, at, shape);
    });
    return {
      sprite: toSprite(c, style.palette),
      front: toSprite(front, style.palette),
      sleep: { x: 10, y: 0 },
    };
  },
};
