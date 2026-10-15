import { ROOM_SPOT_IDS } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ROOM_SPOTS } from './sprites/room-art';

describe('room spot ids', () => {
  it('match the server list (ROOM_SPOT_IDS), in the same order', () => {
    expect(ROOM_SPOTS.map((spot) => spot.id)).toEqual([...ROOM_SPOT_IDS]);
  });
});
