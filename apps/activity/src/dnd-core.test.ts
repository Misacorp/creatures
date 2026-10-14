import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  IDLE,
  TOUCH_HOLD_MS,
  autoScrollSpeed,
  contains,
  hitTest,
  holdMove,
  move,
  nextIndex,
  pageScrollSpeed,
  verticalNeighbour,
  press,
  type DragPhase,
  type Rect,
} from './dnd-core';

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe('hitTest', () => {
  const targets = [
    { id: 'a', rect: rect(0, 0, 80, 80) },
    { id: 'b', rect: rect(90, 0, 170, 80) },
  ];

  it('finds the target under the pointer', () => {
    expect(hitTest(targets, { x: 10, y: 10 })).toBe('a');
    expect(hitTest(targets, { x: 120, y: 40 })).toBe('b');
  });

  it('returns null off every target, including in the gap without slop', () => {
    expect(hitTest(targets, { x: 85, y: 40 })).toBeNull();
    expect(hitTest(targets, { x: 500, y: 500 })).toBeNull();
    expect(hitTest([], { x: 0, y: 0 })).toBeNull();
  });

  it('counts the gap when slop is given, picking the nearer centre', () => {
    expect(hitTest(targets, { x: 83, y: 40 }, 6)).toBe('a');
    expect(hitTest(targets, { x: 88, y: 40 }, 6)).toBe('b');
  });

  it('includes the edges', () => {
    expect(contains(rect(0, 0, 10, 10), { x: 10, y: 10 })).toBe(true);
    expect(contains(rect(0, 0, 10, 10), { x: 10.1, y: 10 })).toBe(false);
  });
});

describe('autoScrollSpeed', () => {
  it('is zero in the middle of the strip', () => {
    expect(autoScrollSpeed(200, 0, 400, 50, 10)).toBe(0);
    expect(autoScrollSpeed(50, 0, 400, 50, 10)).toBe(0);
    expect(autoScrollSpeed(350, 0, 400, 50, 10)).toBe(0);
  });

  it('scrolls back near the start and forward near the end', () => {
    expect(autoScrollSpeed(25, 0, 400, 50, 10)).toBe(-5);
    expect(autoScrollSpeed(375, 0, 400, 50, 10)).toBe(5);
  });

  it('speeds up toward the edge and caps at the maximum, also past the strip', () => {
    expect(autoScrollSpeed(0, 0, 400, 50, 10)).toBe(-10);
    expect(autoScrollSpeed(-100, 0, 400, 50, 10)).toBe(-10);
    expect(autoScrollSpeed(400, 0, 400, 50, 10)).toBe(10);
    expect(autoScrollSpeed(900, 0, 400, 50, 10)).toBe(10);
    expect(Math.abs(autoScrollSpeed(10, 0, 400, 50, 10))).toBeGreaterThan(
      Math.abs(autoScrollSpeed(40, 0, 400, 50, 10)),
    );
  });

  it('works for a strip that does not start at zero', () => {
    expect(autoScrollSpeed(110, 100, 500, 50, 10)).toBeCloseTo(-8);
    expect(autoScrollSpeed(480, 100, 500, 50, 10)).toBeCloseTo(6);
  });

  it('keeps the two edge zones apart on a tiny strip, and ignores empty strips', () => {
    // Zone shrinks to half the size, so the exact middle is still still.
    expect(autoScrollSpeed(50, 0, 100, 80, 10)).toBe(0);
    expect(autoScrollSpeed(0, 0, 0, 50, 10)).toBe(0);
    expect(autoScrollSpeed(5, 0, 100, 0, 10)).toBe(0);
  });
});

describe('drag phases', () => {
  const start = { x: 100, y: 100 };

  it('stays a press until the pointer travels the threshold', () => {
    const pressed: DragPhase<string, number> = press('c1', start);
    const small = move(pressed, { x: 100 + DRAG_THRESHOLD - 1, y: 100 }, 1);
    expect(small.phase).toBe('pending');
    expect(small).toBe(pressed);
  });

  it('lifts once the threshold is passed, in any direction', () => {
    const pressed: DragPhase<string, number> = press('c1', start);
    const lifted = move(pressed, { x: 100, y: 100 - DRAG_THRESHOLD }, 4);
    expect(lifted).toEqual({
      phase: 'dragging',
      source: 'c1',
      start,
      at: { x: 100, y: 92 },
      over: 4,
    });
  });

  it('measures diagonal travel as a distance', () => {
    const pressed: DragPhase<string, number> = press('c1', start);
    expect(move(pressed, { x: 106, y: 106 }, null).phase).toBe('dragging');
    expect(move(pressed, { x: 105, y: 105 }, null).phase).toBe('pending');
  });

  it('follows the pointer once dragging, and keeps what is under it', () => {
    let state: DragPhase<string, number> = press('c1', start);
    state = move(state, { x: 140, y: 100 }, 2);
    state = move(state, { x: 10, y: 10 }, null);
    expect(state).toMatchObject({ phase: 'dragging', at: { x: 10, y: 10 }, over: null });
    // Coming back near the start does not drop back to a press.
    state = move(state, { x: 101, y: 100 }, 1);
    expect(state.phase).toBe('dragging');
  });

  it('ignores moves when idle', () => {
    expect(move(IDLE as DragPhase<string, number>, { x: 5, y: 5 }, 1)).toBe(IDLE);
  });
});

describe('nextIndex', () => {
  it('steps by one and stops at the ends', () => {
    expect(nextIndex(2, 'ArrowRight', 5)).toBe(3);
    expect(nextIndex(2, 'ArrowLeft', 5)).toBe(1);
    expect(nextIndex(4, 'ArrowRight', 5)).toBe(4);
    expect(nextIndex(0, 'ArrowLeft', 5)).toBe(0);
  });

  it('jumps with Home and End', () => {
    expect(nextIndex(2, 'Home', 5)).toBe(0);
    expect(nextIndex(2, 'End', 5)).toBe(4);
  });

  it('ignores other keys and empty rows', () => {
    expect(nextIndex(2, 'a', 5)).toBeNull();
    expect(nextIndex(2, 'Enter', 5)).toBeNull();
    expect(nextIndex(0, 'ArrowRight', 0)).toBeNull();
  });
});

// The zones are rows now: a zone's slots wrap onto several lines, one zone under the other.
describe('slots laid out as rows', () => {
  // Front zone: two slots on one line; middle zone: three slots wrapped onto two lines.
  const slots = [
    { id: 0, rect: rect(50, 0, 106, 80) },
    { id: 1, rect: rect(110, 0, 166, 80) },
    { id: 2, rect: rect(50, 90, 106, 170) },
    { id: 3, rect: rect(110, 90, 166, 170) },
    { id: 4, rect: rect(170, 90, 226, 170) },
    { id: 5, rect: rect(80, 180, 136, 260) },
  ];

  it('finds the slot under the pointer in any row, and counts the gaps between rows with slop', () => {
    expect(hitTest(slots, { x: 140, y: 120 })).toBe(3);
    expect(hitTest(slots, { x: 100, y: 220 })).toBe(5);
    expect(hitTest(slots, { x: 80, y: 85 })).toBeNull();
    expect(hitTest(slots, { x: 80, y: 85 }, 6)).toBe(0);
    expect(hitTest(slots, { x: 80, y: 87 }, 6)).toBe(2);
  });

  it('moves up and down to the nearest slot of the next line', () => {
    expect(verticalNeighbour(slots, 0, 'down')).toBe(2);
    expect(verticalNeighbour(slots, 1, 'down')).toBe(3);
    expect(verticalNeighbour(slots, 4, 'down')).toBe(5);
    expect(verticalNeighbour(slots, 3, 'down')).toBe(5);
    expect(verticalNeighbour(slots, 5, 'up')).toBe(2);
    expect(verticalNeighbour(slots, 4, 'up')).toBe(1);
    expect(verticalNeighbour(slots, 2, 'up')).toBe(0);
  });

  it('stops at the first and last line', () => {
    expect(verticalNeighbour(slots, 0, 'up')).toBeNull();
    expect(verticalNeighbour(slots, 5, 'down')).toBeNull();
    expect(verticalNeighbour(slots, 99, 'down')).toBeNull();
    expect(verticalNeighbour([], 0, 'down')).toBeNull();
  });

  it('does not move sideways in a line', () => {
    const line = [
      { id: 'a', rect: rect(0, 0, 50, 50) },
      { id: 'b', rect: rect(60, 0, 110, 50) },
    ];
    expect(verticalNeighbour(line, 'a', 'down')).toBeNull();
    expect(verticalNeighbour(line, 'b', 'up')).toBeNull();
  });
});

describe('pageScrollSpeed', () => {
  it('scrolls up near the top of the window, down near the bottom, and not in between', () => {
    expect(pageScrollSpeed(0, 700)).toBeLessThan(0);
    expect(pageScrollSpeed(10, 700)).toBeLessThan(0);
    expect(pageScrollSpeed(350, 700)).toBe(0);
    expect(pageScrollSpeed(690, 700)).toBeGreaterThan(0);
  });

  it('is faster nearer the edge and capped', () => {
    expect(Math.abs(pageScrollSpeed(5, 700))).toBeGreaterThan(Math.abs(pageScrollSpeed(40, 700)));
    expect(pageScrollSpeed(-100, 700)).toBe(-16);
    expect(pageScrollSpeed(900, 700)).toBe(16);
  });
});

describe('holdMove: a finger that has not been held long enough yet', () => {
  it('keeps waiting through a small wobble', () => {
    expect(holdMove({ x: 100, y: 100 }, { x: 103, y: 104 })).toBe('wait');
    expect(holdMove({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe('wait');
  });

  it('calls a real move a swipe, which scrolls instead of picking the creature up', () => {
    expect(holdMove({ x: 100, y: 100 }, { x: 100 + DRAG_THRESHOLD, y: 100 })).toBe('swipe');
    expect(holdMove({ x: 100, y: 100 }, { x: 60, y: 110 })).toBe('swipe');
  });

  it('asks for a short hold: long enough for a swipe to show itself, short enough to feel quick', () => {
    expect(TOUCH_HOLD_MS).toBeGreaterThanOrEqual(150);
    expect(TOUCH_HOLD_MS).toBeLessThanOrEqual(400);
  });
});
