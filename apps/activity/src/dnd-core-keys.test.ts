import { describe, expect, it } from 'vitest';
import { slotKeyTarget, type Rect } from './dnd-core';

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe('slotKeyTarget', () => {
  // The raid's zones: slots 0-2 on one line, 3-5 on the next, 6 alone on the last.
  const grid = [0, 1, 2, 3, 4, 5, 6].map((slot) => {
    const left = (slot % 3) * 60;
    const top = Math.floor(slot / 3) * 60;
    return { slot, rect: rect(left, top, left + 50, top + 50) };
  });
  // The dungeon's single row of three.
  const row = grid.slice(0, 3);

  it('steps left and right through the slots in order and stops at the ends', () => {
    expect(slotKeyTarget(grid, 2, 'ArrowRight', true)).toBe(3);
    expect(slotKeyTarget(grid, 3, 'ArrowLeft', true)).toBe(2);
    expect(slotKeyTarget(grid, 0, 'ArrowLeft', true)).toBe(0);
    expect(slotKeyTarget(grid, 6, 'ArrowRight', true)).toBe(6);
  });

  it('jumps to the first and last slot with Home and End', () => {
    expect(slotKeyTarget(grid, 4, 'Home', true)).toBe(0);
    expect(slotKeyTarget(grid, 4, 'End', true)).toBe(6);
  });

  it('goes to the line above or below when the strip wraps, and nowhere past the last line', () => {
    expect(slotKeyTarget(grid, 1, 'ArrowDown', true)).toBe(4);
    expect(slotKeyTarget(grid, 4, 'ArrowUp', true)).toBe(1);
    expect(slotKeyTarget(grid, 0, 'ArrowUp', true)).toBeNull();
    expect(slotKeyTarget(grid, 6, 'ArrowDown', true)).toBeNull();
  });

  it('reads up and down as before and after in a single row', () => {
    expect(slotKeyTarget(row, 0, 'ArrowDown', false)).toBe(1);
    expect(slotKeyTarget(row, 2, 'ArrowUp', false)).toBe(1);
    expect(slotKeyTarget(row, 2, 'ArrowDown', false)).toBe(2);
    expect(slotKeyTarget(row, 0, 'ArrowUp', false)).toBe(0);
    expect(slotKeyTarget(row, 1, 'ArrowRight', false)).toBe(2);
  });

  it('follows slot numbers, not the order the slots are listed in', () => {
    const shuffled = [row[2], row[0], row[1]] as typeof row;
    expect(slotKeyTarget(shuffled, 0, 'ArrowRight', false)).toBe(1);
    expect(slotKeyTarget(shuffled, 2, 'Home', false)).toBe(0);
  });

  it('ignores other keys and an empty strip', () => {
    expect(slotKeyTarget(grid, 1, 'a', true)).toBeNull();
    expect(slotKeyTarget(grid, 1, 'Tab', false)).toBeNull();
    expect(slotKeyTarget([], 0, 'ArrowRight', true)).toBeNull();
  });
});
