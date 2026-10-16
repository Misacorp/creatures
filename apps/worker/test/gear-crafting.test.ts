import {
  RULES,
  craftOdds,
  createSeededRng,
  dismantleRange,
  jobDuration,
  rollCraftItem,
  rollDismantle,
  type PartsBundle,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { Gear } from '../src/gear';
import { grantTripLoot } from '../src/gear-grants';
import {
  apiPlayer as player,
  essenceOf,
  giveEssence,
  giveItem,
  giveParts,
  learnBase,
  newKey,
  setCraftingXp,
  skipWelcome,
  type Api,
} from './gear-helpers';
import { runCore, undoWorkshopV2Migration, type CoreContext } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

const HOUR = 3_600_000;
const MIN = 60_000;

interface JobBody {
  id: string;
  creatureId: string;
  kind: string;
  input: Record<string, unknown>;
  endsAt: number;
  startedAt: number;
  status: string;
  result: Record<string, unknown> | null;
}

interface GearBody {
  parts: Record<string, number>;
  blueprints: { baseId: string; marks: number }[];
  jobs: JobBody[];
  items: { id: string; dismantle: unknown }[];
}

const partsOf = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ kind: string; amount: number }>(
      ctx.sql,
      'SELECT kind, amount FROM parts WHERE user_id = ?',
      userId,
    ).map((r) => [r.kind, r.amount]),
  );

const marksOf = (ctx: CoreContext, userId: string, baseId: string): number | undefined =>
  rows<{ marks: number }>(
    ctx.sql,
    'SELECT marks FROM blueprints WHERE user_id = ? AND base_id = ?',
    userId,
    baseId,
  )[0]?.marks;

const give = (ctx: CoreContext, userId: string, baseId: string, o = {}): string =>
  giveItem(ctx.sql, userId, baseId, { now: ctx.clock.t, ...o });

/** An RNG that counts its draws. */
function counting(seed: string): Rng & { drawn: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    nextU32() {
      n++;
      return inner.nextU32();
    },
    drawn: () => n,
  };
}

/** An RNG that always answers 0: the lowest roll, and every chance succeeds. */
const lowest: Rng = { nextU32: () => 0 };

const start = (p: Api, body: Record<string, unknown>) =>
  p.call('POST', '/api/workshop/jobs', { idempotencyKey: newKey(), ...body });

const claim = (p: Api, jobId: string, key = newKey()) =>
  p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: key });

const jobIdOf = (res: { body: Record<string, unknown> }): string =>
  (res.body['result'] as { jobId: string }).jobId;

describe('crafting: the preview', () => {
  it('sends the exact odds, costs, times and XP of every way to craft, and changes nothing', async () => {
    const rng = counting('preview');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap', 4);
        learnBase(ctx, p.id, 'trail-cap');
        giveParts(ctx, p.id, { scrap: 50, 'tide-shard': 3, 'spark-shard': 9 });
        const [c1, c2] = p.creatureIds as [string, string];
        setCraftingXp(ctx, p.id, c2, 1_000); // Crafting level 6
        const before = { jobs: count(ctx.sql, 'workshop_jobs'), parts: partsOf(ctx, p.id) };

        const level1 = await p.call('POST', '/api/workshop/preview', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'kelp-cap',
        });
        expect(level1.status).toBe(200);
        const r1 = level1.body['result'] as {
          kind: string;
          craftingLevel: number;
          itemLevel: number;
          marks: number;
          marksMax: number;
          stepUpBp: number;
          options: {
            reach: string;
            unlocked: boolean;
            minLevel: number;
            parts: PartsBundle;
            essence: number;
            durationMs: number;
            xp: number;
            oddsBp: { common: number; rare: number; epic: number };
          }[];
        };
        expect(r1).toMatchObject({
          kind: 'craft',
          craftingLevel: 1,
          itemLevel: 2,
          marks: 4,
          marksMax: 10,
          stepUpBp: 400,
        });
        const [none, rare, epic] = r1.options;
        expect(none).toMatchObject({
          reach: 'none',
          unlocked: true,
          parts: { scrap: 6, 'tide-shard': 1 },
          essence: 0,
          durationMs: 3 * HOUR,
          xp: 36,
          oddsBp: craftOdds('none', 1, 4),
        });
        expect(none?.oddsBp).toEqual({ common: 9_600, rare: 400, epic: 0 });
        // A Reach shows what it asks for even when this creature cannot do it yet.
        expect(rare).toMatchObject({
          reach: 'rare',
          unlocked: false,
          minLevel: 3,
          parts: { scrap: 6, 'tide-shard': 1 },
          essence: 25,
          durationMs: 6 * HOUR,
          xp: 72,
        });
        expect(rare?.oddsBp).toEqual(craftOdds('rare', 1, 4));
        expect(epic).toMatchObject({
          reach: 'epic',
          unlocked: false,
          minLevel: 6,
          parts: { scrap: 6, 'tide-shard': 1, glimmer: 1 },
          essence: 70,
          durationMs: 10 * HOUR,
          xp: 120,
        });
        for (const o of r1.options) {
          expect(o.oddsBp.common + o.oddsBp.rare + o.oddsBp.epic).toBe(10_000);
        }

        // A level 6 creature: unlocked, the step up counts its level, a neutral base pays shards from the biggest pile.
        const level6 = await p.call('POST', '/api/workshop/preview', {
          kind: 'craft',
          creatureId: c2,
          blueprintId: 'trail-cap',
        });
        const r6 = level6.body['result'] as typeof r1;
        expect(r6).toMatchObject({ craftingLevel: 6, itemLevel: 12, marks: 0, stepUpBp: 500 });
        expect(r6.options.map((o) => o.unlocked)).toEqual([true, true, true]);
        expect(r6.options[2]).toMatchObject({
          parts: { scrap: 11, glimmer: 1 },
          essence: 70,
        });
        expect(r6.options[2]?.oddsBp).toEqual(craftOdds('epic', 6, 0));

        // Nothing was started, spent or rolled.
        expect(count(ctx.sql, 'workshop_jobs')).toBe(before.jobs);
        expect(partsOf(ctx, p.id)).toEqual(before.parts);
        expect(rng.drawn()).toBe(0);
        expect(count(ctx.sql, 'gear_actions')).toBe(0);
      },
      { gearRng: rng },
    );
  });

  it('refuses an unknown blueprint, a foreign creature and a body with anything extra', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        const [c1] = p.creatureIds as [string];
        const ask = (body: unknown) => p.call('POST', '/api/workshop/preview', body);
        expect(
          await ask({ kind: 'craft', creatureId: c1, blueprintId: 'acorn-cap' }),
        ).toMatchObject({
          status: 409,
          body: { error: 'blueprint_unknown' },
        });
        expect(
          await ask({ kind: 'craft', creatureId: other.creatureIds[0], blueprintId: 'kelp-cap' }),
        ).toMatchObject({ status: 404 });
        for (const body of [
          { kind: 'craft', creatureId: c1, blueprintId: 'nope' },
          { kind: 'craft', creatureId: c1, blueprintId: 'kelp-cap', extra: 1 },
          { kind: 'sing', creatureId: c1 },
          { kind: 'dismantle', creatureId: c1, itemIds: [] },
        ]) {
          expect((await ask(body)).status, JSON.stringify(body)).toBe(400);
        }
        expect((await other.call('POST', '/api/workshop/preview', { kind: 'craft' })).status).toBe(
          400,
        );
      },
      {},
    );
  });
});

describe('crafting: Reach', () => {
  it("Reach for Rare pays Essence and a longer job (and the plain craft's parts), and needs Crafting level 3", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        giveParts(ctx, p.id, { scrap: 20, 'tide-shard': 5 });
        giveEssence(ctx, p.id, 100);
        const [c1, c2] = p.creatureIds as [string, string];
        const reach = (creatureId: string) =>
          start(p, { kind: 'craft', creatureId, blueprintId: 'kelp-cap', reach: 'rare' });
        // Level 1: not allowed, and nothing is charged.
        expect(await reach(c1)).toMatchObject({ status: 409, body: { error: 'skill_too_low' } });
        expect(essenceOf(ctx, p.id)).toBe(100);
        expect(partsOf(ctx, p.id)['scrap']).toBe(20);
        // Level 3.
        setCraftingXp(ctx, p.id, c2, 250);
        const res = await reach(c2);
        expect(res.status).toBe(200);
        expect(essenceOf(ctx, p.id)).toBe(75);
        // Item level 6: 6 + 1 scrap and one shard (a Reach takes no shard more than a plain craft).
        expect(partsOf(ctx, p.id)).toMatchObject({ scrap: 13, 'tide-shard': 4 });
        const job = (res.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job.input).toMatchObject({ baseId: 'kelp-cap', reach: 'rare' });
        expect(job.endsAt - job.startedAt).toBe(jobDuration(3, 0, 6));
        expect(job.endsAt - job.startedAt).toBe(Math.floor(6 * HOUR * 0.94));
        // The Essence went through the ledger once, as a craft spend.
        expect(
          rows<{ amount: number; source: string }>(
            ctx.sql,
            "SELECT amount, source FROM ledger WHERE user_id = ? AND source = 'craft'",
            p.id,
          ),
        ).toEqual([{ amount: -25, source: 'craft' }]);
      },
      {},
    );
  });

  it('Reach for Epic needs level 6, 70 Essence and a glimmer, and takes 10 hours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        giveParts(ctx, p.id, { scrap: 20, 'tide-shard': 5, glimmer: 1 });
        giveEssence(ctx, p.id, 69);
        const [c1, c2] = p.creatureIds as [string, string];
        setCraftingXp(ctx, p.id, c1, 700); // level 5
        setCraftingXp(ctx, p.id, c2, 1_000); // level 6
        const epic = (creatureId: string) =>
          start(p, { kind: 'craft', creatureId, blueprintId: 'kelp-cap', reach: 'epic' });
        expect(await epic(c1)).toMatchObject({ status: 409, body: { error: 'skill_too_low' } });
        // One Essence short: a clear answer, nothing charged, nothing started.
        expect(await epic(c2)).toMatchObject({
          status: 409,
          body: { error: 'insufficient_essence' },
        });
        expect(essenceOf(ctx, p.id)).toBe(69);
        expect(partsOf(ctx, p.id)).toMatchObject({ scrap: 20, 'tide-shard': 5, glimmer: 1 });
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
        giveEssence(ctx, p.id, 1);
        const res = await epic(c2);
        expect(res.status).toBe(200);
        expect(essenceOf(ctx, p.id)).toBe(0);
        // Item level 12: 6 + 3 scrap, one shard and the glimmer.
        expect(partsOf(ctx, p.id)).toMatchObject({ scrap: 11, 'tide-shard': 4 });
        expect(partsOf(ctx, p.id)['glimmer'] ?? 0).toBe(0);
        const job = (res.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job.endsAt - job.startedAt).toBe(jobDuration(6, 0, 10));
      },
      {},
    );
  });

  it('leaves everything alone when the parts are short (the Essence is not taken)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        giveParts(ctx, p.id, { scrap: 5, 'tide-shard': 1 });
        giveEssence(ctx, p.id, 100);
        setCraftingXp(ctx, p.id, p.creatureIds[0] as string, 250);
        const res = await start(p, {
          kind: 'craft',
          creatureId: p.creatureIds[0],
          blueprintId: 'kelp-cap',
          reach: 'rare',
        });
        expect(res).toMatchObject({ status: 409, body: { error: 'insufficient_parts' } });
        expect(essenceOf(ctx, p.id)).toBe(100);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
      },
      {},
    );
  });

  it('is idempotent: a retry with the same key starts one job and takes the Essence once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        giveParts(ctx, p.id, { scrap: 20, 'tide-shard': 6 });
        giveEssence(ctx, p.id, 100);
        const [c1] = p.creatureIds as [string];
        setCraftingXp(ctx, p.id, c1, 250);
        const body = {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'kelp-cap',
          reach: 'rare',
          idempotencyKey: newKey(),
        };
        const first = await p.call('POST', '/api/workshop/jobs', body);
        const again = await Promise.all(
          Array.from({ length: 3 }, () => p.call('POST', '/api/workshop/jobs', body)),
        );
        for (const r of again) expect(r.body['result']).toEqual(first.body['result']);
        expect(essenceOf(ctx, p.id)).toBe(75);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(1);
        // The same key for a different Reach is a conflict and charges nothing.
        const conflict = await p.call('POST', '/api/workshop/jobs', { ...body, reach: 'none' });
        expect(conflict).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
        expect(essenceOf(ctx, p.id)).toBe(75);
      },
      {},
    );
  });

  it('rolls the rarity when claimed from the shown odds, with the marks it had at the start', async () => {
    const rng = counting('reach-claim');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap', 3);
        giveParts(ctx, p.id, { scrap: 20, 'tide-shard': 6 });
        giveEssence(ctx, p.id, 100);
        const [c1] = p.creatureIds as [string];
        setCraftingXp(ctx, p.id, c1, 250); // level 3
        const started = await start(p, {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'kelp-cap',
          reach: 'rare',
        });
        const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
        // Nothing is drawn at the start.
        expect(rng.drawn()).toBe(0);
        // A mark added after the start does not change this craft.
        ctx.sql.exec("UPDATE blueprints SET marks = 9 WHERE base_id = 'kelp-cap'");
        ctx.clock.t = job.endsAt;
        const res = await claim(p, job.id);
        expect(res.status).toBe(200);
        const expected = rollCraftItem(createSeededRng('reach-claim'), 'kelp-cap', 3, {
          reach: 'rare',
          marks: 3,
        });
        const result = res.body['result'] as Record<string, unknown>;
        expect(result).toMatchObject({
          kind: 'craft',
          reach: 'rare',
          baseId: 'kelp-cap',
          rarity: expected.item.rarity,
          itemLevel: 6,
          upgraded: expected.upgraded,
          // 6 hours at 12 XP an hour.
          xp: 72,
        });
        const item = rows<{
          rarity: string;
          made_by_name: string | null;
          made_at: number | null;
          item_level: number;
        }>(ctx.sql, 'SELECT rarity, made_by_name, made_at, item_level FROM gear_items')[0];
        expect(item?.rarity).toBe(expected.item.rarity);
        expect(item?.item_level).toBe(6);
        // The maker and the date are on the crafted item.
        expect(item?.made_by_name).not.toBeNull();
        expect(item?.made_at).toBe(job.endsAt);
        // The job recorded the nominal minutes it worked, for the creatures step.
        expect(
          rows<{ work_minutes: number }>(ctx.sql, 'SELECT work_minutes FROM workshop_jobs')[0]
            ?.work_minutes,
        ).toBe(360);
        // The same claim again rolls nothing.
        const drawn = rng.drawn();
        expect((await claim(p, job.id)).body['result']).toEqual(result);
        expect(rng.drawn()).toBe(drawn);
      },
      { gearRng: rng },
    );
  });

  it('a plain craft is still a Common-or-one-up craft of 3 hours, and an old client that sends no Reach gets one', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'trail-cap');
        giveParts(ctx, p.id, { scrap: 20 });
        const res = await start(p, {
          kind: 'craft',
          creatureId: p.creatureIds[0],
          blueprintId: 'trail-cap',
        });
        const job = (res.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job.endsAt - job.startedAt).toBe(3 * HOUR);
        expect(job.input['reach']).toBeUndefined();
        ctx.clock.t = job.endsAt;
        expect((await claim(p, job.id)).body['result']).toMatchObject({
          reach: 'none',
          rarity: 'common',
          xp: 36,
        });
      },
      { gearRng: createSeededRng('plain') },
    );
  });

  it('refuses a Reach that is not one of the three', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        for (const reach of ['legendary', 5, null]) {
          const res = await start(p, {
            kind: 'craft',
            creatureId: p.creatureIds[0],
            blueprintId: 'kelp-cap',
            reach,
          });
          expect(res.status, String(reach)).toBe(400);
        }
      },
      {},
    );
  });
});

describe('dismantling is a Workshop job', () => {
  it('previews the range (the same for every creature), the time and the blueprint chance of the creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const hat = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 10 });
        const [novice, master] = p.creatureIds as [string, string];
        setCraftingXp(ctx, p.id, master, 5_500); // level 10
        const ask = async (creatureId: string) =>
          (
            await p.call('POST', '/api/workshop/preview', {
              kind: 'dismantle',
              creatureId,
              itemIds: [hat],
            })
          ).body['result'] as {
            kind: string;
            range: unknown;
            durationMs: number;
            xp: number;
            learnBp: number | null;
            teachers: number;
            items: { id: string }[];
          };
        const a = await ask(novice);
        const b = await ask(master);
        expect(a.range).toEqual(
          dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 10 }]),
        );
        expect(a.range).toEqual({
          scrap: { min: 2, max: 3 },
          shards: { min: 1, max: 1, element: 'tide' },
          glimmer: { min: 0, max: 0 },
          essence: { min: 3, max: 8 },
        });
        // The range is the same whoever works; time and the blueprint chance are the creature's.
        expect(b.range).toEqual(a.range);
        expect(a.durationMs).toBe(HOUR);
        expect(b.durationMs).toBe(Math.floor(HOUR * 0.73));
        expect(a).toMatchObject({ learnBp: 700, xp: 12, teachers: 1 });
        expect(b.learnBp).toBe(1_600);
        expect(a.items.map((i) => i.id)).toEqual([hat]);
        expect(count(ctx.sql, 'gear_items')).toBe(1);
      },
      {},
    );
  });

  it('takes the items out of the bag now and gives the refund only at the claim, rolled with the live rng', async () => {
    const rng = counting('dismantle');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const ids = [1, 2, 3].map((n) => give(ctx, p.id, 'trail-cap', { seed: `c${String(n)}` }));
        const [c1] = p.creatureIds as [string];
        const started = await start(p, { kind: 'dismantle', creatureId: c1, itemIds: ids });
        expect(started.status).toBe(200);
        // 3 Commons in one 15 minute job; the bag is empty, nothing is paid yet.
        const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job).toMatchObject({ kind: 'dismantle', status: 'running' });
        expect(job.endsAt - job.startedAt).toBe(15 * MIN);
        expect(job.input['items']).toHaveLength(3);
        expect(count(ctx.sql, 'gear_items')).toBe(0);
        expect(partsOf(ctx, p.id)['scrap'] ?? 0).toBe(0);
        expect(rng.drawn()).toBe(0);
        expect(
          (started.body['state'] as { creatures: { id: string; busy: unknown }[] }).creatures.find(
            (c) => c.id === c1,
          )?.busy,
        ).toEqual({ kind: 'job', id: job.id });
        // Too early.
        ctx.clock.t = job.endsAt - 1;
        expect(await claim(p, job.id)).toMatchObject({ status: 409, body: { error: 'not_ready' } });
        ctx.clock.t = job.endsAt;
        const res = await claim(p, job.id);
        expect(res.status).toBe(200);
        const items = (
          job.input['items'] as { baseId: string; rarity: string; itemLevel: number }[]
        ).map((i) => ({ baseId: i.baseId, rarity: i.rarity as 'common', itemLevel: i.itemLevel }));
        const expected = rollDismantle(createSeededRng('dismantle'), items);
        const result = res.body['result'] as {
          kind: string;
          parts: PartsBundle;
          essence: number;
          xp: number;
          learned: string[];
          marked: unknown[];
        };
        expect(result).toMatchObject({ kind: 'dismantle', parts: expected.parts, essence: 0 });
        // Three Commons (item level 1, craft scrap cost 8 each): 2 to 3 scrap each, and the minimum 6 XP for a 15 minute job.
        expect(result.parts.scrap).toBeGreaterThanOrEqual(6);
        expect(result.parts.scrap).toBeLessThanOrEqual(9);
        expect(result.xp).toBe(6);
        expect(partsOf(ctx, p.id)['scrap']).toBe(result.parts.scrap);
        expect(
          rows<{ work_minutes: number }>(ctx.sql, 'SELECT work_minutes FROM workshop_jobs')[0]
            ?.work_minutes,
        ).toBe(15);
        // The creature is free again, and claiming again pays and rolls nothing more.
        const drawn = rng.drawn();
        expect((await claim(p, job.id)).body['result']).toEqual(res.body['result']);
        expect(rng.drawn()).toBe(drawn);
        expect(partsOf(ctx, p.id)['scrap']).toBe(result.parts.scrap);
      },
      { gearRng: rng },
    );
  });

  it('a Rare takes 1 hour and pays Essence through the ledger, an Epic takes 2 hours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const rare = give(ctx, p.id, 'coal-warm-cap', { rarity: 'rare', level: 5 });
        const epic = give(ctx, p.id, 'kelp-cap', { rarity: 'epic', level: 20 });
        const [c1, c2] = p.creatureIds as [string, string];
        const a = await start(p, { kind: 'dismantle', creatureId: c1, itemIds: [rare] });
        const b = await start(p, { kind: 'dismantle', creatureId: c2, itemIds: [epic] });
        const jobs = (b.body['gear'] as GearBody).jobs;
        const byKind = (id: string) => jobs.find((j) => j.id === id) as JobBody;
        expect(byKind(jobIdOf(a)).endsAt - byKind(jobIdOf(a)).startedAt).toBe(HOUR);
        expect(byKind(jobIdOf(b)).endsAt - byKind(jobIdOf(b)).startedAt).toBe(2 * HOUR);
        ctx.clock.t += 2 * HOUR;
        const done = await claim(p, jobIdOf(b));
        const result = done.body['result'] as { parts: PartsBundle; essence: number; xp: number };
        // Epic at item level 20 (craft scrap cost 11): 4 to 5 scrap, 1 or 2 tide shards, up to 1 glimmer, 10 to 25 Essence, 24 XP.
        expect(result.parts.scrap).toBeGreaterThanOrEqual(4);
        expect(result.parts.scrap).toBeLessThanOrEqual(5);
        expect(result.essence).toBeGreaterThanOrEqual(10);
        expect(result.essence).toBeLessThanOrEqual(25);
        expect(result.xp).toBe(24);
        expect(essenceOf(ctx, p.id)).toBe(result.essence);
        expect(
          rows<{ amount: number; source: string }>(
            ctx.sql,
            "SELECT amount, source FROM ledger WHERE user_id = ? AND source = 'dismantle'",
            p.id,
          ),
        ).toEqual([{ amount: result.essence, source: 'dismantle' }]);
        const shards = result.parts['tide-shard'] ?? 0;
        expect([1, 2]).toContain(shards);
        // Claiming again credits the Essence once.
        await claim(p, jobIdOf(b));
        expect(essenceOf(ctx, p.id)).toBe(result.essence);
      },
      { gearRng: createSeededRng('rare-epic') },
    );
  });

  it('the refund range is the same whichever creature works, over many rolls', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [novice, master] = p.creatureIds as [string, string];
        setCraftingXp(ctx, p.id, master, 5_500);
        const seen = new Map<string, Set<number>>();
        for (let i = 0; i < 12; i++) {
          for (const creature of [novice, master]) {
            const item = give(ctx, p.id, 'kelp-cap', {
              rarity: 'rare',
              level: 5,
              seed: `s${String(i)}${creature}`,
            });
            const res = await start(p, {
              kind: 'dismantle',
              creatureId: creature,
              itemIds: [item],
            });
            const job = (res.body['gear'] as GearBody).jobs.find(
              (j) => j.creatureId === creature,
            ) as JobBody;
            ctx.clock.t = job.endsAt;
            const done = (await claim(p, job.id)).body['result'] as {
              essence: number;
              parts: PartsBundle;
            };
            const values = seen.get(creature) ?? new Set<number>();
            values.add(done.essence);
            seen.set(creature, values);
            // Rare at item level 5 (craft scrap cost 7): 2 to 3 scrap, 1 shard, 3 to 8 Essence for everybody.
            expect(done.parts.scrap).toBeGreaterThanOrEqual(2);
            expect(done.parts.scrap).toBeLessThanOrEqual(3);
            expect(done.essence).toBeGreaterThanOrEqual(3);
            expect(done.essence).toBeLessThanOrEqual(8);
          }
        }
        // Both creatures roll across the range.
        expect((seen.get(master) ?? new Set()).size).toBeGreaterThan(2);
        expect((seen.get(novice) ?? new Set()).size).toBeGreaterThan(2);
      },
      { gearRng: createSeededRng('range') },
    );
  });

  it('refuses a mixed bundle, a bundle of Rares, repeats, six items and items that are not yours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        skipWelcome(ctx, other.id);
        const [c1] = p.creatureIds as [string];
        const common = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const common2 = give(ctx, p.id, 'trail-cap', { seed: 'b' });
        const rare = give(ctx, p.id, 'kelp-cap', { rarity: 'rare' });
        const rare2 = give(ctx, p.id, 'coal-warm-cap', { rarity: 'rare' });
        const theirs = give(ctx, other.id, 'trail-cap');
        const six = Array.from({ length: 6 }, (_, i) =>
          give(ctx, p.id, 'trail-cap', { seed: `six${String(i)}` }),
        );
        const tries: [string, string[], number, string][] = [
          ['mixed rarities', [common, rare], 400, 'invalid_bundle'],
          ['two Rares', [rare, rare2], 400, 'invalid_bundle'],
          ['a repeat', [common, common], 400, 'invalid_bundle'],
          ['six Commons', six, 400, 'invalid_body'],
          ['nothing', [], 400, 'invalid_body'],
          ['theirs', [theirs], 404, 'not_found'],
          ['one of theirs in a bundle', [common, common2, theirs], 404, 'not_found'],
        ];
        for (const [label, itemIds, status, error] of tries) {
          const res = await start(p, { kind: 'dismantle', creatureId: c1, itemIds });
          expect([label, res.status, res.body['error']]).toEqual([label, status, error]);
        }
        // Nothing was taken, started or kept by the failed tries.
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(10);
        // Five Commons are fine.
        const five = six.slice(0, 5);
        expect((await start(p, { kind: 'dismantle', creatureId: c1, itemIds: five })).status).toBe(
          200,
        );
      },
      {},
    );
  });

  it('keeps the busy rules: a busy creature, a full workshop, and gear frozen on a busy creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        skipWelcome(ctx, p.id);
        const [c1, c2, c3] = p.creatureIds as [string, string, string];
        const items = [1, 2, 3, 4].map((n) =>
          give(ctx, p.id, 'trail-cap', { seed: `b${String(n)}` }),
        );
        const [i1, i2, i3, i4] = items as [string, string, string, string];
        expect((await start(p, { kind: 'dismantle', creatureId: c1, itemIds: [i1] })).status).toBe(
          200,
        );
        expect(await start(p, { kind: 'dismantle', creatureId: c1, itemIds: [i2] })).toMatchObject({
          status: 409,
          body: { error: 'creature_on_job' },
        });
        expect((await start(p, { kind: 'dismantle', creatureId: c2, itemIds: [i2] })).status).toBe(
          200,
        );
        expect(await start(p, { kind: 'dismantle', creatureId: c3, itemIds: [i3] })).toMatchObject({
          status: 409,
          body: { error: 'workshop_full' },
        });
        // The items of a refused start stay.
        expect(count(ctx.sql, 'gear_items')).toBe(2);
        void i4;
        // An item worn by a creature on a job is not taken away from it.
        ctx.clock.t += HOUR;
        for (const j of ((await p.call('GET', '/api/gear')).body as unknown as GearBody).jobs) {
          await claim(p, j.id);
        }
        const worn = give(ctx, p.id, 'trail-cap', { seed: 'worn' });
        expect((await p.call('POST', `/api/gear/${worn}/equip`, { creatureId: c3 })).status).toBe(
          200,
        );
        expect(
          (await start(p, { kind: 'craft', creatureId: c3, blueprintId: 'trail-cap' })).status,
        ).toBe(409);
        learnBase(ctx, p.id, 'trail-cap');
        giveParts(ctx, p.id, { scrap: 20 });
        expect(
          (await start(p, { kind: 'craft', creatureId: c3, blueprintId: 'trail-cap' })).status,
        ).toBe(200);
        expect(
          await start(p, { kind: 'dismantle', creatureId: c1, itemIds: [worn] }),
        ).toMatchObject({
          status: 409,
          body: { error: 'creature_on_job' },
        });
        expect(count(ctx.sql, 'gear_items', `id = '${worn}'`)).toBe(1);
      },
      { gearRng: createSeededRng('busy') },
    );
  });

  it('takes a worn item off when its job starts, and is idempotent per key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 13 });
        skipWelcome(ctx, p.id);
        const [c1, c2] = p.creatureIds as [string, string];
        const worn = give(ctx, p.id, 'trail-cap');
        await p.call('POST', `/api/gear/${worn}/equip`, { creatureId: c1 });
        const body = {
          kind: 'dismantle',
          creatureId: c2,
          itemIds: [worn],
          idempotencyKey: newKey(),
        };
        const first = await p.call('POST', '/api/workshop/jobs', body);
        const again = await Promise.all(
          Array.from({ length: 3 }, () => p.call('POST', '/api/workshop/jobs', body)),
        );
        for (const r of again) expect(r.body['result']).toEqual(first.body['result']);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(1);
        expect(count(ctx.sql, 'gear_items')).toBe(0);
        // The same key on other items is a conflict.
        const other = give(ctx, p.id, 'trail-cap', { seed: 'other' });
        expect(
          await p.call('POST', '/api/workshop/jobs', { ...body, itemIds: [other] }),
        ).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
        expect(count(ctx.sql, 'gear_items')).toBe(1);
      },
      {},
    );
  });
});

describe('dismantling teaches blueprints and adds well-thumbed marks', () => {
  it('learns the blueprint of an item with the chance, or adds a mark for one it knows (never past 10)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'trail-cap', 9);
        const [c1, c2] = p.creatureIds as [string, string];
        const known = give(ctx, p.id, 'trail-cap', { seed: 'k1' });
        const fresh = give(ctx, p.id, 'kelp-cap', { seed: 'f1' });
        const started = await start(p, {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [known, fresh],
        });
        expect(started.status).toBe(200);
        // Two Commons: always a mark for the one it knows, the other is learned.
        const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
        ctx.clock.t = job.endsAt;
        const res = await claim(p, job.id);
        expect(res.body['result']).toMatchObject({
          learned: ['kelp-cap'],
          marked: [{ baseId: 'trail-cap', marks: 10 }],
        });
        expect(marksOf(ctx, p.id, 'trail-cap')).toBe(10);
        expect(marksOf(ctx, p.id, 'kelp-cap')).toBe(0);
        // At 10 marks a find adds nothing more.
        const more = give(ctx, p.id, 'trail-cap', { seed: 'k2' });
        const second = await start(p, { kind: 'dismantle', creatureId: c2, itemIds: [more] });
        const job2 = (second.body['gear'] as GearBody).jobs.find(
          (j) => j.creatureId === c2,
        ) as JobBody;
        ctx.clock.t = job2.endsAt;
        expect((await claim(p, job2.id)).body['result']).toMatchObject({ learned: [], marked: [] });
        expect(marksOf(ctx, p.id, 'trail-cap')).toBe(10);
      },
      { gearRng: lowest },
    );
  });

  it('gives no blueprint chance for Festival pieces and role Charms, and the chance follows the worker level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const bell = give(ctx, p.id, 'wardens-bell', { rarity: 'rare' });
        const lantern = give(ctx, p.id, 'festival-lantern-charm', { rarity: 'festival' });
        const ask = async (itemId: string) =>
          (
            await p.call('POST', '/api/workshop/preview', {
              kind: 'dismantle',
              creatureId: c1,
              itemIds: [itemId],
            })
          ).body['result'] as { learnBp: number | null; teachers: number };
        expect(await ask(bell)).toMatchObject({ learnBp: null, teachers: 0 });
        expect(await ask(lantern)).toMatchObject({ learnBp: null, teachers: 0 });
        const started = await start(p, { kind: 'dismantle', creatureId: c1, itemIds: [bell] });
        const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
        ctx.clock.t = job.endsAt;
        expect((await claim(p, job.id)).body['result']).toMatchObject({ learned: [], marked: [] });
        expect(count(ctx.sql, 'blueprints')).toBe(0);
      },
      { gearRng: lowest },
    );
  });

  it('adds a mark for a repeat find of a blueprint on a trip or in the finale, and scrap only at 10 marks', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const p = { id: 'user-marks' };
        learnBase(ctx, p.id, 'trail-cap', 8);
        const deps = {
          storage: ctx.storage,
          now: () => ctx.clock.t,
          rng: createSeededRng('marks'),
        };
        const find = (key: string) =>
          grantTripLoot(deps, p.id, key, () => ({
            parts: {},
            blueprints: ['trail-cap'],
            supplies: [],
            gear: [],
          }));
        const first = find('t1');
        expect(first.blueprints).toEqual([{ baseId: 'trail-cap', duplicate: true, marks: 9 }]);
        expect(first.parts).toEqual({});
        expect(find('t2').blueprints).toEqual([
          { baseId: 'trail-cap', duplicate: true, marks: 10 },
        ]);
        // The most marks: the find is scrap, as before.
        const capped = find('t3');
        expect(capped.blueprints).toEqual([{ baseId: 'trail-cap', duplicate: true }]);
        expect(capped.parts).toEqual({ scrap: RULES.gear.drops.duplicateBlueprintScrap });
        expect(marksOf(ctx, p.id, 'trail-cap')).toBe(10);
        // A repeat of the same trip claim changes nothing.
        expect(find('t2').blueprints).toEqual([
          { baseId: 'trail-cap', duplicate: true, marks: 10 },
        ]);
        expect(marksOf(ctx, p.id, 'trail-cap')).toBe(10);
        return Promise.resolve();
      },
      {},
    );
  });

  it('shows the marks of every blueprint in the gear view', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap', 4);
        const view = (await p.call('GET', '/api/gear')).body as unknown as GearBody;
        expect(view.blueprints).toEqual([
          expect.objectContaining({ baseId: 'kelp-cap', marks: 4 }),
        ]);
      },
      {},
    );
  });
});

describe('the day modifiers hook', () => {
  it('prices and rolls with what the day gives, and stores it with the job', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'kelp-cap');
        giveParts(ctx, p.id, { scrap: 20, 'tide-shard': 5 });
        giveEssence(ctx, p.id, 100);
        const [c1] = p.creatureIds as [string];
        setCraftingXp(ctx, p.id, c1, 250);
        const gear = new Gear({
          storage: ctx.storage,
          now: () => ctx.clock.t,
          rng: createSeededRng('mods'),
          workshopMods: () => ({ stepUpBonusBp: 500, dismantleTopOfRange: true }),
        });
        const plain = new Gear({
          storage: ctx.storage,
          now: () => ctx.clock.t,
          rng: createSeededRng('mods'),
        });
        const shown = gear.previewCraft(p.id, c1, 'kelp-cap');
        const normal = plain.previewCraft(p.id, c1, 'kelp-cap');
        if (!shown.ok || !normal.ok) throw new Error('preview failed');
        const rare = (o: typeof shown.value) => o.options[1]?.oddsBp;
        expect(rare(shown.value)).toEqual(craftOdds('rare', 3, 0, { stepUpBonusBp: 500 }));
        expect(rare(shown.value)?.epic).toBeGreaterThan(rare(normal.value)?.epic ?? 99_999);
        // A dismantle with the day's top-of-range rolls the top.
        const item = give(ctx, p.id, 'coal-warm-cap', { rarity: 'epic', level: 10 });
        const key = newKey();
        const started = gear.startJob(p.id, {
          kind: 'dismantle',
          creatureId: p.creatureIds[1] as string,
          itemIds: [item],
          idempotencyKey: key,
        });
        if (!started.ok) throw new Error('start failed');
        const job = rows<{ id: string; ends_at: number }>(
          ctx.sql,
          'SELECT id, ends_at FROM workshop_jobs',
        )[0];
        ctx.clock.t = job?.ends_at ?? 0;
        const done = gear.claimJob(p.id, job?.id ?? '', newKey());
        if (!done.ok || done.value.kind !== 'dismantle') throw new Error('claim failed');
        const range = dismantleRange([{ baseId: 'coal-warm-cap', rarity: 'epic', itemLevel: 10 }]);
        expect(done.value.parts.scrap).toBe(range.scrap.max);
        expect(done.value.essence).toBe(range.essence.max);
      },
      {},
    );
  });
});

describe('migration 28', () => {
  it('rebuilds the Workshop jobs table for dismantle jobs, keeps every row and adds the worked minutes', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const [c1, c2] = p.creatureIds as [string, string];
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json, work_minutes)
           VALUES ('j1', ?, ?, 'dismantle', NULL, '{}', 1, 2, NULL, NULL, 15)`,
          p.id,
          c1,
        );
        // Back to before the migration (a dismantle row cannot exist there), then forward again.
        undoWorkshopV2Migration(ctx.sql);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
             VALUES ('x', ?, ?, 'dismantle', '{}', 1, 2)`,
            p.id,
            c1,
          ),
        ).toThrow();
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at, claimed_at, result_json)
           VALUES ('old1', ?, ?, 'craft', '{"baseId":"kelp-cap","cost":{}}', 1, 2, 3, '{}'),
                  ('old2', ?, ?, 'supply', '{"cost":{}}', 4, 5, NULL, NULL)`,
          p.id,
          c1,
          p.id,
          c2,
        );
        ctx.core.migrate();
        expect(
          rows<{ id: string; kind: string; work_minutes: number; claimed_at: number | null }>(
            ctx.sql,
            'SELECT id, kind, work_minutes, claimed_at FROM workshop_jobs ORDER BY rowid',
          ),
        ).toEqual([
          { id: 'old1', kind: 'craft', work_minutes: 0, claimed_at: 3 },
          { id: 'old2', kind: 'supply', work_minutes: 0, claimed_at: null },
        ]);
        // A dismantle job fits now, and the rules of the table still hold: one open job per creature.
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
           VALUES ('new', ?, ?, 'dismantle', '{}', 1, 2)`,
          p.id,
          c1,
        );
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
             VALUES ('twice', ?, ?, 'dismantle', '{}', 1, 2)`,
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
      },
      {},
    );
  });
});
