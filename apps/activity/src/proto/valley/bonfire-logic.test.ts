import { describe, expect, it } from 'vitest';
import {
  catchUpFactor,
  catchUpTarget,
  crowd,
  facesLeft,
  giveToHearth,
  hearthBuilt,
  hearthNeeds,
  isWarmingUp,
  momentPair,
  rotated,
  seatedFew,
  yourSharePercent,
  type Hearth,
} from './bonfire-logic';

describe('catch-up (V-BON-2)', () => {
  it('aims at the higher of the 3rd-best level and the server middle', () => {
    expect(catchUpTarget([15, 14, 13, 3], 12)).toBe(13);
    expect(catchUpTarget([8, 7, 5, 3], 12)).toBe(12);
    expect(catchUpTarget([5, 4], 3)).toBe(4);
    expect(catchUpTarget([], 0)).toBe(0);
  });

  it('pays x2 from six levels below and fades evenly to x1 at the target', () => {
    expect(catchUpFactor(4, 12)).toBe(2);
    expect(catchUpFactor(6, 12)).toBe(2);
    expect(catchUpFactor(9, 12)).toBe(1.5);
    expect(catchUpFactor(12, 12)).toBe(1);
    expect(catchUpFactor(20, 12)).toBe(1);
  });

  it('shows the warming-up flame only while catching up', () => {
    expect(isWarmingUp(11, 12)).toBe(true);
    expect(isWarmingUp(12, 12)).toBe(false);
  });
});

describe('the seats', () => {
  it('turns a list by any whole number, also negative and past its length', () => {
    expect(rotated([1, 2, 3], 1)).toEqual([2, 3, 1]);
    expect(rotated([1, 2, 3], 4)).toEqual([2, 3, 1]);
    expect(rotated([1, 2, 3], -1)).toEqual([3, 1, 2]);
    expect(rotated([], 5)).toEqual([]);
  });

  it('seats a few and counts the rest, and every creature gets its turn', () => {
    const resting = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const first = seatedFew(resting, 0, 5);
    expect(first.seated).toHaveLength(5);
    expect(first.more).toBe(2);
    const seen = new Set<string>();
    for (let day = 0; day < resting.length; day += 1) {
      for (const c of seatedFew(resting, day, 5).seated) seen.add(c);
    }
    expect(seen.size).toBe(resting.length);
  });

  it('seats everyone when there are few, with no "+N"', () => {
    expect(seatedFew(['a', 'b'], 3, 5)).toEqual({ seated: ['a', 'b'], more: 0 });
  });

  it("fills the art's three seats, then two grass spots, and counts the rest behind +N", () => {
    expect(crowd(5, 2)).toEqual({
      own: ['seatLeft', 'seatFront', 'seatRight'],
      friends: ['groundLeft', 'groundRight'],
      more: 2,
    });
    expect(crowd(1, 0)).toEqual({ own: ['seatLeft'], friends: [], more: 0 });
    expect(facesLeft('seatRight')).toBe(true);
    expect(facesLeft('seatLeft')).toBe(false);
  });

  it('shares the moment between the first two seats, when two sit', () => {
    expect(momentPair(1)).toBeNull();
    expect(momentPair(3)).toEqual([0, 1]);
  });
});

describe('the hearth (V-COM-2, V-COM-15)', () => {
  const hearth: Hearth = { total: 12, placed: 7, yours: 3, stoneCost: 10 };

  it('says what it still needs in stones and Acorns', () => {
    expect(hearthNeeds(hearth)).toEqual({ stones: 5, acorns: 50 });
  });

  it('raises a stone for a gift and counts it as yours, never past the total', () => {
    const next = giveToHearth(hearth, 1);
    expect(next).toMatchObject({ placed: 8, yours: 4 });
    const over = giveToHearth({ ...hearth, placed: 11 }, 3);
    expect(over.placed).toBe(12);
    expect(over.yours).toBe(4);
    expect(hearthBuilt(over)).toBe(true);
    expect(hearthBuilt(hearth)).toBe(false);
  });

  it('shows your own share as a whole percent, 0 when nothing is up', () => {
    expect(yourSharePercent(hearth)).toBe(43);
    expect(yourSharePercent({ ...hearth, placed: 0, yours: 0 })).toBe(0);
  });
});
