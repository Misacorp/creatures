import { describe, expect, it } from 'vitest';
import { RULES, dailyAllowance, leetBonusForDay } from '@creatures/game';
import { baitForDay } from '../../../apps/worker/src/economy';
import { runEconomy } from '../src/economy';
import { dayIncome, parseIncomeModel, playerIncome } from '../src/income';
import { PRESETS, type PlayerProfile } from '../src/profiles';

describe('income models', () => {
  it('current: only a leet pays, by the Worker table', () => {
    for (const n of [0, 1, 2, 3, 6, 10, 12, 20]) {
      expect(dayIncome('current', n)).toEqual({ perLogin: 0, perLeet: baitForDay(n) });
    }
    const income = dayIncome('current', 4);
    expect(playerIncome(income, true, false)).toBe(0);
    expect(playerIncome(income, true, true)).toBe(baitForDay(4));
    expect(playerIncome(income, false, false)).toBe(0);
  });

  it('allowance: every login pays the allowance and a leet adds the bonus', () => {
    for (const n of [1, 2, 3, 5, 10, 15]) {
      const income = dayIncome('allowance', n);
      expect(income).toEqual({ perLogin: dailyAllowance(), perLeet: leetBonusForDay(n) });
      expect(playerIncome(income, true, false)).toBe(RULES.income.dailyAllowance);
      expect(playerIncome(income, true, true)).toBe(dailyAllowance() + leetBonusForDay(n));
      expect(playerIncome(income, false, false)).toBe(0);
    }
    expect(dayIncome('allowance', 0).perLeet).toBe(0);
  });

  it('allowance: more leeters never pay anyone less, a solo leet equals a double', () => {
    let last = 0;
    for (let n = 1; n <= 20; n++) {
      const bonus = dayIncome('allowance', n).perLeet;
      expect(bonus).toBeGreaterThanOrEqual(last);
      last = bonus;
    }
    expect(dayIncome('allowance', 1).perLeet).toBe(dayIncome('allowance', 2).perLeet);
  });

  it('reads the model name', () => {
    expect(parseIncomeModel('current')).toBe('current');
    expect(parseIncomeModel('allowance')).toBe('allowance');
    expect(() => parseIncomeModel('free')).toThrow(/--income/);
  });
});

function solo(profile: Partial<PlayerProfile>): PlayerProfile {
  return { ...PRESETS.regular, id: 'solo', label: 'Solo', ...profile };
}

describe('income in the economy', () => {
  const weeklyBait = (profile: PlayerProfile, income: 'current' | 'allowance'): number[] => {
    const result = runEconomy({
      seed: 'income',
      weeks: 3,
      roster: [{ profile }],
      income,
      snapshotWeeks: [],
    });
    return (result.players[0]?.weeks ?? []).map((w) => w.baitEarned);
  };

  it('a player who opens the game every day without leeting earns only under the allowance', () => {
    const profile = solo({ loginDays: 7, leetDays: 0 });
    expect(weeklyBait(profile, 'current')).toEqual([0, 0, 0]);
    expect(weeklyBait(profile, 'allowance')).toEqual([7, 7, 7].map((d) => d * dailyAllowance()));
  });

  it('a daily leeter earns the leet pay (current) or the allowance plus the bonus (allowance)', () => {
    const profile = solo({ loginDays: 7, leetDays: 7 });
    expect(weeklyBait(profile, 'current')).toEqual([7, 7, 7].map((d) => d * baitForDay(1)));
    expect(weeklyBait(profile, 'allowance')).toEqual(
      [7, 7, 7].map((d) => d * (dailyAllowance() + leetBonusForDay(1))),
    );
  });

  it('a player who logs in on 3 days earns the allowance on 3 days', () => {
    const profile = solo({ loginDays: 3, leetDays: 0 });
    expect(weeklyBait(profile, 'allowance')).toEqual([3, 3, 3].map((d) => d * dailyAllowance()));
  });

  it('the default income is the current one', () => {
    const profile = solo({ loginDays: 7, leetDays: 2 });
    const run = (income?: 'current'): number[] =>
      (
        runEconomy({
          seed: 'income',
          weeks: 2,
          roster: [{ profile }],
          snapshotWeeks: [],
          ...(income === undefined ? {} : { income }),
        }).players[0]?.weeks ?? []
      ).map((w) => w.baitEarned);
    expect(run()).toEqual(run('current'));
  });
});
