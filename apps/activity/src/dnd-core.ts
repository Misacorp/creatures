/**
 * The generic, pure parts of pointer-based drag and drop: where a pointer is, when a press becomes a
 * drag, which target is under the pointer, and how fast to scroll near the edge of a strip. No DOM
 * access here, so all of it is unit-tested. The component that wires it to real pointer events is
 * `use-drag-drop.ts`.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Pixels the pointer must travel before a press turns into a drag (so taps stay taps). */
export const DRAG_THRESHOLD = 8;
/** How close to the edge of the strip (in pixels) auto-scroll starts. */
export const SCROLL_EDGE = 56;
/** Auto-scroll speed at the very edge, in pixels per frame. */
export const SCROLL_MAX_SPEED = 16;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function contains(rect: Rect, p: Point, slop = 0): boolean {
  return (
    p.x >= rect.left - slop &&
    p.x <= rect.right + slop &&
    p.y >= rect.top - slop &&
    p.y <= rect.bottom + slop
  );
}

/**
 * The target under the pointer. `slop` widens every rectangle a little so the gaps between slots
 * still count; when several rectangles match, the one whose centre is nearest wins. Null when the
 * pointer is over none of them.
 */
export function hitTest<T>(
  targets: readonly { id: T; rect: Rect }[],
  p: Point,
  slop = 0,
): T | null {
  let best: { id: T; d: number } | null = null;
  for (const target of targets) {
    if (!contains(target.rect, p, slop)) continue;
    const centre = {
      x: (target.rect.left + target.rect.right) / 2,
      y: (target.rect.top + target.rect.bottom) / 2,
    };
    const d = distance(centre, p);
    if (best === null || d < best.d) best = { id: target.id, d };
  }
  return best === null ? null : best.id;
}

/**
 * Signed scroll speed (pixels per frame) for a pointer at `pos` along a strip that spans
 * `start` to `end`: negative near the start edge, positive near the end edge, zero in the middle.
 * It grows linearly with how deep into the edge zone the pointer is and is capped at `maxSpeed`.
 */
export function autoScrollSpeed(
  pos: number,
  start: number,
  end: number,
  edge = SCROLL_EDGE,
  maxSpeed = SCROLL_MAX_SPEED,
): number {
  const size = end - start;
  if (size <= 0 || edge <= 0) return 0;
  // On a very short strip the two zones must not overlap.
  const zone = Math.min(edge, size / 2);
  const intoStart = start + zone - pos;
  if (intoStart > 0) return -Math.min(1, intoStart / zone) * maxSpeed;
  const intoEnd = pos - (end - zone);
  if (intoEnd > 0) return Math.min(1, intoEnd / zone) * maxSpeed;
  return 0;
}

/** The pointer's drag phase. `pending` is a press that has not moved far enough yet. */
export type DragPhase<S, T> =
  | { phase: 'idle' }
  | { phase: 'pending'; source: S; start: Point }
  | { phase: 'dragging'; source: S; start: Point; at: Point; over: T | null };

export const IDLE = { phase: 'idle' } as const;

export function press<S, T>(source: S, at: Point): DragPhase<S, T> {
  return { phase: 'pending', source, start: at };
}

/**
 * A pointer move. A pending press becomes a drag after `threshold` pixels; a drag follows the
 * pointer. `over` is whatever the caller hit-tested at the new position.
 */
export function move<S, T>(
  state: DragPhase<S, T>,
  at: Point,
  over: T | null,
  threshold = DRAG_THRESHOLD,
): DragPhase<S, T> {
  if (state.phase === 'idle') return state;
  if (state.phase === 'pending') {
    if (distance(state.start, at) < threshold) return state;
    return { phase: 'dragging', source: state.source, start: state.start, at, over };
  }
  return { ...state, at, over };
}

/**
 * The next index when moving a keyboard cursor over `count` slots. Left and right arrows step by one and stop
 * at the ends (no wrapping, so the ends are easy to find); Home and End jump. Null for other keys.
 */
export function nextIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const clamp = (n: number): number => Math.max(0, Math.min(last, n));
  switch (key) {
    case 'ArrowLeft':
      return clamp(current - 1);
    case 'ArrowRight':
      return clamp(current + 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}
