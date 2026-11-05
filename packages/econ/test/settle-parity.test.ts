/**
 * The lazy pass against the lab: the idle XP `settle` gives over a lab schedule equals the lab's (the share-hours the lab's hourly loop
 * adds up, times the base rate), for a daily, a weekend-off and a weekly player (phase 5 step 0; step 1 grows it into the live parity test).
 */
import { settle, type SettleEvent, type SettleState } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/rules';
import { profileById } from '../src/profiles';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';
import { HOURS_PER_WEEK } from '../src/types';
import { buildSchedule } from '../src/world';

const H = 3_600_000;
const WEEKS = 6;
const config = ALL_SERVERS.find((s) => s.id === 'mixed8');
if (!config) throw new Error('no mixed8 server');
const run = runServer({ ...config, weeks: WEEKS }, 1, RULES);

describe('settle against the lab', () => {
  for (const profile of ['daily', 'weekend-off', 'weekly']) {
    it(`gives a ${profile} player the lab's idle XP, week by week`, () => {
      const index = config.players.findIndex((p) => p.profile === profile);
      const lab = run.players[index];
      if (!lab) throw new Error(`no ${profile} player`);
      const visitAt = buildSchedule(profileById(profile), index, WEEKS);
      const events: SettleEvent[] = [];
      visitAt.forEach((flag, hour) => {
        if (flag === 1) events.push({ at: hour * H, kind: 'visit' });
      });
      // The player joins (and so visits) at hour 0 in the lab.
      let state: SettleState = {
        settledAt: 0,
        lastVisitAt: 0,
        hearth: 1,
        creatures: [{ xp: 0, carry: 0, capXp: Infinity }],
      };
      let labTotal = 0;
      for (let week = 1; week <= WEEKS; week++) {
        const to = week * HOURS_PER_WEEK * H;
        state = settle(state, state.settledAt, to, events);
        labTotal += RULES.xp.idlePerHour * (lab.weeks[week - 1]?.effHours ?? NaN);
        const got = (state.creatures[0]?.xp ?? 0) + (state.creatures[0]?.carry ?? 0);
        expect(got, `week ${week}`).toBeCloseTo(labTotal, 6);
      }
      expect(labTotal).toBeGreaterThan(0);
    });
  }
});
