/**
 * Live parity (phase 5 step 1): the lazy pass the server runs (`settle` of `@creatures/game`, called by `valley-settle.ts` for every
 * player who looks) replays a lab schedule, seeded, and matches the lab's idle XP and allowance for a daily, a weekend-off and a
 * weekly player.
 *
 * Three checks, per profile, on the lab's own schedule (`buildSchedule`) and a seeded lab run of the `mixed8` server:
 * - idle XP per day: the pass, stepped one game day at a time with the player's visits as events, equals an hour-by-hour replay of the
 *   lab's accrual (the share of the hour, counted from the last visit, times the base rate) at the end of every day (1e-6 of an XP);
 * - idle XP per week: that replay equals the lab's own effective hours times the rate, week by week (so the replay is the lab's);
 * - the allowance: the Acorns collected at the visits plus what waits in the store equal the lab's hour-by-hour store (the store
 *   holds `storeHours` of effective hours; what the store cannot hold is lost), within one Acorn (the pass keeps whole Acorns and
 *   a carry; the lab keeps fractions).
 * The server wraps the same pass: creature XP goes through the game's level rules, and `apps/worker/test/valley-settle.test.ts`
 * proves the wrapper pays the pass's numbers.
 */
import {
  VALLEY_RULES,
  awayShare,
  settle,
  type SettleEvent,
  type SettleState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/rules';
import { profileById } from '../src/profiles';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';
import { HOURS_PER_WEEK } from '../src/types';
import { buildSchedule } from '../src/world';

const H = 3_600_000;
const WEEKS = 5;
const SEED = 1;
const config = ALL_SERVERS.find((s) => s.id === 'mixed8');
if (!config) throw new Error('no mixed8 server');
const run = runServer({ ...config, weeks: WEEKS }, SEED, RULES);
const day = (n: number): number => n * 24 * H;
const perHour = RULES.acorns.allowancePerDay / 24;
const capHours = RULES.posts.storeHours;

/** The lab's hour: a visit at hour h comes first, then the hour pays at the share counted from the last visit. */
function replay(visitAt: Uint8Array): { xp: number[]; weekHours: number[]; acorns: number[] } {
  const xp: number[] = [];
  const acorns: number[] = [];
  const weekHours: number[] = [];
  let lastVisit = 0;
  let totalXp = 0;
  let store = 0;
  let collected = 0;
  let week = 0;
  for (let h = 0; h < visitAt.length; h++) {
    if (visitAt[h] === 1 || h === 0) {
      collected += store * perHour;
      store = 0;
      lastVisit = h;
    }
    const share = awayShare(RULES, 'B', h - lastVisit);
    week += share;
    totalXp += RULES.xp.idlePerHour * share;
    store += Math.min(share, Math.max(0, capHours - store));
    if ((h + 1) % 24 === 0) {
      xp.push(totalXp);
      acorns.push(collected + store * perHour);
    }
    if ((h + 1) % HOURS_PER_WEEK === 0) {
      weekHours.push(week);
      week = 0;
    }
  }
  return { xp, weekHours, acorns };
}

describe('the lazy pass against the lab, a day at a time', () => {
  for (const profile of ['daily', 'weekend-off', 'weekly']) {
    it(`gives a ${profile} player the lab's idle XP and allowance`, () => {
      const index = config.players.findIndex((p) => p.profile === profile);
      const lab = run.players[index];
      if (!lab) throw new Error(`no ${profile} player`);
      const visitAt = buildSchedule(profileById(profile), index, WEEKS);
      const reference = replay(visitAt);

      // The lab's own effective hours, week by week: the replay is the lab's accrual.
      for (let w = 0; w < WEEKS; w++)
        expect(reference.weekHours[w], `week ${w + 1}`).toBeCloseTo(
          lab.weeks[w]?.effHours ?? NaN,
          6,
        );

      // The pass: one game day at a time, the visits as events, the allowance collected at each visit (as the server does at an
      // arrival: the whole store comes home, the carry stays).
      const visits: number[] = [0];
      visitAt.forEach((flag, hour) => {
        if (flag === 1 && hour > 0) visits.push(hour * H);
      });
      let state: SettleState = {
        settledAt: 0,
        lastVisitAt: 0,
        hearth: 1,
        creatures: [{ xp: 0, carry: 0, capXp: Infinity }],
        allowance: { store: 0, carry: 0 },
      };
      let collected = 0;
      const events: SettleEvent[] = visits.map((at) => ({ at, kind: 'visit' as const }));
      for (let d = 0; d < WEEKS * 7; d++) {
        // Stop at each visit inside the day to bring the store home, then run on to the end of the day.
        const stops = visits.filter((at) => at > day(d) && at <= day(d + 1));
        for (const to of [...stops, day(d + 1)]) {
          if (to <= state.settledAt) continue;
          state = settle(state, state.settledAt, to, events);
          if (visits.includes(to) && state.allowance) {
            collected += state.allowance.store;
            state = { ...state, allowance: { store: 0, carry: state.allowance.carry } };
          }
        }
        const got = (state.creatures[0]?.xp ?? 0) + (state.creatures[0]?.carry ?? 0);
        expect(got, `day ${d + 1} XP`).toBeCloseTo(reference.xp[d] ?? NaN, 6);
        const waiting = (state.allowance?.store ?? 0) + (state.allowance?.carry ?? 0);
        expect(
          Math.abs(collected + waiting - (reference.acorns[d] ?? NaN)),
          `day ${d + 1} Acorns`,
        ).toBeLessThan(1);
      }
      expect(reference.xp.at(-1)).toBeGreaterThan(0);
      // The store is the plan's size: three days of the daily rate.
      expect(capHours * perHour).toBe(VALLEY_RULES.acorns.allowancePerDay * 3);
    });
  }

  it('shows the profiles differ the way the plan says: a weekly player earns about 75 to 80% of a daily one', () => {
    const totals = ['daily', 'weekly'].map((profile) => {
      const index = config.players.findIndex((p) => p.profile === profile);
      return replay(buildSchedule(profileById(profile), index, WEEKS)).xp.at(-1) ?? 0;
    });
    const ratio = (totals[1] ?? 0) / (totals[0] ?? 1);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.85);
  });
});
