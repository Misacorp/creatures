import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, dragScroll, isDrag } from './use-drag-scroll';

describe('dragging a scrolling box with a mouse', () => {
  const start = { x: 100, y: 50, left: 300, top: 0 };

  it('stays a click until the pointer moves past the threshold', () => {
    expect(isDrag(start, 100 + DRAG_THRESHOLD, 50)).toBe(false);
    expect(isDrag(start, 100, 50 - DRAG_THRESHOLD)).toBe(false);
    expect(isDrag(start, 100 + DRAG_THRESHOLD + 1, 50)).toBe(true);
    expect(isDrag(start, 100, 50 + DRAG_THRESHOLD + 1)).toBe(true);
  });

  it('moves the content with the pointer: dragging left scrolls right', () => {
    expect(dragScroll(start, 40, 50)).toEqual({ left: 360, top: 0 });
    expect(dragScroll(start, 160, 70)).toEqual({ left: 240, top: -20 });
  });
});
