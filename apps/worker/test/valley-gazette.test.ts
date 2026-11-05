/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 4: the welcome-back Gazette on real output (migration 59, `valley-gazette.ts`, the paper in `/api/state`'s `valley`, the close
 * and deep routes). An arrival's pass records what happened while away; the paper is kept until it is closed, so a reload replays it; at most
 * three headlines however long the absence was; at most one decision, a way deeper for an Expert scout (push on, V-SCOUT-6).
 */
import {
  HEADLINE_KINDS,
  MAX_HIGHLIGHTS,
  VALLEY_RULES,
  ValleyViewSchema,
  createSeededRng,
  type Rng,
  type ValleyView,
} from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller, type SessionCaller } from './kit';
import { count, nextGuild, seedPlayer } from './raid-helpers';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
/** A source whose every draw is 0: every Poisson count is 0 and a way deeper is always found. */
const NONE: Rng = { nextU32: () => 0 };
const DAY_MS = 24 * HOUR;

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures: 3, level: 3 });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);

/** A player with one seat and a creature posted to it at `destination`, valley opened. */
async function scouting(
  ctx: CoreContext,
  n: number,
  destination = 'tidepools',
): Promise<P & { seatId: string; creatureId: string }> {
  const p = await newPlayer(ctx, n);
  await p.state();
  const bought = await p.api.call('POST', '/api/valley/seat/buy', {
    idempotencyKey: newKey('seat'),
  });
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const creatureId = p.creatureIds[0] as string;
  const posted = await p.api.call('POST', '/api/valley/seat', { seatId, creatureId, destination });
  expect(posted.status).toBe(200);
  return { ...p, seatId, creatureId };
}

const makeExpert = (ctx: CoreContext, creatureId: string): void => {
  ctx.sql.exec('UPDATE valley_creatures SET scout_hours = 200 WHERE creature_id = ?', creatureId);
};

describe('migration 59: the paper table', () => {
  it('creates valley_gazette keyed by user, empty, and valley-fresh clears it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const columns = ctx.sql
          .exec<{ name: string }>("SELECT name FROM pragma_table_info('valley_gazette')")
          .toArray()
          .map((r) => r.name);
        expect(columns).toEqual([
          'user_id',
          'paper_id',
          'at',
          'away_hours',
          'log',
          'decision',
          'read_at',
        ]);
        expect(count(ctx.sql, 'valley_gazette')).toBe(0);
        const p = await scouting(ctx, 1);
        ctx.clock.t += DAY_MS;
        await p.state();
        expect(count(ctx.sql, 'valley_gazette')).toBe(1);
        expect((await p.api.call('POST', '/api/dev/valley-fresh', {})).status).toBe(200);
        expect(count(ctx.sql, 'valley_gazette')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('the flag', () => {
  it('answers 404 on the close and deep routes with the flag off, before reading the body, and the state has no paper', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        for (const path of ['/api/valley/gazette/close', '/api/valley/deep']) {
          expect((await p.api.call('POST', path, { nonsense: true })).status).toBe(404);
        }
        expect(Object.hasOwn((await p.state()).body as object, 'valley')).toBe(false);
        expect(count(ctx.sql, 'valley_gazette')).toBe(0);
      },
      FLAG_OFF,
    );
  });
});

describe('the paper of an arrival', () => {
  it('is written on an arrival after a day, carried by the state, replayed on a reload and gone once closed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        // Mid-visit: no paper yet.
        expect(view(await p.state()).paper).toBeUndefined();
        ctx.clock.t += DAY_MS;
        const arrived = view(await p.state());
        const paper = arrived.paper;
        expect(arrived.arrived).toBe(true);
        expect(paper).toBeDefined();
        if (paper === undefined) return;
        expect(paper.awayHours).toBe(24);
        expect(paper.headlines.length).toBeGreaterThanOrEqual(1);
        expect(paper.headlines.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
        for (const h of paper.headlines) expect(HEADLINE_KINDS).toContain(h.kind);
        // The allowance came home with the arrival: it is in the paper's "brought".
        expect(paper.brought.acorns).toBe(arrived.allowance.brought);
        // A reload (a minute on, the same visit) replays the same paper.
        ctx.clock.t += 60_000;
        const again = view(await p.state()).paper;
        expect(again).toEqual(paper);
        // A wrong id closes nothing.
        const wrong = await p.api.call('POST', '/api/valley/gazette/close', { paperId: '1' });
        expect(wrong.status).toBe(200);
        expect(view(await p.state()).paper).toEqual(paper);
        // Closing marks it read; closing again changes nothing.
        const closed = await p.api.call('POST', '/api/valley/gazette/close', {
          paperId: paper.id,
        });
        expect(closed.status).toBe(200);
        expect(closed.body).toEqual({ closed: true });
        expect(
          (await p.api.call('POST', '/api/valley/gazette/close', { paperId: paper.id })).status,
        ).toBe(200);
        expect(view(await p.state()).paper).toBeUndefined();
        expect(count(ctx.sql, 'valley_gazette')).toBe(1);
      },
      { ...SYSTEMS, scoutRng: createSeededRng('paper-day') },
    );
  });

  it('writes nothing for a short absence, and validates the close body strictly', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        ctx.clock.t += 2 * HOUR;
        const res = view(await p.state());
        expect(res.arrived).toBe(true);
        expect(res.paper).toBeUndefined();
        expect(count(ctx.sql, 'valley_gazette')).toBe(0);
        expect((await p.api.call('POST', '/api/valley/gazette/close', {})).status).toBe(400);
        expect(
          (await p.api.call('POST', '/api/valley/gazette/close', { paperId: 'a', extra: 1 }))
            .status,
        ).toBe(400);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('settling twice at the same moment changes nothing in the stored paper', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        ctx.clock.t += DAY_MS;
        await p.state();
        const row = ctx.sql.exec('SELECT * FROM valley_gazette').one();
        await p.state();
        await p.state();
        expect(ctx.sql.exec('SELECT * FROM valley_gazette').one()).toEqual(row);
      },
      { ...SYSTEMS, scoutRng: createSeededRng('twice') },
    );
  });

  it('is never longer after a long absence: at most three headlines and a small stored log', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        ctx.clock.t += 30 * DAY_MS;
        const paper = view(await p.state()).paper;
        expect(paper).toBeDefined();
        expect(paper?.awayHours).toBe(30 * 24);
        expect(paper?.headlines.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
        const stored = ctx.sql.exec<{ log: string }>('SELECT log FROM valley_gazette').one().log;
        expect(stored.length).toBeLessThan(6000);
      },
      { ...SYSTEMS, scoutRng: createSeededRng('month') },
    );
  });

  it('joins an unread paper with the next arrival: one story, the Acorns add', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        ctx.clock.t += DAY_MS;
        const first = view(await p.state());
        ctx.clock.t += DAY_MS;
        const second = view(await p.state());
        expect(second.paper?.id).not.toBe(first.paper?.id);
        expect(second.paper?.brought.acorns).toBe(
          (first.paper?.brought.acorns ?? 0) + second.allowance.brought,
        );
        expect(count(ctx.sql, 'valley_gazette')).toBe(1);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('only ever shows the caller their own paper', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await scouting(ctx, 1);
        const b = await scouting(ctx, 2);
        ctx.clock.t += DAY_MS;
        const mine = view(await a.state()).paper;
        expect(mine).toBeDefined();
        // B closing A's paper id closes nothing of A's.
        await b.api.call('POST', '/api/valley/gazette/close', { paperId: mine?.id });
        expect(view(await a.state()).paper).toEqual(mine);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });
});

describe('push on: a way deeper (V-SCOUT-6, V-RET-3)', () => {
  it("offers an Expert scout a way as the paper's one decision, and taking it sets the seat deep", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'ember-caves');
        makeExpert(ctx, p.creatureId);
        ctx.clock.t += DAY_MS;
        const arrived = view(await p.state());
        const decision = arrived.paper?.decision;
        expect(decision).toEqual({
          kind: 'push-on',
          seatId: p.seatId,
          creatureId: p.creatureId,
          destination: 'ember-caves',
        });
        expect(arrived.seats[0]?.deep).toBe(false);
        const taken = await p.api.call('POST', '/api/valley/deep', {
          seatId: p.seatId,
          deep: true,
        });
        expect(taken.status).toBe(200);
        expect(view(taken).seats[0]?.deep).toBe(true);
        // The decision is spent: the paper stays, with no decision.
        expect(view(taken).paper?.decision).toBeNull();
        // Deep, the kit does not work and scrap and shards are fewer, rare finds more.
        const deepRates = view(taken).seats[0]?.perDay;
        const back = await p.api.call('POST', '/api/valley/deep', {
          seatId: p.seatId,
          deep: false,
        });
        expect(back.status).toBe(200);
        const upRates = view(back).seats[0]?.perDay;
        expect(view(back).seats[0]?.deep).toBe(false);
        if (deepRates === undefined || upRates === undefined) return;
        expect(deepRates.scrap).toBeCloseTo(
          upRates.scrap * VALLEY_RULES.scouts.pushOn.partsMultiplier,
          9,
        );
        expect(deepRates.gear).toBeCloseTo(
          upRates.gear * VALLEY_RULES.scouts.pushOn.rareMultiplier,
          9,
        );
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('offers nothing to a scout below Expert', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'ember-caves');
        ctx.clock.t += DAY_MS;
        expect(view(await p.state()).paper?.decision ?? null).toBeNull();
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it("refuses going deeper without an offer, for another player's seat, and after the paper is closed", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'ember-caves');
        const other = await scouting(ctx, 2, 'ember-caves');
        const noOffer = await p.api.call('POST', '/api/valley/deep', {
          seatId: p.seatId,
          deep: true,
        });
        expect(noOffer.status).toBe(409);
        expect(noOffer.body).toEqual({ error: 'no_way_deeper' });
        makeExpert(ctx, p.creatureId);
        ctx.clock.t += DAY_MS;
        const paper = view(await p.state()).paper;
        expect(paper?.decision).not.toBeNull();
        // Another player's seat is a 404, never the offer's.
        expect(
          (await other.api.call('POST', '/api/valley/deep', { seatId: p.seatId, deep: true }))
            .status,
        ).toBe(404);
        // Closing the paper without taking it lets the way go.
        await p.api.call('POST', '/api/valley/gazette/close', { paperId: paper?.id });
        const late = await p.api.call('POST', '/api/valley/deep', { seatId: p.seatId, deep: true });
        expect(late.status).toBe(409);
        // A strict body.
        expect((await p.api.call('POST', '/api/valley/deep', { seatId: p.seatId })).status).toBe(
          400,
        );
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('brings the deep scout back up when its destination changes', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'ember-caves');
        makeExpert(ctx, p.creatureId);
        ctx.clock.t += DAY_MS;
        await p.state();
        await p.api.call('POST', '/api/valley/deep', { seatId: p.seatId, deep: true });
        const moved = await p.api.call('POST', '/api/valley/seat', {
          seatId: p.seatId,
          destination: 'tidepools',
        });
        expect(moved.status).toBe(200);
        expect(view(await p.state()).seats[0]?.deep).toBe(false);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });
});
