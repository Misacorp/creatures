import type { BoardEvent, FightEvent } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import { isBoardEvent } from './fight-v2-api';
import { buildBeats, showOf, stateAfter, type BeatV2, type FoldSetup } from './fight-v2';

/** The board cues of the second answers (Pin Down, Backlash, Aftershock, Shake It Off), on hand-made events. */
const ev = (board: BoardEvent): FightEvent => ({
  round: 1,
  turn: 0,
  kind: 'board',
  text: '',
  board,
});
const beat = (to: number, kind: BeatV2['kind'] = 'boss'): BeatV2 => ({
  from: 0,
  to,
  kind,
  round: 1,
  row: 0,
  actor: null,
  reacts: false,
});
const creatures = [
  { key: 'setter', element: 'tide', knackName: 'Pin Down' },
  { key: 'next', element: 'spark', knackName: 'Detonate' },
  { key: 'payoff', element: 'ember', knackName: 'Backlash' },
];
const setup: FoldSetup = {
  creatures: creatures.map((c, col) => ({ ...c, maxHp: 100, startHp: 100, row: 0, col })),
  bossHpStart: 1000,
  moveTurns: {},
  shedsMarks: true,
  escalationStep: null,
};

describe('the board cues of the second answers', () => {
  it('"cannot dodge" has a board event, and its Knack is named on the tile of the creature whose Knack did it', () => {
    const events = [ev({ type: 'sure', who: 'next', by: 'setter' })];
    const show = showOf(events, beat(1), { creatures });
    expect(show.knacks.map((k) => [k.who, k.name])).toEqual([['setter', 'Pin Down']]);
    expect(show.floats).toEqual([]);
  });

  it("a counter that is a Knack's own effect names the Knack; a plain counter (a talent, Retaliate) names nothing", () => {
    const named = showOf(
      [ev({ type: 'counter', from: 'payoff', damage: 12, byKnack: true })],
      beat(1),
      { creatures },
    );
    expect(named.knacks.map((k) => k.name)).toEqual(['Backlash']);
    expect(named.floats.map((f) => [f.target, f.text, f.tone])).toEqual([[null, '12', 'hit']]);
    const plain = showOf([ev({ type: 'counter', from: 'payoff', damage: 12 })], beat(1), {
      creatures,
    });
    expect(plain.knacks).toEqual([]);
  });

  it('Fizzle: a callout when it fires and when a reaction is blocked, and the boss is Fizzling until its next turn', () => {
    const on = [ev({ type: 'fizzle', state: 'on' })];
    expect(showOf(on, beat(1), { creatures }).floats[0]).toMatchObject({
      target: null,
      text: 'Fizzle!',
      tone: 'reaction',
      sub: 'No reactions',
    });
    expect(stateAfter(setup, on, 1).fizzled).toBe(true);
    const blocked = [ev({ type: 'fizzle', state: 'blocked', by: 'payoff', mark: 'tide' })];
    expect(showOf(blocked, beat(1), { creatures }).floats[0]).toMatchObject({
      text: 'Fizzled!',
      sub: 'Mark kept',
    });
    expect(stateAfter(setup, [...on, ...blocked], 2).fizzled).toBe(true);
    const off = [...on, ev({ type: 'fizzle', state: 'off' })];
    expect(stateAfter(setup, off, 2).fizzled).toBe(false);
  });

  it("Shake It Off is the reaction callout on the boss with what it cleared, and the board's Bogged Down follows", () => {
    const events = [ev({ type: 'boggedDown', stacks: 1, shook: 3 })];
    const show = showOf(events, beat(1), { creatures });
    expect(show.floats).toHaveLength(1);
    expect(show.floats[0]).toMatchObject({
      target: null,
      text: 'Shakes it off!',
      tone: 'reaction',
      sub: '-3 Bogged Down',
    });
    expect(stateAfter(setup, events, 1).boggedDown).toBe(1);
    // A Bogged Down change that is no shake (the fade, a new stack) says nothing.
    expect(showOf([ev({ type: 'boggedDown', stacks: 2 })], beat(1), { creatures }).floats).toEqual(
      [],
    );
  });

  it("Aftershock's bonus is its own hit float after the plain hit, and the reaction callout leaves the bonus out", () => {
    const events = [
      {
        ...ev({
          type: 'reaction',
          by: 'next',
          mark: 'tide',
          spent: 2,
          bonus: 40,
          left: 0,
          split: true,
        }),
        kind: 'reaction',
        text: 'next cashes tide x2 for +40',
      },
      ev({
        type: 'hit',
        from: 'next',
        to: null,
        damage: 60,
        crit: false,
        blocked: false,
        dodged: false,
      }),
      ev({
        type: 'hit',
        from: 'next',
        to: null,
        damage: 40,
        crit: false,
        blocked: false,
        dodged: false,
        bonus: true,
      }),
    ];
    const show = showOf(events, beat(3, 'creature'), { creatures });
    const reaction = show.floats.find((f) => f.tone === 'reaction');
    expect(reaction?.sub).toBeUndefined();
    expect(reaction?.hit?.text).toBe('60');
    // The plain hit rides in the callout; the bonus is the one number left on the boss.
    expect(show.floats.filter((f) => f.tone === 'hit').map((f) => f.text)).toEqual(['60', '40']);
    expect(stateAfter(setup, events, 3).bossHp).toBe(900);
    // The bonus hit is the same creature's turn: one beat holds the callout, the plain hit and the bonus.
    const roundStart = ev({ type: 'round', round: 1 });
    const beats = buildBeats([roundStart, ...events], setup);
    expect(beats.map((b) => b.kind)).toEqual(['round', 'creature']);
    expect(beats[1]).toMatchObject({ from: 1, to: 4, actor: 'next', reacts: true });
    // Without a split the callout carries its bonus as before.
    const whole = showOf(
      [ev({ type: 'reaction', by: 'next', mark: 'tide', spent: 1, bonus: 40, left: 0 })],
      beat(1, 'creature'),
      { creatures },
    );
    expect(whole.floats[0]?.sub).toBe('+40');
  });

  it('a stored event with the old name of the debuff event reads as the current one', async () => {
    const { isFightEventV2 } = await import('./fight-v2-api');
    const stored = {
      round: 1,
      turn: 0,
      kind: 'board',
      text: '',
      board: { type: 'mired', stacks: 2 },
    };
    expect(isFightEventV2(stored)).toBe(true);
    expect(stored.board.type).toBe('boggedDown');
  });

  it('the client reads the new board fields and nothing malformed', () => {
    expect(isBoardEvent({ type: 'sure', who: 'a', by: 'b' })).toBe(true);
    expect(isBoardEvent({ type: 'sure', who: 'a' })).toBe(false);
    expect(isBoardEvent({ type: 'counter', from: 'a', damage: 3, byKnack: true })).toBe(true);
    expect(isBoardEvent({ type: 'counter', from: 'a', damage: 3, byKnack: 'yes' })).toBe(false);
    expect(isBoardEvent({ type: 'boggedDown', stacks: 1, shook: 2 })).toBe(true);
    expect(isBoardEvent({ type: 'boggedDown', stacks: 1, shook: -1 })).toBe(false);
    expect(isBoardEvent({ type: 'fizzle', state: 'blocked', by: 'a', mark: 'tide' })).toBe(true);
    expect(isBoardEvent({ type: 'fizzle', state: 'on' })).toBe(true);
    expect(isBoardEvent({ type: 'fizzle', state: 'later' })).toBe(false);
    expect(isBoardEvent({ type: 'fizzle', state: 'blocked', by: 3 })).toBe(false);
    expect(
      isBoardEvent({
        type: 'hit',
        from: 'a',
        to: null,
        damage: 3,
        crit: false,
        blocked: false,
        dodged: false,
        bonus: true,
      }),
    ).toBe(true);
    expect(
      isBoardEvent({
        type: 'reaction',
        by: 'a',
        mark: 'tide',
        spent: 1,
        bonus: 2,
        left: 0,
        split: 1,
      }),
    ).toBe(false);
  });
});
