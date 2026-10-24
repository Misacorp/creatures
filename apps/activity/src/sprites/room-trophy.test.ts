import { describe, expect, it } from 'vitest';
import {
  CALENDAR_SPOT,
  ROOM_BAND_HEIGHT,
  ROOM_SIZE,
  ROOM_SPOTS,
  SPOT_SIZE,
  TROPHY_SPOT,
  roomScene,
  type RoomPhase,
} from './room-art';
import { spriteSize } from './sprite-data';

/** The Valley Games trophy shelf hangs on a free bit of wall, in every light. */
const PHASES: readonly RoomPhase[] = ['day', 'twilight', 'night'];

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('the trophy shelf', () => {
  it('has art of its spot size in every light', () => {
    for (const phase of PHASES) {
      expect(spriteSize(roomScene(phase).trophy), phase).toEqual({
        width: TROPHY_SPOT.width,
        height: TROPHY_SPOT.height,
      });
    }
  });

  it('hangs inside the room, below the title band, clear of the calendar and every creature', () => {
    expect(TROPHY_SPOT.y).toBeGreaterThanOrEqual(ROOM_BAND_HEIGHT);
    expect(TROPHY_SPOT.x + TROPHY_SPOT.width).toBeLessThanOrEqual(ROOM_SIZE.width);
    expect(TROPHY_SPOT.y + TROPHY_SPOT.height).toBeLessThanOrEqual(ROOM_SIZE.height);
    expect(overlaps(TROPHY_SPOT, CALENDAR_SPOT)).toBe(false);
    for (const spot of ROOM_SPOTS) {
      expect(overlaps(TROPHY_SPOT, { ...spot, ...SPOT_SIZE }), spot.id).toBe(false);
    }
  });
});
