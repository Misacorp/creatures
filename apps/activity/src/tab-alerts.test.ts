import { describe, expect, it } from 'vitest';
import type { Attention } from './api';
import type { Trip } from './expedition-types';
import type { Job } from './gear-types';
import {
  ALERT_TEXT,
  MAX_TIMER_MS,
  NO_ALERTS,
  RECHECK_GRACE_MS,
  changeDelay,
  nextChangeAt,
  recheckDelay,
  tabAlerts,
} from './tab-alerts';

const NOW = 1_000_000;
const HOUR = 3_600_000;

function trip(patch: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    creatureId: 'c1',
    duration: 'short',
    supplies: 'basic',
    kit: [],
    destination: 'meadow',
    twist: null,
    rolls: 2,
    cost: 0,
    treat: false,
    startedAt: NOW - HOUR,
    endsAt: NOW + HOUR,
    readyAt: NOW + HOUR,
    status: 'active',
    claimedAt: null,
    result: null,
    offer: null,
    pushOn: null,
    ...patch,
  };
}

const OFFER = { goals: [{ id: 'g1' }, { id: 'g2' }] } as unknown as Trip['offer'];

function pushedOn(endsAt: number): Trip['pushOn'] {
  return { goalId: 'g1', startedAt: NOW - 10, endsAt, oddsBp: 5000 };
}

function job(patch: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    creatureId: 'c1',
    kind: 'craft',
    input: {},
    cost: {},
    startedAt: NOW - HOUR,
    endsAt: NOW + HOUR,
    status: 'running',
    claimedAt: null,
    result: null,
    ...patch,
  };
}

const quiet: Attention = { dungeon: false, raid: false, recheckAt: null };

function alerts(
  patch: {
    expeditions?: Trip[];
    jobs?: Job[] | null;
    attention?: Attention | null;
    pending?: number;
    serverNow?: number;
  } = {},
) {
  return tabAlerts({
    expeditions: patch.expeditions ?? [],
    jobs: patch.jobs === undefined ? [] : patch.jobs,
    attention: patch.attention === undefined ? quiet : patch.attention,
    ...(patch.pending === undefined ? {} : { pending: patch.pending }),
    serverNow: patch.serverNow ?? NOW,
  });
}

describe('the pips on the tabs', () => {
  it('has none when nothing needs the player', () => {
    expect(alerts()).toEqual(NO_ALERTS);
    expect(alerts({ expeditions: [trip()], jobs: [job()] })).toEqual(NO_ALERTS);
  });

  it('never puts one on Creatures for a trip, the dungeon or the raid', () => {
    expect(
      alerts({
        expeditions: [trip({ endsAt: NOW - 1 })],
        attention: { dungeon: true, raid: true, recheckAt: null },
      }).collection,
    ).toBeNull();
  });

  it('puts one on Creatures while a duplicate waits for a choice', () => {
    expect(alerts({ pending: 1 }).collection).toBe(ALERT_TEXT.catchWaiting);
    expect(alerts({ pending: 4 }).collection).toBe(ALERT_TEXT.catchWaiting);
    expect(alerts({ pending: 0 }).collection).toBeNull();
    expect(alerts({}).collection).toBeNull();
  });

  describe('Expeditions', () => {
    it('names a trip that is home', () => {
      expect(alerts({ expeditions: [trip({ endsAt: NOW - 1 })] }).expeditions).toBe(
        ALERT_TEXT.tripHome,
      );
      expect(alerts({ expeditions: [trip({ endsAt: NOW })] }).expeditions).toBe(
        ALERT_TEXT.tripHome,
      );
    });

    it('names a choice that is waiting', () => {
      expect(alerts({ expeditions: [trip({ endsAt: NOW - 1, offer: OFFER })] }).expeditions).toBe(
        ALERT_TEXT.choiceWaiting,
      );
    });

    it('names the choice before a trip that is simply home', () => {
      const home = trip({ id: 'a', endsAt: NOW - 5 });
      const choice = trip({ id: 'b', endsAt: NOW - 1, offer: OFFER });
      expect(alerts({ expeditions: [home, choice] }).expeditions).toBe(ALERT_TEXT.choiceWaiting);
      expect(alerts({ expeditions: [choice, home] }).expeditions).toBe(ALERT_TEXT.choiceWaiting);
    });

    it('stays quiet for a trip still out and for one pushing on', () => {
      expect(alerts({ expeditions: [trip({ endsAt: NOW + 1 })] }).expeditions).toBeNull();
      const pushing = trip({ endsAt: NOW - 1, pushOn: pushedOn(NOW + HOUR) });
      expect(alerts({ expeditions: [pushing] }).expeditions).toBeNull();
    });

    it('names a push-on that has finished', () => {
      const done = trip({ endsAt: NOW - HOUR, pushOn: pushedOn(NOW - 1) });
      expect(alerts({ expeditions: [done] }).expeditions).toBe(ALERT_TEXT.tripHome);
    });

    it('ignores a trip that was already claimed', () => {
      expect(
        alerts({ expeditions: [trip({ endsAt: NOW - 1, status: 'claimed' })] }).expeditions,
      ).toBeNull();
    });

    it('clears when the clock moves back before the end (a fresh offset)', () => {
      const t = trip({ endsAt: NOW + 10 });
      expect(alerts({ expeditions: [t], serverNow: NOW + 10 }).expeditions).not.toBeNull();
      expect(alerts({ expeditions: [t], serverNow: NOW + 9 }).expeditions).toBeNull();
    });
  });

  describe('Workshop', () => {
    it('names a job that is ready, by status or by its time', () => {
      expect(alerts({ jobs: [job({ status: 'ready' })] }).workshop).toBe(ALERT_TEXT.jobReady);
      expect(alerts({ jobs: [job({ endsAt: NOW - 1 })] }).workshop).toBe(ALERT_TEXT.jobReady);
      expect(alerts({ jobs: [job({ endsAt: NOW })] }).workshop).toBe(ALERT_TEXT.jobReady);
    });

    it('stays quiet for a running job, a claimed one and while the gear view has not loaded', () => {
      expect(alerts({ jobs: [job()] }).workshop).toBeNull();
      expect(alerts({ jobs: [job({ status: 'claimed', endsAt: NOW - 5 })] }).workshop).toBeNull();
      expect(alerts({ jobs: null }).workshop).toBeNull();
      expect(alerts({ jobs: [] }).workshop).toBeNull();
    });

    it('names one ready job among running ones', () => {
      const jobs = [job({ id: 'a' }), job({ id: 'b', status: 'ready' })];
      expect(alerts({ jobs }).workshop).toBe(ALERT_TEXT.jobReady);
    });
  });

  describe('Dungeon and Raid', () => {
    it('follow the server attention block', () => {
      const both = alerts({ attention: { dungeon: true, raid: true, recheckAt: null } });
      expect(both.dungeon).toBe(ALERT_TEXT.dungeonOpen);
      expect(both.raid).toBe(ALERT_TEXT.raidPlace);
      const dungeonOnly = alerts({ attention: { dungeon: true, raid: false, recheckAt: 5 } });
      expect(dungeonOnly.dungeon).not.toBeNull();
      expect(dungeonOnly.raid).toBeNull();
    });

    it('stay quiet while the attention is unknown', () => {
      const unknown = alerts({ attention: null });
      expect(unknown.dungeon).toBeNull();
      expect(unknown.raid).toBeNull();
    });
  });

  it('keeps every reason short and plain', () => {
    for (const text of Object.values(ALERT_TEXT)) {
      expect(text.length).toBeLessThanOrEqual(30);
      expect(text).toBe(text.toLowerCase());
    }
  });
});

describe('the next moment a pip can appear by itself', () => {
  const next = (expeditions: Trip[], jobs: Job[] | null = []) =>
    nextChangeAt({ expeditions, jobs, serverNow: NOW });

  it('is null with nothing running', () => {
    expect(next([])).toBeNull();
    expect(next([], null)).toBeNull();
  });

  it('is the soonest end among trips and jobs', () => {
    expect(
      next([trip({ endsAt: NOW + 5 * HOUR }), trip({ id: 'b', endsAt: NOW + 2 * HOUR })]),
    ).toBe(NOW + 2 * HOUR);
    expect(next([trip({ endsAt: NOW + 5 * HOUR })], [job({ endsAt: NOW + 3 * HOUR })])).toBe(
      NOW + 3 * HOUR,
    );
    expect(next([trip({ endsAt: NOW + HOUR })], [job({ endsAt: NOW + 10 })])).toBe(NOW + 10);
  });

  it('uses the end of the push-on leg for a trip that is pushing on', () => {
    const pushing = trip({ endsAt: NOW - 100, pushOn: pushedOn(NOW + 7) });
    expect(next([pushing])).toBe(NOW + 7);
  });

  it('skips what already happened: ended trips, finished pushes, ready and claimed jobs', () => {
    expect(next([trip({ endsAt: NOW - 1 })])).toBeNull();
    expect(next([trip({ endsAt: NOW - 100, pushOn: pushedOn(NOW - 1) })])).toBeNull();
    expect(next([], [job({ status: 'ready', endsAt: NOW + 5 })])).toBeNull();
    expect(next([], [job({ status: 'claimed', endsAt: NOW + 5 })])).toBeNull();
    expect(next([], [job({ endsAt: NOW })])).toBeNull();
  });

  it('skips claimed trips', () => {
    expect(next([trip({ status: 'claimed', endsAt: NOW + 5 })])).toBeNull();
  });
});

describe('the timer delays', () => {
  it('waits until the change plus a moment, never negative', () => {
    expect(changeDelay(NOW + 1000, NOW)).toBe(1050);
    expect(changeDelay(NOW - 5, NOW)).toBe(50);
  });

  it('caps a far-off change at what a timer can hold', () => {
    expect(changeDelay(NOW + 2 ** 40, NOW)).toBe(MAX_TIMER_MS);
    expect(recheckDelay(NOW + 2 ** 40, NOW)).toBe(MAX_TIMER_MS);
  });

  it('asks again a grace after a recheck time in the future, and not at all otherwise', () => {
    expect(recheckDelay(NOW + 1000, NOW)).toBe(1000 + RECHECK_GRACE_MS);
    expect(recheckDelay(NOW, NOW)).toBeNull();
    expect(recheckDelay(NOW - 1, NOW)).toBeNull();
    expect(recheckDelay(null, NOW)).toBeNull();
  });
});
