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
  pocketPoints,
} from '../src/index';

describe('chooseLineup', () => {
  const pool = gamesContent.events;

  it('picks three events, exactly one team event (last), no kind twice, no bonus', () => {
    for (let s = 0; s < 50; s++) {
      const day = chooseLineup(pool, createSeededRng(`day:${String(s)}`));
      expect(day).toHaveLength(RULES.games.eventsPerDay);
      expect(day.filter((e) => e.team === 3)).toHaveLength(1);
      expect(day[day.length - 1]?.team).toBe(3);
      expect(new Set(day.map((e) => e.kind)).size).toBe(day.length);
      expect(day.some((e) => e.bonus === true)).toBe(false);
    }
  });

  it('a bonus day adds one solo bonus event of a new kind before the team closer', () => {
    for (let s = 0; s < 50; s++) {
      const day = chooseLineup(
        pool,
        createSeededRng(`bonus:${String(s)}`),
        [],
        RULES.games.eventsPerDay,
        RULES.games.teamEventsPerDay,
        true,
      );
      expect(day).toHaveLength(RULES.games.eventsPerDay + 1);
      expect(day.filter((e) => e.team === 3)).toHaveLength(1);
      expect(day[day.length - 1]?.team).toBe(3);
      const bonus = day.filter((e) => e.bonus === true);
      expect(bonus).toHaveLength(1);
      expect(bonus[0]?.team).toBe(1);
      expect(day[day.length - 2]?.bonus).toBe(true);
      expect(new Set(day.map((e) => e.kind)).size).toBe(day.length);
      expect(new Set(day.map((e) => e.id)).size).toBe(day.length);
    }
  });

  it('the bonus draw keeps the regular draw and falls back to a team event without solos', () => {
    const plain = chooseLineup(pool, createSeededRng('same'));
    const withBonus = chooseLineup(pool, createSeededRng('same'), [], 3, 1, true);
    expect(withBonus.filter((e) => e.bonus !== true).map((e) => e.id)).toEqual(
      plain.map((e) => e.id),
    );
    const teamsOnly = [
      { id: 'a', kind: 'x', team: 3 as const },
      { id: 'b', kind: 'y', team: 3 as const },
    ];
    const day = chooseLineup(teamsOnly, createSeededRng('t'), [], 1, 1, true);
    expect(day).toHaveLength(2);
    expect(day.filter((e) => e.bonus === true)).toHaveLength(1);
    expect(chooseLineup(teamsOnly, createSeededRng('t'), [], 2, 1, true)).toHaveLength(2);
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
      const last = RULES.games.eventsPerDay - 1;
      expect(today[last]?.id).not.toBe(yesterday[last]?.id);
      expect(new Set(today.map((e) => e.kind)).size).toBe(RULES.games.eventsPerDay);
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

  it('the bonus event puts double medal points in the pocket', () => {
    expect(RULES.games.bonus.pocketBp).toBe(20_000);
    expect(pocketPoints(4, false)).toBe(4);
    expect(pocketPoints(4, true)).toBe(8);
    expect(pocketPoints(0, true)).toBe(0);
    expect(() => pocketPoints(-1, true)).toThrow(RangeError);
    expect(() => pocketPoints(1.5, false)).toThrow(RangeError);
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
