import { describe, expect, it } from 'vitest';
import type { Creature, RoomResident } from './api';
import {
  ROOM_CHUNK,
  ROOM_STALE_MS,
  chunk,
  dropAbsent,
  idsToFetch,
  isStale,
  mergeResidents,
  othersOf,
  ownResident,
  roomResidents,
  type Resident,
} from './room-data';

const resident = (userId: string, name = userId): Resident => ({ userId, name, creature: null });

describe('chunk', () => {
  it('splits into pieces of at most the size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 25)).toEqual([]);
  });

  it('keeps 60 ids in three requests of 25, 25 and 10', () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(i));
    expect(chunk(ids, ROOM_CHUNK).map((c) => c.length)).toEqual([25, 25, 10]);
  });
});

describe('which ids to fetch', () => {
  it('leaves out the player, repeats and ids that are already known', () => {
    const known = new Map([['2', resident('2')]]);
    expect(idsToFetch(['1', '2', '3', '3', '4'], known, '1')).toEqual(['3', '4']);
  });

  it('leaves out ids a request is already on its way for', () => {
    expect(idsToFetch(['1', '2', '3'], new Map(), '1', new Set(['2']))).toEqual(['3']);
  });

  it('is empty when the player is alone', () => {
    expect(idsToFetch(['1'], new Map(), '1')).toEqual([]);
    expect(othersOf(['1', '2', '2'], '1')).toEqual(['2']);
  });
});

describe('keeping the known residents', () => {
  it('drops the ones who left, without asking anything', () => {
    const known = new Map([
      ['2', resident('2')],
      ['3', resident('3')],
    ]);
    expect([...dropAbsent(known, ['1', '3'])]).toEqual([['3', resident('3')]]);
  });

  it('merges an answer in, ignoring people who left meanwhile', () => {
    const known = new Map([['2', resident('2', 'old')]]);
    const answer: RoomResident[] = [
      { userId: '2', name: 'new', creature: null },
      { userId: '3', name: 'Cy', creature: null },
      { userId: '9', name: 'Gone', creature: null },
    ];
    const merged = mergeResidents(known, answer, ['1', '2', '3']);
    expect(merged.get('2')?.name).toBe('new');
    expect(merged.get('3')?.name).toBe('Cy');
    expect(merged.has('9')).toBe(false);
    // The old map is not changed.
    expect(known.get('2')?.name).toBe('old');
  });
});

describe('isStale', () => {
  it('is stale before the first fetch and after more than a minute', () => {
    expect(isStale(null, 1000)).toBe(true);
    expect(isStale(1000, 1000 + ROOM_STALE_MS)).toBe(false);
    expect(isStale(1000, 1000 + ROOM_STALE_MS + 1)).toBe(true);
    expect(isStale(1000, 5000)).toBe(false);
  });
});

function creature(over: Partial<Creature>): Creature {
  return {
    id: 'c1',
    species: 'splashet',
    line: 'splashet',
    level: 12,
    levelCap: 20,
    fusionCount: 0,
    shiny: true,
    nickname: 'Bubbles',
    away: false,
    quirk: 'hums-quietly',
    stats: { hp: 1, atk: 1, spd: 1 },
    statsWithGear: { hp: 1, atk: 1, spd: 1 },
    gear: null,
    busy: null,
    trainCost: null,
    ability: null,
    explorer: { rank: 3, xp: 10, nextRankXp: null, trips: 2 },
    ...over,
  };
}

describe('ownResident', () => {
  const state = {
    creatures: [creature({ id: 'c1' }), creature({ id: 'c2', nickname: null, shiny: false })],
    loungerId: 'c2',
  };

  it('builds the lounger from the state, with the Crafting level when known', () => {
    const own = ownResident(state, 'u1', 'Misa', new Map([['c2', 4]]));
    expect(own).toEqual({
      userId: 'u1',
      name: 'Misa',
      creature: {
        id: 'c2',
        species: 'splashet',
        shiny: false,
        level: 12,
        nickname: null,
        quirk: 'hums-quietly',
        craftingLevel: 4,
        explorerRank: 3,
      },
    });
  });

  it('leaves the Crafting level out until it is known', () => {
    expect(ownResident(state, 'u1', 'Misa', new Map()).creature?.craftingLevel).toBeNull();
  });

  it('follows a level-up of the lounger at once (no request)', () => {
    const trained = { ...state, creatures: [creature({ id: 'c2', level: 13 })] };
    expect(ownResident(trained, 'u1', 'Misa', new Map()).creature?.level).toBe(13);
  });

  it('has no creature when there is no lounger or it is not in the list', () => {
    expect(ownResident({ ...state, loungerId: null }, 'u1', 'Misa', new Map()).creature).toBeNull();
    expect(ownResident({ ...state, loungerId: 'zz' }, 'u1', 'Misa', new Map()).creature).toBeNull();
  });
});

describe('roomResidents', () => {
  it('lists the player, then the known others in the order present, skipping unknown ids', () => {
    const own = resident('1', 'Me');
    const known = new Map([
      ['3', resident('3')],
      ['2', resident('2')],
    ]);
    const list = roomResidents(['2', '1', '4', '3'], known, own);
    expect(list.map((r) => r.userId)).toEqual(['1', '2', '3']);
    expect(list[0]).toBe(own);
  });

  it('always has the player, even when present is empty', () => {
    expect(roomResidents([], new Map(), resident('1')).map((r) => r.userId)).toEqual(['1']);
  });
});
