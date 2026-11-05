import { describe, expect, it } from 'vitest';
import { clampToArea, dropPoint, pastThreshold, DRAG_THRESHOLD } from './creature-drag';

const AREA = { x: 10, y: 20, width: 100, height: 50 };

describe('clampToArea', () => {
  it('keeps a point inside the meadow, last pixel included', () => {
    expect(clampToArea(AREA, 50, 30)).toEqual({ x: 50, y: 30 });
    expect(clampToArea(AREA, -5, 999)).toEqual({ x: 10, y: 69 });
    expect(clampToArea(AREA, 500, -50)).toEqual({ x: 109, y: 20 });
  });
  it('rounds to whole pixels and survives an empty meadow', () => {
    expect(clampToArea(AREA, 50.6, 30.4)).toEqual({ x: 51, y: 30 });
    expect(clampToArea({ x: 3, y: 4, width: 0, height: 0 }, 9, 9)).toEqual({ x: 3, y: 4 });
  });
});

describe('dropPoint', () => {
  const box = { left: 100, top: 200 };
  it('turns the pointer into scene pixels and keeps the grab offset', () => {
    // Pointer at (160, 260) on a 3x scene whose box starts at (100, 200): scene (20, 20), plus a (-4, 6) grab.
    expect(dropPoint({ dx: -4, dy: 6 }, 160, 260, box, 3, AREA)).toEqual({ x: 16, y: 26 });
  });
  it('clamps a drop outside the meadow', () => {
    expect(dropPoint({ dx: 0, dy: 0 }, 5000, 5000, box, 3, AREA)).toEqual({ x: 109, y: 69 });
    expect(dropPoint({ dx: 0, dy: 0 }, 0, 0, box, 3, AREA)).toEqual({ x: 10, y: 20 });
  });
  it('a zero scale does not divide by zero', () => {
    expect(Number.isFinite(dropPoint({ dx: 0, dy: 0 }, 150, 250, box, 0, AREA).x)).toBe(true);
  });
});

describe('pastThreshold', () => {
  const grab = { px: 50, py: 50 };
  it('a press that barely moves stays a tap', () => {
    expect(pastThreshold(grab, 50, 50)).toBe(false);
    expect(pastThreshold(grab, 50 + DRAG_THRESHOLD, 50 - DRAG_THRESHOLD)).toBe(false);
  });
  it('past the threshold in either direction is a drag', () => {
    expect(pastThreshold(grab, 50 + DRAG_THRESHOLD + 1, 50)).toBe(true);
    expect(pastThreshold(grab, 50, 50 - DRAG_THRESHOLD - 1)).toBe(true);
  });
});
