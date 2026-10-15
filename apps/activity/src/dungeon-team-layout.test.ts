import { describe, expect, it } from 'vitest';

/**
 * The order of the lines under the dungeon team's tiles (Misa, 2026-10-15): the count ("3 / 3 placed")
 * sits right under the tiles, then the order line ("Your creatures act left to right, then the foe."),
 * then whatever follows (the Enter button). Components are not rendered in tests, so this reads the
 * JSX of `DungeonTeam.tsx` and checks the order the pieces are written in.
 */
const sources = import.meta.glob<string>('./DungeonTeam.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const source = sources['./DungeonTeam.tsx'] ?? '';

describe('the lines under the dungeon team', () => {
  it('finds the source', () => {
    expect(source).toContain('<RaidBoard');
  });

  it('puts the count right under the board, above the order line, with the children last', () => {
    const board = source.indexOf('<RaidBoard');
    const count = source.indexOf('<PlacedCount');
    const order = source.indexOf('dungeon-order-line');
    const children = source.indexOf('{props.children}');
    expect(board).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(board);
    expect(order).toBeGreaterThan(count);
    expect(children).toBeGreaterThan(order);
  });
});
