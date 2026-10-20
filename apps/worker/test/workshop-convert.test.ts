import { RULES, conversionJobMs, conversionRecipe } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  apiPlayer as player,
  setCraftingXp,
  skipWelcome,
  giveParts,
  type Api,
} from './gear-helpers';
import { runCore, undoWorkshopConvertMigration, type CoreContext } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';
import { HOUR, newKey } from './kit';

interface JobBody {
  id: string;
  kind: string;
  input: { recipeId?: string };
  endsAt: number;
  startedAt: number;
  result: Record<string, unknown> | null;
}

const start = (p: Api, body: Record<string, unknown>) =>
  p.call('POST', '/api/workshop/jobs', { idempotencyKey: newKey(), ...body });

const claim = (p: Api, jobId: string, key = newKey()) =>
  p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: key });

const jobIdOf = (res: { body: Record<string, unknown> }): string =>
  (res.body['result'] as { jobId: string }).jobId;

function giveSupply(ctx: CoreContext, userId: string, supplyId: string, amount: number): void {
  ctx.sql.exec(
    `INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, supply_id) DO UPDATE SET amount = amount + excluded.amount`,
    userId,
    supplyId,
    amount,
  );
}

const stock = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ supply_id: string; amount: number }>(
      ctx.sql,
      'SELECT supply_id, amount FROM supplies WHERE user_id = ? AND amount > 0',
      userId,
    ).map((r) => [r.supply_id, r.amount]),
  );

const partsOf = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ kind: string; amount: number }>(
      ctx.sql,
      'SELECT kind, amount FROM parts WHERE user_id = ? AND amount > 0',
      userId,
    ).map((r) => [r.kind, r.amount]),
  );

describe('Workshop conversions: refine', () => {
  it('takes the supplies when it starts and gives the next tier once, when claimed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1);
      skipWelcome(ctx, p.id);
      const [c1] = p.creatureIds as [string];
      giveSupply(ctx, p.id, 'lure-basic', 4);
      setCraftingXp(ctx, p.id, c1, 250); // level 3
      const key = newKey();
      const started = await start(p, {
        kind: 'convert',
        creatureId: c1,
        recipeId: 'refine-lure-basic',
        idempotencyKey: key,
      });
      expect(started.status).toBe(200);
      // A retry with the same key takes nothing more and returns the same job.
      const again = await start(p, {
        kind: 'convert',
        creatureId: c1,
        recipeId: 'refine-lure-basic',
        idempotencyKey: key,
      });
      expect(jobIdOf(again)).toBe(jobIdOf(started));
      expect(stock(ctx, p.id)).toEqual({ 'lure-basic': 1 });
      const job = (started.body['gear'] as { jobs: JobBody[] }).jobs[0] as JobBody;
      expect(job).toMatchObject({ kind: 'convert', input: { recipeId: 'refine-lure-basic' } });
      const def = conversionRecipe('refine-lure-basic');
      if (def === undefined) throw new Error('recipe');
      expect(job.endsAt - job.startedAt).toBe(conversionJobMs(def, 3));
      expect(await claim(p, job.id)).toMatchObject({ status: 409, body: { error: 'not_ready' } });
      ctx.clock.t = job.endsAt;
      const done = await claim(p, job.id);
      expect(done.status).toBe(200);
      expect(done.body['result']).toMatchObject({
        kind: 'convert',
        recipeId: 'refine-lure-basic',
        took: { supplies: { 'lure-basic': 3 }, parts: {} },
        gave: { supplies: { 'lure-good': 1 }, parts: {} },
        xp: def.hours * RULES.gear.skill.xpPerHour,
      });
      expect(stock(ctx, p.id)).toEqual({ 'lure-basic': 1, 'lure-good': 1 });
      // Claiming again pays nothing more.
      expect((await claim(p, job.id)).body['result']).toEqual(done.body['result']);
      expect(stock(ctx, p.id)).toEqual({ 'lure-basic': 1, 'lure-good': 1 });
      expect(
        rows<{ work_minutes: number }>(ctx.sql, 'SELECT work_minutes FROM workshop_jobs')[0]
          ?.work_minutes,
      ).toBe(def.hours * 60);
    });
  });

  it('refuses when supplies are short, the level is too low, or the slots are full, and takes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1);
      skipWelcome(ctx, p.id);
      const [c1, c2, c3] = p.creatureIds as [string, string, string];
      giveSupply(ctx, p.id, 'lure-basic', 2);
      giveSupply(ctx, p.id, 'lantern-good', 3);
      setCraftingXp(ctx, p.id, c1, 250); // level 3: enough for Sweet, not for Golden
      const body = (creatureId: string, recipeId: string) => ({
        kind: 'convert',
        creatureId,
        recipeId,
      });
      expect(await start(p, body(c1, 'refine-lure-basic'))).toMatchObject({
        status: 409,
        body: { error: 'insufficient_supplies' },
      });
      // Refining to great needs Crafting level 5.
      expect(await start(p, body(c1, 'refine-lantern-good'))).toMatchObject({
        status: 409,
        body: { error: 'skill_too_low' },
      });
      expect(stock(ctx, p.id)).toEqual({ 'lure-basic': 2, 'lantern-good': 3 });
      expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
      // Unknown recipe and unknown keys are rejected by the schema.
      expect((await start(p, body(c1, 'refine-gold'))).status).toBe(400);
      expect((await start(p, { ...body(c1, 'recycle-lantern-good'), extra: 1 })).status).toBe(400);
      expect((await start(p, { ...body(c1, 'recycle-lantern-good'), amount: 1 })).status).toBe(400);
      // Workshop slots are shared with every other job.
      expect((await start(p, body(c1, 'recycle-lantern-good'))).status).toBe(200);
      expect((await start(p, body(c2, 'recycle-lantern-good'))).status).toBe(200);
      expect(await start(p, body(c3, 'recycle-lantern-good'))).toMatchObject({
        status: 409,
        body: { error: 'workshop_full' },
      });
      expect(stock(ctx, p.id)).toEqual({ 'lure-basic': 2, 'lantern-good': 1 });
    });
  });

  it('cannot be started for another player or with a creature that is not yours', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await player(ctx, 1);
      const b = await player(ctx, 2);
      skipWelcome(ctx, a.id);
      skipWelcome(ctx, b.id);
      giveSupply(ctx, a.id, 'lure-good', 1);
      const [theirs] = b.creatureIds as [string];
      expect(
        await start(a, { kind: 'convert', creatureId: theirs, recipeId: 'recycle-lure-good' }),
      ).toMatchObject({ status: 404 });
      expect(stock(ctx, a.id)).toEqual({ 'lure-good': 1 });
    });
  });
});

describe('Workshop conversions: recycle', () => {
  it('gives a few parts and never Bait', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1);
      skipWelcome(ctx, p.id);
      const [c1] = p.creatureIds as [string];
      giveSupply(ctx, p.id, 'satchel-great', 1);
      giveParts(ctx, p.id, { scrap: 1 });
      const started = await start(p, {
        kind: 'convert',
        creatureId: c1,
        recipeId: 'recycle-satchel-great',
      });
      expect(started.status).toBe(200);
      expect(stock(ctx, p.id)).toEqual({});
      const job = (started.body['gear'] as { jobs: JobBody[] }).jobs[0] as JobBody;
      expect(job.endsAt - job.startedAt).toBe(2 * HOUR);
      expect(partsOf(ctx, p.id)).toEqual({ scrap: 1 });
      const balancesBefore = rows(ctx.sql, 'SELECT * FROM ledger');
      ctx.clock.t = job.endsAt;
      const done = await claim(p, job.id);
      expect(done.body['result']).toMatchObject({
        kind: 'convert',
        gave: { supplies: {}, parts: { scrap: 3, 'ember-shard': 1 } },
      });
      expect(partsOf(ctx, p.id)).toEqual({ scrap: 4, 'ember-shard': 1 });
      expect(rows(ctx.sql, 'SELECT * FROM ledger')).toEqual(balancesBefore);
    });
  });
});

describe('migration 36', () => {
  it('rebuilds the Workshop jobs table for convert jobs and keeps every row', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1);
      const [c1, c2] = p.creatureIds as [string, string];
      ctx.sql.exec(
        `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at, claimed_at, result_json, work_minutes)
         VALUES ('old1', ?, ?, 'dismantle', '{}', 1, 2, 3, '{}', 15),
                ('old2', ?, ?, 'supply', '{"cost":{}}', 4, 5, NULL, NULL, 0),
                ('conv', ?, ?, 'convert', '{}', 6, 7, NULL, NULL, 0)`,
        p.id,
        c1,
        p.id,
        c2,
        p.id,
        c1,
      );
      undoWorkshopConvertMigration(ctx.sql);
      expect(count(ctx.sql, 'workshop_jobs')).toBe(2);
      expect(() =>
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
           VALUES ('x', ?, ?, 'convert', '{}', 1, 2)`,
          p.id,
          c1,
        ),
      ).toThrow();
      ctx.core.migrate();
      expect(
        rows<{ id: string; kind: string; work_minutes: number; claimed_at: number | null }>(
          ctx.sql,
          'SELECT id, kind, work_minutes, claimed_at FROM workshop_jobs ORDER BY rowid',
        ),
      ).toEqual([
        { id: 'old1', kind: 'dismantle', work_minutes: 15, claimed_at: 3 },
        { id: 'old2', kind: 'supply', work_minutes: 0, claimed_at: null },
      ]);
      ctx.sql.exec(
        `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
         VALUES ('new', ?, ?, 'convert', '{}', 1, 2)`,
        p.id,
        c1,
      );
      // One open job per creature still holds, and unknown kinds are still refused.
      expect(() =>
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
           VALUES ('twice', ?, ?, 'convert', '{}', 1, 2)`,
          p.id,
          c1,
        ),
      ).toThrow();
      expect(() =>
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
           VALUES ('bad', ?, ?, 'sing', '{}', 1, 2)`,
          p.id,
          c2,
        ),
      ).toThrow();
    });
  });
});
