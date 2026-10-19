import { RULES, expToNext, xpBoostTotalBp } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { ExperienceView } from './experience';
import {
  boostLabel,
  boostLines,
  experienceBoost,
  multiplierText,
  partValue,
  showsTimes,
} from './xp-boost-view';
import { legsOf, numbers, pct } from './xp-change';
import { craftingGain, experienceGain, explorerGain } from './xp-gain';

const view = (over: Partial<ExperienceView> = {}): ExperienceView => ({
  creatureId: 'c',
  gained: 16,
  treat: false,
  levelBefore: 7,
  level: 7,
  exp: 174,
  needed: expToNext(7),
  waiting: false,
  gold: false,
  ...over,
});

describe('the bars a gain went through', () => {
  it('is one bar from the old value to the new one inside a level', () => {
    expect(
      legsOf({ levelBefore: 7, level: 7, value: 174, max: 273, gained: 16, sizeOf: expToNext }),
    ).toEqual([{ level: 7, max: 273, from: 158, to: 174 }]);
  });

  it("fills the old level's bar and starts the new one with the rest", () => {
    // 60 gained, 37 into level 8: the other 23 filled level 7 from 250 to its top.
    expect(
      legsOf({
        levelBefore: 7,
        level: 8,
        value: 37,
        max: expToNext(8),
        gained: 60,
        sizeOf: expToNext,
      }),
    ).toEqual([
      { level: 7, max: expToNext(7), from: expToNext(7) - 23, to: expToNext(7) },
      { level: 8, max: expToNext(8), from: 0, to: 37 },
    ]);
  });

  it('crosses several levels, each a full bar but the first and the last', () => {
    const legs = legsOf({
      levelBefore: 3,
      level: 5,
      value: 10,
      max: expToNext(5),
      gained: expToNext(4) + 30,
      sizeOf: expToNext,
    });
    expect(legs.map((l) => l.level)).toEqual([3, 4, 5]);
    expect(legs[1]).toEqual({ level: 4, max: expToNext(4), from: 0, to: expToNext(4) });
    expect(legs[0]).toEqual({
      level: 3,
      max: expToNext(3),
      from: expToNext(3) - 20,
      to: expToNext(3),
    });
  });

  it('never starts a bar below empty when the server says less than the bar shows', () => {
    expect(
      legsOf({ levelBefore: 7, level: 7, value: 5, max: 273, gained: 50, sizeOf: expToNext }),
    ).toEqual([{ level: 7, max: 273, from: 0, to: 5 }]);
  });

  it('is a full bar at the top', () => {
    const top = experienceGain(
      view({ levelBefore: 30, level: 30, needed: null, exp: 0 }),
      'Cindle',
    );
    expect(top.top).toBe(true);
    expect(numbers(top)).toBe('Top level');
    expect(top.legs.at(-1)).toEqual({ level: 30, max: 1, from: 1, to: 1 });
  });

  it('floors the percent, so a bar is never full before it is', () => {
    expect(pct(272, 273)).toBe(99.6);
    expect(pct(0, 0)).toBe(0);
  });
});

describe('the three kinds of XP gain', () => {
  it("puts a creature's experience on its bar, with the flags it has", () => {
    const gain = experienceGain(view(), 'Cindle');
    expect(gain).toMatchObject({
      kind: 'experience',
      unit: 'Lv',
      from: 7,
      to: 7,
      gained: 16,
      label: "Cindle's experience",
      boost: null,
    });
    expect(numbers(gain)).toBe('174 / 273');
    const gold = experienceGain(view({ gold: true, waiting: true }), 'Cindle');
    expect(gold.gold).toBe(true);
    expect(gold.waiting).toBe(false);
    expect(experienceGain(view({ waiting: true }), 'Cindle').waiting).toBe(true);
  });

  it('measures Crafting XP from the start of its level, and knows the level before', () => {
    const table = RULES.gear.skill.xpForLevel;
    const gain = craftingGain({ xp: 12, skillXp: (table[1] ?? 0) + 40, skillLevel: 2 }, 'Cindle');
    expect(gain).toMatchObject({ kind: 'crafting', from: 2, to: 2, gained: 12 });
    expect(gain.legs).toEqual([
      { level: 2, max: (table[2] ?? 0) - (table[1] ?? 0), from: 28, to: 40 },
    ]);
    const up = craftingGain({ xp: 12, skillXp: (table[2] ?? 0) + 5, skillLevel: 3 }, 'Cindle');
    expect([up.from, up.to]).toEqual([2, 3]);
    expect(up.legs.map((l) => [l.from, l.to])).toEqual([
      [(table[2] ?? 0) - (table[1] ?? 0) - 7, (table[2] ?? 0) - (table[1] ?? 0)],
      [0, 5],
    ]);
    const boost = {
      parts: [{ source: 'gear' as const, name: 'Apprentice', bp: 2000 }],
      totalBp: 12_000,
    };
    expect(craftingGain({ xp: 12, skillXp: 140, skillLevel: 2, xpBoost: boost }, 'C').boost).toBe(
      boost,
    );
    const top = table.length;
    expect(
      craftingGain({ xp: 12, skillXp: (table[top - 1] ?? 0) + 50, skillLevel: top }, 'C').top,
    ).toBe(true);
  });

  it('counts explorer XP in ranks', () => {
    const gain = explorerGain({
      gained: 300,
      rank: 4,
      rankBefore: 3,
      value: 60,
      max: 1500,
      name: 'Sproutle',
    });
    expect(gain).toMatchObject({ kind: 'explorer', unit: 'Rank', from: 3, to: 4 });
    expect(gain.legs).toHaveLength(2);
    expect(
      numbers(
        explorerGain({ gained: 1, rank: 10, rankBefore: 10, value: 1, max: null, name: 'S' }),
      ),
    ).toBe('Top rank');
  });
});

describe('the multiplier of a gain', () => {
  const treat2 = {
    parts: [{ source: 'treat' as const, name: 'Treat', times: 2 }],
    totalBp: 20_000,
  };
  const hearty = {
    parts: [{ source: 'day' as const, name: 'Hearty Breakfast', bp: 2500 }],
    totalBp: 12_500,
  };
  const several = {
    parts: [
      { source: 'treat' as const, name: 'Treat', times: 3 },
      { source: 'day' as const, name: 'Hearty Breakfast', bp: 2500 },
      { source: 'day' as const, name: 'Cold Snap', bp: -2000 },
    ],
    totalBp: 30_000,
  };

  it('writes every multiplier as a decimal with an x: up to two decimals, no trailing zeros', () => {
    expect(
      [20_000, 15_000, 12_500, 37_500, 8_000, 31_500, 35_100, 10_000, 11_250, 0].map(
        multiplierText,
      ),
    ).toEqual(['2x', '1.5x', '1.25x', '3.75x', '0.8x', '3.15x', '3.51x', '1x', '1.13x', '0x']);
  });

  it('words each part as its multiplier, a share too, and the total the same way', () => {
    expect(several.parts.map(partValue)).toEqual(['3x', '1.25x', '0.8x']);
    expect(partValue({ source: 'gear', name: 'Trail XP', bp: 1700 })).toBe('1.17x');
    expect(partValue({ source: 'treat', name: 'Treat', times: 1.5 })).toBe('1.5x');
    expect(boostLines(several)).toEqual({
      parts: [
        { name: 'Treat', value: '3x', treat: true },
        { name: 'Hearty Breakfast', value: '1.25x', treat: false },
        { name: 'Cold Snap', value: '0.8x', treat: false },
      ],
      total: '3x',
    });
    expect(boostLabel(treat2, 'Experience')).toBe('Experience 2x: Treat 2x. What changed it?');
  });

  it('shows the chip only when the total is not 1x', () => {
    expect([showsTimes(treat2), showsTimes(hearty), showsTimes(null)]).toEqual([true, true, false]);
    const even = { parts: [{ source: 'day' as const, name: 'X', bp: 0 }], totalBp: 10_000 };
    expect(showsTimes(even)).toBe(false);
  });

  it("takes the server's boost, and reads a result from before it from what it had", () => {
    expect(experienceBoost(view({ boost: several }))).toBe(several);
    expect(experienceBoost(view())).toBeNull();
    // A trip's or job's treat from before: the usual doubling.
    expect(experienceBoost(view({ treat: true }))).toEqual({
      parts: [{ source: 'treat', name: 'Treat', times: RULES.experience.treat.multiplier }],
      totalBp: RULES.experience.treat.multiplier * 10_000,
    });
    // A dungeon run's older fields.
    expect(
      experienceBoost(
        view({
          treat: true,
          treatTimes: 3,
          dayEffects: [
            { name: 'Hearty Breakfast', bp: 2500 },
            { name: 'Quiet', bp: 0 },
          ],
        }),
      ),
    ).toEqual({
      parts: [
        { source: 'treat', name: 'Treat', times: 3 },
        { source: 'day', name: 'Hearty Breakfast', bp: 2500 },
      ],
      totalBp: 37_500,
    });
  });

  it("reads an older dungeon result's total by the shared rule: every part multiplies", () => {
    const old = experienceBoost(
      view({
        treat: true,
        treatTimes: 3,
        dayEffects: [
          { name: 'Hearty Breakfast', bp: 2500 },
          { name: 'Cold Snap', bp: -2000 },
        ],
      }),
    );
    // 3 x 1.25 x 0.8 = 3x (added, it was 3.15x).
    expect(old?.totalBp).toBe(30_000);
    expect(old?.totalBp).toBe(xpBoostTotalBp(old?.parts ?? []));
  });
});
