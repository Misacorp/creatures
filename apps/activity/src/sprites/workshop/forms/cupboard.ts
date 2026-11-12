/**
 * Cupboard, 30x36: the crown (with the style's crest above it and its trim), the carcass, two doors that meet in
 * the middle with their handles, a drawer, the plinth and the feet. Stands on its bottom row. The variants
 * (`Style.shapes.cupboard`) are drawn by `cupboard-shapes.ts`.
 */
import { canvas, toSprite } from '../../draw/canvas';
import { crest, crestHeight, leg, motifAt, panel, trim } from '../../draw/parts';
import { INK, box, vline } from '../../draw/shapes';
import { shapedCupboard } from './cupboard-shapes';
import { type FormDef, part } from './kit';

const W = 30;
const H = 36;

export const CUPBOARD: FormDef = {
  id: 'cupboard',
  box: { w: W, h: H },
  parts: ['feet', 'carcass', 'doors', 'drawer', 'plinth', 'crown'],
  note: 'Crown from row 4 (lower under a tall crest), carcass x1-28, doors rows 9-24, drawer rows 25-28, plinth rows 29-31, feet 32-35.',
  draw(style) {
    const shape = style.shapes?.cupboard;
    if (shape !== undefined && Object.keys(shape).length > 0) return shapedCupboard(style, shape);
    const c = canvas(W, H);
    const top = Math.max(4, crestHeight(style.top, W) + 1);
    part(c, style, 'cupboard', 'feet', { x: 0, y: 31, w: W, h: 5 }, ({ c, style, at }) => {
      leg(c, at.x + 2, at.y, at.h, style.leg, style.wood, { side: 'left' });
      leg(c, at.x + at.w - 7, at.y, at.h, style.leg, style.wood, { side: 'right' });
    });
    part(
      c,
      style,
      'cupboard',
      'carcass',
      { x: 1, y: top + 3, w: W - 2, h: 29 - top },
      ({ c, style, at }) => {
        box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'cols', edge: 2 });
      },
    );
    part(
      c,
      style,
      'cupboard',
      'doors',
      { x: 4, y: top + 5, w: W - 8, h: 24 - top - 4 },
      ({ c, style, at }) => {
        const dw = Math.floor(at.w / 2);
        box(c, at.x - 1, at.y - 1, at.w + 2, at.h + 2, style.wood, { shade: 'flat' });
        for (const [i, dx] of [at.x, at.x + dw].entries()) {
          panel(c, dx, at.y, dw, at.h, style.wood, {
            knob: i === 0 ? 'right' : 'left',
            metal: style.metal,
            arch: style.top === 'arched',
          });
          motifAt(c, dx + 2, at.y + 2, dw - 4, Math.min(8, at.h - 4), style.motif, style.accent);
        }
        vline(c, at.x + dw - 1, at.y, at.h, INK);
      },
    );
    part(c, style, 'cupboard', 'drawer', { x: 3, y: 25, w: W - 6, h: 4 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'tl' });
      c.px[(at.y + 1) * W + at.x + Math.floor(at.w / 2)] = style.metal.hi ?? style.metal.light;
      c.px[(at.y + 1) * W + at.x + Math.floor(at.w / 2) - 1] = style.metal.light;
    });
    part(c, style, 'cupboard', 'plinth', { x: 0, y: 29, w: W, h: 3 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
    });
    part(c, style, 'cupboard', 'crown', { x: 0, y: top, w: W, h: 4 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
      if (style.trim !== 'scallop')
        trim(c, at.x + 1, at.y + 1, at.w - 2, style.trim, style.wood, style.accent);
      crest(
        c,
        at.x,
        at.y,
        at.w,
        style.top === 'rounded' ? 'arched' : style.top,
        style.wood,
        style.accent,
      );
    });
    return { sprite: toSprite(c, style.palette) };
  },
};
