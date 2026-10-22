import { describe, expect, it } from 'vitest';
import {
  RULES,
  beatsRecord,
  chooseLineup,
  createSeededRng,
  gamesContent,
  gamesXp,
  medalPoints,
  placesToMedals,
} from '../src/index';

describe('chooseLineup', () => {
  const pool = gamesContent.events;

  it('picks four events, exactly one team event (last), no kind twice', () => {
    for (let s = 0; s < 50; s++) {
      const day = chooseLineup(pool, createSeededRng(`day:${String(s)}`));
      expect(day).toHaveLength(RULES.games.eventsPerDay);
      expect(day.filter((e) => e.team === 3)).toHaveLength(1);
      expect(day[day.length - 1]?.team).toBe(3);
      expect(new Set(day.map((e) => e.kind)).size).toBe(day.length);
    }
  });

  it("avoids yesterday's events when the pool allows it", () => {
    for (let s = 0; s < 30; s++) {
      const yesterday = chooseLineup(pool, createSeededRng(`y:${String(s)}`));
      const today = chooseLineup(
        pool,
        createSeededRng(`t:${String(s)}`),
        yesterday.map((e) => e.id),
      );
      // Two team events in the pool: the team event always changes.
      expect(today[3]?.id).not.toBe(yesterday[3]?.id);
      expect(new Set(today.map((e) => e.kind)).size).toBe(4);
    }
  });

  it('is deterministic for a seed and shows every event over time', () => {
    const ids = (seed: string) => chooseLineup(pool, createSeededRng(seed)).map((e) => e.id);
    expect(ids('same')).toEqual(ids('same'));
    const seen = new Set<string>();
    for (let s = 0; s < 80; s++) for (const id of ids(`all:${String(s)}`)) seen.add(id);
    expect(seen.size).toBe(pool.length);
  });

  it('a small pool repeats a kind or gives what it has; bad input throws', () => {
    const tiny = [
      { id: 'a', kind: 'x', team: 1 as const },
      { id: 'b', kind: 'x', team: 1 as const },
      { id: 'c', kind: 'y', team: 3 as const },
    ];
    expect(chooseLineup(tiny, createSeededRng('t'))).toHaveLength(3);
    expect(
      chooseLineup(tiny, createSeededRng('t'), [], 2)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['x', 'y']);
    expect(() => chooseLineup(tiny, createSeededRng('t'), [], 0)).toThrow(RangeError);
    expect(() =>
      chooseLineup([...tiny, tiny[0] as (typeof tiny)[number]], createSeededRng('t')),
    ).toThrow(/duplicate/);
  });
});

describe('medals, experience and records', () => {
  it('places 1 to 3 get gold, silver, bronze; ties share the medal', () => {
    expect(placesToMedals([{ place: 1 }, { place: 2 }, { place: 3 }, { place: 4 }])).toEqual([
      'gold',
      'silver',
      'bronze',
      null,
    ]);
    expect(
      placesToMedals([{ place: 1 }, { place: 1 }, { place: 3 }, { place: 3 }, { place: 5 }]),
    ).toEqual(['gold', 'gold', 'bronze', 'bronze', null]);
    expect(() => placesToMedals([{ place: 0 }])).toThrow(RangeError);
  });

  it('experience: flat for entering, plus the place and the pin', () => {
    const xp = RULES.games.xp;
    expect(gamesXp(null, false)).toBe(xp.enter);
    expect(gamesXp(1, false)).toBe(xp.enter + (xp.place[0] as number));
    expect(gamesXp(3, true)).toBe(xp.enter + (xp.place[2] as number) + xp.pin);
    expect(gamesXp(7, false)).toBe(xp.enter);
  });

  it('medal points price a pocket', () => {
    const p = RULES.games.medalPoints;
    expect(medalPoints({ gold: 2, silver: 1, bronze: 3, pin: 4 })).toBe(
      2 * p.gold + p.silver + 3 * p.bronze + 4 * p.pin,
    );
    expect(() => medalPoints({ gold: -1, silver: 0, bronze: 0, pin: 0 })).toThrow(RangeError);
  });

  it('a record is beaten only by a higher score, and a first entry earns no pin', () => {
    expect(beatsRecord(undefined, 50)).toBe(false);
    expect(beatsRecord(40, 50)).toBe(true);
    expect(beatsRecord(50, 50)).toBe(false);
  });

  it('locks at the daily reset and shows three minutes later', () => {
    expect(RULES.games.lockAt).toEqual(RULES.daily.reset);
    expect(RULES.games.showAt).toEqual({ hour: 13, minute: 40 });
  });
});
