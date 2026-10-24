import type { FightEvent } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { stateAt } from './replay';

const armed: FightEvent = {
  t: 'gimmick',
  round: 1,
  gimmick: 'backdraft',
  op: 'reflect_first_reaction',
};
const reaction = (over: Partial<Extract<FightEvent, { t: 'reaction' }>>): FightEvent => ({
  t: 'reaction',
  round: 1,
  reaction: 'steam',
  setupCreature: 'a',
  setupPlayer: 'p1',
  payoff: 'b',
  bonus: 40,
  reflected: false,
  ...over,
});
const start: FightEvent = { t: 'round_start', round: 1, bossHp: 1000, mark: null };
const end: FightEvent = { t: 'round_end', round: 1, bossHp: 1000 };

describe('the barrier over the foe', () => {
  it('rises when a lasting move is armed and lasts the round', () => {
    const events = [start, armed, reaction({}), end];
    expect(stateAt(events, 1, 1000).barrier).toBeNull();
    expect(stateAt(events, 2, 1000).barrier).toEqual({
      gimmick: 'backdraft',
      round: 1,
      broken: null,
    });
    // A reaction it did not meet (none reflected) leaves it standing.
    expect(stateAt(events, 3, 1000).barrier?.broken).toBeNull();
    expect(stateAt(events, 4, 1000).barrier).toBeNull();
  });

  it('breaks on the first reaction it throws back, or one a gear set turned aside', () => {
    const thrown = [
      start,
      armed,
      reaction({ reflected: true, payoff: 'c' }),
      reaction({ reflected: true }),
    ];
    expect(stateAt(thrown, 4, 1000).barrier?.broken).toEqual({
      i: 2,
      creature: 'c',
      turned: false,
    });
    const turned = [start, armed, reaction({ proof: true })];
    expect(stateAt(turned, 3, 1000).barrier?.broken).toEqual({ i: 2, creature: 'b', turned: true });
  });

  it('keeps the first of two announcements in a round (fights stored before the change)', () => {
    const events = [start, armed, reaction({ reflected: true }), armed];
    expect(stateAt(events, 4, 1000).barrier?.broken).not.toBeNull();
  });

  it('is not raised by other moves', () => {
    const events: FightEvent[] = [
      start,
      { t: 'gimmick', round: 1, gimmick: 'undertow', op: 'hit_zone' },
    ];
    expect(stateAt(events, 2, 1000).barrier).toBeNull();
  });
});
