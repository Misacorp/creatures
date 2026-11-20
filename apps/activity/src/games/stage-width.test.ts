import { describe, expect, it } from 'vitest';
import { stageWidth } from './GamesShow';

describe('stageWidth: the arena in a stage that fills its room', () => {
  it('is a whole multiple of the 192 px scene when the room allows more than today’s', () => {
    expect(stageWidth(1500, 800)).toBe(192 * 4);
    expect(stageWidth(1920, 910)).toBe(192 * 5);
    expect(stageWidth(1700, 900)).toBe(192 * 5);
  });

  it('is limited by the height: the rows under the arena keep their room', () => {
    // 640 px high leaves 550 for the 160 rows of arena: 3x; the replay's controls take 50 more.
    expect(stageWidth(1700, 640)).toBe(192 * 3);
    expect(stageWidth(1920, 910, true)).toBe(192 * 4);
  });

  it('never goes under the width-filling size of today (at most 576 px)', () => {
    expect(stageWidth(390, 600)).toBe(390);
    expect(stageWidth(700, 400)).toBe(576);
    expect(stageWidth(300, 300)).toBe(300);
  });
});
