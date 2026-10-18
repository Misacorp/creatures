import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { ExperienceView } from './experience';
import { craftingGain, experienceGain } from './xp-gain';

const view = (over: Partial<ExperienceView> = {}): ExperienceView => ({
  creatureId: 'c',
  gained: 8,
  treat: false,
  levelBefore: 6,
  level: 6,
  exp: 140,
  needed: 222,
  waiting: false,
  gold: false,
  ...over,
});

describe("a worker's experience on the bar", () => {
  it("puts the server's numbers on the bar from its level to the next", () => {
    const gain = experienceGain(view(), 'Cindle');
    expect(gain.gain).toBe('+8');
    expect(gain.levels).toEqual({ from: 6, to: 6 });
    expect(gain.bar).toEqual({
      value: 140,
      max: 222,
      startCap: 'Lv 6',
      endCap: 'Lv 7',
      label: "Cindle's experience",
    });
  });

  it('reports a level up, a treat and a Gold Ribbon, and "waiting" only without the Gold Ribbon', () => {
    const up = experienceGain(view({ levelBefore: 5, treat: true, waiting: true }), 'Cindle');
    expect(up.levels).toEqual({ from: 5, to: 6 });
    expect(up.treat).toBe(true);
    expect(up.waiting).toBe(true);
    const gold = experienceGain(view({ gold: true, waiting: true }), 'Cindle');
    expect(gold.gold).toBe(true);
    expect(gold.waiting).toBe(false);
  });

  it('is a full bar at the top level', () => {
    const top = experienceGain(view({ needed: null, level: 30, levelBefore: 30 }), 'Cindle');
    expect(top.bar).toMatchObject({ value: 1, max: 1, text: 'Top level', startCap: 'Lv 30' });
    expect(top.bar.endCap).toBeUndefined();
  });
});

describe('the Crafting XP on its bar', () => {
  const table = RULES.gear.skill.xpForLevel;

  it('measures the XP from the start of the level to the next, in its own tone', () => {
    // Level 2 starts at the table's second number; 140 total XP is 40 into it.
    const gain = craftingGain({ xp: 12, skillXp: 140, skillLevel: 2, leveledUp: false }, 'Cindle');
    expect(gain.gain).toBe('+12');
    expect(gain.levels).toEqual({ from: 2, to: 2 });
    expect(gain.bar).toEqual({
      value: 140 - (table[1] ?? 0),
      max: (table[2] ?? 0) - (table[1] ?? 0),
      startCap: 'Lv 2',
      endCap: 'Lv 3',
      label: "Cindle's Crafting XP",
      tone: 'craft',
    });
  });

  it('knows the level before a job that levelled the skill up, from the XP before it', () => {
    const next = table[2] ?? 0;
    const gain = craftingGain(
      { xp: 12, skillXp: next + 5, skillLevel: 3, leveledUp: true },
      'Cindle',
    );
    expect(gain.levels).toEqual({ from: 2, to: 3 });
    expect(gain.leveledUp).toBe(true);
    expect(gain.bar.value).toBe(5);
  });

  it('is a full bar at the top level', () => {
    const top = table.length;
    const gain = craftingGain(
      { xp: 12, skillXp: (table[top - 1] ?? 0) + 50, skillLevel: top, leveledUp: false },
      'Cindle',
    );
    expect(gain.bar).toMatchObject({ value: 1, max: 1, text: 'Top level', tone: 'craft' });
  });
});
