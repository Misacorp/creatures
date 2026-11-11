/**
 * Bed, 48x26: a tall headboard on the left, a low footboard on the right, the side rail, the mattress and the
 * pillow on the back layer; the blanket on the front layer, drawn over the sleeping housemate. The sleeper's 16x16
 * box has its top left at 10, 0, so it lies on the mattress (top at row 14) with the pillow under its head.
 */
import { canvas, toSprite } from '../../draw/canvas';
import { blanket, crest, crestHeight, leg, mattress, motifAt, panel, pillow } from '../../draw/parts';
import { INK, box, hline } from '../../draw/shapes';
import { type FormDef, part } from './kit';

const W = 48;
const H = 26;

export const BED: FormDef = {
  id: 'bed',
  box: { w: W, h: H },
  parts: ['legs', 'headboard', 'footboard', 'rail', 'mattress', 'pillow', 'blanket'],
  note: 'Headboard x0-9, footboard x41-47 from row 8, rail rows 18-21, mattress rows 14-18, legs rows 22-25; blanket in front.',
  draw(style) {
    const c = canvas(W, H);
    part(c, style, 'bed', 'legs', { x: 0, y: 21, w: W, h: 5 }, ({ c, style, at }) => {
      leg(c, at.x + 1, at.y, at.h, style.leg, style.wood, { side: 'left' });
      leg(c, at.x + at.w - 6, at.y, at.h, style.leg, style.wood, { side: 'right' });
    });
    const head = Math.max(crestHeight(style.top, 10), 2);
    part(c, style, 'bed', 'headboard', { x: 0, y: head, w: 10, h: 22 - head }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'cols', round: style.top === 'rounded' ? 2 : 0 });
      panel(c, at.x + 2, at.y + 3, at.w - 4, at.h - 7, style.wood, { inset: 1 });
      motifAt(c, at.x + 2, at.y + 3, at.w - 4, 6, style.motif, style.accent);
      if (style.top !== 'rounded') crest(c, at.x, at.y, at.w, style.top, style.wood, style.accent);
    });
    part(c, style, 'bed', 'footboard', { x: 41, y: 8, w: 7, h: 14 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'cols', round: style.top === 'rounded' ? 1 : 0 });
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
    });
    return {
      sprite: toSprite(c, style.palette),
      front: toSprite(front, style.palette),
      sleep: { x: 10, y: 0 },
    };
  },
};
