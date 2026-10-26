import { describe, expect, it } from 'vitest';
import type { RaidView, RowSlotView } from './raid-api';
import { applyBoardPush, parseBoardPush, type BoardPush } from './raid-board-live';

const mate = {
  ownerName: 'Mira',
  species: 'splashet',
  name: 'Splashet',
  level: 7,
  mine: false as const,
};

/** The part of a raid view a board push touches: a nine slot row, two members, a second party. */
function view(): RaidView {
  const zones = ['front', 'front', 'front', 'middle', 'middle', 'middle', 'back', 'back', 'back'];
  const row = zones.map((zone, slot) => ({ slot, zone, creature: null })) as RowSlotView[];
  row[1] = {
    slot: 1,
    zone: 'front',
    creature: {
      ownerName: 'You',
      species: 'cindle',
      name: 'Cindle',
      level: 5,
      mine: true,
      creatureId: 'c1',
    },
  };
  row[2] = { slot: 2, zone: 'front', creature: { ...mate, ownerName: 'Old' } };
  return {
    weekId: '2027-W02',
    roster: [
      { displayName: 'You', you: true, party: 1 },
      { displayName: 'Old', you: false, party: 1 },
      { displayName: 'Far', you: false, party: 2 },
    ],
    parties: [
      { party: 1, size: 2 },
      { party: 2, size: 1 },
    ],
    party: { party: 1, rowLength: 9, row },
  } as unknown as RaidView;
}

const wire = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1,
  type: 'raid',
  week: '2027-W02',
  party: 1,
  cells: [{ slot: 4, creature: mate }],
  ...extra,
});

describe('parseBoardPush', () => {
  it('reads what the server sends', () => {
    expect(parseBoardPush(wire())).toEqual({
      week: '2027-W02',
      party: 1,
      cells: [{ slot: 4, creature: mate }],
    });
    const full = parseBoardPush(
      wire({
        cells: [
          { slot: 4, creature: { ...mate, reach: { left: 1, right: 2 } } },
          { slot: 5, creature: null },
        ],
        rowLength: 9,
        member: { displayName: 'Mira', joined: true },
      }),
    );
    expect(full).toEqual({
      week: '2027-W02',
      party: 1,
      cells: [
        { slot: 4, creature: { ...mate, reach: { left: 1, right: 2 } } },
        { slot: 5, creature: null },
      ],
      rowLength: 9,
      member: { displayName: 'Mira', joined: true },
    });
  });

  it('refuses anything else', () => {
    const bad: unknown[] = [
      null,
      'x',
      wire({ extra: 1 }),
      wire({ week: 'x' }),
      wire({ party: 0 }),
      wire({ party: '1' }),
      wire({ cells: [] }),
      wire({ cells: 'x' }),
      wire({ cells: Array.from({ length: 9 }, (_, slot) => ({ slot, creature: null })) }),
      wire({ cells: [{ slot: 4 }] }),
      wire({ cells: [{ slot: -1, creature: null }] }),
      wire({ cells: [{ slot: 1.5, creature: null }] }),
      wire({ cells: [{ slot: 1, creature: null, zone: 'front' }] }),
      wire({
        cells: [
          { slot: 1, creature: null },
          { slot: 1, creature: null },
        ],
      }),
      // A teammate's cell is never `mine` and never carries a creature id.
      wire({ cells: [{ slot: 4, creature: { ...mate, mine: true } }] }),
      wire({ cells: [{ slot: 4, creature: { ...mate, creatureId: 'c9' } }] }),
      wire({ cells: [{ slot: 4, creature: { ...mate, level: 'x' } }] }),
      wire({ cells: [{ slot: 4, creature: { ...mate, name: '' } }] }),
      wire({ cells: [{ slot: 4, creature: { ...mate, name: 'x'.repeat(101) } }] }),
      wire({ cells: [{ slot: 4, creature: { ...mate, reach: { left: 9, right: 0 } } }] }),
      wire({ rowLength: 0 }),
      wire({ member: { displayName: 'Mira' } }),
      wire({ member: { displayName: 'Mira', joined: true, id: 'u1' } }),
    ];
    for (const message of bad) expect(parseBoardPush(message), JSON.stringify(message)).toBeNull();
  });
});

describe('applyBoardPush', () => {
  const push = (patch: Partial<BoardPush> = {}): BoardPush => ({
    week: '2027-W02',
    party: 1,
    cells: [{ slot: 4, creature: mate }],
    ...patch,
  });

  it('puts a cell into the shown board in place and leaves the rest alone', () => {
    const before = view();
    const after = applyBoardPush(before, push());
    expect(after?.party?.row[4]).toEqual({ slot: 4, zone: 'middle', creature: mate });
    expect(after?.party?.row[1]).toBe(before.party?.row[1]);
    expect(after?.party?.row.map((r) => r.zone)).toEqual(before.party?.row.map((r) => r.zone));
    expect(after?.roster).toBe(before.roster);
    // The view that was shown is not changed.
    expect(before.party?.row[4]?.creature).toBeNull();
  });

  it('empties a cell, and applies several at once (a swap)', () => {
    const after = applyBoardPush(
      view(),
      push({
        cells: [
          { slot: 2, creature: null },
          { slot: 3, creature: mate },
        ],
      }),
    );
    expect(after?.party?.row[2]?.creature).toBeNull();
    expect(after?.party?.row[3]?.creature).toEqual(mate);
  });

  it('adds a joiner after the last of their party, and counts them', () => {
    const after = applyBoardPush(view(), push({ member: { displayName: 'Mira', joined: true } }));
    expect(after?.roster.map((r) => `${String(r.party)}:${r.displayName}`)).toEqual([
      '1:You',
      '1:Old',
      '1:Mira',
      '2:Far',
    ]);
    expect(after?.roster[2]?.you).toBe(false);
    expect(after?.parties).toEqual([
      { party: 1, size: 3 },
      { party: 2, size: 1 },
    ]);
  });

  it('removes a leaver and counts them out', () => {
    const left = applyBoardPush(
      view(),
      push({ cells: [{ slot: 2, creature: null }], member: { displayName: 'Old', joined: false } }),
    );
    expect(left?.roster.map((r) => r.displayName)).toEqual(['You', 'Far']);
    expect(left?.parties).toEqual([
      { party: 1, size: 1 },
      { party: 2, size: 1 },
    ]);
  });

  it('drops a party that is empty', () => {
    const before = {
      ...view(),
      roster: [{ displayName: 'Far', you: false, party: 1 }],
      parties: [{ party: 1, size: 1 }],
    } as RaidView;
    const after = applyBoardPush(
      before,
      push({ cells: [{ slot: 3, creature: null }], member: { displayName: 'Far', joined: false } }),
    );
    expect(after?.parties).toEqual([]);
    expect(after?.roster).toEqual([]);
  });

  it('cannot be applied to a screen it does not fit: the caller reloads', () => {
    expect(applyBoardPush(view(), push({ cells: [{ slot: 9, creature: mate }] }))).toBeNull();
    expect(applyBoardPush(view(), push({ party: 2 }))).toBeNull();
    expect(applyBoardPush(view(), push({ week: '2027-W03' }))).toBeNull();
    expect(applyBoardPush(view(), push({ rowLength: 12 }))).toBeNull();
    expect(
      applyBoardPush(view(), push({ member: { displayName: 'Nobody', joined: false } })),
    ).toBeNull();
    const noParty = { ...view(), party: null } as RaidView;
    expect(applyBoardPush(noParty, push())).toBeNull();
    // A push never overwrites one of your own creatures: the screen is stale.
    expect(applyBoardPush(view(), push({ cells: [{ slot: 1, creature: mate }] }))).toBeNull();
    expect(applyBoardPush(view(), push({ cells: [{ slot: 1, creature: null }] }))).toBeNull();
  });

  it('takes a matching row length', () => {
    expect(applyBoardPush(view(), push({ rowLength: 9 }))).not.toBeNull();
  });
});
