import { describe, expect, it } from 'vitest';
import {
  CALM_LINE,
  comingUp,
  homeAlerts,
  needsYou,
  placeCards,
  valleyToday,
  whenText,
} from './home-view';
import { HOME_TZ, homeInput } from './workbench/home-mockups/home-data';

/** The fixture clock: Saturday 10:00 in Helsinki. Games lock 13:37, a trip back 15:20, a job ready 14:05, Phase 2 13:37, finale Sunday 20:00. */

describe('whenText', () => {
  it('gives the time of day on the same local day and the weekday on another', () => {
    const now = Date.UTC(2027, 1, 13, 8, 0);
    expect(whenText(now, Date.UTC(2027, 1, 13, 13, 20), HOME_TZ)).toBe('15:20');
    expect(whenText(now, Date.UTC(2027, 1, 14, 18, 0), HOME_TZ)).toBe('Sun 20:00');
  });

  it('counts the day in the guild timezone, not UTC', () => {
    const now = Date.UTC(2027, 1, 13, 21, 30);
    // 23:30 Saturday in Helsinki; 00:30 is already Sunday there.
    expect(whenText(now, Date.UTC(2027, 1, 13, 22, 30), HOME_TZ)).toBe('Sun 00:30');
  });
});

describe('needsYou', () => {
  it('has one row per place with a pip, the Games door first', () => {
    const rows = needsYou(homeInput('busy', true));
    expect(rows.map((r) => r.place)).toEqual([
      'games',
      'raid',
      'expeditions',
      'workshop',
      'dungeon',
    ]);
    expect(rows[0]).toMatchObject({ reason: '2 events are open to enter', until: 'by 13:37' });
    expect(rows[2]?.reason).toBe('Cindle is home from Tidepools');
    expect(rows[3]?.reason).toBe('Craft Kelp Cap is ready');
  });

  it('has a row exactly where the navigation has a pip', () => {
    for (const state of ['busy', 'nothing waiting', 'crowded']) {
      const input = homeInput(state, true);
      const alerts = homeAlerts(input);
      const waiting = Object.entries(alerts)
        .filter(([, reason]) => reason !== null)
        .map(([place]) => place)
        .sort();
      expect(
        needsYou(input)
          .map((r) => r.place)
          .sort(),
      ).toEqual(waiting);
    }
  });

  it('is empty when nothing waits, and counts when several trips and jobs wait', () => {
    expect(needsYou(homeInput('nothing waiting', true))).toEqual([]);
    const crowded = needsYou(homeInput('crowded', true));
    expect(crowded.length).toBeLessThanOrEqual(6);
    expect(crowded.find((r) => r.place === 'expeditions')?.reason).toBe('3 trips need you');
    expect(crowded.find((r) => r.place === 'workshop')?.reason).toBe('2 jobs are ready');
    expect(crowded.find((r) => r.place === 'collection')?.reason).toBe(
      '3 catches await your choice',
    );
  });

  it('says a calm thing in the game voice', () => {
    expect(CALM_LINE).toMatch(/quiet/);
  });
});

describe('comingUp', () => {
  it('lists the next things on the clock, soonest first, with real times', () => {
    const rows = comingUp(homeInput('busy', true));
    expect(rows.map((r) => [r.when, r.text])).toEqual([
      ['13:37', 'Games lock'],
      ['13:37', 'Raid: Phase 2'],
      ['14:05', 'Craft Kelp Cap is ready'],
      ['15:20', 'First of 2 trips is back'],
    ]);
    expect(rows[0]?.rel).toBe('in 3 h 37 m');
  });

  it('puts the finale on the list with its weekday when it is the next thing', () => {
    const rows = comingUp(homeInput('busy', true), 8);
    expect(rows.at(-1)).toMatchObject({ when: 'Sun 20:00', text: 'Raid finale' });
  });

  it('leaves the raid out when the game screen has no raid schedule', () => {
    const rows = comingUp(homeInput('busy', false), 8);
    expect(rows.some((r) => r.place === 'raid')).toBe(false);
  });

  it('never lists a time that has passed and respects the limit', () => {
    const input = homeInput('busy', true);
    const rows = comingUp(input, 2);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.at > input.now)).toBe(true);
  });
});

describe('placeCards', () => {
  const lines = (state: string, raid: boolean) =>
    Object.fromEntries(placeCards(homeInput(state, raid)).map((c) => [c.id, c.status]));

  it('writes a status line for every place from the data the game screen holds', () => {
    expect(lines('busy', true)).toEqual({
      expeditions: '1 home, 2 out, next back 15:20',
      workshop: 'Job ready, 1 running, ready 14:05',
      raid: 'Creatures to place',
      games: 'Enter by 13:37',
      dungeon: 'Run open',
      collection: '9 creatures',
    });
  });

  it('reads calmly when nothing waits', () => {
    expect(lines('nothing waiting', true)).toEqual({
      expeditions: '2 out, next back 15:20',
      workshop: '1 running, ready 14:05',
      raid: 'Phase 2 13:37',
      games: 'Entered, show 14:00',
      dungeon: 'No run waiting',
      collection: '9 creatures',
    });
  });

  it('has no raid line beyond the attention block without the raid week', () => {
    expect(lines('nothing waiting', false)['raid']).toBeNull();
    expect(lines('busy', false)['raid']).toBe('Creatures to place');
  });

  it('gives the cards the pips of the navigation', () => {
    const cards = placeCards(homeInput('busy', true));
    expect(cards.filter((c) => c.pip !== null).map((c) => c.id)).toEqual([
      'expeditions',
      'workshop',
      'raid',
      'games',
      'dungeon',
    ]);
    expect(placeCards(homeInput('nothing waiting', true)).every((c) => c.pip === null)).toBe(true);
  });
});

describe('valleyToday', () => {
  it('names the sky and lists the Games lineup', () => {
    const valley = valleyToday(homeInput('busy', true));
    expect(valley.sky).toBe('Fair Winds and Static Sky');
    expect(valley.lineup.map((e) => e.id)).toEqual(['melon-run', 'pepper-panic', 'log-carry']);
  });

  it('is empty before anything has loaded', () => {
    const input = { ...homeInput('busy', true), forecast: null, games: null };
    expect(valleyToday(input)).toEqual({ kind: 'blank', sky: null, lineup: [] });
  });
});
