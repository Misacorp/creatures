import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

/** How far (CSS px) a mouse must move with the button down before the press counts as a drag, not a click. */
export const DRAG_THRESHOLD = 4;

/** Where a drag started: the pointer and the scroll position at that moment. */
export interface DragStart {
  x: number;
  y: number;
  left: number;
  top: number;
}

/** True once the pointer has moved far enough from where it went down to be a drag. */
export function isDrag(start: Pick<DragStart, 'x' | 'y'>, x: number, y: number): boolean {
  return Math.abs(x - start.x) > DRAG_THRESHOLD || Math.abs(y - start.y) > DRAG_THRESHOLD;
}

/** The scroll position for a pointer at (x, y): the content follows the pointer, as a hand moves paper. */
export function dragScroll(start: DragStart, x: number, y: number): { left: number; top: number } {
  return { left: start.left - (x - start.x), top: start.top - (y - start.y) };
}

/**
 * Lets a mouse drag a scrolling box (the world map) the way a finger already does: press, move and the
 * content follows. A press that moves less than `DRAG_THRESHOLD` stays a click (a marker still opens); a
 * real drag swallows the click that ends it. Touch and pen keep the browser's own scrolling. The box gets
 * the `dragging` class while it is dragged (for the grabbing cursor).
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const box = ref.current;
    if (box === null || typeof box.addEventListener !== 'function') return;
    let start: (DragStart & { id: number }) | null = null;
    let dragging = false;

    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      start = {
        x: event.clientX,
        y: event.clientY,
        left: box.scrollLeft,
        top: box.scrollTop,
        id: event.pointerId,
      };
      dragging = false;
    };
    const onMove = (event: PointerEvent): void => {
      if (start === null || event.pointerId !== start.id) return;
      if (!dragging) {
        if (!isDrag(start, event.clientX, event.clientY)) return;
        dragging = true;
        box.classList.add('dragging');
        box.setPointerCapture(event.pointerId);
      }
      const to = dragScroll(start, event.clientX, event.clientY);
      box.scrollLeft = to.left;
      box.scrollTop = to.top;
      event.preventDefault();
    };
    const onUp = (event: PointerEvent): void => {
      if (start === null || event.pointerId !== start.id) return;
      start = null;
      box.classList.remove('dragging');
      // A drag released outside the box ends with no click on it: forget it once this event's click is past.
      if (dragging) {
        setTimeout(() => {
          dragging = false;
        }, 0);
      }
      if (box.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId);
    };
    // The click that ends a drag is not a pick; any later click is.
    const onClick = (event: MouseEvent): void => {
      if (!dragging) return;
      dragging = false;
      event.stopPropagation();
      event.preventDefault();
    };

    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
    box.addEventListener('click', onClick, true);
    return () => {
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('pointercancel', onUp);
      box.removeEventListener('click', onClick, true);
    };
  }, [ref]);
}
