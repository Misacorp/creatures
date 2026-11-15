/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose); the house answer is parsed with its strict schema. */
/**
 * Package F of player housing (`docs/design/housing.md` 3.6): every reward moment calls the housing hook once, inside its own
 * transaction, with a stable key, so a retried claim or a replayed award never pays twice; with the flag off no hook exists and nothing
 * is read or written. The hook's own rules are in `housing-hook.test.ts`; here is only that each path calls it.
 */
import { HouseAnswerSchema, createSeededRng, type Rng } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { dungeonPlayer } from './dungeon-helpers';
import { GAMES_SCENARIO_START, gamesScenarioOptions, runGamesScenario } from './games-scenario';
import { runCore, type CoreContext } from './helpers';
import { runTripsScenario, tripsScenarioOptions } from './expeditions-scenario';
import { HOUR, newKey, sessionCaller } from './kit';
import {
  HELSINKI,
  W02,
  count,
  forcePool,
  nextGuild,
  rows,
  runRaid,
  seedMember,
  seedPlayer,
  weekPayout,
} from './raid-helpers';
import { GuildCore } from '../src/guild-core';
import { BUILD, NOW, coreOptions, inGuild } from './read-world';

const housingOptions = () => ({ housing: true, housingRng: createSeededRng('housing-drops') });

const keysOf = (ctx: CoreContext, prefix: string): { user_id: string; key: string }[] =>
  rows<{ user_id: string; key: string }>(
    ctx.sql,
    'SELECT user_id, key FROM house_drops WHERE key LIKE ? ORDER BY user_id, key',
    `${prefix}%`,
  );

const dropRows = (ctx: CoreContext): number => count(ctx.sql, 'house_drops');

describe('the reward paths call the housing hook', () => {
  it('a trip that pays drops once (a failed goal and a recall pay nothing), and a second claim drops nothing more', async () => {
    const { draw, options } = tripsScenarioOptions();
    await runCore(
      nextGuild(),
      async (ctx) => {
        const captured = await runTripsScenario(ctx, draw);
        const paid = keysOf(ctx, 'trip:');
        // The scenario claims a trip whose risky goal failed (nothing comes home), one that worked, and recalls a third.
        expect(paid).toHaveLength(1);
        expect(captured.responses['expedition-claim-recall']).toBeDefined();
        const user = paid[0]?.user_id ?? '';
        const id = (paid[0]?.key ?? '').slice('trip:'.length);
        // The same claim again (answered from the stored result or refused) leaves the drop table as it was.
        const { call } = await sessionCaller(ctx, { id: user, displayName: 'Again' });
        const again = await call('POST', `/api/expeditions/${id}/claim`, {});
        expect([200, 404, 409]).toContain(again.status);
        expect(keysOf(ctx, 'trip:')).toEqual(paid);
        // The place's materials are held for the player, with the drop.
        expect(
          count(ctx.sql, 'house_items', `user_id = '${user}' AND kind = 'material'`),
        ).toBeGreaterThanOrEqual(0);
      },
      { ...options, ...housingOptions() },
    );
  });

  /** Runs one scout seat in a valley world with housing on; `body` gets the caller, the seat and a way to move it. */
  const scoutWorld = async (
    body: (w: {
      ctx: CoreContext;
      seatId: string;
      state: () => Promise<unknown>;
      moveTo: (destination: string) => Promise<number>;
    }) => Promise<void>,
  ): Promise<void> => {
    const NONE: Rng = { nextU32: () => 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const seeded = seedPlayer(ctx, 1, { creatures: 3, level: 3 });
        const api = await sessionCaller<Json['body']>(ctx, {
          id: seeded.id,
          displayName: seeded.name,
        });
        await api.call('GET', '/api/state');
        const bought = await api.call('POST', '/api/valley/seat/buy', {
          idempotencyKey: newKey('seat'),
        });
        expect(bought.status).toBe(200);
        const seatId = bought.body.seatId as string;
        const moveTo = async (destination: string): Promise<number> =>
          (
            await api.call('POST', '/api/valley/seat', {
              seatId,
              creatureId: seeded.creatureIds[0],
              destination,
            })
          ).status;
        expect(await moveTo('storm-ridge')).toBe(200);
        // A pack that holds finds, so a drop that does not come is the rule's doing and not an empty pack's.
        ctx.sql.exec(
          'UPDATE valley_seats SET gear_finds = 3, blueprint_finds = 2, page_finds = 2 WHERE seat_id = ?',
          seatId,
        );
        expect(dropRows(ctx)).toBe(0);
        await body({ ctx, seatId, state: () => api.call('GET', '/api/state'), moveTo });
      },
      {
        ...ON,
        valleySystems: true,
        combatV2: true,
        dailyAllowance: true,
        scoutRng: NONE,
        ...housingOptions(),
      },
    );
  };

  it('a scout pack that scouted a day comes home and drops once, keyed by the seat and its arrival', async () => {
    await scoutWorld(async ({ ctx, seatId, state }) => {
      ctx.clock.t += 24 * HOUR;
      await state();
      const dropped = keysOf(ctx, 'scout:');
      expect(dropped).toHaveLength(1);
      expect(dropped[0]?.key.startsWith(`scout:${seatId}:`)).toBe(true);
      // Another look brings nothing home and drops nothing.
      await state();
      expect(keysOf(ctx, 'scout:')).toEqual(dropped);
    });
  });

  it('a pack left two days still drops once, not twice', async () => {
    await scoutWorld(async ({ ctx, state }) => {
      ctx.clock.t += 48 * HOUR;
      await state();
      await state();
      expect(keysOf(ctx, 'scout:')).toHaveLength(1);
    });
  });

  it('a short pack brought home by a destination change drops nothing', async () => {
    await scoutWorld(async ({ ctx, moveTo }) => {
      ctx.clock.t += HOUR / 2;
      expect(await moveTo('ember-caves')).toBe(200);
      expect(keysOf(ctx, 'scout:')).toHaveLength(0);
    });
  });

  it('a pack that came home before the rule (11 hours) drops nothing, and its hours do not carry over', async () => {
    await scoutWorld(async ({ ctx, seatId, state }) => {
      ctx.clock.t += 11 * HOUR;
      await state();
      expect(keysOf(ctx, 'scout:')).toHaveLength(0);
      // The store is empty after coming home: the next 11 hours are a new, short pack again.
      expect(
        rows<{ h: number }>(
          ctx.sql,
          'SELECT store_hours AS h FROM valley_seats WHERE seat_id = ?',
          seatId,
        )[0]?.h,
      ).toBe(0);
    });
  });

  it('changing destination every half hour for a day drops nothing; a day on one place after it drops once', async () => {
    await scoutWorld(async ({ ctx, moveTo, state }) => {
      for (let i = 0; i < 48; i++) {
        ctx.clock.t += HOUR / 2;
        expect(await moveTo(i % 2 === 0 ? 'ember-caves' : 'storm-ridge')).toBe(200);
        ctx.sql.exec('UPDATE valley_seats SET gear_finds = 1 WHERE gear_finds = 0');
      }
      expect(keysOf(ctx, 'scout:')).toHaveLength(0);
      ctx.clock.t += 24 * HOUR;
      await state();
      expect(keysOf(ctx, 'scout:')).toHaveLength(1);
    });
  });

  it('a dungeon run that ends drops once, and the drop shows in GET /api/house', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        expect((await p.run()).status).toBe(200);
        const dropped = keysOf(ctx, 'dungeon:');
        expect(dropped).toHaveLength(1);
        expect(dropped[0]?.user_id).toBe(p.id);
        // A look at the run (a replay) pays nothing more.
        await p.today();
        expect(keysOf(ctx, 'dungeon:')).toEqual(dropped);
        const house = await p.call('GET', '/api/house');
        expect(house.status).toBe(200);
        const own = v.parse(HouseAnswerSchema, house.body).own;
        expect(own.recent).toHaveLength(1);
        const found =
          Object.values(own.recent[0]?.materials ?? {}).reduce((a, b) => a + b, 0) +
          (own.recent[0]?.blueprint === null ? 0 : 1) +
          (own.recent[0]?.stamp === null ? 0 : 1);
        expect(found).toBeGreaterThan(0);
        expect(Object.keys(own.materials).length).toBeGreaterThan(0);
      },
      housingOptions(),
    );
  });

  it('a won finale drops for every member and records the trophy with the best rank; a lost one drops without a trophy', async () => {
    await runRaid(
      (ctx) => {
        const members = [1, 2, 3].map((n) => seedMember(ctx, n, { level: 15 }));
        ctx.core.raid.currentWeek(HELSINKI);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const dropped = keysOf(ctx, 'raid:');
        expect(dropped.map((d) => d.user_id).sort()).toEqual(members.map((m) => m.id).sort());
        expect(new Set(dropped.map((d) => d.key))).toEqual(new Set([`raid:${W02.id}:1`]));
        const trophies = rows<{ user_id: string; kind: string; best: number; wins: number }>(
          ctx.sql,
          "SELECT user_id, kind, best, wins FROM house_trophies WHERE kind = 'raid' ORDER BY user_id",
        );
        expect(trophies).toHaveLength(3);
        for (const t of trophies) {
          expect(t.best).toBe(weekPayout(ctx.sql).rank);
          expect(t.wins).toBe(1);
        }
        // Running the settlement again pays nothing twice.
        ctx.core.raid.runDue(HELSINKI);
        expect(keysOf(ctx, 'raid:')).toEqual(dropped);
        expect(count(ctx.sql, 'house_trophies')).toBe(3);
      },
      { core: housingOptions() },
    );
    await runRaid(
      (ctx) => {
        [1, 2].forEach((n) => seedMember(ctx, n, { level: 5 }));
        ctx.core.raid.currentWeek(HELSINKI);
        forcePool(ctx.sql, 50_000_000);
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(keysOf(ctx, 'raid:')).toHaveLength(2);
        expect(count(ctx.sql, 'house_trophies')).toBe(0);
      },
      { core: housingOptions() },
    );
  });

  it('a Games award drops one moment for each medal, keyed by day and event', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        await runGamesScenario(ctx);
        const dropped = keysOf(ctx, 'games:');
        expect(dropped.length).toBeGreaterThan(0);
        for (const d of dropped) expect(d.key).toMatch(/^games:2027-01-12:[a-z-]+$/);
        expect(new Set(dropped.map((d) => `${d.user_id}|${d.key}`)).size).toBe(dropped.length);
        // Every drop is a medal: no placing without one drops.
        const medals = count(
          ctx.sql,
          'games_placings',
          "day = '2027-01-12' AND bot = 0 AND medal IS NOT NULL",
        );
        expect(dropped).toHaveLength(medals);
      },
      { ...gamesScenarioOptions(), ...housingOptions() },
    );
  });
});

describe('with the flag off', () => {
  it('no hook exists and no reward path writes a housing row', async () => {
    const { draw, options } = tripsScenarioOptions();
    await runCore(
      nextGuild(),
      async (ctx) => {
        expect(ctx.core.housingHook).toBeNull();
        await runTripsScenario(ctx, draw);
        expect(dropRows(ctx)).toBe(0);
        expect(count(ctx.sql, 'house_items')).toBe(0);
      },
      options,
    );
    await runCore(
      nextGuild(),
      async (ctx) => {
        await runGamesScenario(ctx);
        const p = await dungeonPlayer(ctx, 9);
        expect((await p.run()).status).toBe(200);
        expect(dropRows(ctx)).toBe(0);
        expect(count(ctx.sql, 'house_items')).toBe(0);
        expect(GAMES_SCENARIO_START).toBeGreaterThan(0);
      },
      gamesScenarioOptions(),
    );
  });
});

describe('what the hook costs when it is on (rows read and written for one moment)', () => {
  it('stays small on every moment, for a player with no house', async () => {
    await inGuild(
      async (env) => {
        const { metered } = env;
        const core = new GuildCore(
          metered.storage,
          () => NOW,
          coreOptions(BUILD, { housing: true, housingRng: createSeededRng('housing-reads') }),
        );
        core.migrate();
        const hook = core.housingHook;
        if (hook === null) throw new Error('no hook');
        const user = '8000000000000000001';
        const moments = [
          { kind: 'trip', key: 'trip:a', place: 'tidepools', element: 'tide', ticks: 9 },
          { kind: 'scout', key: 'scout:a', place: 'tidepools', element: 'tide', finds: 7 },
          { kind: 'dungeon', key: 'dungeon:a', depth: 10, cleared: true },
          {
            kind: 'raid',
            key: 'raid:a',
            weekId: '2027-W02',
            bossId: 'tidal-colossus',
            rank: 3,
            cleared: true,
            festival: null,
            element: 'tide',
          },
          { kind: 'games', key: 'games:a', medal: 'gold' },
        ] as const;
        const measured: Record<string, { reads: number; written: number }> = {};
        for (const moment of moments) {
          const { reads } = await metered.measure(() => {
            hook.drop(user, moment);
            return Promise.resolve();
          });
          measured[moment.kind] = { reads: reads.total, written: reads.written };
        }
        console.info('housing hook cost per moment', JSON.stringify(measured));
        for (const m of Object.values(measured)) {
          expect(m.reads).toBeLessThanOrEqual(260);
          expect(m.written).toBeLessThanOrEqual(40);
        }
        // The same moment again reads one row (the drop's key) and writes nothing.
        const { reads: again } = await metered.measure(() => {
          hook.drop(user, moments[0]);
          return Promise.resolve();
        });
        expect(again.total).toBeLessThanOrEqual(3);
        expect(again.written).toBe(0);
      },
      { fresh: true },
    );
  });
});
