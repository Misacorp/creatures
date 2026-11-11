/**
 * The stool's, the frame's and the window's silhouette variants (`Style.shapes.stool`, `.frame`, `.curtains`,
 * `docs/design/housing-workshop.md`). The stool: two legs, three legs, a drum, a pouf, a stump, a spool. The frame: a
 * picture, an oval mirror, a round picture, a shield, a banner, a clock. The window: its dressing (tied, straight,
 * shutters, bead strings, a café curtain, bare), its pane (cross, round, arched, grid, plain) and its valance. Drawn
 * through the same named parts as the plain forms.
 */
import { type Canvas, canvas, get, put, toSprite, under } from '../../draw/canvas';
import {
  crest,
  cushion,
  drape,
  leg,
  motif,
  motifAt,
  motifSize,
  pattern,
  picture,
  windowPane,
} from '../../draw/parts';
import { INK, box, hline, vline } from '../../draw/shapes';
import { type Shape, inArch, inEllipse, inRect, shrink, solid, union } from '../../draw/solid';
import type { PieceArt } from '../../../housing/house-art';
import type { Area, Style } from '../style';
import type { CurtainShape, FrameShape, StoolShape } from '../variants';
import { part } from './kit';

// ---------------------------------------------------------------------------------------------------------------
// the stool, 16x12

/** The style's motif in the middle of a seat area, on a patch of the cloth so it reads. */
function seatMark(c: Canvas, style: Style, a: Area): void {
  const s = motifSize(style.motif);
  if (s.w === 0 || s.h > a.h || s.w > a.w) return;
  motifAt(c, a.x, a.y, a.w, a.h, style.motif, style.accent);
}

export function shapedStool(style: Style, shape: StoolShape): PieceArt {
  const c = canvas(16, 12);
  const kind = shape.kind ?? 'two-leg';
  const mark = shape.mark === true;
  part(c, style, 'stool', 'legs', { x: 1, y: 4, w: 14, h: 8 }, ({ c, style, at }) => {
    if (kind === 'two-leg') {
      leg(c, at.x + 1, at.y + 2, at.h - 2, style.leg, style.wood, { w: 4, side: 'left' });
      leg(c, at.x + at.w - 5, at.y + 2, at.h - 2, style.leg, style.wood, { w: 4, side: 'right' });
    } else if (kind === 'three-leg') {
      leg(c, 6, at.y, at.h - 2, 'straight', style.wood, { w: 4 });
      leg(c, at.x + 2, at.y, at.h, 'splayed', style.wood, { w: 4, side: 'left' });
      leg(c, at.x + at.w - 6, at.y, at.h, 'splayed', style.wood, { w: 4, side: 'right' });
    } else if (kind === 'spool') {
      box(c, 4, 3, 8, 7, style.wood, { shade: 'cols' });
      box(c, 1, 9, 14, 3, style.wood, { shade: 'rows', round: 1 });
    } else if (kind === 'stump') {
      box(c, 2, 3, 12, 9, style.wood, { shade: 'cols' });
      for (const x of [5, 8, 11]) vline(c, x, 5, 5, style.wood.dark);
      put(c, 1, 11, INK);
      put(c, 14, 11, INK);
      put(c, 1, 10, INK);
      put(c, 14, 10, INK);
      put(c, 2, 10, style.wood.mid);
      put(c, 13, 10, style.wood.dark);
    } else if (kind === 'drum') {
      box(c, 1, 2, 14, 10, style.wood, { shade: 'cols', round: 2 });
      for (const y of [5, 9]) {
        hline(c, 2, y, 12, style.metal.light);
        put(c, 13, y, style.metal.dark);
      }
    }
  });
  part(c, style, 'stool', 'frame', { x: 1, y: 4, w: 14, h: 3 }, ({ c, style, at }) => {
    if (kind === 'two-leg') box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
  });
  part(c, style, 'stool', 'seat', { x: 0, y: 0, w: 16, h: 5 }, ({ c, style, at }) => {
    if (kind === 'pouf') {
      // a round cushion on the floor, tufted, with a seam round its middle
      const body = inEllipse(0, 1, 16, 16);
      solid(c, { x: 0, y: 1, w: 16, h: 11 }, body, style.cloth, { shade: 'tl' });
      hline(c, 2, 6, 12, style.cloth.dark);
      if (style.weave !== 'plain') pattern(c, 3, 8, 10, 2, style.weave, style.cloth, style.accent);
      if (mark) seatMark(c, style, { x: 3, y: 2, w: 10, h: 4 });
      else put(c, 7, 3, style.cloth.dark);
      return;
    }
    if (kind === 'stump') {
      solid(c, { x: 1, y: 0, w: 14, h: 5 }, inEllipse(1, 0, 14, 5), style.wood, { shade: 'flat' });
      for (let x = 4; x < 12; x++) put(c, x, 2, style.wood.light);
      put(c, 7, 2, style.wood.dark);
      put(c, 8, 2, style.wood.dark);
      if (mark) seatMark(c, style, { x: 3, y: 1, w: 10, h: 3 });
      return;
    }
    if (kind === 'three-leg' || kind === 'drum') {
      const ramp = style.weave === 'plain' && kind === 'three-leg' ? style.wood : style.cloth;
      solid(c, { x: 0, y: 0, w: 16, h: 5 }, inEllipse(0, 0, 16, 5), ramp, { shade: 'rows' });
      if (mark) seatMark(c, style, { x: 3, y: 1, w: 10, h: 3 });
      return;
    }
    // two-leg and spool: the cushion of the plain stool
    const y = kind === 'spool' ? at.y : at.y;
    cushion(c, at.x, y, at.w, at.h, style.cloth);
    if (mark) seatMark(c, style, { x: 2, y: 1, w: 12, h: 3 });
    else if (style.weave !== 'plain')
      pattern(c, at.x + 2, at.y + 2, at.w - 4, 1, style.weave, style.cloth, style.accent);
  });
  return { sprite: toSprite(c, style.palette) };
}

// ---------------------------------------------------------------------------------------------------------------
// the frame, 24x16

/** Draws the picture into a shape: the style's subject, clipped. */
function pictureIn(c: Canvas, style: Style, a: Area, shape: Shape): void {
  const tmp = canvas(c.w, c.h);
  picture(tmp, a.x, a.y, a.w, a.h, style.picture, style);
  for (let y = a.y; y < a.y + a.h; y++) {
    for (let x = a.x; x < a.x + a.w; x++) if (shape(x, y)) put(c, x, y, get(tmp, x, y));
  }
}

export function shapedFrame(style: Style, shape: FrameShape): PieceArt {
  const c = canvas(24, 16);
  const kind = shape.kind ?? 'picture';
  const all: Area = { x: 0, y: 0, w: 24, h: 16 };
  part(c, style, 'frame', 'frame', all, ({ c, style }) => {
    if (kind === 'picture') {
      box(c, 0, 0, 24, 16, style.wood, { round: 1, edge: 2 });
    } else if (kind === 'mirror') {
      solid(c, all, inEllipse(0, 0, 24, 16), style.wood, { shade: 'tl' });
      put(c, 11, 0, style.accent.light);
      put(c, 12, 0, style.accent.mid);
    } else if (kind === 'round' || kind === 'clock') {
      solid(c, all, inEllipse(4, 0, 16, 16), style.wood, { shade: 'tl' });
    } else if (kind === 'crest') {
      // a shield: square shoulders, a point at the bottom
      const shield: Shape = (x, y) => {
        if (x < 4 || x > 19 || y < 0 || y > 15) return false;
        if (y < 9) return true;
        const half = 8 - ((y - 8) * 8) / 8;
        return Math.abs(x - 11.5) <= half;
      };
      solid(c, all, shield, style.wood, { shade: 'tl' });
    } else if (kind === 'banner') {
      // a rod with knobs, the cloth hanging from it with a swallow-tail
      hline(c, 3, 0, 18, INK);
      hline(c, 3, 1, 18, style.metal.light);
      hline(c, 3, 2, 18, INK);
      box(c, 1, 0, 3, 3, style.metal, { shade: 'tl' });
      box(c, 20, 0, 3, 3, style.metal, { shade: 'tl' });
      const cloth: Shape = (x, y) => {
        if (x < 5 || x > 18 || y < 3 || y > 15) return false;
        return y < 12 || Math.abs(x - 11.5) >= y - 10;
      };
      solid(c, all, cloth, style.cloth, { shade: 'cols' });
      for (let y = 4; y < 13; y++) {
        put(c, 7, y, style.accent.light);
        put(c, 16, y, style.accent.light);
      }
    }
  });
  part(c, style, 'frame', 'picture', { x: 3, y: 3, w: 18, h: 10 }, ({ c, style, at }) => {
    if (kind === 'picture') {
      hline(c, at.x - 1, at.y - 1, at.w + 2, style.wood.dark);
      picture(c, at.x, at.y, at.w, at.h, style.picture, style);
      const s = motifSize(style.motif);
      if (s.w > 0 && s.h <= at.h - 1)
        motif(c, at.x + at.w - s.w - 1, at.y + at.h - s.h, style.motif, style.accent);
    } else if (kind === 'mirror') {
      const glass = inEllipse(3, 2, 18, 12);
      for (let y = 2; y < 14; y++) {
        for (let x = 3; x < 21; x++) {
          if (!glass(x, y)) continue;
          const streak = x + y === 14 || x + y === 15 || x + y === 19;
          const edge = !glass(x - 1, y) || !glass(x, y - 1);
          put(
            c,
            x,
            y,
            streak
              ? (style.glass.hi ?? style.glass.light)
              : edge
                ? style.wood.dark
                : style.glass.mid,
          );
        }
      }
    } else if (kind === 'round') {
      pictureIn(c, style, { x: 6, y: 2, w: 12, h: 12 }, inEllipse(6, 2, 12, 12));
    } else if (kind === 'clock') {
      const face = inEllipse(6, 2, 12, 12);
      for (let y = 2; y < 14; y++)
        for (let x = 6; x < 18; x++) if (face(x, y)) put(c, x, y, style.linen.light);
      for (const [x, y] of [
        [11, 3],
        [12, 3],
        [7, 7],
        [16, 7],
        [11, 12],
        [12, 12],
      ] as const)
        put(c, x, y, style.wood.dark);
      vline(c, 11, 5, 3, INK);
      hline(c, 11, 8, 4, INK);
      put(c, 11, 8, style.accent.mid);
    } else if (kind === 'crest') {
      const field = shrink((x, y) => get(c, x, y) !== '.' && y < 16, 2);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 24; x++) {
          if (!field(x, y)) continue;
          put(c, x, y, y < 5 ? style.accent.mid : style.cloth.mid);
        }
      }
      hline(c, 6, 5, 12, style.accent.dark);
      motifAt(c, 6, 6, 12, 7, style.motif === 'none' ? 'star' : style.motif, style.accent);
    } else if (kind === 'banner') {
      motifAt(c, 8, 4, 8, 8, style.motif === 'none' ? 'star' : style.motif, style.accent);
    }
  });
  return { sprite: toSprite(c, style.palette) };
}

// ---------------------------------------------------------------------------------------------------------------
// the window and its dressing, 36x26

function windowShape(pane: NonNullable<CurtainShape['pane']>): Shape {
  if (pane === 'round') return inEllipse(8, 2, 20, 21);
  if (pane === 'arched') return inArch(6, 1, 24, 22, 8);
  return inRect(6, 3, 24, 20);
}

export function shapedCurtains(style: Style, shape: CurtainShape): PieceArt {
  const c = canvas(36, 26);
  const kind = shape.kind ?? 'tied';
  const pane = shape.pane ?? 'cross';
  const valance = shape.valance ?? 'band';
  part(c, style, 'curtains', 'window', { x: 6, y: 1, w: 24, h: 22 }, ({ c, style }) => {
    const frame = windowShape(pane);
    const area: Area = { x: 0, y: 0, w: 36, h: 23 };
    solid(c, area, frame, style.wood, { shade: 'flat' });
    const glass = shrink(frame, 2);
    const tmp = canvas(36, 26);
    windowPane(tmp, 6, 1, 24, 22, style.glass, style.wood, { cross: false });
    for (let y = 0; y < 23; y++) {
      for (let x = 0; x < 36; x++) {
        if (!glass(x, y)) continue;
        let k = get(tmp, x, y);
        const bars =
          pane === 'grid'
            ? (x - 6) % 4 === 0 || (y - 1) % 5 === 0
            : pane !== 'plain' && (x === 18 || y === 13);
        if (bars) k = style.wood.dark;
        put(c, x, y, k);
      }
    }
  });
  part(c, style, 'curtains', 'sill', { x: 3, y: 22, w: 30, h: 4 }, ({ c, style, at }) => {
    box(c, at.x, at.y, at.w, at.h - 1, style.wood, { round: 1, shade: 'rows' });
    hline(c, at.x + 3, at.y + at.h - 1, at.w - 6, INK);
  });
  part(c, style, 'curtains', 'drapes', { x: 1, y: 4, w: 34, h: 18 }, ({ c, style, at }) => {
    if (kind === 'tied' || kind === 'straight') {
      const dw = kind === 'tied' ? 10 : 8;
      const tie = kind === 'tied' ? { tie: 9, band: style.accent } : {};
      drape(c, at.x, at.y, dw, at.h, style.cloth, { side: 'left', ...tie });
      drape(c, at.x + at.w - dw, at.y, dw, at.h, style.cloth, { side: 'right', ...tie });
    } else if (kind === 'shutters') {
      for (const sx of [0, 29]) {
        box(c, sx, 3, 7, 20, style.wood, { shade: 'cols' });
        for (let y = 5; y < 21; y += 2) hline(c, sx + 2, y, 3, style.wood.dark);
      }
    } else if (kind === 'beads') {
      for (let x = 9; x < 28; x += 4) {
        const len = 7 + Math.round(6 * Math.abs(Math.cos(((x - 18) / 20) * Math.PI)));
        for (let y = 5; y < 5 + len; y++) {
          const bead = (y - 5) % 3 === 2;
          put(c, x, y, bead ? style.accent.light : style.cloth.dark);
          if (bead) {
            put(c, x - 1, y, INK);
            put(c, x + 1, y, INK);
          }
        }
        put(c, x, 5 + len, INK);
      }
    } else if (kind === 'cafe') {
      // a half curtain on a thin rod across the lower half of the window
      hline(c, 5, 12, 26, INK);
      hline(c, 5, 13, 26, style.metal.light);
      for (const [dx, side] of [
        [6, 'left'],
        [18, 'right'],
      ] as const)
        drape(c, dx, 14, 12, 8, style.cloth, { side, fold: 3 });
    }
  });
  part(c, style, 'curtains', 'valance', { x: 1, y: 3, w: 34, h: 3 }, ({ c, style, at }) => {
    if (valance === 'band') {
      box(c, at.x, at.y, at.w, at.h, style.cloth, { shade: 'rows' });
    } else if (valance === 'scallop') {
      // a deep pelmet whose lower edge hangs in round tabs
      const tabs: Shape = (x, y) => {
        if (x < at.x || x >= at.x + at.w || y < 2) return false;
        if (y < 7) return true;
        if (y > 8) return false;
        const p = (x - at.x) % 6;
        return y === 7 ? p !== 0 : p >= 2 && p <= 4;
      };
      solid(c, { x: 0, y: 0, w: 36, h: 10 }, union(tabs), style.cloth, { shade: 'rows' });
      hline(c, at.x + 1, 4, at.w - 2, style.accent.light);
    }
  });
  part(c, style, 'curtains', 'rod', { x: 0, y: 1, w: 36, h: 2 }, ({ c, style, at }) => {
    hline(c, at.x + 2, at.y, at.w - 4, INK);
    hline(c, at.x + 2, at.y + 1, at.w - 4, style.metal.light);
    // the rod's ink underside where nothing hangs from it
    for (let x = at.x + 2; x < at.x + at.w - 2; x++) under(c, x, at.y + 2, INK);
    for (const fx of [at.x, at.x + at.w - 3])
      box(c, fx, at.y - 1, 3, 4, style.metal, { shade: 'tl' });
    if (style.top === 'scallop')
      crest(c, at.x + 6, at.y, at.w - 12, 'scallop', style.wood, style.accent);
  });
  return { sprite: toSprite(c, style.palette) };
}
