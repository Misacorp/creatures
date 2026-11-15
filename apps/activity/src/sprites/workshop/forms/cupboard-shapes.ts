/**
 * The cupboard's silhouette variants (`Style.shapes.cupboard`, `docs/design/housing-workshop.md`): the top's outline
 * (the crown with the style's crest, a heavy cornice, a round arch, a dome, soft round corners), the doors (panel,
 * glass, lattice, slatted, a round window, one door, a chest of drawers), the base (legs, plinth, bun feet), iron
 * bands and a narrow body. Drawn through the same named parts as the plain cupboard, so a style's part hook still
 * replaces one of them.
 */
import { type Canvas, canvas, put, toSprite } from '../../draw/canvas';
import { crest, crestHeight, leg, motifAt, panel, trim } from '../../draw/parts';
import { INK, box, ellipsePixels, hline, vline } from '../../draw/shapes';
import { inArch, inEllipse, solid } from '../../draw/solid';
import type { PieceArt } from '../../../housing/house-art';
import type { Area, Style } from '../style';
import type { CupboardShape } from '../variants';
import { part } from './kit';

const W = 30;
const H = 36;

/** One door's front of the given kind, in its area. */
function door(
  c: Canvas,
  style: Style,
  kind: NonNullable<CupboardShape['doors']>,
  a: Area,
  knob: 'left' | 'right' | 'centre',
  arch: boolean,
): void {
  const glass = kind === 'glass' || kind === 'lattice';
  panel(c, a.x, a.y, a.w, a.h, style.wood, {
    knob,
    metal: style.metal,
    arch,
    ...(glass ? { field: style.glass } : {}),
  });
  const ix = a.x + 2;
  const iy = a.y + 2;
  const iw = a.w - 4;
  const ih = a.h - 4;
  if (kind === 'glass') {
    hline(c, ix, iy + Math.floor(ih / 2), iw, style.wood.dark);
    put(c, ix + 1, iy + 1, style.glass.hi ?? style.glass.light);
  } else if (kind === 'lattice') {
    for (let y = iy + 1; y < iy + ih - 1; y++) {
      for (let x = ix + 1; x < ix + iw - 1; x++) {
        if ((x - ix) % 3 === 0 || (y - iy) % 3 === 0) put(c, x, y, style.wood.dark);
      }
    }
  } else if (kind === 'slatted') {
    for (let y = iy + 1; y < iy + ih - 1; y += 2) hline(c, ix + 1, y, iw - 2, style.wood.dark);
  } else if (kind === 'round') {
    const d = Math.min(iw, 8);
    const ex = a.x + Math.floor((a.w - d) / 2);
    const ey = a.y + 2;
    solid(c, { x: ex, y: ey, w: d, h: d }, inEllipse(ex, ey, d, d), style.glass, { shade: 'tl' });
    put(c, ex + 2, ey + 2, style.glass.hi ?? style.glass.light);
  } else if (kind === 'panel' || kind === 'single') {
    const mh = Math.min(8, a.h - 4);
    motifAt(c, a.x + 2, a.y + 2, a.w - 4, mh, style.motif, style.accent);
  }
}

/** The cupboard drawn with its variants. */
export function shapedCupboard(style: Style, shape: CupboardShape): PieceArt {
  const c = canvas(W, H);
  const top = shape.top ?? 'crest';
  const doors = shape.doors ?? 'panel';
  const base = shape.base ?? 'legs';
  const inset = shape.narrow === true ? 4 : 0;
  const x0 = inset;
  const fw = W - 2 * inset;
  const crestTop = Math.max(4, crestHeight(style.top, fw) + 1);
  // where the body starts and the doors start, by the top's kind
  const bodyTop = top === 'crest' ? crestTop + 3 : top === 'cornice' ? 6 : top === 'domed' ? 13 : 2;
  const doorTop =
    top === 'arched' ? 11 : top === 'rounded' ? 6 : top === 'domed' ? 16 : bodyTop + 2;
  const plinthTop = 29;

  part(c, style, 'cupboard', 'feet', { x: x0, y: 31, w: fw, h: 5 }, ({ c, style, at }) => {
    if (base === 'legs') {
      leg(c, at.x + 2, at.y, at.h, style.leg, style.wood, { side: 'left' });
      leg(c, at.x + at.w - 7, at.y, at.h, style.leg, style.wood, { side: 'right' });
    } else if (base === 'bun') {
      for (const bx of [at.x + 2, at.x + at.w - 8]) {
        solid(c, { x: bx, y: at.y + 1, w: 6, h: 4 }, inEllipse(bx, at.y - 1, 6, 6), style.wood, {
          shade: 'tl',
        });
      }
    }
  });
  const body: Area = { x: x0 + 1, y: bodyTop, w: fw - 2, h: 32 - bodyTop };
  part(c, style, 'cupboard', 'carcass', body, ({ c, style, at }) => {
    if (top === 'arched') {
      solid(c, at, inArch(at.x, at.y, at.w, at.y + at.h - 1, 9), style.wood, { shade: 'cols' });
    } else {
      box(c, at.x, at.y, at.w, at.h, style.wood, {
        shade: 'cols',
        edge: 2,
        round: top === 'rounded' ? 4 : 0,
      });
    }
  });
  const bottom = doors === 'drawers' ? 29 : 25;
  const doorArea: Area = { x: x0 + 4, y: doorTop, w: fw - 8, h: bottom - doorTop - 1 };
  part(c, style, 'cupboard', 'doors', doorArea, ({ c, style, at }) => {
    if (doors === 'drawers') {
      const n = Math.max(2, Math.round(at.h / 5));
      const dh = Math.floor((at.h + 1) / n);
      for (let i = 0; i < n; i++) {
        const y = at.y + i * dh;
        box(c, at.x - 1, y, at.w + 2, dh, style.wood, { shade: 'tl' });
        const mx = at.x + Math.floor(at.w / 2);
        put(c, mx - 1, y + Math.floor(dh / 2), style.metal.hi ?? style.metal.light);
        put(c, mx, y + Math.floor(dh / 2), style.metal.dark);
      }
      return;
    }
    box(c, at.x - 1, at.y - 1, at.w + 2, at.h + 2, style.wood, { shade: 'flat' });
    const arch = top === 'arched' || top === 'domed';
    if (doors === 'single') {
      door(c, style, doors, at, 'right', arch);
      return;
    }
    const dw = Math.floor(at.w / 2);
    door(c, style, doors, { x: at.x, y: at.y, w: dw, h: at.h }, 'right', arch);
    door(c, style, doors, { x: at.x + dw, y: at.y, w: at.w - dw, h: at.h }, 'left', arch);
    vline(c, at.x + dw - 1, at.y, at.h, INK);
  });
  if (shape.bands === true) {
    for (const y of [doorTop + 2, bottom - 4]) {
      hline(c, body.x + 1, y, body.w - 2, style.metal.light);
      hline(c, body.x + 1, y + 1, body.w - 2, style.metal.dark);
      for (let x = body.x + 2; x < body.x + body.w - 2; x += 4)
        put(c, x, y, style.metal.hi ?? style.metal.light);
      put(c, body.x, y, INK);
      put(c, body.x + body.w - 1, y + 1, INK);
    }
  }
  if (doors !== 'drawers') {
    part(
      c,
      style,
      'cupboard',
      'drawer',
      { x: x0 + 3, y: 25, w: fw - 6, h: 4 },
      ({ c, style, at }) => {
        box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'tl' });
        const mx = at.x + Math.floor(at.w / 2);
        put(c, mx, at.y + 1, style.metal.hi ?? style.metal.light);
        put(c, mx - 1, at.y + 1, style.metal.light);
      },
    );
  }
  const plinthH = base === 'plinth' ? H - plinthTop : 3;
  part(
    c,
    style,
    'cupboard',
    'plinth',
    { x: x0, y: plinthTop, w: fw, h: plinthH },
    ({ c, style, at }) => {
      box(c, at.x, at.y, at.w, at.h, style.wood, { shade: 'rows' });
      if (at.h > 4)
        trim(
          c,
          at.x + 1,
          at.y + 2,
          at.w - 2,
          style.trim === 'scallop' ? 'bead' : style.trim,
          style.wood,
          style.accent,
        );
    },
  );
  part(
    c,
    style,
    'cupboard',
    'crown',
    { x: x0, y: bodyTop - 3, w: fw, h: 4 },
    ({ c, style, at }) => {
      if (top === 'crest') {
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
      } else if (top === 'cornice') {
        // a deep moulding that overhangs the body: a cap, the trim, a step back
        box(c, at.x, 1, at.w, 4, style.wood, { shade: 'rows' });
        if (style.trim !== 'scallop')
          trim(c, at.x + 1, 2, at.w - 2, style.trim, style.wood, style.accent);
        box(c, at.x + 1, 4, at.w - 2, 3, style.wood, { shade: 'rows' });
      } else if (top === 'domed') {
        // a dome on a crown band, with a knob
        const dw = at.w - 8;
        const dx = at.x + 4;
        const dome = inEllipse(dx, 2, dw, 20);
        solid(c, { x: dx, y: 2, w: dw, h: 10 }, (x, y) => dome(x, y) && y < 12, style.wood, {
          shade: 'cols',
        });
        for (const p of ellipsePixels(dx + 3, 5, dw - 6, 14)) {
          if (p.y < 11 && (p.x - dx) % 4 === 1) put(c, p.x, p.y, style.wood.light);
        }
        box(c, at.x + 1, 11, at.w - 2, 3, style.wood, { shade: 'rows' });
        const mx = at.x + Math.floor(at.w / 2);
        put(c, mx - 1, 1, style.accent.light);
        put(c, mx, 1, style.accent.mid);
        hline(c, mx - 1, 0, 2, INK);
        put(c, mx - 2, 1, INK);
        put(c, mx + 1, 1, INK);
      } else if (top === 'arched' || top === 'rounded') {
        // the motif at the top of the body, over the doors
        const mx = at.x + 3;
        motifAt(
          c,
          mx,
          top === 'arched' ? 4 : 2,
          at.w - 6,
          doorTop - (top === 'arched' ? 5 : 3),
          style.motif,
          style.accent,
        );
      }
    },
  );
  return { sprite: toSprite(c, style.palette) };
}
