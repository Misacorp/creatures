/**
 * Solid silhouettes (`docs/design/housing-workshop.md`): a shape given as a test of its pixels (an arch, a dome, a
 * shield, a point), drawn like `box` draws a rectangle: the ink edge on the shape's own outer pixels, a ramp inside,
 * light on the top and left, dark on the right and bottom. The form variants use it for every outline that is not a
 * rectangle, so a new silhouette is a few lines of geometry, never hand pixels.
 */
import type { Canvas } from './canvas';
import { put } from './canvas';
import { INK, type Ramp } from './shapes';

/** Whether a pixel is in a shape. */
export type Shape = (x: number, y: number) => boolean;

export interface SolidOptions {
  /** How the inside is shaded (as `box`): default `tl`. */
  shade?: 'tl' | 'rows' | 'cols' | 'flat';
  /** The edge key; `false` draws no edge (the shape's outer pixels get the ramp too). Default the ink. */
  ink?: string | false;
}

/** Draws every pixel of `area` that is in the shape: the outer ones in ink, the inside shaded by the ramp. */
export function solid(
  c: Canvas,
  area: { x: number; y: number; w: number; h: number },
  shape: Shape,
  ramp: Ramp,
  options: SolidOptions = {},
): void {
  const shade = options.shade ?? 'tl';
  const ink = options.ink === undefined ? INK : options.ink;
  const at = (x: number, y: number): boolean =>
    x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h && shape(x, y);
  const edge = (x: number, y: number): boolean =>
    !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      if (!at(x, y)) continue;
      if (ink !== false && edge(x, y)) {
        put(c, x, y, ink);
        continue;
      }
      // the inside: next to the edge on a side, the side's tone
      const inner = (dx: number, dy: number): boolean => {
        const nx = x + dx;
        const ny = y + dy;
        return ink === false ? !at(nx, ny) : !at(nx, ny) || edge(nx, ny);
      };
      let key = ramp.mid;
      const top = inner(0, -1);
      const bottom = inner(0, 1);
      const left = inner(-1, 0);
      const right = inner(1, 0);
      if (shade === 'tl') {
        if (bottom || right) key = ramp.dark;
        else if (top || left) key = ramp.light;
      } else if (shade === 'rows') {
        if (top) key = ramp.light;
        else if (bottom) key = ramp.dark;
      } else if (shade === 'cols') {
        if (left) key = ramp.light;
        else if (right) key = ramp.dark;
      }
      put(c, x, y, key);
    }
  }
}

/** The pixels of an ellipse that fits the box (a pixel is in when its centre is), as a shape. */
export function inEllipse(x: number, y: number, w: number, h: number): Shape {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (px, py) => {
    const nx = (px + 0.5 - cx) / (w / 2);
    const ny = (py + 0.5 - cy) / (h / 2);
    return nx * nx + ny * ny <= 1;
  };
}

/** A rectangle as a shape. */
export function inRect(x: number, y: number, w: number, h: number): Shape {
  return (px, py) => px >= x && py >= y && px < x + w && py < y + h;
}

/** Pixels in any of the shapes. */
export function union(...shapes: Shape[]): Shape {
  return (x, y) => shapes.some((s) => s(x, y));
}

/** Pixels in the first shape and not the second. */
export function minus(a: Shape, b: Shape): Shape {
  return (x, y) => a(x, y) && !b(x, y);
}

/** The pixels of a shape at least `inset` pixels inside it (4 neighbours, step by step). */
export function shrink(shape: Shape, inset: number): Shape {
  let s = shape;
  for (let i = 0; i < inset; i++) {
    const prev = s;
    s = (x, y) =>
      prev(x, y) && prev(x - 1, y) && prev(x + 1, y) && prev(x, y - 1) && prev(x, y + 1);
  }
  return s;
}

/**
 * A recessed field following a shape (a door's sunk panel): the shape shrunk by `inset`, its top and left edge dark,
 * its bottom and right edge light (a recess catches light on the far side), the inside left as it is or filled.
 */
export function recess(
  c: Canvas,
  area: { x: number; y: number; w: number; h: number },
  shape: Shape,
  ramp: Ramp,
  inset: number,
  fill?: Ramp,
): void {
  const inner = shrink(shape, inset);
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      if (!inner(x, y)) continue;
      const top = !inner(x, y - 1) || !inner(x - 1, y);
      const bottom = !inner(x, y + 1) || !inner(x + 1, y);
      if (top) put(c, x, y, ramp.dark);
      else if (bottom) put(c, x, y, ramp.light);
      else if (fill !== undefined) put(c, x, y, fill.mid);
    }
  }
}

/**
 * A board `w` wide whose top is an arch: straight sides from `top + rise` down to `bottom`, the top a half ellipse
 * `rise` rows high (the round top of a headboard, a door, a mirror).
 */
export function inArch(x: number, top: number, w: number, bottom: number, rise: number): Shape {
  const cap = inEllipse(x, top, w, rise * 2);
  return (px, py) =>
    px >= x && px < x + w && py >= top && py <= bottom && (py >= top + rise || cap(px, py));
}

/**
 * A board `w` wide whose top comes to a point (a gothic arch): one pixel narrower per row on each side over `rise`
 * rows, so the point is two pixels wide on an even board and one on an odd one.
 */
export function inPoint(x: number, top: number, w: number, bottom: number, rise: number): Shape {
  const mid = x + (w - 1) / 2;
  return (px, py) => {
    if (px < x || px >= x + w || py < top || py > bottom) return false;
    const r = py - top;
    if (r >= rise) return true;
    const half = ((w - 1) / 2) * ((r + 1) / (rise + 1)) + 0.5;
    return Math.abs(px - mid) <= half;
  };
}
