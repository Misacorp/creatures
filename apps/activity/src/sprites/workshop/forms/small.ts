/**
 * The small forms: the stool (16x12, a cushion on a frame on two legs), the ceiling lamp (20x16, a cord, the
 * style's shade, a light under it and the night glow) and the rug (56x10, lying on the floor line).
 */
import { blit, canvas, toSprite } from '../../draw/canvas';
import { cushion, glow, lamp, leg, motifAt, pattern, rug } from '../../draw/parts';
import { box } from '../../draw/shapes';
import { type FormDef, part } from './kit';

export const STOOL: FormDef = {
  id: 'stool',
  box: { w: 16, h: 12 },
  parts: ['legs', 'frame', 'seat'],
  note: 'Seat rows 0-4, frame rows 4-6, legs x2-5 and x10-13 to the bottom row.',
  draw(style) {
    const c = canvas(16, 12);
    part(c, style, 'stool', 'legs', { x: 1, y: 6, w: 14, h: 6 }, ({ c, style, at }) => {
      leg(c, at.x + 1, at.y, at.h, style.leg, style.wood, { w: 4, side: 'left' });
      leg(c, at.x + at.w - 5, at.y, at.h, style.leg, style.wood, { w: 4, side: 'right' });
    });
    part(c, style, 'stool', 'frame', { x: 1, y: 4, w: 14, h: 3 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
      motifAt(c, at.x, at.y, at.w, at.h, style.motif === 'rivet' ? 'rivet' : 'none', style.accent);
    });
    part(c, style, 'stool', 'seat', { x: 0, y: 0, w: 16, h: 5 }, ({ c, style, at }) => {
      cushion(c, at.x, at.y, at.w, at.h, style.cloth);
      if (style.weave !== 'plain')
        pattern(c, at.x + 2, at.y + 2, at.w - 4, 1, style.weave, style.cloth, style.accent);
    });
    return { sprite: toSprite(c, style.palette) };
  },
};

export const LAMP: FormDef = {
  id: 'lamp',
  box: { w: 20, h: 16 },
  parts: ['lamp', 'glow'],
  note: 'Hangs from the top row: a cord, the shade, the light under it; the glow is 20x10 (ring) or 20x16 (dither).',
  draw(style) {
    const c = canvas(20, 16);
    part(c, style, 'lamp', 'lamp', { x: 0, y: 0, w: 20, h: 16 }, ({ c, style, at }) => {
      const g = style.glow;
      const light = { hi: g.inner, light: g.inner, mid: g.outer, dark: g.outer };
      lamp(c, at.x + 10, 16, style.lamp, style[style.lampMaterial], style.metal, light, 3);
    });
    // the ring halo is 10 rows high, the dithered one the piece's size
    const light = canvas(20, style.glow.kind === 'ring' ? 10 : 16);
    part(
      light,
      style,
      'lamp',
      'glow',
      { x: 0, y: 0, w: light.w, h: light.h },
      ({ c, style, at }) => {
        blit(c, glow(at.w, at.h, style.glow.kind, style.glow.inner, style.glow.outer), at.x, at.y);
      },
    );
    return { sprite: toSprite(c, style.palette), glow: toSprite(light, style.palette) };
  },
};

export const RUG: FormDef = {
  id: 'rug',
  box: { w: 56, h: 10 },
  parts: ['rug'],
  note: 'The whole box: the shape, a border band of linen, a dark inner line and a field of cloth in the weave.',
  draw(style) {
    const c = canvas(56, 10);
    part(c, style, 'rug', 'rug', { x: 0, y: 0, w: 56, h: 10 }, ({ c, style, at }) => {
      rug(
        c,
        at.x,
        at.y,
        at.w,
        at.h,
        style.rug.shape,
        style.linen,
        style.cloth,
        style.accent,
        style.rug.weave,
      );
    });
    return { sprite: toSprite(c, style.palette) };
  },
};
