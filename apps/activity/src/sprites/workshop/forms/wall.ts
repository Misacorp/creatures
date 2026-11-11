/**
 * The wall forms: the picture frame (24x16, the frame with the style's crest and a small picture in it) and the
 * window with its dressing (36x26: the rod, the valance, the glass, two tied drapes and the sill).
 */
import { canvas, toSprite } from '../../draw/canvas';
import { crest, crestHeight, drape, motif, motifSize, picture, trim, windowPane } from '../../draw/parts';
import { INK, box, hline } from '../../draw/shapes';
import { type FormDef, part } from './kit';

export const FRAME: FormDef = {
  id: 'frame',
  box: { w: 24, h: 16 },
  parts: ['frame', 'picture'],
  note: 'The frame fills the box under its crest; the picture sits 3 px inside.',
  draw(style) {
    const c = canvas(24, 16);
    const top = Math.min(4, crestHeight(style.top, 24));
    part(c, style, 'frame', 'frame', { x: 0, y: top, w: 24, h: 16 - top }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { round: style.top === 'rounded' ? 2 : 1, edge: 2 });
      if (style.top !== 'rounded' && style.top !== 'square' && top > 0) {
        crest(c, at.x, at.y, at.w, style.top, style.wood, style.accent);
      }
    });
    part(c, style, 'frame', 'picture', { x: 3, y: top + 3, w: 18, h: 16 - top - 6 }, ({ c, style, at }) => {
      hline(c, at.x - 1, at.y - 1, at.w + 2, style.wood.dark);
      picture(c, at.x, at.y, at.w, at.h, style.picture, style);
      const s = motifSize(style.motif);
      if (s.w > 0 && s.h <= at.h - 1) motif(c, at.x + at.w - s.w - 1, at.y + at.h - s.h, style.motif, style.accent);
    });
    return { sprite: toSprite(c, style.palette) };
  },
};

export const CURTAINS: FormDef = {
  id: 'curtains',
  box: { w: 36, h: 26 },
  parts: ['window', 'sill', 'drapes', 'valance', 'rod'],
  note: 'Rod rows 1-2 (crest above), glass x7-28 rows 4-21, drapes x1-10 and x25-34 tied at row 13, sill rows 22-25.',
  draw(style) {
    const c = canvas(36, 26);
    const up = Math.min(2, crestHeight(style.top, 36));
    part(c, style, 'curtains', 'window', { x: 6, y: 3, w: 24, h: 20 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'flat' });
      windowPane(c, at.x + 1, at.y + 1, at.w - 2, at.h - 2, style.glass, style.wood, { cross: true });
    });
    part(c, style, 'curtains', 'sill', { x: 3, y: 22, w: 30, h: 4 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h - 1, style.wood, { round: 1, shade: 'rows' });
      hline(c, at.x + 3, at.y + at.h - 1, at.w - 6, INK);
    });
    part(c, style, 'curtains', 'drapes', { x: 1, y: 4, w: 34, h: 18 }, ({ c, style, at }) => {
      const dw = 10;
      drape(c, at.x, at.y, dw, at.h, style.cloth, { side: 'left', tie: 9, band: style.accent });
      drape(c, at.x + at.w - dw, at.y, dw, at.h, style.cloth, { side: 'right', tie: 9, band: style.accent });
    });
    part(c, style, 'curtains', 'valance', { x: 1, y: 3, w: 34, h: 3 }, ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.cloth, { shade: 'rows' });
      if (style.trim === 'scallop' || style.trim === 'zigzag' || style.trim === 'leaf') {
        trim(c, at.x + 1, at.y + 1, at.w - 2, style.trim === 'scallop' ? 'bead' : style.trim, style.cloth, style.accent);
      }
    });
    part(c, style, 'curtains', 'rod', { x: 0, y: up, w: 36, h: 2 }, ({ c, style, at }) => {
      hline(c, at.x + 2, at.y, at.w - 4, INK);
      hline(c, at.x + 2, at.y + 1, at.w - 4, style.metal.light);
      for (const fx of [at.x, at.x + at.w - 3]) {
        box(c, fx, at.y - 1, 3, 4, style.metal, { shade: 'tl' });
      }
      if (up > 0) crest(c, at.x + 6, at.y, at.w - 12, style.top === 'scallop' ? 'scallop' : 'square', style.wood, style.accent);
    });
    return { sprite: toSprite(c, style.palette) };
  },
};
