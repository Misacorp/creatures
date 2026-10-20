import { describe, expect, it } from 'vitest';
import type { Creature, RoomResident } from './api';
import type { GearItem } from './gear-types';
import {
  LOUNGE_REFRESH_MS,
  ROOM_CHUNK,
  ROOM_POLL_MS,
  ROOM_STALE_MS,
  chunk,
  dropAbsent,
  idsToFetch,
  isStale,
  loungeEarning,
  mergeResidents,
  nextPollDelay,
  onVisibleAction,
  othersOf,
  ownResident,
  roomResidents,
  settleClaim,
  shouldPoll,
  type Resident,
  shouldOpenSocket,
} from './room-data';

const resident = (userId: string, name = userId): Resident => ({
  userId,
  name,
  creature: null,
  spot: null,
});

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
      { userId: '2', name: 'new', creature: null, spot: null },
      { userId: '3', name: 'Cy', creature: null, spot: null },
      { userId: '9', name: 'Gone', creature: null, spot: null },
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
    caughtAt: 1_000,
    quirk: 'hums-quietly',
    stats: { hp: 1, atk: 1, spd: 1 },
    statsWithGear: { hp: 1, atk: 1, spd: 1 },
    dodgeBp: 0,
    gear: [],
    busy: null,
    exp: 0,
    expNeeded: 27,
    waiting: false,
    ribbons: 0,
    nextUnlock: { level: 7, name: 'Scarf' },
    ribbon: null,
    treatCost: 4,
    ability: null,
    explorer: { rank: 3, xp: 10, nextRankXp: null, trips: 2 },
    lineSlot: 1,
    talents: { slots: [], signature: null, book: [] },
    ...over,
  };
}

describe('ownResident', () => {
  const state = {
    creatures: [creature({ id: 'c1' }), creature({ id: 'c2', nickname: null, shiny: false })],
    loungerId: 'c2',
    loungeSpot: null,
  };

  it('builds the lounger from the state, with the Crafting level when known', () => {
    const own = ownResident(state, 'u1', 'Misa', new Map([['c2', 4]]));
    expect(own).toEqual({
      userId: 'u1',
      name: 'Misa',
      spot: null,
      creature: {
        id: 'c2',
        species: 'splashet',
        shiny: false,
        level: 12,
        nickname: null,
        quirk: 'hums-quietly',
        craftingLevel: 4,
        explorerRank: 3,
        gear: [],
      },
    });
  });

  it('shows the worn items, with the text of their lines once the gear view has loaded', () => {
    const worn = {
      id: 'g1',
      baseId: 'kelp-cap',
      slot: 'hat' as const,
      rarity: 'rare' as const,
      itemLevel: 2,
    };
    const wearing = { ...state, creatures: [creature({ id: 'c2', gear: [worn] })] };
    const before = ownResident(wearing, 'u1', 'Misa', new Map());
    expect(before.creature?.gear).toEqual([
      { baseId: 'kelp-cap', slot: 'hat', rarity: 'rare', itemLevel: 2 },
    ]);
    const items = [{ id: 'g1', lines: [{ text: 'Attack +4%' }] }] as unknown as GearItem[];
    const after = ownResident(wearing, 'u1', 'Misa', new Map(), items);
    expect(after.creature?.gear[0]?.lines).toEqual(['Attack +4%']);
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

describe('own spot', () => {
  const state = { creatures: [], loungerId: null };

  it('carries the chosen spot into the own resident', () => {
    const spot = { id: 'couch-left', at: 5 };
    expect(ownResident({ ...state, loungeSpot: spot }, 'u1', 'Misa', new Map()).spot).toEqual(spot);
    expect(ownResident({ ...state, loungeSpot: null }, 'u1', 'Misa', new Map()).spot).toBeNull();
  });
});

describe('settleClaim', () => {
  const mine = { id: 'couch-left', at: 10 };
  const old = { id: 'fire-pouf', at: 1 };

  it('puts the server answer in place of the optimistic claim', () => {
    expect(settleClaim(mine, mine, { id: 'couch-left', at: 11 })).toEqual({
      id: 'couch-left',
      at: 11,
    });
  });

  it('puts the old spot back after a failure', () => {
    expect(settleClaim(mine, mine, old)).toEqual(old);
    expect(settleClaim(mine, mine, null)).toBeNull();
  });

  it('leaves a newer move alone', () => {
    const newer = { id: 'table-stool', at: 20 };
    expect(settleClaim(newer, mine, old)).toEqual(newer);
    expect(settleClaim(null, mine, old)).toBeNull();
  });
});

describe('the slow poll rules', () => {
  it('polls every 45 s', () => {
    expect(ROOM_POLL_MS).toBe(45_000);
  });

  it('polls only with somebody else here and the page visible', () => {
    expect(shouldPoll(['1'], '1', false)).toBe(false);
    expect(shouldPoll([], '1', false)).toBe(false);
    expect(shouldPoll(['1', '1'], '1', false)).toBe(false);
    expect(shouldPoll(['1', '2'], '1', false)).toBe(true);
    expect(shouldPoll(['1', '2'], '1', true)).toBe(false);
  });

  it('waits one interval after the last attempt, never negative', () => {
    expect(nextPollDelay(null, 1000)).toBe(ROOM_POLL_MS);
    expect(nextPollDelay(1000, 1000)).toBe(ROOM_POLL_MS);
    expect(nextPollDelay(1000, 21_000)).toBe(25_000);
    expect(nextPollDelay(1000, 1000 + ROOM_POLL_MS)).toBe(0);
    expect(nextPollDelay(1000, 1_000_000)).toBe(0);
  });

  it('never waits longer than one interval (a clock that stepped back)', () => {
    expect(nextPollDelay(10_000, 1000)).toBe(ROOM_POLL_MS);
  });

  it('refreshes on becoming visible only when the data is over 45 s old', () => {
    expect(onVisibleAction(null, 100)).toBe('refresh');
    expect(onVisibleAction(1000, 1000 + ROOM_POLL_MS)).toBe('wait');
    expect(onVisibleAction(1000, 1000 + ROOM_POLL_MS + 1)).toBe('refresh');
  });

  it('keeps the tab-switch limit at a minute', () => {
    expect(isStale(1000, 1000 + ROOM_STALE_MS)).toBe(false);
    expect(isStale(1000, 1000 + ROOM_STALE_MS + 1)).toBe(true);
    expect(isStale(1000, 1000 + ROOM_POLL_MS + 1, ROOM_POLL_MS)).toBe(true);
  });
});

describe('shouldOpenSocket', () => {
  const on = { enabled: true, offered: true, hidden: false };

  it('opens only when offered, visible and somebody else is here', () => {
    expect(shouldOpenSocket(on, ['1', '2'], '1')).toBe(true);
    expect(shouldOpenSocket(on, ['1'], '1')).toBe(false);
    expect(shouldOpenSocket({ ...on, hidden: true }, ['1', '2'], '1')).toBe(false);
    expect(shouldOpenSocket({ ...on, offered: false }, ['1', '2'], '1')).toBe(false);
    expect(shouldOpenSocket({ ...on, enabled: false }, ['1', '2'], '1')).toBe(false);
  });
});

describe('loungeEarning', () => {
  const state = { loungerId: 'c1', loungeXp: { c1: 34 } };
  it('is true only while live, visible, with a lounger that is not Rested', () => {
    expect(loungeEarning(true, false, state)).toBe(true);
    expect(loungeEarning(false, false, state)).toBe(false);
    expect(loungeEarning(true, true, state)).toBe(false);
    expect(loungeEarning(true, false, { ...state, loungerId: null })).toBe(false);
    expect(loungeEarning(true, false, { loungerId: 'c1', loungeXp: { c1: 60 } })).toBe(false);
    // A lounger with nothing yet today earns.
    expect(loungeEarning(true, false, { loungerId: 'c1', loungeXp: {} })).toBe(true);
  });

  it('reloads every 4 minutes: 2 XP at the lounging rate', () => {
    expect(LOUNGE_REFRESH_MS).toBe(2 * 2 * 60_000);
  });
});
