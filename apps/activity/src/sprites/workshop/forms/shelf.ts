/**
 * Wall shelf, 40x20: the board (rows 11-14) with the style's trim on its edge, two brackets under it, and the
 * style's things standing on it (their bottoms on row 10).
 */
import { canvas, put, toSprite } from '../../draw/canvas';
import { shelfItem, shelfItemWidth } from '../../draw/parts';
import { INK, box, hline } from '../../draw/shapes';
import { type FormDef, part } from './kit';

const W = 40;
const H = 20;

export const SHELF: FormDef = {
  id: 'shelf',
  box: { w: W, h: H },
  parts: ['brackets', 'board', 'things'],
  note: 'Board rows 11-14, brackets x3-7 and x32-36 under it, things on the board from x2.',
  draw(style) {
    const c = canvas(W, H);
    part(c, style, 'shelf', 'brackets', { x: 3, y: 15, w: W - 6, h: 5 }, ({ c, style, at }) => {
      for (const bx of [at.x, at.x + at.w - 5]) {
        for (let r = 0; r < at.h; r++) {
          const bw = Math.max(1, 5 - r);
          const x0 = bx + Math.floor((5 - bw) / 2);
          hline(c, x0, at.y + r, bw, r === 0 ? style.wood.mid : style.wood.dark);
          put(c, x0 - 1, at.y + r, INK);
          put(c, x0 + bw, at.y + r, INK);
        }
        hline(c, bx + 2, at.y + at.h - 1, 1, INK);
      }
    });
    part(c, style, 'shelf', 'board', { x: 0, y: 11, w: W, h: 4 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { round: 1, shade: 'rows' });
    });
    part(c, style, 'shelf', 'things', { x: 2, y: 0, w: W - 4, h: 11 }, ({ c, style, at }) => {
      const widths = style.shelf.map(shelfItemWidth);
      const used = widths.reduce((a, b) => a + b, 0);
      const gap =
        style.shelf.length > 1
          ? Math.max(1, Math.floor((at.w - used) / (style.shelf.length + 1)))
          : 0;
      let x = at.x + gap;
      for (const item of style.shelf) {
        const w = shelfItem(c, x, at.y + at.h, item, style);
        x += w + gap;
      }
    });
    return { sprite: toSprite(c, style.palette) };
  },
};
