import { describe, expect, it } from 'vitest';
import type { FightInput, FightResult, FightSlot } from '../src/index';
import { eventsOf, slot } from './helpers';
import { fightWith } from './pattern-helpers';

/**
 * A serpentine fight, end to end: the order is worked out each round (so the events of round 2 run
 * the other way), knocked-out creatures drop out of it, enrage rounds keep flipping, and Overflow
 * reads the order of the round it fires in. The pure order is proved in `board.test.ts`.
 */

const sturdy = (id: string, options: Parameters<typeof slot>[1] = {}): FightSlot =>
  slot(id, { atk: 100, hp: 1_000_000, ...options });

const fight = (
  row: FightSlot[],
  options: { rounds?: number; bossAtk?: number; extra?: Partial<FightInput> } = {},
) =>
  fightWith(row, [], {
    ...options,
    extra: { turnOrderOverride: 'serpentine', ...options.extra },
  });

const actors = (r: FightResult, round: number): string[] =>
  eventsOf(r, 'turn')
    .filter((e) => e.round === round)
    .map((e) => e.creature);

describe('serpentine fights', () => {
  const nine = Array.from({ length: 9 }, (_, i) => sturdy(`c${String(i + 1)}`));

  it('acts in round 1 order, then flips in round 2', () => {
    const r = fight(nine, { rounds: 2 });
    expect(actors(r, 1)).toEqual(['c1', 'c2', 'c3', 'c6', 'c5', 'c4', 'c7', 'c8', 'c9']);
    expect(actors(r, 2)).toEqual(['c3', 'c2', 'c1', 'c4', 'c5', 'c6', 'c9', 'c8', 'c7']);
  });

  it('uses the board positions: gaps are skipped and the rows come from the board', () => {
    const row = ['a', 'b', 'c', 'd'].map((id) => sturdy(id));
    const r = fight(row, { rounds: 2, extra: { board: { length: 9, slots: [0, 3, 5, 6] } } });
    expect(actors(r, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(actors(r, 2)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('skips a knocked-out creature without changing the rest of the order', () => {
    const row = nine.map((s) => slot(s.id, { atk: 100, hp: 1_000 }));
    const r = fight(row, { bossAtk: 1_000, rounds: 4 });
    const down = eventsOf(r, 'knockout')[0];
    expect(down).toBeDefined();
    const full = ['c1', 'c2', 'c3', 'c6', 'c5', 'c4', 'c7', 'c8', 'c9'];
    const round = down!.round + 1;
    const flipped = ['c3', 'c2', 'c1', 'c4', 'c5', 'c6', 'c9', 'c8', 'c7'];
    const base = round % 2 === 1 ? full : flipped;
    const downIds = eventsOf(r, 'knockout')
      .filter((e) => e.round < round)
      .map((e) => e.creature);
    expect(actors(r, round).length).toBeGreaterThan(0);
    expect(actors(r, round)).toEqual(base.filter((id) => !downIds.includes(id)));
  });

  it('keeps flipping in enrage rounds by round number', () => {
    const r = fight(nine, { rounds: 1, extra: { enrage: { rounds: 2, powerBp: 0 } } });
    expect(actors(r, 2)).toEqual(['c3', 'c2', 'c1', 'c4', 'c5', 'c6', 'c9', 'c8', 'c7']);
    expect(actors(r, 3)).toEqual(['c1', 'c2', 'c3', 'c6', 'c5', 'c4', 'c7', 'c8', 'c9']);
  });

  it("Overflow boosts the next creature in that round's order", () => {
    // All three stand in the Front row, so round 1 runs a, p, b and round 2 runs b, p, a.
    const row: FightSlot[] = [
      sturdy('a', { element: 'ember' }),
      { ...sturdy('p', { role: 'payoff' }), mods: { overflowBp: 1_500 } },
      sturdy('b', { element: 'ember' }),
    ];
    const r = fight(row, { rounds: 2, extra: { board: { length: 9, slots: [0, 1, 2] } } });
    const overflow = eventsOf(r, 'proc').filter((e) => e.kind === 'overflow');
    // p cashes an Ember mark in both rounds; the creature after it is b in round 1 and a in round 2.
    expect(overflow.map((e) => [e.round, e.creature, e.target])).toEqual([
      [1, 'p', 'b'],
      [2, 'p', 'a'],
    ]);
  });
});
