/**
 * Picking up a creature in the Paddock's scene and putting it down (display only: positions live in the page and
 * are saved nowhere). Pure parts: where a drop lands (clamped inside the meadow) and whether a press has become
 * a drag. A press that moves less than `DRAG_THRESHOLD` stays a tap and opens the popover. There is no long press:
 * that is kept for selecting elsewhere in the app.
 */
import { DRAG_THRESHOLD, isDrag } from '../ui/use-drag-scroll';
import type { Rect } from './valley-art';

export { DRAG_THRESHOLD };

/** Where a press started: the pointer (CSS px) and how far the creature's corner was from it (scene pixels). */
export interface Grab {
  id: number;
  px: number;
  py: number;
  /** Scene pixels from the pointer to the creature's top-left corner, so it does not jump to the cursor. */
  dx: number;
  dy: number;
}

/** True once a press that went down at `grab` has moved far enough to be a drag, not a tap. */
export function pastThreshold(grab: Pick<Grab, 'px' | 'py'>, x: number, y: number): boolean {
  return isDrag({ x: grab.px, y: grab.py }, x, y);
}

/** A creature's corner kept inside the meadow (whole pixels; the last pixel row and column count as inside). */
export function clampToArea(area: Rect, x: number, y: number): { x: number; y: number } {
  const clamp = (v: number, from: number, size: number): number =>
    Math.min(from + Math.max(1, size) - 1, Math.max(from, Math.round(v)));
  return { x: clamp(x, area.x, area.width), y: clamp(y, area.y, area.height) };
}

/**
 * Where a creature let go with the pointer at (`clientX`, `clientY`) lands: the pointer in scene pixels
 * (`box` is the scene's on-screen box, `scale` its CSS px per scene pixel), plus the grab offset, clamped.
 */
export function dropPoint(
  grab: Pick<Grab, 'dx' | 'dy'>,
  clientX: number,
  clientY: number,
  box: { left: number; top: number },
  scale: number,
  area: Rect,
): { x: number; y: number } {
  const s = scale > 0 ? scale : 1;
  return clampToArea(area, (clientX - box.left) / s + grab.dx, (clientY - box.top) / s + grab.dy);
}
