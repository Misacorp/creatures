import { describe, expect, it } from 'vitest';
import {
  RULES,
  ROOM_SPOT_IDS,
  isNightHour,
  isRoomSpotId,
  roomPhase,
  type RoomPhase,
} from '../src/index';

describe('roomPhase', () => {
  it('is night exactly when isNightHour says so, for every hour', () => {
    for (let h = 0; h < 24; h++) expect(roomPhase(h) === 'night', String(h)).toBe(isNightHour(h));
  });

  it('gives the expected phase for every hour of the day', () => {
    const expected: RoomPhase[] = [
      ...Array<RoomPhase>(6).fill('night'), // 0-5
      'twilight', // 6
      'twilight', // 7
      ...Array<RoomPhase>(10).fill('day'), // 8-17
      'twilight', // 18
      'twilight', // 19
      ...Array<RoomPhase>(4).fill('night'), // 20-23
    ];
    expect(expected).toHaveLength(24);
    for (let h = 0; h < 24; h++) expect(roomPhase(h), String(h)).toBe(expected[h]);
  });

  it('puts twilight right outside the night window', () => {
    const { fromHour, toHour } = RULES.expeditions.night;
    const span = RULES.room.twilightHours;
    expect(roomPhase(toHour)).toBe('twilight');
    expect(roomPhase(toHour + span - 1)).toBe('twilight');
    expect(roomPhase(toHour + span)).toBe('day');
    expect(roomPhase(fromHour - span)).toBe('twilight');
    expect(roomPhase(fromHour - span - 1)).toBe('day');
    expect(roomPhase(fromHour - 1)).toBe('twilight');
  });
});

describe('ROOM_SPOT_IDS', () => {
  it('lists 16 distinct kebab-case ids', () => {
    expect(ROOM_SPOT_IDS).toHaveLength(16);
    expect(new Set(ROOM_SPOT_IDS).size).toBe(16);
    for (const id of ROOM_SPOT_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('starts at the window and ends at the beanbag', () => {
    expect(ROOM_SPOT_IDS[0]).toBe('window-sill');
    expect(ROOM_SPOT_IDS[15]).toBe('shelf-beanbag');
  });
});

describe('isRoomSpotId', () => {
  it('accepts every spot id', () => {
    for (const id of ROOM_SPOT_IDS) expect(isRoomSpotId(id)).toBe(true);
  });

  it('rejects other values, including non-strings and look-alikes', () => {
    for (const value of [
      '',
      'couch',
      'Couch-Left',
      ' couch-left',
      'couch-left ',
      'constructor',
      '__proto__',
      'toString',
      null,
      undefined,
      0,
      1,
      true,
      {},
      ['couch-left'],
    ]) {
      expect(isRoomSpotId(value), JSON.stringify(value) ?? 'undefined').toBe(false);
    }
  });
});
