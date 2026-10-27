/**
 * Marked items, dismantled as a pile (decisions.md, 2026-10-27), through the real routes: marking and its
 * refusals, the keyed all-at-once dismantle, its rolls (refund, blueprints, Tinker's luck, Essence once,
 * Market Day on the most valuable items), Crafting XP, and the old timed job (start refused, a running one
 * still claims).
 */
import {
  RULES,
  createSeededRng,
  dismantleRange,
  pileDismantleXp,
  rollDismantle,
  type PartsBundle,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/migrations';
import {
  apiPlayer as player,
  dismantlePile,
  essenceOf,
  giveItem,
  giveParts,
  learnBase,
  markAndDismantle,
  markItems,
  seedOldDismantleJob,
  setCraftingXp,
  skipWelcome,
  type Api,
} from './gear-helpers';
import { runCore, undoDismantleMarkMigration, type CoreContext } from './helpers';
import { HOUR, newKey } from './kit';
import { HELSINKI, count, nextGuild, rows } from './raid-helpers';
import { gameDay } from '../src/time';

/** Every roll lands on its lowest number: each chance succeeds, each range gives its minimum. */
const lowest: Rng = { nextU32: () => 0 };
/** Every roll lands high: a chance of under 99.98% fails. */
const highest: Rng = { nextU32: () => 4_294_959_998 };

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

const give = (ctx: CoreContext, userId: string, baseId: string, o = {}): string =>
  giveItem(ctx.sql, userId, baseId, { now: ctx.clock.t, ...o });

const markOf = (ctx: CoreContext, id: string): number | undefined =>
  rows<{ dismantle_mark: number }>(
    ctx.sql,
    'SELECT dismantle_mark FROM gear_items WHERE id = ?',
    id,
  )[0]?.dismantle_mark;

const partsOf = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ kind: string; amount: number }>(
      ctx.sql,
      'SELECT kind, amount FROM parts WHERE user_id = ?',
      userId,
    ).map((r) => [r.kind, r.amount]),
  );

const skillXpOf = (ctx: CoreContext, creatureId: string): number =>
  rows<{ xp: number }>(
    ctx.sql,
    'SELECT xp FROM crafting_skill WHERE creature_id = ?',
    creatureId,
  )[0]?.xp ?? 0;

interface PileResult {
  kind: string;
  items: { baseId: string; rarity: string; itemLevel: number }[];
  parts: PartsBundle;
  essence: number;
  learned: string[];
  marked: { baseId: string; marks: number }[];
  tinkered?: number;
  creatureId: string;
  boosted: number;
  xp: number;
  skillXp: number;
  skillLevel: number;
  leveledUp: boolean;
  experience?: unknown;
}

const resultOf = (res: { body: Record<string, unknown> }): PileResult =>
  res.body['result'] as PileResult;

describe('marking items for dismantling', () => {
  it('marks and unmarks, keeps the mark with the bag, and shows it in the gear view', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const b = give(ctx, p.id, 'trail-cap', { seed: 'b' });
        const view = async () =>
          (
            (await p.call('GET', '/api/gear')).body['items'] as {
              id: string;
              markedForDismantle: boolean;
            }[]
          ).map((i) => [i.id, i.markedForDismantle]);
        expect(await view()).toEqual([
          [a, false],
          [b, false],
        ]);
        const res = await markItems(p, [a, b]);
        expect(res.status).toBe(200);
        expect(res.body['result']).toEqual({ itemIds: [a, b], marked: true });
        expect(await view()).toEqual([
          [a, true],
          [b, true],
        ]);
        // Marking again changes nothing; unmarking one leaves the other.
        expect((await markItems(p, [a])).status).toBe(200);
        expect((await markItems(p, [a], false)).status).toBe(200);
        expect(await view()).toEqual([
          [a, false],
          [b, true],
        ]);
        // The answer carries the fresh gear view.
        const again = await markItems(p, [a]);
        expect(
          (
            again.body['gear'] as { items: { id: string; markedForDismantle: boolean }[] }
          ).items.find((i) => i.id === a)?.markedForDismantle,
        ).toBe(true);
      },
      {},
    );
  });

  it('refuses a worn item and an item in an open job, all or nothing, and unknown or foreign items', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const free = give(ctx, p.id, 'trail-cap', { seed: 'free' });
        const worn = give(ctx, p.id, 'trail-cap', { seed: 'worn' });
        const held = give(ctx, p.id, 'trail-cap', { seed: 'held' });
        const theirs = give(ctx, other.id, 'trail-cap');
        expect((await p.call('POST', `/api/gear/${worn}/equip`, { creatureId: c1 })).status).toBe(
          200,
        );
        // An item an open job holds (the `gear_id` of an old job).
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES ('held-job', ?, ?, 'craft', ?, '{}', 1, 2)`,
          p.id,
          p.creatureIds[1],
          held,
        );
        expect(await markItems(p, [free, worn])).toMatchObject({
          status: 409,
          body: { error: 'item_worn' },
        });
        expect(await markItems(p, [free, held])).toMatchObject({
          status: 409,
          body: { error: 'item_in_job' },
        });
        // Nothing was marked by the refused calls.
        expect([free, worn, held].map((id) => markOf(ctx, id))).toEqual([0, 0, 0]);
        expect((await markItems(p, [theirs])).status).toBe(404);
        expect((await markItems(p, [crypto.randomUUID()])).status).toBe(404);
        expect(markOf(ctx, theirs)).toBe(0);
        // Unmarking is always allowed, a worn item included.
        expect((await markItems(p, [worn], false)).status).toBe(200);
      },
      {},
    );
  });

  it('validates the body: strict keys, one to 60 distinct-looking ids, a boolean', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-cap');
        const ids = (n: number): string[] => Array.from({ length: n }, () => crypto.randomUUID());
        const ask = (body: unknown) => p.call('POST', '/api/gear/mark', body);
        for (const body of [
          { itemIds: [], marked: true },
          { itemIds: ids(61), marked: true },
          { itemIds: ['not-an-id'], marked: true },
          { itemIds: [id] },
          { itemIds: [id], marked: 'yes' },
          { itemIds: [id], marked: true, userId: 'someone' },
        ]) {
          expect((await ask(body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
        }
        expect(markOf(ctx, id)).toBe(0);
      },
      {},
    );
  });

  it('equipping a marked item removes its mark (Equip best too), and the picker sees it before', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        skipWelcome(ctx, p.id);
        const [c1, c2] = p.creatureIds as [string, string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const best = give(ctx, p.id, 'kelp-cap', { rarity: 'epic', level: 6, seed: 'best' });
        const rest = give(ctx, p.id, 'trail-cap', { seed: 'rest' });
        await markItems(p, [a, best, rest]);
        const gear = (await p.call('GET', '/api/gear')).body['items'] as {
          id: string;
          markedForDismantle: boolean;
        }[];
        expect(gear.every((i) => i.markedForDismantle)).toBe(true);
        const equipped = await p.call('POST', `/api/gear/${a}/equip`, { creatureId: c1 });
        expect(equipped.status).toBe(200);
        expect(
          (equipped.body['result'] as { item: { markedForDismantle: boolean } }).item
            .markedForDismantle,
        ).toBe(false);
        expect(markOf(ctx, a)).toBe(0);
        expect(markOf(ctx, rest)).toBe(1);
        // Equip best puts the Epic hat on and clears its mark too (the item it replaces was not marked).
        const planned = await p.call('POST', '/api/gear/equip-best', { creatureIds: [c2] });
        expect(planned.status).toBe(200);
        const moved = (planned.body['result'] as { changes: { itemId: string }[] }).changes.map(
          (c) => c.itemId,
        );
        for (const id of moved) expect(markOf(ctx, id)).toBe(0);
        expect(moved.length).toBeGreaterThan(0);
      },
      {},
    );
  });
});

describe('dismantling the marked pile', () => {
  it('takes every marked item at once, pays the refund, the Crafting XP and no creature experience', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const commons = [1, 2, 3].map((n) =>
          give(ctx, p.id, 'trail-cap', { seed: `c${String(n)}` }),
        );
        const rare = give(ctx, p.id, 'coal-warm-cap', { rarity: 'rare', level: 5 });
        const kept = give(ctx, p.id, 'trail-cap', { seed: 'kept' });
        const expBefore = rows<{ experience: number }>(
          ctx.sql,
          'SELECT exp AS experience FROM creatures WHERE id = ?',
          c1,
        )[0]?.experience;
        const ids = [...commons, rare];
        const res = await markAndDismantle(p, c1, ids);
        expect(res.status).toBe(200);
        const result = resultOf(res);
        expect(result.kind).toBe('dismantle');
        expect(result.creatureId).toBe(c1);
        // The most valuable first.
        expect(result.items.map((i) => i.rarity)).toEqual(['rare', 'common', 'common', 'common']);
        // The items are gone, the unmarked one stays, the parts are in the bank.
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(1);
        expect(markOf(ctx, kept)).toBe(0);
        expect(partsOf(ctx, p.id)['scrap']).toBe(result.parts.scrap);
        // Crafting XP: 6 for the (up to 5) Commons together and 12 for the Rare, as the old jobs paid.
        expect(result.xp).toBe(18);
        expect(result.xp).toBe(pileDismantleXp(['common', 'common', 'common', 'rare']));
        expect(skillXpOf(ctx, c1)).toBe(18);
        expect(result.skillXp).toBe(18);
        // No creature experience.
        expect(result.experience).toBeUndefined();
        expect(
          rows<{ experience: number }>(
            ctx.sql,
            'SELECT exp AS experience FROM creatures WHERE id = ?',
            c1,
          )[0]?.experience,
        ).toBe(expBefore);
        // The answer carries both fresh views.
        expect(res.body['gear']).toBeDefined();
        expect(res.body['state']).toBeDefined();
      },
      {},
    );
  });

  it('pays the same Crafting XP the old jobs did: a Common bundle per 5, 12 a Rare, 24 an Epic', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const ids = [
          ...Array.from({ length: 7 }, (_, i) =>
            give(ctx, p.id, 'trail-cap', { seed: `many${String(i)}` }),
          ),
          give(ctx, p.id, 'kelp-cap', { rarity: 'rare' }),
          give(ctx, p.id, 'coal-warm-cap', { rarity: 'epic', level: 10 }),
        ];
        const result = resultOf(await markAndDismantle(p, c1, ids));
        // 7 Commons are two old jobs (12), plus 12 and 24.
        expect(result.xp).toBe(12 + 12 + 24);
      },
      {},
    );
  });

  it('is keyed: a retry returns the stored result and rolls, pays and takes nothing more', async () => {
    const rng = counting('pile-retry');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const ids = [
          give(ctx, p.id, 'coal-warm-cap', { rarity: 'epic', level: 10, seed: 'e1' }),
          give(ctx, p.id, 'kelp-cap', { rarity: 'epic', level: 10, seed: 'e2' }),
        ];
        await markItems(p, ids);
        const key = newKey();
        const first = await dismantlePile(p, c1, ids, key);
        expect(first.status).toBe(200);
        const drawn = rng.drawn();
        expect(drawn).toBeGreaterThan(0);
        const parts = partsOf(ctx, p.id);
        const essence = essenceOf(ctx, p.id);
        const xp = skillXpOf(ctx, c1);
        const again = await Promise.all(
          Array.from({ length: 3 }, () => dismantlePile(p, c1, ids, key)),
        );
        for (const r of again) {
          expect(r.status).toBe(200);
          expect(r.body['result']).toEqual(first.body['result']);
        }
        expect(rng.drawn()).toBe(drawn);
        expect(partsOf(ctx, p.id)).toEqual(parts);
        expect(essenceOf(ctx, p.id)).toBe(essence);
        expect(skillXpOf(ctx, c1)).toBe(xp);
        // The same key for another pile is a conflict.
        const other = give(ctx, p.id, 'trail-cap', { seed: 'other' });
        await markItems(p, [other]);
        expect(await dismantlePile(p, c1, [other], key)).toMatchObject({
          status: 409,
          body: { error: 'key_conflict' },
        });
        expect(count(ctx.sql, 'gear_items', `id = '${other}'`)).toBe(1);
      },
      { gearRng: rng },
    );
  });

  it('pays the Essence once, through the ledger, for the whole pile', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const ids = [
          give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 5, seed: 'r1' }),
          give(ctx, p.id, 'coal-warm-cap', { rarity: 'rare', level: 5, seed: 'r2' }),
          give(ctx, p.id, 'kelp-cap', { rarity: 'epic', level: 20, seed: 'e1' }),
        ];
        const result = resultOf(await markAndDismantle(p, c1, ids));
        expect(result.essence).toBeGreaterThanOrEqual(3 + 3 + 10);
        expect(result.essence).toBeLessThanOrEqual(8 + 8 + 25);
        expect(essenceOf(ctx, p.id)).toBe(result.essence);
        expect(
          rows<{ amount: number; source: string }>(
            ctx.sql,
            "SELECT amount, source FROM ledger WHERE user_id = ? AND source = 'dismantle'",
            p.id,
          ),
        ).toEqual([{ amount: result.essence, source: 'dismantle' }]);
      },
      { gearRng: createSeededRng('pile-essence') },
    );
  });

  it('refuses with 409 and takes nothing when the marked set is not exactly what was shown', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const b = give(ctx, p.id, 'trail-cap', { seed: 'b' });
        const c = give(ctx, p.id, 'trail-cap', { seed: 'c' });
        await markItems(p, [a, b]);
        const before = partsOf(ctx, p.id);
        // A marked item the confirmation did not show (c is marked now, the request names a and b).
        await markItems(p, [c]);
        expect(await dismantlePile(p, c1, [a, b])).toMatchObject({
          status: 409,
          body: { error: 'marks_changed' },
        });
        // A shown item that was unmarked meanwhile.
        await markItems(p, [c], false);
        await markItems(p, [b], false);
        expect(await dismantlePile(p, c1, [a, b])).toMatchObject({
          status: 409,
          body: { error: 'marks_changed' },
        });
        // An item that was never marked.
        expect(await dismantlePile(p, c1, [a, c])).toMatchObject({
          status: 409,
          body: { error: 'marks_changed' },
        });
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(3);
        expect(partsOf(ctx, p.id)).toEqual(before);
        expect(skillXpOf(ctx, c1)).toBe(0);
        // The exact set goes through.
        expect((await dismantlePile(p, c1, [a])).status).toBe(200);
      },
      {},
    );
  });

  it('refuses a busy creature (away or on a job), a foreign creature and a body with anything extra', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        const [away, working, free] = p.creatureIds as [string, string, string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        await markItems(p, [a]);
        ctx.sql.exec("UPDATE creatures SET away_expedition_id = 'trip-1' WHERE id = ?", away);
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES ('busy-job', ?, ?, 'supply', NULL, '{}', 1, 2)`,
          p.id,
          working,
        );
        expect(await dismantlePile(p, away, [a])).toMatchObject({
          status: 409,
          body: { error: 'creature_away' },
        });
        expect(await dismantlePile(p, working, [a])).toMatchObject({
          status: 409,
          body: { error: 'creature_on_job' },
        });
        expect((await dismantlePile(p, other.creatureIds[0] as string, [a])).status).toBe(404);
        expect(
          (
            await p.call('POST', '/api/gear/dismantle', {
              creatureId: free,
              itemIds: [a],
              idempotencyKey: newKey(),
              userId: 'someone',
            })
          ).status,
        ).toBe(400);
        expect(count(ctx.sql, 'gear_items', `id = '${a}'`)).toBe(1);
        expect((await dismantlePile(p, free, [a])).status).toBe(200);
      },
      {},
    );
  });

  it('takes no workshop slot: a creature can dismantle while every slot is busy', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        skipWelcome(ctx, p.id);
        const [c1, c2, c3] = p.creatureIds as [string, string, string];
        for (const creatureId of [c1, c2]) {
          ctx.sql.exec(
            `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
             VALUES (?, ?, ?, 'supply', NULL, '{}', 1, 2)`,
            crypto.randomUUID(),
            p.id,
            creatureId,
          );
        }
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        expect((await markAndDismantle(p, c3, [a])).status).toBe(200);
        expect(count(ctx.sql, 'workshop_jobs', 'claimed_at IS NULL')).toBe(2);
      },
      {},
    );
  });

  it('rolls each item inside its range: the refund does not depend on the Crafting level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [novice, master] = p.creatureIds as [string, string];
        setCraftingXp(ctx, p.id, master, 5_500);
        for (let i = 0; i < 6; i++) {
          for (const who of [novice, master]) {
            const item = give(ctx, p.id, 'kelp-cap', {
              rarity: 'rare',
              level: 5,
              seed: `s${String(i)}${who}`,
            });
            const done = resultOf(await markAndDismantle(p, who, [item]));
            const range = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 5 }]);
            expect(done.parts.scrap).toBeGreaterThanOrEqual(range.scrap.min);
            expect(done.parts.scrap).toBeLessThanOrEqual(range.scrap.max);
            expect(done.essence).toBeGreaterThanOrEqual(range.essence.min);
            expect(done.essence).toBeLessThanOrEqual(range.essence.max);
          }
        }
      },
      { gearRng: createSeededRng('pile-range') },
    );
  });
});

describe('what the pile teaches and refunds', () => {
  it('learns a blueprint per item with the chance, or adds a mark for one it knows (never past 10)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learnBase(ctx, p.id, 'trail-cap', 9);
        const [c1] = p.creatureIds as [string];
        const known = give(ctx, p.id, 'trail-cap', { seed: 'k1' });
        const fresh = give(ctx, p.id, 'kelp-cap', { seed: 'f1' });
        const result = resultOf(await markAndDismantle(p, c1, [known, fresh]));
        // Every chance hits: the new base is learned, the known one gets its tenth mark.
        expect(result.learned).toEqual(['kelp-cap']);
        expect(result.marked).toEqual([{ baseId: 'trail-cap', marks: 10 }]);
        // At 10 marks a find adds nothing more.
        const more = give(ctx, p.id, 'trail-cap', { seed: 'k2' });
        expect(resultOf(await markAndDismantle(p, c1, [more]))).toMatchObject({
          learned: [],
          marked: [],
        });
      },
      { gearRng: lowest },
    );
  });

  it("draws the blueprint chance with the dismantler's Crafting level (6% + 1 point a level)", async () => {
    const rolls = async (level: number): Promise<number> => {
      let learned = 0;
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await player(ctx, 1);
          skipWelcome(ctx, p.id);
          const [c1] = p.creatureIds as [string];
          setCraftingXp(ctx, p.id, c1, level === 10 ? 5_500 : 0);
          const preview = await p.call('POST', '/api/workshop/preview', {
            kind: 'dismantle',
            creatureId: c1,
            itemIds: [give(ctx, p.id, 'kelp-cap', { seed: `p${String(level)}` })],
          });
          learned = (preview.body['result'] as { learnBp: number }).learnBp;
        },
        {},
      );
      return learned;
    };
    expect(await rolls(1)).toBe(700);
    expect(await rolls(10)).toBe(1_600);
  });

  it('gives Festival pieces and role Charms no blueprint chance', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const bell = give(ctx, p.id, 'wardens-bell', { rarity: 'rare' });
        const lantern = give(ctx, p.id, 'festival-lantern-charm', { rarity: 'epic' });
        const preview = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [bell, lantern],
        });
        expect(preview.body['result']).toMatchObject({ learnBp: null, teachers: 0 });
        expect(resultOf(await markAndDismantle(p, c1, [bell, lantern]))).toMatchObject({
          learned: [],
          marked: [],
        });
        expect(count(ctx.sql, 'blueprints')).toBe(0);
      },
      { gearRng: lowest },
    );
  });

  it("applies the dismantler's Tinker's luck to each item, and says how many came back in full", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 15, species: ['cindle', 'splashet'] });
        skipWelcome(ctx, p.id);
        const [worker, plain] = p.creatureIds as [string, string];
        const charm = give(ctx, p.id, 'trail-charm', {
          rarity: 'epic',
          level: 1,
          lines: [['tinkers-luck', 0]],
        });
        expect(
          (await p.call('POST', `/api/gear/${charm}/equip`, { creatureId: worker })).status,
        ).toBe(200);
        const mk = (seed: string) =>
          give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 8, seed });
        const range = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 8 }]);
        const without = resultOf(await markAndDismantle(p, plain, [mk('a'), mk('b')]));
        expect(without.tinkered).toBeUndefined();
        expect(without.parts.scrap).toBe(range.scrap.min * 2);
        const withLine = resultOf(await markAndDismantle(p, worker, [mk('c'), mk('d'), mk('e')]));
        expect(withLine.tinkered).toBe(3);
        expect(withLine.parts.scrap ?? 0).toBeGreaterThan(range.scrap.min * 3);
      },
      { gearRng: lowest },
    );
  });

  it("shows Tinker's luck in the preview and no refund bonus when the chance misses", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 15, species: ['cindle'] });
        skipWelcome(ctx, p.id);
        const [worker] = p.creatureIds as [string];
        const charm = give(ctx, p.id, 'trail-charm', {
          rarity: 'epic',
          level: 1,
          lines: [['tinkers-luck', 0]],
        });
        await p.call('POST', `/api/gear/${charm}/equip`, { creatureId: worker });
        const item = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 8 });
        const preview = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: worker,
          itemIds: [item],
        });
        expect((preview.body['result'] as { tinkersLuckBp: number }).tinkersLuckBp).toBeGreaterThan(
          0,
        );
        const done = resultOf(await markAndDismantle(p, worker, [item]));
        expect(done.tinkered).toBeUndefined();
      },
      { gearRng: highest },
    );
  });
});

describe('the preview of a pile', () => {
  it('sends the range, the Crafting XP, the blueprint chance and the order, and changes nothing', async () => {
    const rng = counting('pile-preview');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const common = give(ctx, p.id, 'trail-cap', { seed: 'c' });
        const epic = give(ctx, p.id, 'coal-warm-cap', { rarity: 'epic', level: 12 });
        const rare = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 3 });
        const res = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [common, rare, epic],
        });
        expect(res.status).toBe(200);
        const r = res.body['result'] as {
          items: { id: string }[];
          range: unknown;
          xp: number;
          learnBp: number | null;
          teachers: number;
          boosted: number;
          durationMs?: number;
        };
        expect(r.items.map((i) => i.id)).toEqual([epic, rare, common]);
        expect(r.range).toEqual(
          dismantleRange([
            { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
            { baseId: 'kelp-cap', rarity: 'rare', itemLevel: 3 },
            { baseId: 'coal-warm-cap', rarity: 'epic', itemLevel: 12 },
          ]),
        );
        expect(r).toMatchObject({ xp: 6 + 12 + 24, learnBp: 700, teachers: 3, boosted: 0 });
        expect(r.durationMs).toBeUndefined();
        expect(rng.drawn()).toBe(0);
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(3);
        expect(markOf(ctx, common)).toBe(0);
      },
      { gearRng: rng },
    );
  });

  it('refuses a foreign item, repeats and more than 60 items, but previews a worn one (the dismantle refuses it)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const theirs = give(ctx, other.id, 'trail-cap');
        await p.call('POST', `/api/gear/${a}/equip`, { creatureId: c1 });
        const ask = (itemIds: string[]) =>
          p.call('POST', '/api/workshop/preview', { kind: 'dismantle', creatureId: c1, itemIds });
        expect((await ask([a])).status).toBe(200);
        expect((await ask([theirs])).status).toBe(404);
        const b = give(ctx, p.id, 'trail-cap', { seed: 'b' });
        expect((await ask([b, b])).status).toBe(400);
        expect((await ask(Array.from({ length: 61 }, () => crypto.randomUUID()))).status).toBe(400);
      },
      {},
    );
  });
});

describe('Market Day on a pile', () => {
  const AFTERNOON = Date.parse('2027-01-13T12:00:00Z');

  async function marketPlayer(ctx: CoreContext): Promise<Api> {
    ctx.clock.t = AFTERNOON;
    const p = await player(ctx, 1, { level: 5, creatures: 3 });
    skipWelcome(ctx, p.id);
    return p;
  }
  const dayOf = (ctx: CoreContext): string => gameDay(ctx.clock.t, HELSINKI, RULES.daily.reset);
  const market = (ctx: CoreContext, boon = 'market-day'): void => {
    ctx.core.weather.force(dayOf(ctx), boon, null);
  };

  it('gives the top of the range to the most valuable items: rarity first, then item level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await marketPlayer(ctx);
        market(ctx);
        const [c1] = p.creatureIds as [string];
        // Three Rares of one base at different item levels, and a Common that is never among the first two.
        const low = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 2, seed: 'low' });
        const high = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 10, seed: 'high' });
        const mid = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 6, seed: 'mid' });
        const common = give(ctx, p.id, 'trail-cap', { seed: 'common' });
        const result = resultOf(await markAndDismantle(p, c1, [low, high, mid, common]));
        expect(result.boosted).toBe(2);
        // With the lowest dice, each unboosted Rare gives the bottom of its range and a boosted one the top.
        const essence = RULES.gear.dismantle.ranges.rare.essence;
        expect(result.essence).toBe(essence[1] * 2 + essence[0]);
        const top = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 10 }]);
        const second = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 6 }]);
        const bottom = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 2 }]);
        const commonRange = dismantleRange([
          { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
        ]);
        expect(result.parts.scrap).toBe(
          top.scrap.max + second.scrap.max + bottom.scrap.min + commonRange.scrap.min,
        );
      },
      { weather: true, gearRng: lowest },
    );
  });

  it('counts the day in items: the first 2 items of the day, across piles, then none; a new day starts again', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await marketPlayer(ctx);
        market(ctx);
        const [c1] = p.creatureIds as [string];
        const mk = (seed: string) => give(ctx, p.id, 'trail-cap', { seed });
        expect(resultOf(await markAndDismantle(p, c1, [mk('a')])).boosted).toBe(1);
        expect(resultOf(await markAndDismantle(p, c1, [mk('b'), mk('c'), mk('d')])).boosted).toBe(
          1,
        );
        expect(resultOf(await markAndDismantle(p, c1, [mk('e')])).boosted).toBe(0);
        // The preview of a pile says the same before it is dismantled.
        const preview = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [mk('f')],
        });
        expect((preview.body['result'] as { boosted: number }).boosted).toBe(0);
        // Without the Boon nothing is boosted.
        market(ctx, 'fair-winds');
        expect(resultOf(await markAndDismantle(p, c1, [mk('g')])).boosted).toBe(0);
      },
      { weather: true, gearRng: lowest },
    );
  });

  it('counts the timed jobs started today before the pile (one each)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await marketPlayer(ctx);
        market(ctx);
        const [c1, c2] = p.creatureIds as [string, string];
        // One old timed job started earlier today: one of the day's two is used.
        seedOldDismantleJob(
          ctx,
          p.id,
          c2,
          [{ baseId: 'trail-cap', rarity: 'common', itemLevel: 1 }],
          ctx.clock.t + HOUR,
        );
        const items = ['a', 'b', 'c'].map((seed) => give(ctx, p.id, 'trail-cap', { seed }));
        expect(resultOf(await markAndDismantle(p, c1, items)).boosted).toBe(1);
      },
      { weather: true, gearRng: lowest },
    );
  });
});

describe('the timed dismantle job is gone', () => {
  it('refuses to start one with 410 and takes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const res = await p.call('POST', '/api/workshop/jobs', {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [a],
          idempotencyKey: newKey(),
        });
        expect(res).toMatchObject({ status: 410, body: { error: 'dismantle_job_removed' } });
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
        expect(count(ctx.sql, 'gear_items', `id = '${a}'`)).toBe(1);
      },
      {},
    );
  });

  it('lets a job that was already running finish and be claimed normally, with its experience', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const jobId = seedOldDismantleJob(
          ctx,
          p.id,
          c1,
          [
            { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
            { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
          ],
          ctx.clock.t + 15 * 60_000,
        );
        const early = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(early).toMatchObject({ status: 409, body: { error: 'not_ready' } });
        ctx.clock.t += 15 * 60_000;
        const res = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        const result = res.body['result'] as PileResult;
        expect(result).toMatchObject({ kind: 'dismantle', xp: 6 });
        expect(result.experience).toBeDefined();
        expect(partsOf(ctx, p.id)['scrap']).toBe(result.parts.scrap);
      },
      {},
    );
  });
});

describe('migration 48', () => {
  it('adds the mark column (everything unmarked) and the day count table, and can be redone', async () => {
    expect(SCHEMA_VERSION).toBe(48);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-cap');
        undoDismantleMarkMigration(ctx.sql);
        expect(count(ctx.sql, "pragma_table_info('gear_items')", "name = 'dismantle_mark'")).toBe(
          0,
        );
        ctx.core.migrate();
        ctx.core.migrate();
        expect(markOf(ctx, a)).toBe(0);
        expect(count(ctx.sql, 'sqlite_master', "name = 'dismantle_days'")).toBe(1);
        expect(
          rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
        ).toBe(48);
        expect((await markItems(p, [a])).status).toBe(200);
      },
      {},
    );
  });
});

// A rolled pile is what `rollDismantle` gives for the same dice over the items in pile order.
describe('the roll of a pile', () => {
  it('is rollDismantle over the items most valuable first, drawn from the live gear dice', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        giveParts(ctx, p.id, {});
        const rare = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 4, seed: 'r' });
        const common = give(ctx, p.id, 'trail-cap', { seed: 'c' });
        const result = resultOf(await markAndDismantle(p, c1, [common, rare]));
        const expected = rollDismantle(
          createSeededRng('pile-roll'),
          [
            { baseId: 'kelp-cap', rarity: 'rare', itemLevel: 4 },
            { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
          ],
          {},
          0,
        );
        expect(result.parts).toEqual(expected.parts);
        expect(result.essence).toBe(expected.essence);
      },
      { gearRng: createSeededRng('pile-roll') },
    );
  });
});
