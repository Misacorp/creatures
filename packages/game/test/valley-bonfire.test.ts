import { describe, expect, it } from 'vitest';
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES as R,
  catchUpBpOf,
  catchUpMultiplier,
  catchUpTarget,
  createSeededRng,
  levelAtXp,
  momentWeight,
  pickByWeight,
  serverMiddleOf,
  settle,
  topThreeMean,
  xpAtLevel,
  type AwayWindow,
  type SettleSeat,
  type SettleState,
} from '../src';

const H = 3_600_000;

describe('the catch-up target and the server middle (V-BON-2)', () => {
  it('is the higher of the 3rd best level and the middle, and the lowest creature with fewer than three', () => {
    expect(catchUpTarget([15, 14, 13, 3], 12)).toBe(13);
    expect(catchUpTarget([8, 7, 5, 3], 12)).toBe(12);
    expect(catchUpTarget([5, 4], 3)).toBe(4);
    expect(catchUpTarget([], 0)).toBe(1);
  });

  it('takes the median of the top-three means', () => {
    expect(topThreeMean([10, 8, 6, 1])).toBe(8);
    expect(topThreeMean([4])).toBe(4);
    expect(topThreeMean([])).toBe(0);
    expect(serverMiddleOf([5, 9, 7])).toBe(7);
    expect(serverMiddleOf([4, 8])).toBe(6);
    expect(serverMiddleOf([])).toBe(0);
  });

  it('pays the rules multiplier: full at the full gap, fading to x1 at the target', () => {
    const top = R.bonfire.catchUp.maxMultiplier;
    expect(catchUpBpOf(R, 4, 10)).toBe(Math.round(top * 10_000));
    expect(catchUpBpOf(R, 10, 10)).toBe(10_000);
    expect(catchUpBpOf(R, 12, 10)).toBe(10_000);
    const half = catchUpMultiplier(R, R.bonfire.catchUp.fullAtGap / 2);
    expect(half).toBeCloseTo(1 + (top - 1) / 2, 12);
  });
});

describe('the level table', () => {
  it('is its own inverse at every level start', () => {
    for (let level = 1; level <= 30; level++) {
      expect(levelAtXp(xpAtLevel(level))).toBe(level);
      if (level > 1) expect(levelAtXp(xpAtLevel(level) - 1e-3)).toBe(level - 1);
    }
  });
});

const catching = (level: number, target: number, mult: number): SettleState => ({
  settledAt: 0,
  lastVisitAt: 0,
  hearth: 1,
  creatures: [
    {
      xp: 0,
      carry: 0,
      capXp: Infinity,
      catchUp: mult,
      catchTarget: target,
      baseXp: xpAtLevel(level),
    },
  ],
});

describe('catch-up inside a pass', () => {
  /** The lab's rule hour by hour: the held multiplier, never above the one for the gap now (`effectiveCatchUp`). */
  function hourly(level: number, target: number, mult: number, hours: number): number {
    let xp = xpAtLevel(level);
    for (let h = 0; h < hours; h++) {
      const now = Math.min(mult, catchUpMultiplier(R, target - levelAtXp(xp)));
      // Away share 1 for the first hours after the visit (the first away step).
      xp += R.xp.idlePerHour * now;
    }
    return xp - xpAtLevel(level);
  }

  it('fades as the creature closes the gap, as the lab does, and never lifts it past the target', () => {
    const held = catchUpMultiplier(R, 6);
    const after = settle(catching(1, 7, held), 0, 20 * H, []);
    const got = after.creatures[0]!.xp + after.creatures[0]!.carry;
    // 20 hours inside the first away step (share 1): equal to the hour-by-hour rule within an hour's worth.
    expect(got).toBeCloseTo(hourly(1, 7, held, 20), -1);
    expect(got).toBeGreaterThan(R.xp.idlePerHour * 20);
    expect(got).toBeLessThan(R.xp.idlePerHour * held * 20 + 1e-6);
  });

  it('once the target is reached pays x1 again', () => {
    const start = catching(5, 6, 3);
    const need = xpAtLevel(6) - xpAtLevel(5);
    const after = settle(start, 0, 200 * H, []);
    const got = after.creatures[0]!.xp + after.creatures[0]!.carry;
    // Far more time than the climb needs: everything after level 6 is plain idle XP (away share included), so the surplus matches a
    // creature that had no catch-up at the target.
    const plain = settle(
      { ...start, creatures: [{ ...start.creatures[0]!, catchUp: 1 }] },
      0,
      200 * H,
      [],
    );
    const plainGot = plain.creatures[0]!.xp + plain.creatures[0]!.carry;
    expect(got).toBeGreaterThan(plainGot);
    expect(got - plainGot).toBeLessThan(need);
  });

  it('is split-invariant: a to c equals a to b to c', () => {
    const held = catchUpMultiplier(R, 6);
    const whole = settle(catching(1, 9, held), 0, 60 * H, []);
    const first = settle(catching(1, 9, held), 0, 17 * H + 12_345, []);
    const both = settle(first, first.settledAt, 60 * H, []);
    const total = (s: SettleState): number => s.creatures[0]!.xp + s.creatures[0]!.carry;
    expect(total(both)).toBeCloseTo(total(whole), 3);
  });

  it('keeps the held multiplier when the creature carries no target', () => {
    const state: SettleState = {
      ...catching(1, 7, 2),
      creatures: [{ xp: 0, carry: 0, capXp: Infinity, catchUp: 2 }],
    };
    const after = settle(state, 0, 10 * H, []);
    expect(after.creatures[0]!.xp + after.creatures[0]!.carry).toBeCloseTo(
      R.xp.idlePerHour * 2 * 10,
      6,
    );
  });
});

describe('a raider is away from its post (V-POST-7)', () => {
  const seat = (): SettleSeat => ({
    id: 's1',
    creature: 0,
    destination: 'tidepools',
    kit: null,
    fit: false,
    second: false,
    storeHours: 0,
    scrap: 0,
    scrapCarry: 0,
    shards: 0,
    shardCarry: 0,
  });
  const start = (): SettleState => ({
    settledAt: 0,
    lastVisitAt: 0,
    hearth: 1,
    creatures: [{ xp: 0, carry: 0, capXp: Infinity, scoutHours: 0 }],
    seats: [seat()],
  });
  const heldHours = (s: SettleState): number => s.seats![0]!.storeHours;

  it('works no hours inside the window and all the rest, while idle XP goes on', () => {
    const away: AwayWindow[] = [{ creature: 0, from: 2 * H, to: 5 * H }];
    const without = settle(start(), 0, 8 * H, []);
    const paused = settle(start(), 0, 8 * H, [], { away });
    expect(heldHours(without)).toBeCloseTo(8, 6);
    expect(heldHours(paused)).toBeCloseTo(5, 6);
    expect(paused.creatures[0]!.scoutHours).toBeCloseTo(5, 6);
    expect(paused.creatures[0]!.xp + paused.creatures[0]!.carry).toBeCloseTo(
      without.creatures[0]!.xp + without.creatures[0]!.carry,
      6,
    );
  });

  it('an open window (the finale has not ended) pauses to the end of the pass', () => {
    const paused = settle(start(), 0, 8 * H, [], {
      away: [{ creature: 0, from: 3 * H, to: Number.POSITIVE_INFINITY }],
    });
    expect(heldHours(paused)).toBeCloseTo(3, 6);
  });

  it("another creature's window does not pause this seat", () => {
    const paused = settle(start(), 0, 8 * H, [], {
      away: [{ creature: 1, from: 0, to: 8 * H }],
    });
    expect(heldHours(paused)).toBeCloseTo(8, 6);
  });

  it('is split-invariant at the window edges', () => {
    const away: AwayWindow[] = [{ creature: 0, from: 2 * H, to: 5 * H }];
    const whole = settle(start(), 0, 8 * H, [], { away });
    const first = settle(start(), 0, 3.3 * H, [], { away });
    const both = settle(first, first.settledAt, 8 * H, [], { away });
    expect(heldHours(both)).toBeCloseTo(heldHours(whole), 6);
  });

  it('pauses an anvil: its piece makes no progress while the smith is away', () => {
    const forge = (): NonNullable<SettleState['forge']> => ({
      anvils: [
        {
          id: 'a1',
          creature: 0,
          kit: null,
          orders: [
            {
              id: 'o1',
              blueprint: 'tide-hat',
              element: 0,
              count: 99,
              made: 0,
              reach: 'none',
              forTeam: false,
              stepUp: 0,
            },
          ],
          piece: null,
          floor: 0,
        },
      ],
      shelf: {
        scrap: 10_000,
        shards: new Array<number>(VALLEY_ELEMENTS.length).fill(1000),
        essence: 1000,
      },
      scrapCarry: 0,
      weak: new Array<number>(VALLEY_ELEMENTS.length).fill(0),
      pending: new Array<number>(VALLEY_ELEMENTS.length).fill(0),
      fireLevel: 1,
    });
    const run = (away: AwayWindow[]): number => {
      const s: SettleState = {
        settledAt: 0,
        lastVisitAt: 0,
        hearth: 1,
        creatures: [{ xp: 0, carry: 0, capXp: Infinity, smithHours: 0 }],
        forge: forge(),
      };
      const after = settle(s, 0, 10 * H, [], { away, rng: createSeededRng('away') });
      return after.creatures[0]!.smithHours ?? 0;
    };
    expect(run([])).toBeCloseTo(10, 6);
    expect(run([{ creature: 0, from: 0, to: 10 * H }])).toBe(0);
    expect(run([{ creature: 0, from: 4 * H, to: 10 * H }])).toBeCloseTo(4, 6);
  });
});

describe('who a small moment is about (V-BON-9)', () => {
  it('weighs a creature that never featured the most, and one that just did the least', () => {
    expect(momentWeight(50, null)).toBeGreaterThan(momentWeight(50, 45));
    expect(momentWeight(50, 45)).toBeGreaterThan(momentWeight(50, 49));
    expect(momentWeight(50, 50)).toBe(1);
    // A future day (a clock that went back) never goes below the floor.
    expect(momentWeight(50, 60)).toBe(1);
  });

  it('picks by weight from a roll, and nothing from no weights', () => {
    expect(pickByWeight([1, 1, 2], 0)).toBe(0);
    expect(pickByWeight([1, 1, 2], 0.3)).toBe(1);
    expect(pickByWeight([1, 1, 2], 0.99)).toBe(2);
    expect(pickByWeight([0, 0], 0.5)).toBe(-1);
    expect(pickByWeight([], 0.5)).toBe(-1);
  });

  it('leans toward creatures that have not featured lately, over many draws', () => {
    const rng = createSeededRng('moments');
    const weights = [momentWeight(30, 29), momentWeight(30, null)];
    const seen = [0, 0];
    for (let i = 0; i < 5000; i++) {
      const at = pickByWeight(weights, rng.nextU32() / 0x1_0000_0000);
      seen[at] = (seen[at] ?? 0) + 1;
    }
    expect(seen[1]!).toBeGreaterThan(seen[0]! * 3);
    expect(seen[0]!).toBeGreaterThan(0);
  });
});
