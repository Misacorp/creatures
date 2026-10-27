import {
  RULES,
  craftOdds,
  createSeededRng,
  dismantleRange,
  jobDuration,
  rollCraftItem,
  type PartsBundle,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { Gear } from '../src/gear';
import { grantTripLoot } from '../src/gear-grants';
import {
  apiPlayer as player,
  essenceOf,
  giveItem,
  giveParts,
  learnBase,
  setCraftingXp,
  skipWelcome,
  type Api,
} from './gear-helpers';
import { runCore, undoWorkshopV2Migration, type CoreContext } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';
import { HOUR, newKey, give as giveFunds } from './kit';

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

const start = (p: Api, body: Record<string, unknown>) =>
  p.call('POST', '/api/workshop/jobs', { idempotencyKey: newKey(), ...body });

const claim = (p: Api, jobId: string, key = newKey()) =>
  p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: key });

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
        giveFunds(ctx, p.id, { essence: 100 });
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
        giveFunds(ctx, p.id, { essence: 69 });
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
        giveFunds(ctx, p.id, { essence: 1 });
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
        giveFunds(ctx, p.id, { essence: 100 });
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
        giveFunds(ctx, p.id, { essence: 100 });
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
        giveFunds(ctx, p.id, { essence: 100 });
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

describe('well-thumbed marks of a blueprint', () => {
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
        giveFunds(ctx, p.id, { essence: 100 });
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
        // A pile dismantle with the day's top-of-range rolls the top of every item (the hook says all).
        const item = give(ctx, p.id, 'coal-warm-cap', { rarity: 'epic', level: 10 });
        const marked = gear.markForDismantle(p.id, [item], true);
        if (!marked.ok) throw new Error('mark failed');
        const done = gear.dismantlePile(p.id, {
          creatureId: p.creatureIds[1] as string,
          itemIds: [item],
          idempotencyKey: newKey(),
        });
        if (!done.ok) throw new Error('dismantle failed');
        const range = dismantleRange([{ baseId: 'coal-warm-cap', rarity: 'epic', itemLevel: 10 }]);
        expect(done.value.parts.scrap).toBe(range.scrap.max);
        expect(done.value.essence).toBe(range.essence.max);
        expect(done.value.boosted).toBe(1);
      },
      {},
    );
  });
});

describe('migration 29', () => {
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
