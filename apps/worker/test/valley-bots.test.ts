/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
   These tests read parts of dev tool bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 10: the staging bots and the simulated month (`valley-bots.ts`, the `valley-bots`, `valley-sim-day` and `valley-report` dev
 * tools). The whole month is `pnpm valley-month:local` (`valley-month.local.test.ts`, too slow for the suite); here the guard, the bots'
 * start, a few days and what they leave behind.
 */
import { MIXED8_BOTS, profileById, visitHours } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ON, player } from './dev-helpers';
import { runCore } from './helpers';
import { count, nextGuild } from './raid-helpers';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true } as const;

describe('the simulated month: the guard', () => {
  it('answers 404 without the valley systems, for each of the three tools', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        for (const tool of ['valley-bots', 'valley-sim-day', 'valley-report']) {
          expect(await p.dev(tool, {})).toEqual({ status: 404, body: { error: 'not_found' } });
        }
        expect(count(ctx.sql, 'players')).toBe(1);
      },
      ON,
    );
  });

  it('refuses a day before there are bots, and a body with an unknown key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        expect(await p.dev('valley-sim-day', {})).toEqual({
          status: 409,
          body: { error: 'no_bots' },
        });
        expect((await p.dev('valley-sim-day', { days: 3 })).status).toBe(400);
        expect((await p.dev('valley-sim-day', { maxVisits: 0 })).status).toBe(400);
      },
      SYSTEMS,
    );
  });
});

describe('the bots', () => {
  it('are the lab mixed server of 8 without the human, and visit as the lab players do', () => {
    expect(MIXED8_BOTS.map((b) => b.profile)).toEqual([
      'daily',
      'active',
      'every-other-day',
      'weekend-off',
      'weekly',
      'new',
      'returner',
    ]);
    // Day 0 is a Monday: the weekly player visits on Sunday (day 6) only, the active one three times a day.
    expect(visitHours(profileById('weekly'), 0, 5)).toEqual([]);
    expect(visitHours(profileById('weekly'), 6, 5)).toEqual([20]);
    expect(visitHours(profileById('active'), 3, 2)).toEqual([8, 13, 20]);
    expect(visitHours(profileById('new'), 20, 6)).toEqual([]);
    expect(visitHours(profileById('new'), 35, 6)).toEqual([20]);
  });

  it('start as fresh valley players: three creatures, the welcome Acorns, a scout seat and an anvil', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        await p.tool('valley-fresh', {});
        const made = await p.tool('valley-bots', {});
        expect(made.bots).toHaveLength(7);
        // The dev clock stands at a Monday 00:00 in Helsinki, ahead of the real clock.
        const clock = (await p.call('GET', '/api/dev/state')).body.clock;
        expect(clock.offsetMs).toBeGreaterThan(0);
        expect(new Date(made.startMs).toISOString().slice(11, 16)).toMatch(/^(21|22):00$/);
        const joined = made.bots.filter((b: { joined: boolean }) => b.joined);
        // The new player joins in week 6, outside the month.
        expect(joined.map((b: { profile: string }) => b.profile)).not.toContain('new');
        expect(joined).toHaveLength(6);
        for (const bot of joined) {
          const creatures = count(ctx.sql, 'creatures', `user_id = '${bot.id as string}'`);
          expect(creatures).toBe(3);
          expect(
            count(
              ctx.sql,
              'valley_seats',
              `user_id = '${bot.id as string}' AND place = 'signpost'`,
            ),
          ).toBe(1);
          expect(
            count(ctx.sql, 'valley_seats', `user_id = '${bot.id as string}' AND place = 'forge'`),
          ).toBe(1);
        }
        // Safe to repeat: no second set of bots.
        await p.tool('valley-bots', {});
        expect(count(ctx.sql, 'creatures', "user_id LIKE 'dev-guest-%'")).toBe(18);
      },
      SYSTEMS,
    );
  });
});

describe('a few days of the month', () => {
  it('plays days in order through the real settle and keeps its books', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        await p.tool('valley-fresh', {});
        await p.tool('valley-bots', {});
        const days = [];
        for (let d = 0; d < 3; d++) days.push(await p.tool('valley-sim-day', {}));
        expect(days.map((d) => d.day)).toEqual([0, 1, 2]);
        expect(days.every((d) => d.done)).toBe(true);
        // Day 0 is a Monday: the daily, the active (3), the every-other-day player (id 3 visits on odd days), the weekend-off and the
        // returner visit; the weekly player waits for Sunday.
        expect(days[0].visits).toBeGreaterThanOrEqual(6);
        expect(days[0].rows.read).toBeGreaterThan(0);
        expect(days[0].rows.written).toBeGreaterThan(0);
        // The bots earned and spent through the ledger: Acorns went out for a seat or a gift, nothing went negative.
        const bad = ctx.sql
          .exec<{ n: number }>('SELECT COUNT(*) AS n FROM balances WHERE amount < 0')
          .one().n;
        expect(bad).toBe(0);
        expect(
          count(ctx.sql, 'ledger', "user_id LIKE 'dev-guest-%' AND amount < 0"),
        ).toBeGreaterThan(0);
        // Every bot's creatures gained experience (the lazy pass) and the fights paid the lab's inputs.
        const xp = ctx.sql
          .exec<{ n: number }>(
            "SELECT COUNT(*) AS n FROM creatures WHERE user_id LIKE 'dev-guest-%' AND (level > 1 OR exp > 0)",
          )
          .one().n;
        expect(xp).toBeGreaterThan(0);
        const report = await p.tool('valley-report', {});
        expect(report.report.version).toBe(1);
        expect(report.month.daysPlayed).toBe(3);
        expect(report.month.rowsLog).toHaveLength(3);
        expect(report.month.rowsTotal.read).toBeGreaterThan(0);
      },
      SYSTEMS,
    );
  });

  it('splits a day over several calls and ends it once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        await p.tool('valley-fresh', {});
        await p.tool('valley-bots', {});
        const first = await p.tool('valley-sim-day', { maxVisits: 2 });
        expect(first).toMatchObject({ day: 0, done: false, visits: 2 });
        let last = first;
        while (!last.done) last = await p.tool('valley-sim-day', { maxVisits: 2 });
        expect(last.day).toBe(0);
        const next = await p.tool('valley-sim-day', {});
        expect(next.day).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('wipes the month with valley-fresh', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        await p.tool('valley-fresh', {});
        await p.tool('valley-bots', {});
        await p.tool('valley-sim-day', {});
        await p.tool('valley-fresh', {});
        expect(await p.dev('valley-sim-day', {})).toEqual({
          status: 409,
          body: { error: 'no_bots' },
        });
        expect(count(ctx.sql, 'creatures')).toBe(0);
        expect(count(ctx.sql, 'valley_seats')).toBe(0);
      },
      SYSTEMS,
    );
  });
});
