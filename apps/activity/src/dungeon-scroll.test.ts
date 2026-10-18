import { describe, expect, it } from 'vitest';
import { sampleState } from './dungeon-map-sample';
import { ROOM_FOCUS, mapFocusNode, mapScrollTop } from './dungeon-scroll';
import { undercroftState } from './dungeon-undercroft-sample';
import type { DungeonRunState } from './dungeon-types';

const VIEW = 800;
const base = { roomHeight: 46, viewportHeight: VIEW, maxScroll: 5000 };

describe('mapScrollTop', () => {
  it('leaves the page alone when the whole room is already in the top half', () => {
    expect(mapScrollTop({ ...base, roomTop: 100, scrollY: 600 })).toBeNull();
    expect(mapScrollTop({ ...base, roomTop: 0, scrollY: 600 })).toBeNull();
    // The centre exactly at the middle still counts.
    expect(mapScrollTop({ ...base, roomTop: VIEW / 2 - 23, scrollY: 600 })).toBeNull();
  });

  it('scrolls a room in the bottom half up so its centre is at 30% of the view', () => {
    const top = mapScrollTop({ ...base, roomTop: 700, scrollY: 1000 });
    // The room's centre is 723 px down the view; it should be 240 px down.
    expect(top).toBe(1000 + 723 - Math.round(VIEW * ROOM_FOCUS));
    expect(ROOM_FOCUS).toBeLessThan(0.5);
  });

  it('scrolls a room above the view (or cut by its top edge) down into the top half', () => {
    expect(mapScrollTop({ ...base, roomTop: -300, scrollY: 1000 })).toBe(1000 - 277 - 240);
    // Cut by the top edge counts as not in view.
    expect(mapScrollTop({ ...base, roomTop: -10, scrollY: 1000 })).toBe(1000 + 13 - 240);
  });

  it('lands the room in the top half whenever the page can scroll that far', () => {
    for (const roomTop of [-500, -50, 450, 790, 1500]) {
      const scrollY = 1200;
      const target = mapScrollTop({ ...base, roomTop, scrollY });
      expect(target).not.toBeNull();
      const centreAfter = roomTop + 23 - ((target ?? 0) - scrollY);
      expect(centreAfter).toBeLessThanOrEqual(VIEW / 2);
      expect(centreAfter).toBeGreaterThanOrEqual(23);
    }
  });

  it('never goes past either end of the page', () => {
    expect(mapScrollTop({ ...base, roomTop: -900, scrollY: 100 })).toBe(0);
    expect(mapScrollTop({ ...base, roomTop: 1200, scrollY: 100, maxScroll: 400 })).toBe(400);
    expect(mapScrollTop({ ...base, roomTop: 1200, scrollY: 0, maxScroll: -50 })).toBe(0);
  });

  it('gives whole pixels', () => {
    const top = mapScrollTop({ ...base, roomTop: 700.4, roomHeight: 45.5, scrollY: 1000.25 });
    expect(Number.isInteger(top)).toBe(true);
  });
});

describe('mapFocusNode', () => {
  it('is the room the run stands in', () => {
    const run = sampleState('midway') as DungeonRunState;
    expect(run.at).not.toBeNull();
    expect(mapFocusNode(run)).toBe(run.at);
    const deep = undercroftState('midway');
    expect(mapFocusNode(deep)).toBe('u1f1l0');
  });

  it('is nothing at the entrance of the day, so the top of the run is shown', () => {
    expect(mapFocusNode(sampleState('entrance') as DungeonRunState)).toBeNull();
  });

  it('is an entrance room of the Undercroft level a run is about to start', () => {
    const down = undercroftState('entrance');
    expect(down.at).toBeNull();
    expect(down.level).toBe(1);
    expect(mapFocusNode(down)).toMatch(/^u1f0l\d$/);
  });

  it('is nothing when the level has not been drawn', () => {
    const down = undercroftState('entrance');
    expect(mapFocusNode({ ...down, undercroft: null })).toBeNull();
  });
});
