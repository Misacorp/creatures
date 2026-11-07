/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return --
   These tests read parts of dev tool bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 10: the staging bots and the simulated month (`valley-bots.ts`, the `valley-bots`, `valley-sim-day` and `valley-report` dev
 * tools). The whole month is `pnpm valley-month:local` (`valley-month.local.test.ts`, too slow for the suite); here the guard, the bots'
 * start, a few days and what they leave behind.
 */
import { MIXED8_BOTS, STAND_IN_BOT, profileById, visitHours } from '@creatures/game';
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
  it('are the lab mixed server of 8 (a bot stands in for the human seat), and visit as the lab players do', () => {
    expect(MIXED8_BOTS.map((b) => b.profile)).toEqual([
      'daily',
      'daily',
      'active',
      'every-other-day',
      'weekend-off',
      'weekly',
      'new',
      'returner',
    ]);
    // The first daily player is the lab's player 0, the human's seat: the stand-in, never reported.
    expect(MIXED8_BOTS[0]).toEqual({ profile: 'daily', id: STAND_IN_BOT });
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
        expect(made.bots).toHaveLength(8);
        // The dev clock stands at a Monday 00:00 in Helsinki, ahead of the real clock.
        const clock = (await p.call('GET', '/api/dev/state')).body.clock;
        expect(clock.offsetMs).toBeGreaterThan(0);
        expect(new Date(made.startMs).toISOString().slice(11, 16)).toMatch(/^(21|22):00$/);
        const joined = made.bots.filter((b: { joined: boolean }) => b.joined);
        // The new player joins in week 6, outside the month.
        expect(joined.map((b: { profile: string }) => b.profile)).not.toContain('new');
        expect(joined).toHaveLength(7);
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
        expect(count(ctx.sql, 'creatures', "user_id LIKE 'dev-guest-%'")).toBe(21);
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
        // The stand-in for the human's seat plays but is not reported: the report's "daily" is bot 1 alone.
        expect(report.report.profiles.daily.days.length).toBeLessThanOrEqual(1);
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

describe("the month's dev triggers and tables", () => {
  const simObjects = (sql: SqlStorage): string[] =>
    sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE name LIKE 'valley_sim_%' ORDER BY name",
      )
      .toArray()
      .map((r) => r.name);
  const TRIGGERS_AND_TABLES = [
    'valley_sim_flows',
    'valley_sim_forge',
    'valley_sim_parts_insert',
    'valley_sim_parts_update',
  ];

  it('are made by valley-bots and dropped by valley-fresh, so staging pays nothing after a fresh start', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        expect(simObjects(ctx.sql)).toEqual([]);
        await p.tool('valley-fresh', {});
        await p.tool('valley-bots', {});
        expect(simObjects(ctx.sql)).toEqual(TRIGGERS_AND_TABLES);
        await p.tool('valley-fresh', {});
        expect(simObjects(ctx.sql)).toEqual([]);
        // A month can be started again after that.
        await p.tool('valley-bots', {});
        expect(simObjects(ctx.sql)).toEqual(TRIGGERS_AND_TABLES);
      },
      SYSTEMS,
    );
  });

  it("are dropped when the month ends, and the report still answers from the bots' snapshots", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 1 });
        await p.tool('valley-fresh', {});
        await p.tool('valley-bots', {});
        let last = await p.tool('valley-sim-day', {});
        for (let day = 1; day < 28; day++) {
          ctx.clock.t += 2_000;
          expect(simObjects(ctx.sql)).toEqual(TRIGGERS_AND_TABLES);
          last = await p.tool('valley-sim-day', {});
        }
        expect(last.finished).toBe(true);
        expect(simObjects(ctx.sql)).toEqual([]);
        // Scrap and shards move as before and nothing writes to a table that is gone.
        ctx.sql.exec("UPDATE parts SET amount = amount + 1 WHERE kind = 'scrap'");
        ctx.clock.t += 2_000;
        const report = await p.tool('valley-report', {});
        expect(report.month.daysPlayed).toBe(28);
        expect(report.report.profiles.weekly.days).toHaveLength(4);
        expect(report.report.profiles.weekly.days[3].metrics.scrapIn).toBeGreaterThan(0);
      },
      SYSTEMS,
    );
  }, 120_000);
});
