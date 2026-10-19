import { describe, expect, it } from 'vitest';
import { ROW, emptySlotLabel } from './use-single-row-board';

describe('the single row of the board', () => {
  it('is three places, left to right', () => {
    expect(ROW.zone).toBe('front');
    expect(ROW.slots).toEqual([0, 1, 2]);
  });

  it('names an empty place by where it is, for the dungeon team and the camp alike', () => {
    expect(emptySlotLabel(0)).toBe('Left slot, empty');
    expect(emptySlotLabel(1)).toBe('Middle slot, empty');
    expect(emptySlotLabel(2)).toBe('Right slot, empty');
  });

  it('adds what a tap does when there is something to do', () => {
    expect(emptySlotLabel(1, 'Choose a creature.')).toBe('Middle slot, empty. Choose a creature.');
  });
});
