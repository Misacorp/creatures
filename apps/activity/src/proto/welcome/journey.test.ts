import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY, WEEKLY, eventsOf, gapDays, parseEvent, replayTitle } from './journey';

/** The lab's files, from the package's folder (vitest runs there). */
const LAB = '../../docs/design/valley/economy/journeys';
const COPY = 'src/proto/welcome/journeys';

describe('the journeys the prototype plays', () => {
  it.each(['daily.json', 'weekly.json'])(
    'has a copy of the lab’s %s that is byte for byte the same (run `pnpm --filter @creatures/activity proto:journeys`)',
    (file) => {
      expect(readFileSync(`${COPY}/${file}`, 'utf8')).toBe(readFileSync(`${LAB}/${file}`, 'utf8'));
    },
  );

  it('are a daily player’s four weeks and a weekly player’s four Sundays', () => {
    expect(DAILY.visits).toHaveLength(28);
    expect(DAILY.visits[0]).toMatchObject({ week: 1, day: 1, weekday: 'Monday' });
    expect(WEEKLY.visits.map((v) => v.weekday)).toEqual(Array(4).fill('Sunday'));
    expect(WEEKLY.visits.map((v) => v.day)).toEqual([7, 14, 21, 28]);
  });

  it('reads every event of both journeys into a known kind (nothing falls to a plain line)', () => {
    const plain = [...DAILY.visits, ...WEEKLY.visits]
      .flatMap((v) => eventsOf(v))
      .filter((e) => e.kind === 'plain');
    expect(plain).toEqual([]);
  });

  it('counts the days since the last visit; the first counts from the start of the run', () => {
    expect(gapDays(DAILY, 0)).toBe(1);
    expect(gapDays(DAILY, 5)).toBe(1);
    expect(gapDays(WEEKLY, 0)).toBe(7);
    expect(gapDays(WEEKLY, 2)).toBe(7);
    expect(gapDays(WEEKLY, 99)).toBe(0);
  });

  it('titles a replay by who, week and weekday', () => {
    expect(replayTitle(DAILY, 0)).toBe('Daily · week 1, Mon (day 1)');
    expect(replayTitle(WEEKLY, 3)).toBe('Weekly · week 4, Sun (day 28)');
    expect(replayTitle(WEEKLY, 9)).toBe('');
  });
});

describe('parseEvent', () => {
  it('reads a new line', () => {
    expect(parseEvent('new line: splashet')).toEqual({ kind: 'new-line', line: 'splashet' });
    expect(parseEvent('new line: new line 16 (common)')).toEqual({
      kind: 'new-line',
      line: 'new line 16 (common)',
    });
  });

  it('reads a mastery step of a scout seat or an anvil', () => {
    expect(parseEvent('mastery: scout seat 2 reached Expert')).toEqual({
      kind: 'mastery',
      post: 'scout',
      seat: 2,
      step: 'Expert',
    });
    expect(parseEvent('mastery: anvil 1 reached Master')).toEqual({
      kind: 'mastery',
      post: 'anvil',
      seat: 1,
      step: 'Master',
    });
  });

  it('keeps an unknown mastery step as a plain line', () => {
    const text = 'mastery: anvil 1 reached Grand Master';
    expect(parseEvent(text)).toEqual({ kind: 'plain', text });
  });

  it('reads a graduation, singular or plural', () => {
    expect(parseEvent('graduation: 3 creatures earned Bronze')).toEqual({
      kind: 'graduation',
      count: 3,
      honour: 'Bronze',
    });
    expect(parseEvent('graduation: 1 creature earned Silver')).toEqual({
      kind: 'graduation',
      count: 1,
      honour: 'Silver',
    });
  });

  it('reads a place level-up', () => {
    expect(parseEvent('place level-up: bonfire reached level 3')).toEqual({
      kind: 'place-level',
      place: 'bonfire',
      level: 3,
    });
  });

  it('reads the visitor: arrival, blueprint (new or a copy) and reroll', () => {
    expect(parseEvent('visitor: he is in the valley until the raid finale')).toEqual({
      kind: 'visitor-arrives',
    });
    expect(
      parseEvent("visitor: bought the week's blueprint (a new one) for 120 Acorns and 40 shards"),
    ).toEqual({ kind: 'visitor-blueprint', isNew: true, acorns: 120, shards: 40 });
    expect(
      parseEvent(
        "visitor: bought the week's blueprint (a copy of one already known: its quality rises) for 120 Acorns and 40 shards",
      ),
    ).toMatchObject({ kind: 'visitor-blueprint', isNew: false });
    expect(
      parseEvent(
        'visitor: rerolled a epic piece (item level 12.5) for 90 Acorns and 33 scrap: lines [1, 2] became [3, 4] (1 at the top pip)',
      ),
    ).toEqual({
      kind: 'visitor-reroll',
      rarity: 'epic',
      itemLevel: 12.5,
      acorns: 90,
      scrap: 33,
    });
  });

  it('keeps a string it does not understand as a plain line, as it was', () => {
    const text = 'something new the lab says: 12';
    expect(parseEvent(text)).toEqual({ kind: 'plain', text });
    expect(parseEvent('')).toEqual({ kind: 'plain', text: '' });
  });
});
