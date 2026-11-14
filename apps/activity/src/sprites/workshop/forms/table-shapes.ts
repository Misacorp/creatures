/**
 * The table's and the shelf's silhouette variants (`Style.shapes.table`, `Style.shapes.shelf`,
 * `docs/design/housing-workshop.md`). The table: what holds the top up (two legs, trestles, a pedestal, two slabs, a
 * log on roots) and what hangs under it (the trim, a swag, a tablecloth, a drawer). The shelf: the brackets (wedges,
 * iron scrolls, corbels, hanging ropes or chains) and the board (plank, thick, log). Drawn through the same named
 * parts as the plain forms.
 */
import { type Canvas, canvas, put, toSprite, under } from '../../draw/canvas';
import {
  foot,
  leg,
  motifAt,
  shelfItem,
  shelfItemWidth,
  stencil,
  trim,
  trimHeight,
} from '../../draw/parts';
import { INK, box, hline } from '../../draw/shapes';
import { type Shape, inEllipse, inRect, recess, solid } from '../../draw/solid';
import type { PieceArt } from '../../../housing/house-art';
import type { Style } from '../style';
import type { ShelfShape, TableShape } from '../variants';
import { part } from './kit';

const TW = 44;
const TH = 18;

/** A cloth swag hanging between two points on row y, `drop` rows deep in the middle, with a tassel. */
function swag(c: Canvas, x0: number, x1: number, y: number, drop: number, style: Style): void {
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const sy = y + Math.round(drop * Math.sin(Math.PI * t));
    put(c, x, sy, style.cloth.light);
    put(c, x, sy + 1, style.cloth.dark);
    under(c, x, sy + 2, INK);
    under(c, x, sy - 1, INK);
  }
  const mx = Math.floor((x0 + x1) / 2);
  const ty = y + drop + 2;
  put(c, mx, ty, style.accent.light);
  put(c, mx, ty + 1, style.accent.mid);
  put(c, mx - 1, ty, INK);
  put(c, mx + 1, ty, INK);
  put(c, mx - 1, ty + 1, INK);
  put(c, mx + 1, ty + 1, INK);
  put(c, mx, ty + 2, INK);
}

export function shapedTable(style: Style, shape: TableShape): PieceArt {
  const c = canvas(TW, TH);
  const kind = shape.kind ?? 'four-leg';
  const skirt = shape.skirt ?? 'apron';
  const feet = style.foot === 'none' ? 0 : style.foot === 'block' ? 3 : 2;
  const topH = kind === 'log' ? 6 : 5;
  part(
    c,
    style,
    'table',
    'legs',
    { x: 3, y: topH, w: TW - 6, h: TH - topH },
    ({ c, style, at }) => {
      if (kind === 'four-leg') {
        const h = at.h - feet;
        leg(c, at.x, at.y, h + (feet === 0 ? 0 : 1), style.leg, style.wood, {
          w: 6,
          side: 'left',
          cap: feet === 0,
        });
        leg(c, at.x + at.w - 6, at.y, h + (feet === 0 ? 0 : 1), style.leg, style.wood, {
          w: 6,
          side: 'right',
          cap: feet === 0,
        });
        if (feet > 0) {
          foot(c, at.x - 1, at.y + h, 8, style.foot, style.wood);
          foot(c, at.x + at.w - 7, at.y + h, 8, style.foot, style.wood);
        }
      } else if (kind === 'trestle') {
        // an A-frame at each end: 6 wide under the top, 14 at the floor, open under its cross bar
        for (const cx of [at.x + 6, at.x + at.w - 7]) {
          const frame: Shape = (x, y) => {
            if (y < at.y || y >= TH) return false;
            const t = (y - at.y) / (TH - 1 - at.y);
            const half = 3 + 4 * t;
            const d = Math.abs(x + 0.5 - (cx + 0.5));
            if (d > half) return false;
            return y < at.y + 6 || d > half - 3.2;
          };
          solid(c, { x: cx - 8, y: at.y, w: 18, h: TH - at.y }, frame, style.wood, {
            shade: 'cols',
          });
        }
      } else if (kind === 'pedestal') {
        box(c, 18, at.y, 8, at.h - 4, style.wood, { shade: 'cols' });
        box(c, 15, at.y, 14, 3, style.wood, { shade: 'rows' });
        const base = inEllipse(9, TH - 5, 26, 10);
        solid(c, { x: 9, y: TH - 5, w: 26, h: 5 }, base, style.wood, { shade: 'tl' });
      } else if (kind === 'slab') {
        for (const sx of [2, TW - 12]) {
          box(c, sx, at.y - 1, 10, TH - at.y + 1, style.wood, { shade: 'cols' });
          recess(
            c,
            { x: sx, y: at.y - 1, w: 10, h: TH - at.y + 1 },
            inRect(sx, at.y - 1, 10, TH - at.y + 1),
            style.wood,
            2,
          );
          motifAt(c, sx + 2, at.y + 1, 6, TH - at.y - 3, style.motif, style.accent);
        }
      } else {
        // log: rough splayed legs with root feet
        for (const [lx, side] of [
          [at.x + 2, 'left'],
          [at.x + at.w - 8, 'right'],
        ] as const) {
          leg(c, lx, at.y, at.h, 'splayed', style.wood, { w: 6, side });
          put(c, side === 'left' ? lx - 6 : lx + 11, TH - 1, INK);
        }
      }
    },
  );
  part(c, style, 'table', 'stretcher', { x: 8, y: 11, w: TW - 16, h: 3 }, ({ c, style, at }) => {
    if (kind === 'four-leg') box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
    else if (kind === 'trestle')
      box(c, at.x - 2, at.y - 2, at.w + 4, 3, style.wood, { shade: 'rows' });
  });
  const drawTop = (): void =>
    part(c, style, 'table', 'top', { x: 0, y: 0, w: TW, h: topH }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { round: kind === 'log' ? 2 : 1, shade: 'rows' });
      if (kind === 'log') {
        // end grain at the left, bark along the bottom
        put(c, 2, 2, style.wood.hi ?? style.wood.light);
        put(c, 2, 3, style.wood.dark);
        for (let x = 4; x < at.w - 3; x += 5) put(c, x, at.h - 2, INK);
      }
    });
  const apron = (): void =>
    part(c, style, 'table', 'apron', { x: 3, y: topH, w: TW - 6, h: 3 }, ({ c, style, at }) => {
      if (skirt === 'apron') {
        const th = trimHeight(style.trim);
        hline(c, at.x, at.y, at.w, INK);
        trim(c, at.x + 1, at.y, at.w - 2, style.trim, style.wood, style.accent);
        if (style.trim !== 'scallop') hline(c, at.x + 1, at.y + th, at.w - 2, INK);
        put(c, at.x, at.y, INK);
        put(c, at.x + at.w - 1, at.y, INK);
      } else if (skirt === 'drawer') {
        box(c, at.x + 4, at.y - 1, at.w - 8, 5, style.wood, { shade: 'tl' });
        const mx = at.x + Math.floor(at.w / 2);
        put(c, mx - 1, at.y + 1, style.metal.hi ?? style.metal.light);
        put(c, mx, at.y + 1, style.metal.dark);
      } else if (skirt === 'swag') {
        swag(c, at.x + 5, at.x + at.w - 6, at.y, 4, style);
      } else if (skirt === 'cloth') {
        // a cloth over the whole top, hanging in front, its hem in the accent with a fringe
        const ch = topH + 5;
        box(c, 0, 0, TW, ch, style.cloth, { shade: 'rows', round: 1 });
        hline(c, 1, ch - 3, TW - 2, style.accent.light);
        for (let x = 2; x < TW - 2; x += 2) put(c, x, ch, style.accent.mid);
        for (let x = 2; x < TW - 2; x += 2) put(c, x, ch + 1, INK);
        motifAt(c, 0, 2, TW, ch - 5, style.motif, style.accent);
      }
    });
  if (skirt === 'cloth') {
    drawTop();
    apron();
  } else {
    apron();
    drawTop();
  }
  return { sprite: toSprite(c, style.palette) };
}

// ---------------------------------------------------------------------------------------------------------------
// the shelf

const SW = 40;
const SH = 20;
/** An iron scroll bracket hanging under a board's left end (mirrored for the right). */
const SCROLL = ['kkkkkk', 'k1222k', 'k2kkkk', 'k2k.kk', 'k2kk2k', '.k22k.', '..kk..'];

/** A hanging rope or chain from the top row down to the board, at column x (3 wide). */
function hanger(c: Canvas, x: number, bottom: number, style: Style, chain: boolean): void {
  for (let y = 0; y < bottom; y++) {
    if (chain) {
      const link = y % 3;
      if (link === 1) {
        put(c, x, y, INK);
        put(c, x + 1, y, style.metal.light);
        put(c, x + 2, y, INK);
      } else {
        put(c, x + 1, y, link === 0 ? INK : style.metal.dark);
        if (link === 2) {
          put(c, x, y, INK);
          put(c, x + 2, y, INK);
        }
      }
    } else {
      put(c, x, y, INK);
      put(c, x + 1, y, y % 2 === 0 ? style.linen.light : style.linen.dark);
      put(c, x + 2, y, INK);
    }
  }
}

export function shapedShelf(style: Style, shape: ShelfShape): PieceArt {
  const c = canvas(SW, SH);
  const bracket = shape.bracket ?? 'wedge';
  const board = shape.board ?? 'plank';
  const bh = board === 'plank' ? 4 : 5;
  const hangs = bracket === 'rope' || bracket === 'chain';
  part(
    c,
    style,
    'shelf',
    'brackets',
    { x: 3, y: 11 + bh, w: SW - 6, h: SH - 11 - bh },
    ({ c, style, at }) => {
      if (bracket === 'wedge') {
        for (const bx of [at.x, at.x + at.w - 5]) {
          for (let r = 0; r < at.h; r++) {
            const bw = Math.max(1, 5 - r);
            const x0 = bx + Math.floor((5 - bw) / 2);
            hline(c, x0, at.y + r, bw, r === 0 ? style.wood.mid : style.wood.dark);
            put(c, x0 - 1, at.y + r, INK);
            put(c, x0 + bw, at.y + r, INK);
          }
        }
      } else if (bracket === 'scroll') {
        stencil(c, at.x, at.y - 1, SCROLL, style.metal);
        stencil(
          c,
          at.x + at.w - 6,
          at.y - 1,
          SCROLL.map((r) => [...r].reverse().join('')),
          style.metal,
        );
      } else if (bracket === 'block') {
        for (const bx of [at.x, at.x + at.w - 6])
          box(c, bx, at.y - 1, 6, Math.min(4, at.h + 1), style.wood, { shade: 'tl' });
      } else if (hangs) {
        // the loops under the board's ends
        for (const bx of [at.x - 1, at.x + at.w - 2]) {
          put(c, bx, at.y, INK);
          put(c, bx + 2, at.y, INK);
          put(c, bx + 1, at.y + 1, INK);
          put(c, bx + 1, at.y, bracket === 'rope' ? style.linen.dark : style.metal.dark);
        }
      }
    },
  );
  if (hangs) {
    hanger(c, 2, 11, style, bracket === 'chain');
    hanger(c, SW - 5, 11, style, bracket === 'chain');
  }
  part(c, style, 'shelf', 'board', { x: 0, y: 11, w: SW, h: bh }, ({ c, style, at }) => {
    box(c, at.x, at.y, at.w, at.h, style.wood, { round: board === 'log' ? 2 : 1, shade: 'rows' });
    if (board === 'thick' && style.trim !== 'scallop')
      trim(c, at.x + 1, at.y + 2, at.w - 2, style.trim, style.wood, style.accent);
    if (board === 'log') {
      put(c, 2, at.y + 2, style.wood.hi ?? style.wood.light);
      for (let x = 5; x < at.w - 3; x += 6) put(c, x, at.y + at.h - 2, INK);
    }
    if (hangs) {
      for (const hx of [2, SW - 5]) {
        put(c, hx + 1, at.y, bracket === 'rope' ? style.linen.light : style.metal.light);
        put(c, hx + 1, at.y + 1, bracket === 'rope' ? style.linen.dark : style.metal.dark);
      }
    }
  });
  const left = hangs ? 6 : 2;
  part(
    c,
    style,
    'shelf',
    'things',
    { x: left, y: 0, w: SW - 2 * left, h: 11 },
    ({ c, style, at }) => {
      const widths = style.shelf.map(shelfItemWidth);
      const used = widths.reduce((a, b) => a + b, 0);
      const gap =
        style.shelf.length > 1
          ? Math.max(1, Math.floor((at.w - used) / (style.shelf.length + 1)))
          : 0;
      let x = at.x + gap;
      for (const item of style.shelf) {
        if (x + shelfItemWidth(item) > at.x + at.w) break;
        x += shelfItem(c, x, at.y + at.h, item, style) + gap;
      }
    },
  );
  return { sprite: toSprite(c, style.palette) };
}
