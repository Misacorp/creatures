import { describe, expect, it } from 'vitest';
import {
  MAX_RIBBONS,
  RULES,
  addExperience,
  addEventExperience,
  addRoomExperience,
  dungeonExperience,
  earnedFromTally,
  emptyEarned,
  MAX_EVENT_XP,
  type DungeonEarned,
  expToNext,
  expToReach,
  nextUnlock,
  raidExperience,
  ribbonCeiling,
  ribbonNeeded,
  ribbonParts,
  ribbonsForLevel,
  treatCost,
  treatPart,
  tripExperience,
  unlockLadder,
  workshopExperience,
  xpBoostTotalBp,
  type ExpState,
  type XpBoostPart,
} from '../src/index';

const base = (over: Partial<ExpState> = {}): ExpState => ({
  level: 1,
  exp: 0,
  ribbons: 0,
  levelCap: 30,
  ...over,
});

describe('the experience curve', () => {
  it('costs 25 x L + 2 x L x L from level L to L + 1', () => {
    expect(expToNext(1)).toBe(27);
    expect(expToNext(10)).toBe(450);
    expect(expToNext(20)).toBe(1_300);
    expect(expToNext(29)).toBe(2_407);
    for (const level of [1, 7, 15, 25]) {
      expect(expToNext(level)).toBe(25 * level + 2 * level * level);
    }
  });

  it('takes about 28,000 experience from level 1 to 30', () => {
    expect(expToReach(1)).toBe(0);
    expect(expToReach(2)).toBe(27);
    expect(expToReach(30)).toBeGreaterThan(27_000);
    expect(expToReach(30)).toBeLessThan(29_000);
  });

  it('rejects levels that are not whole numbers from 1', () => {
    expect(() => expToNext(0)).toThrow(RangeError);
    expect(() => expToNext(1.5)).toThrow(RangeError);
  });
});

describe('gaining experience', () => {
  it('levels up as often as the experience allows and keeps the rest', () => {
    const gain = addExperience(base(), 27 + 58 + 10);
    expect(gain).toMatchObject({ level: 3, exp: 10, levelsGained: 2, waiting: false, gold: false });
    expect(addExperience(base({ level: 5, exp: 3 }), 0)).toMatchObject({ level: 5, exp: 3 });
  });

  it('stops at level 10 until the Bronze Ribbon, banking at most the next level’s need', () => {
    const at = base({ level: 9, exp: 0 });
    const reached = addExperience(at, expToNext(9) + 5_000);
    expect(reached.level).toBe(10);
    expect(reached.exp).toBe(expToNext(10));
    expect(reached.waiting).toBe(true);
    // More experience while waiting adds nothing.
    expect(addExperience(reached, 999).exp).toBe(expToNext(10));
    // The ribbon (ribbons 1) lets the banked experience level the creature up at once.
    const opened = addExperience({ ...reached, ribbons: 1 }, 0);
    expect(opened.level).toBe(11);
    expect(opened.exp).toBe(0);
  });

  it('stops at level 20 until the Silver Ribbon, and the Gold Ribbon comes with level 30', () => {
    const atTwenty = addExperience(base({ level: 19, ribbons: 1 }), 1_000_000);
    expect(atTwenty.level).toBe(20);
    expect(atTwenty.exp).toBe(expToNext(20));
    const top = addExperience({ ...atTwenty, ribbons: 2 }, 1_000_000);
    expect(top).toMatchObject({ level: 30, exp: 0, ribbons: MAX_RIBBONS, gold: true });
    // Nothing is banked at the top, and the Gold Ribbon is awarded once.
    expect(addExperience(top, 500)).toMatchObject({ level: 30, exp: 0, gold: false });
  });

  it('stops a first stage at its level cap until it evolves, then spends the bank', () => {
    const stage1 = base({ level: 14, ribbons: 1, levelCap: 15 });
    const capped = addExperience(stage1, 100_000);
    expect(capped.level).toBe(15);
    expect(capped.exp).toBe(expToNext(15));
    expect(capped.waiting).toBe(true);
    const evolved = addExperience({ ...capped, levelCap: 30 }, 0);
    expect(evolved.level).toBe(16);
    expect(evolved.levelsGained).toBe(1);
  });

  it('never loses or invents experience on the way', () => {
    for (const gained of [0, 1, 26, 27, 500, 4_000, 20_000]) {
      const before = base({ level: 4, exp: 11, ribbons: 2 });
      const after = addExperience(before, gained);
      const spent = expToReach(after.level) - expToReach(before.level);
      expect(after.exp + spent).toBe(before.exp + gained);
    }
  });

  it('only takes whole numbers', () => {
    expect(() => addExperience(base(), -1)).toThrow(RangeError);
    expect(() => addExperience(base(), 1.5)).toThrow(RangeError);
    expect(() => addExperience(base({ exp: -1 }), 1)).toThrow(RangeError);
  });
});

describe('ribbons', () => {
  const [bronze, silver] = RULES.experience.ribbons;

  it('are waited for at levels 10 and 20 only, in order', () => {
    expect(ribbonNeeded(10, 0)?.id).toBe('bronze');
    expect(ribbonNeeded(10, 1)).toBeNull();
    expect(ribbonNeeded(9, 0)).toBeNull();
    expect(ribbonNeeded(20, 1)?.id).toBe('silver');
    expect(ribbonNeeded(20, 0)).toBeNull();
    expect(ribbonCeiling(0)).toBe(10);
    expect(ribbonCeiling(1)).toBe(20);
    expect(ribbonCeiling(2)).toBe(30);
  });

  it('cost materials only: scrap, shards of the creature’s element, glimmer and trips', () => {
    expect(bronze).toMatchObject({ scrap: 6, shards: 2, glimmer: 0, trips: 0 });
    expect(silver).toMatchObject({ scrap: 15, shards: 5, glimmer: 1, trips: 5 });
    expect(ribbonParts(bronze as NonNullable<typeof bronze>, 'ember')).toEqual({
      scrap: 6,
      'ember-shard': 2,
    });
    expect(ribbonParts(silver as NonNullable<typeof silver>, 'tide')).toEqual({
      scrap: 15,
      'tide-shard': 5,
      glimmer: 1,
    });
  });

  it('are free for creatures already past their level (spec 12), Gold at the top', () => {
    expect(ribbonsForLevel(1)).toBe(0);
    expect(ribbonsForLevel(10)).toBe(0);
    expect(ribbonsForLevel(11)).toBe(1);
    expect(ribbonsForLevel(20)).toBe(1);
    expect(ribbonsForLevel(21)).toBe(2);
    expect(ribbonsForLevel(29)).toBe(2);
    expect(ribbonsForLevel(30)).toBe(MAX_RIBBONS);
  });
});

describe('what the activities give', () => {
  const NONE: XpBoostPart[] = [];
  const TREAT = [treatPart(RULES.experience.treat.multiplier)];

  it('pays a finished trip by its length, doubled by a treat', () => {
    expect(tripExperience('short', NONE)).toBe(RULES.experience.trip.short);
    expect(tripExperience('day', NONE)).toBe(RULES.experience.trip.day);
    expect(tripExperience('long', TREAT)).toBe(RULES.experience.trip.long * 2);
  });

  describe('the dungeon pays per room a creature stood in the row for', () => {
    const D = RULES.experience.dungeon;

    it('orders the rooms: cache < fight < elite < epic and keeper < floor boss', () => {
      expect(D.cache).toBeGreaterThan(0);
      expect(D.cache).toBeLessThan(D.fight);
      expect(D.fight).toBeLessThan(D.elite);
      expect(D.elite).toBeLessThan(D.epic);
      expect(D.keeper).toBeGreaterThanOrEqual(D.epic);
      expect(D.epic).toBeLessThan(D.boss);
      expect(D.keeper).toBeLessThan(D.boss);
    });

    it('adds each room to the creatures in the row only, and does not change the input', () => {
      const none = {};
      let all = addRoomExperience(none, ['a', 'b'], 'fight');
      all = addRoomExperience(all, ['a', 'c'], 'elite');
      all = addRoomExperience(all, ['a', 'b', 'c'], 'cache');
      expect(none).toEqual({});
      expect(all['a']).toEqual({
        ...emptyEarned(),
        base: D.fight + D.elite + D.cache,
        fights: 1,
        elites: 1,
        caches: 1,
      });
      expect(all['b']?.base).toBe(D.fight + D.cache);
      expect(all['c']?.base).toBe(D.elite + D.cache);
    });

    it('counts every kind of room under its own name', () => {
      let all: Record<string, DungeonEarned> = {};
      for (const kind of ['fight', 'elite', 'epic', 'keeper', 'boss', 'cache'] as const) {
        all = addRoomExperience(all, ['a'], kind);
      }
      expect(all['a']).toEqual({
        base: D.fight + D.elite + D.epic + D.keeper + D.boss + D.cache,
        fights: 1,
        elites: 1,
        epics: 1,
        keepers: 1,
        bosses: 1,
        caches: 1,
        events: 0,
      });
    });

    it('adds a mystery room that paid, and skips a zero', () => {
      const all = addEventExperience(addRoomExperience({}, ['a'], 'fight'), { a: 25, b: 25, c: 0 });
      expect(all['a']).toMatchObject({ base: D.fight + 25, fights: 1, events: 1 });
      expect(all['b']).toMatchObject({ base: 25, events: 1 });
      expect(all['c']).toBeUndefined();
    });

    it('pays the total once, times the treat, with no depth and no extra full-clear bonus', () => {
      expect(dungeonExperience(emptyEarned(), NONE)).toBe(0);
      const all = addRoomExperience(
        addRoomExperience(addRoomExperience({}, ['a'], 'fight'), ['a'], 'fight'),
        ['a'],
        'boss',
      );
      const earned = all['a'] as DungeonEarned;
      expect(earned.base).toBe(2 * D.fight + D.boss);
      expect(dungeonExperience(earned, NONE)).toBe(2 * D.fight + D.boss);
      expect(dungeonExperience(earned, TREAT)).toBe(2 * (2 * D.fight + D.boss));
    });

    it('prices an older run by its tally: plain fights, and the boss for the row that beat it', () => {
      expect(earnedFromTally({ a: 4, b: 2, z: 0 }, ['a'])).toEqual({
        a: { ...emptyEarned(), base: 3 * D.fight + D.boss, fights: 3, bosses: 1 },
        b: { ...emptyEarned(), base: 2 * D.fight, fights: 2 },
      });
    });

    it('keeps the event cap in step with the schema', () => {
      expect(D.maxEvent).toBe(MAX_EVENT_XP);
    });
  });

  it('pays a raid stage, one and a half times when cleared', () => {
    const { phase1, phase2, finale } = RULES.experience.raid;
    expect(raidExperience('phase1', false, NONE)).toBe(phase1);
    expect(raidExperience('phase1', true, NONE)).toBe(Math.floor(phase1 * 1.5));
    expect(raidExperience('phase2', true, NONE)).toBe(Math.floor(phase2 * 1.5));
    expect(raidExperience('finale', true, NONE)).toBe(Math.floor(finale * 1.5));
    expect(raidExperience('finale', false, NONE)).toBe(finale);
  });

  it('pays a Workshop job its per-hour rate for its nominal work, rounded down', () => {
    const perHour = RULES.experience.workshopPerHour;
    expect(workshopExperience(0, NONE)).toBe(0);
    expect(workshopExperience(60, NONE)).toBe(perHour);
    expect(workshopExperience(180, NONE)).toBe(3 * perHour);
    expect(workshopExperience(600, TREAT)).toBe(10 * perHour * 2);
    expect(workshopExperience(1, NONE)).toBe(Math.floor(perHour / 60));
  });

  it('every gain is its base times the Total of its parts, by the one rule of xp-boost.ts', () => {
    const parts: XpBoostPart[] = [
      treatPart(2),
      { source: 'day', name: 'Hearty Breakfast', bp: 2_500 },
      { source: 'day', name: 'Cold Snap', bp: -2_000 },
    ];
    const total = xpBoostTotalBp(parts);
    expect(total).toBe(20_000);
    expect(tripExperience('long', parts)).toBe(
      Math.floor((RULES.experience.trip.long * total) / 10_000),
    );
    expect(workshopExperience(360, parts)).toBe(
      Math.floor((Math.floor((360 * RULES.experience.workshopPerHour) / 60) * total) / 10_000),
    );
  });

  it('prices a treat at 3 + half the level, rounded up', () => {
    expect(treatCost(1)).toBe(4);
    expect(treatCost(10)).toBe(8);
    expect(treatCost(20)).toBe(13);
    expect(treatCost(29)).toBe(18);
    expect(treatCost(2)).toBe(4);
  });
});

describe('the unlock ladder', () => {
  it('lists Scarf 7, Bronze 10, Charm 13, evolution 15, Silver 20, talent 3 at 25 and Gold 30 in order', () => {
    const ladder = unlockLadder('rare', 15);
    expect(ladder.map((u) => [u.level, u.name])).toEqual([
      [7, 'Scarf'],
      [10, 'Bronze Ribbon'],
      [13, 'Charm'],
      [15, 'Evolution'],
      [20, 'Silver Ribbon'],
      [20, 'Second talent'],
      [25, 'Third talent'],
      [30, 'Gold Ribbon'],
    ]);
  });

  it('leaves out what a species does not have: no evolution, no third talent for a common', () => {
    const names = unlockLadder('common').map((u) => u.name);
    expect(names).not.toContain('Evolution');
    expect(names).not.toContain('Third talent');
    expect(names).toContain('Second talent');
  });

  it('names the next unlock above a level', () => {
    expect(nextUnlock(1, 'common', 15)).toEqual({ level: 7, name: 'Scarf' });
    expect(nextUnlock(7, 'common', 15)).toEqual({ level: 10, name: 'Bronze Ribbon' });
    expect(nextUnlock(14, 'common', 15)).toEqual({ level: 15, name: 'Evolution' });
    expect(nextUnlock(30, 'epic')).toBeNull();
  });
});
