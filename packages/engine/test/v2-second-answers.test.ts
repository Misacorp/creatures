/**
 * Combat v2: the second answers of phase 5 (Pin Down, Backlash, Aftershock) and the board events that make off-turn and invisible
 * effects readable (the "cannot dodge" flag, a Knack's counter, Shake It Off's Bogged Down). Built by hand with scripted dice.
 */
import { describe, expect, it } from 'vitest';
import {
  NO,
  YES,
  boardEvents,
  boss,
  by,
  count,
  playScripted,
  play,
  spec,
  type SpecOver,
} from './v2-helpers';

const setter = (col: number, element = 'tide', over: SpecOver = {}) =>
  spec({ name: `S${col}`, role: 'setter', element, col, ...over });
const payoff = (col: number, element = 'spark', over: SpecOver = {}) =>
  spec({ name: `P${col}`, role: 'payoff', element, col, ...over });

describe('Pin Down: the boss cannot dodge the next creature to act in the Setter row', () => {
  // The boss dodges a quarter of all hits (flat), so a roll of YES is a dodge and NO is a hit that lands.
  const slippery = () => boss({ cols: 2, dodgeBp: 2_500 });

  it('the Setter is dodged, still leaves its mark, and the next creature in its row is not rolled for dodge', () => {
    // Draws: S0's dodge roll (dodged), then P1's crit roll only: its dodge is not rolled.
    const { res } = playScripted(
      slippery(),
      [setter(0, 'tide', { fx: { leadUndodge: true } }), payoff(1)],
      [YES, NO],
    );
    expect(count(res, 'boss-dodge')).toBe(1);
    expect(by(res, 'S0').damageDealt).toBe(0);
    expect(by(res, 'P1').damageDealt).toBeGreaterThan(0);
    expect(res.reactions).toBe(1);
    expect(boardEvents(res).filter((b) => b.type === 'sure')).toEqual([
      { type: 'sure', who: 'P1', by: 'S0' },
    ]);
  });

  it('without it the same dice dodge the Payoff too, so no reaction', () => {
    const { res } = playScripted(slippery(), [setter(0), payoff(1)], [YES, YES, NO]);
    expect(count(res, 'boss-dodge')).toBe(2);
    expect(res.reactions).toBe(0);
    expect(boardEvents(res).some((b) => b.type === 'sure')).toBe(false);
  });

  it('a flag, not a stack: two Setters with it pin the same creature once each and the flag clears at the next round start', () => {
    const team = [
      setter(0, 'tide', { fx: { leadUndodge: true } }),
      setter(1, 'tide', { fx: { leadUndodge: true } }),
      payoff(2),
    ];
    const res = play(boss({ cols: 3, rounds: 2, dodgeBp: 0 }), team);
    // Round 1: S0 pins S1; S1 pins P2. Round 2 again (the flag was cleared, then set again): four events, nothing accumulates.
    expect(boardEvents(res).filter((b) => b.type === 'sure')).toEqual([
      { type: 'sure', who: 'S1', by: 'S0' },
      { type: 'sure', who: 'P2', by: 'S1' },
      { type: 'sure', who: 'S1', by: 'S0' },
      { type: 'sure', who: 'P2', by: 'S1' },
    ]);
  });

  it('a silenced Setter marks nothing, so it pins nobody', () => {
    const silenced = setter(0, 'tide', { fx: { leadUndodge: true } });
    const res = play(
      boss({
        cols: 2,
        moves: [
          {
            id: 'hush',
            name: 'Hush',
            pattern: { anchor: 'front', shape: 'single' },
            powerBp: 0,
            every: 1,
            turn: 0,
            silenceTurns: 9,
          },
        ],
        rounds: 2,
      }),
      [silenced, payoff(1)],
    );
    // Round 1 the Setter acts before the Hush lands: it pins once. Round 2 it is silenced: no further pin.
    expect(boardEvents(res).filter((b) => b.type === 'sure')).toHaveLength(1);
  });

  it('Clear Skies says so on the board too: each creature beside the Support, named with the Support', () => {
    const res = play(boss({ cols: 3 }), [
      spec({ name: 'A', col: 0 }),
      spec({ name: 'H', role: 'support', col: 1, fx: { support: 'clearSkies' } }),
      spec({ name: 'C', col: 2 }),
    ]);
    expect(boardEvents(res).filter((b) => b.type === 'sure')).toEqual([
      { type: 'sure', who: 'A', by: 'H' },
      { type: 'sure', who: 'C', by: 'H' },
    ]);
  });
});

describe('Backlash: the boss sheds a mark, the creature strikes back', () => {
  const clean = (over: object = {}) =>
    boss({ cols: 3, rounds: 2, mods: { shedMarks: true }, ...over });
  // P1 is a Grove Payoff: it cashes Spark, not the Tide mark, so the mark stays on the boss until it is shed.
  const backlasher = (col: number, over: SpecOver = {}) =>
    payoff(col, 'grove', { fx: { backlashBp: 2_000 }, ...over });

  it('strikes back for its share of its Attack when the boss sheds, as a counter that is named after its Knack', () => {
    const res = play(clean({ rounds: 1 }), [setter(0), backlasher(1)]);
    expect(boardEvents(res).filter((b) => b.type === 'counter')).toEqual([
      { type: 'counter', from: 'P1', damage: 20, byKnack: true },
    ]);
    expect(by(res, 'P1').fires['backlashBp']).toBe(1);
    // After the shed: the log reads shed first, then the strike back.
    const types = boardEvents(res).map((b) => b.type);
    expect(types.indexOf('counter')).toBeGreaterThan(types.indexOf('shed'));
  });

  it('nothing is shed, nothing strikes: a sealed mark stays, and a boss with no Clean Scales sheds nothing', () => {
    const sealed = play(clean({ rounds: 1 }), [
      setter(0, 'tide', { fx: { seal: true } }),
      backlasher(1),
    ]);
    expect(count(sealed, 'counter')).toBe(0);
    const plain = play(boss({ cols: 3, rounds: 1 }), [setter(0), backlasher(1)]);
    expect(count(plain, 'counter')).toBe(0);
  });

  it('once a round for each creature, not for each mark or each boss turn', () => {
    const arena = clean({ rows: 2, rounds: 2 });
    const team = [
      // Row 0: two Setters (two marks shed on the first boss turn), a Backlash Payoff.
      setter(0),
      setter(1, 'ember'),
      backlasher(2),
      // Row 1: a Setter whose mark is shed on the second boss turn of the round.
      setter(0, 'mire', { row: 1, name: 'R1' }),
    ];
    const res = play(arena, team);
    expect(boardEvents(res).filter((b) => b.type === 'shed')).toHaveLength(4);
    expect(count(res, 'counter')).toBe(2);
    expect(by(res, 'P2').fires['backlashBp']).toBe(2);
  });

  it('every creature that has it strikes once: copies add up one each, they do not multiply', () => {
    const res = play(clean({ rounds: 1 }), [
      setter(0),
      backlasher(1),
      backlasher(2, { name: 'Q2' }),
    ]);
    expect(count(res, 'counter')).toBe(2);
  });

  it('a counter ignores the hit cap and armour, and a silenced creature does not strike', () => {
    const res = play(clean({ rounds: 1, armour: 500, mods: { shedMarks: true, capPerHit: 5 } }), [
      setter(0),
      backlasher(1),
    ]);
    expect(boardEvents(res).filter((b) => b.type === 'counter')).toEqual([
      { type: 'counter', from: 'P1', damage: 20, byKnack: true },
    ]);
    // Silence blanks the Knack like any other.
    const hushed = play(
      clean({
        rounds: 1,
        moves: [
          {
            id: 'hush',
            name: 'Hush',
            pattern: { anchor: 'front', shape: 'all' },
            powerBp: 0,
            every: 1,
            turn: 0,
            silenceTurns: 9,
          },
        ],
      }),
      [setter(0), backlasher(1)],
    );
    expect(count(hushed, 'counter')).toBe(0);
  });
});

describe('Aftershock: a hit cap holds the hit and the bonus apart, and the bonus is its own number', () => {
  const aftershock = { spendAllBp: 7_500, bonusBp: 6_750, splitBonus: true };
  const team = (fx: object) => [setter(0), payoff(1, 'spark', { fx })];
  const hitsOf = (res: ReturnType<typeof play>, from: string) =>
    boardEvents(res).filter((b) => b.type === 'hit' && b.from === from);

  it('under a cap of 60 the plain 100 and the bonus 67 are each cut to 60, 120 in all; one cap on the sum would give 60', () => {
    const capped = boss({ cols: 2, mods: { capPerHit: 60 } });
    const split = play(capped, team(aftershock));
    expect(by(split, 'P1').damageDealt).toBe(120);
    expect(hitsOf(split, 'P1')).toMatchObject([{ damage: 60 }, { damage: 60, bonus: true }]);
    const whole = play(capped, team({ spendAllBp: 7_500, bonusBp: 6_750 }));
    expect(by(whole, 'P1').damageDealt).toBe(60);
    expect(hitsOf(whole, 'P1')).toHaveLength(1);
  });

  it('with no cap it deals what the same bonus would, as two numbers; the reaction event says the bonus is split', () => {
    const open = boss({ cols: 2 });
    const split = play(open, team(aftershock));
    const same = play(open, team({ spendAllBp: 7_500, bonusBp: 6_750 }));
    expect(by(split, 'P1').damageDealt).toBe(by(same, 'P1').damageDealt);
    expect(hitsOf(split, 'P1')).toMatchObject([{ damage: 100 }, { damage: 67, bonus: true }]);
    const reaction = boardEvents(split).find((b) => b.type === 'reaction');
    expect(reaction).toMatchObject({ split: true, bonus: 67 });
    expect(boardEvents(same).find((b) => b.type === 'reaction')).not.toHaveProperty('split');
  });

  it('armour comes off the plain hit first, so the numbers add up to what landed', () => {
    const res = play(boss({ cols: 2, armour: 30, mods: { capPerHit: 60 } }), team(aftershock));
    // 60 + 60 - 30 = 90: the plain hit shows 30, the bonus 60.
    expect(by(res, 'P1').damageDealt).toBe(90);
    expect(hitsOf(res, 'P1')).toMatchObject([{ damage: 30 }, { damage: 60, bonus: true }]);
  });

  it('a creature without a reaction (no mark to cash) has one hit and no bonus number', () => {
    const res = play(boss({ cols: 2 }), [payoff(0, 'spark', { fx: aftershock })]);
    expect(hitsOf(res, 'P0')).toHaveLength(1);
  });
});

describe('Shake It Off tells the board how much Bogged Down it cleared', () => {
  it('the Bogged Down event of the shake carries the stacks that were shaken off', () => {
    const song = (name: string) => spec({ name, fx: { miresAtStart: true } });
    const res = play(boss({ cols: 2, rounds: 3, mods: { shakeEvery: 3 } }), [
      song('S'),
      { ...song('T'), col: 1 },
    ]);
    const events = boardEvents(res).filter((b) => b.type === 'boggedDown');
    // Two songs a round, one stack fades at each round end: the shake at the end of round 3 clears what is left, all of it at full
    // strength (the Bogged Down of the third round: 2 + 1 + 1 from the rounds before, less what faded).
    const last = events.at(-1) as { stacks: number; shook?: number } | undefined;
    expect(last?.stacks).toBe(0);
    expect(last?.shook).toBeGreaterThan(0);
    // The other Bogged Down events (a stack, a fade) are not shakes.
    for (const e of events.slice(0, -1)) expect(e).not.toHaveProperty('shook');
  });
});
