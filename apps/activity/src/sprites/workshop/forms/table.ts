/**
 * Table, 44x18: the top (three rows of the wood ramp), the trim band under it, two legs, the stretcher between them
 * and the feet. Stands on its bottom row.
 */
import { canvas, toSprite } from '../../draw/canvas';
import { foot, leg, motifAt, trim, trimHeight } from '../../draw/parts';
import { INK, box, hline } from '../../draw/shapes';
import { type FormDef, part } from './kit';

const W = 44;
const H = 18;

export const TABLE: FormDef = {
  id: 'table',
  box: { w: W, h: H },
  parts: ['legs', 'stretcher', 'apron', 'top'],
  note: 'Top rows 0-4, apron under it, legs x3-8 and x35-40 down to the feet (rows 15-17), stretcher rows 11-13.',
  draw(style) {
    const c = canvas(W, H);
    const feet = style.foot === 'none' ? 0 : style.foot === 'block' ? 3 : 2;
    part(c, style, 'table', 'legs', { x: 3, y: 5, w: W - 6, h: H - 5 - feet }, ({ c, style, at }) => {
      const lw = 6;
      leg(c, at.x, at.y, at.h + (feet === 0 ? 0 : 1), style.leg, style.wood, { w: lw, side: 'left', cap: feet === 0 });
      leg(c, at.x + at.w - lw, at.y, at.h + (feet === 0 ? 0 : 1), style.leg, style.wood, {
        w: lw,
        side: 'right',
        cap: feet === 0,
      });
      if (feet > 0) {
        const fy = at.y + at.h;
        foot(c, at.x - 1, fy, lw + 2, style.foot, style.wood);
        foot(c, at.x + at.w - lw - 1, fy, lw + 2, style.foot, style.wood);
      }
    });
    part(c, style, 'table', 'stretcher', { x: 8, y: 11, w: W - 16, h: 3 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows', ink: INK });
      motifAt(c, at.x, at.y, at.w, at.h, style.motif === 'rivet' ? 'rivet' : 'none', style.accent);
    });
    part(c, style, 'table', 'apron', { x: 3, y: 5, w: W - 6, h: 3 }, ({ c, style, at }) => {
      const th = trimHeight(style.trim);
      hline(c, at.x, at.y, at.w, INK);
      trim(c, at.x + 1, at.y, at.w - 2, style.trim, style.wood, style.accent);
      if (style.trim !== 'scallop') hline(c, at.x + 1, at.y + th, at.w - 2, INK);
      c.px[at.y * W + at.x] = INK;
      c.px[at.y * W + at.x + at.w - 1] = INK;
    });
    part(c, style, 'table', 'top', { x: 0, y: 0, w: W, h: 5 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { round: 1, shade: 'rows' });
      if (style.motif !== 'none') motifAt(c, at.x, at.y + 1, at.w, 3, style.motif === 'shell' ? 'rivet' : 'none', style.accent);
    });
    return { sprite: toSprite(c, style.palette) };
  },
};
