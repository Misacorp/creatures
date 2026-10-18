import { describe, expect, it } from 'vitest';
import type { RowSlotView } from './raid-api';
import { ownerColour, OWNER_COLOURS, slotOfCreature } from './raid-slots';

// Slot 0: mine (a), 1: empty, 2: someone else's, 3: mine (b), 4: empty
const row: RowSlotView[] = [
  {
    slot: 0,
    zone: 'front',
    creature: {
      ownerName: 'Me',
      species: 'splashet',
      name: 'A',
      level: 3,
      mine: true,
      auto: false,
      movable: false,
      creatureId: 'a',
    },
  },
  { slot: 1, zone: 'front', creature: null },
  {
    slot: 2,
    zone: 'middle',
    creature: {
      ownerName: 'Jun',
      species: 'splashet',
      name: 'J',
      level: 3,
      mine: false,
      auto: false,
      movable: false,
    },
  },
  {
    slot: 3,
    zone: 'middle',
    creature: {
      ownerName: 'Me',
      species: 'splashet',
      name: 'B',
      level: 3,
      mine: true,
      auto: false,
      movable: false,
      creatureId: 'b',
    },
  },
  { slot: 4, zone: 'back', creature: null },
];

describe('slots and colours', () => {
  it('finds my creature slot', () => {
    expect(slotOfCreature(row, 'b')).toBe(3);
    expect(slotOfCreature(row, 'c')).toBeNull();
  });

  it('gives each owner a stable colour inside the palette', () => {
    const names = ['Me', 'Jun', 'Mika'];
    expect(ownerColour('Me', names)).toBe(0);
    expect(ownerColour('Mika', names)).toBe(2);
    expect(ownerColour('Nobody', names)).toBe(0);
    const many = Array.from({ length: 12 }, (_, i) => `p${String(i)}`);
    expect(ownerColour('p11', many)).toBe(11 % OWNER_COLOURS);
  });
});
