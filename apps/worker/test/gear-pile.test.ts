/**
 * Items dismantled as a pile (decisions.md, 2026-10-27, "Bulk selection replaces marking"), through the real
 * routes: the items named in the request (worn ones come off, a creature that is away keeps what its trip or
 * job reads), the keyed all-at-once dismantle, its rolls (refund, blueprints, Tinker's luck, Essence once,
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
  seedOldDismantleJob,
  setCraftingXp,
  skipWelcome,
  type Api,
} from './gear-helpers';
import {
  runCore,
  undoDismantleMarkMigration,
  undoDismantleUnmarkMigration,
  type CoreContext,
} from './helpers';
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

/** Wears an item straight from the table (the equip route refuses a busy creature, which some tests need). */
const wear = (ctx: CoreContext, itemId: string, creatureId: string): void => {
  ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, itemId);
};

/** Sends a creature away on a trip (a row in the creature is all the gear code reads). */
const sendAway = (ctx: CoreContext, creatureId: string): void => {
  ctx.sql.exec("UPDATE creatures SET away_expedition_id = 'trip-1' WHERE id = ?", creatureId);
};

/** Puts a creature on an open Workshop supply job. */
const putOnJob = (ctx: CoreContext, userId: string, creatureId: string): void => {
  ctx.sql.exec(
    `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
     VALUES (?, ?, ?, 'supply', NULL, '{}', 1, 2)`,
    crypto.randomUUID(),
    userId,
    creatureId,
  );
};

const itemCount = (ctx: CoreContext, userId: string): number =>
  count(ctx.sql, 'gear_items', `user_id = '${userId}'`);

describe('the mark route is gone', () => {
  it('has no route to mark items any more, and the gear view carries no mark', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-cap');
        const res = await p.call('POST', '/api/gear/mark', { itemIds: [a], marked: true });
        expect(res.status).toBe(404);
        const view = (await p.call('GET', '/api/gear')).body['items'] as Record<string, unknown>[];
        expect(view[0]).toBeDefined();
        expect('markedForDismantle' in (view[0] as object)).toBe(false);
        expect(count(ctx.sql, "pragma_table_info('gear_items')", "name = 'dismantle_mark'")).toBe(
          0,
        );
      },
      {},
    );
  });
});

describe('dismantling by item ids', () => {
  it('takes the named items only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
        const b = give(ctx, p.id, 'trail-cap', { seed: 'b' });
        const kept = give(ctx, p.id, 'trail-cap', { seed: 'kept' });
        const res = await dismantlePile(p, c1, [a, b]);
        expect(res.status).toBe(200);
        expect(resultOf(res).items).toHaveLength(2);
        expect(count(ctx.sql, 'gear_items', `id IN ('${a}', '${b}')`)).toBe(0);
        expect(count(ctx.sql, 'gear_items', `id = '${kept}'`)).toBe(1);
      },
      {},
    );
  });

  it('takes worn items off in the same transaction: they are gone from their wearers', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        skipWelcome(ctx, p.id);
        const [wearer, helper] = p.creatureIds as [string, string];
        const worn = give(ctx, p.id, 'trail-cap', { seed: 'worn' });
        const free = give(ctx, p.id, 'trail-cap', { seed: 'free' });
        expect(
          (await p.call('POST', `/api/gear/${worn}/equip`, { creatureId: wearer })).status,
        ).toBe(200);
        const res = await dismantlePile(p, helper, [worn, free]);
        expect(res.status).toBe(200);
        expect(resultOf(res).items).toHaveLength(2);
        expect(itemCount(ctx, p.id)).toBe(0);
        expect(count(ctx.sql, 'gear_items', `equipped_on = '${wearer}'`)).toBe(0);
        // The wearer's card shows nothing worn, in the answer's state and in a fresh one.
        const state = res.body['state'] as { creatures: { id: string; gear: unknown[] }[] };
        expect(state.creatures.find((c) => c.id === wearer)?.gear).toEqual([]);
        const fresh = (await p.call('GET', '/api/state')).body as typeof state;
        expect(fresh.creatures.find((c) => c.id === wearer)?.gear).toEqual([]);
      },
      {},
    );
  });

  it('lets the dismantler wear an item of the pile: its own gear counts as it was when the player confirmed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 10 });
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const hat = give(ctx, p.id, 'trail-cap', {
          rarity: 'rare',
          level: 8,
          lines: [['apprentice', 2]],
        });
        expect((await p.call('POST', `/api/gear/${hat}/equip`, { creatureId: c1 })).status).toBe(
          200,
        );
        const preview = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [hat],
        });
        const shown = (preview.body['result'] as { xp: number }).xp;
        const done = resultOf(await dismantlePile(p, c1, [hat]));
        // Apprentice (+20% at tier III) was on when it was shown and when it was done.
        expect(done.xp).toBe(shown);
        expect(done.xp).toBeGreaterThan(pileDismantleXp(['rare']));
        expect(itemCount(ctx, p.id)).toBe(0);
      },
      {},
    );
  });

  it('is all or nothing: a foreign, unknown or repeated item and an item an open job holds refuse the whole pile', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        const [c1, c2] = p.creatureIds as [string, string];
        const free = give(ctx, p.id, 'trail-cap', { seed: 'free' });
        const held = give(ctx, p.id, 'trail-cap', { seed: 'held' });
        const theirs = give(ctx, other.id, 'trail-cap');
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES ('held-job', ?, ?, 'craft', ?, '{}', 1, 2)`,
          p.id,
          c2,
          held,
        );
        const before = partsOf(ctx, p.id);
        expect(await dismantlePile(p, c1, [free, held])).toMatchObject({
          status: 409,
          body: { error: 'item_in_job' },
        });
        expect((await dismantlePile(p, c1, [free, theirs])).status).toBe(404);
        expect((await dismantlePile(p, c1, [free, crypto.randomUUID()])).status).toBe(404);
        expect((await dismantlePile(p, c1, [free, free])).status).toBe(400);
        expect(itemCount(ctx, p.id)).toBe(2);
        expect(count(ctx.sql, 'gear_items', `id = '${theirs}'`)).toBe(1);
        expect(partsOf(ctx, p.id)).toEqual(before);
        expect(skillXpOf(ctx, c1)).toBe(0);
        expect((await dismantlePile(p, c1, [free])).status).toBe(200);
      },
      {},
    );
  });

  it('validates the body: strict keys, one to 60 ids, a creature and a key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const id = give(ctx, p.id, 'trail-cap');
        const ids = (n: number): string[] => Array.from({ length: n }, () => crypto.randomUUID());
        const ask = (body: unknown) => p.call('POST', '/api/gear/dismantle', body);
        const key = newKey();
        for (const body of [
          { creatureId: c1, itemIds: [], idempotencyKey: key },
          { creatureId: c1, itemIds: ids(61), idempotencyKey: key },
          { creatureId: c1, itemIds: ['not-an-id'], idempotencyKey: key },
          { creatureId: c1, itemIds: [id] },
          { itemIds: [id], idempotencyKey: key },
          { creatureId: c1, itemIds: [id], idempotencyKey: key, marked: true },
        ]) {
          expect((await ask(body)).status, JSON.stringify(body).slice(0, 70)).toBe(400);
        }
        expect(itemCount(ctx, p.id)).toBe(1);
      },
      {},
    );
  });
});

describe('worn items on creatures that are away', () => {
  const lines = (...ids: string[]): [string, number][] => ids.map((id) => [id, 2]);

  it('takes an item off a creature on a trip when the trip has already fixed what it does (Quick feet)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 14 });
        skipWelcome(ctx, p.id);
        const [explorer, helper] = p.creatureIds as [string, string];
        // Quick feet shortened the trip when it was sent; the claim never reads them again.
        const compass = give(ctx, p.id, 'static-charm', {
          rarity: 'epic',
          level: 13,
          lines: lines('quick-feet'),
        });
        wear(ctx, compass, explorer);
        sendAway(ctx, explorer);
        expect(
          await p.call('POST', '/api/gear/dismantle-check', { itemIds: [compass] }),
        ).toMatchObject({ status: 200, body: { result: { locked: [] } } });
        const res = await dismantlePile(p, helper, [compass]);
        expect(res.status).toBe(200);
        expect(count(ctx.sql, 'gear_items', `id = '${compass}'`)).toBe(0);
        expect(
          count(ctx.sql, 'creatures', `id = '${explorer}' AND away_expedition_id IS NOT NULL`),
        ).toBe(1);
      },
      {},
    );
  });

  it('keeps an item a trip reads when it is claimed (Lucky find, Trail XP): 409 item_locked, nothing is taken', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 14 });
        skipWelcome(ctx, p.id);
        const [explorer, helper] = p.creatureIds as [string, string];
        const lucky = give(ctx, p.id, 'static-charm', {
          rarity: 'epic',
          level: 13,
          lines: lines('lucky-find'),
        });
        const plain = give(ctx, p.id, 'trail-cap', { seed: 'plain' });
        wear(ctx, lucky, explorer);
        sendAway(ctx, explorer);
        const before = partsOf(ctx, p.id);
        const check = await p.call('POST', '/api/gear/dismantle-check', {
          itemIds: [plain, lucky],
        });
        expect(check.body['result']).toEqual({
          locked: [{ itemId: lucky, creatureId: explorer, reason: 'trip' }],
        });
        expect(await dismantlePile(p, helper, [plain, lucky])).toMatchObject({
          status: 409,
          body: { error: 'item_locked' },
        });
        // All or nothing: the free item stayed too, and nothing was paid.
        expect(itemCount(ctx, p.id)).toBe(2);
        expect(partsOf(ctx, p.id)).toEqual(before);
        expect(skillXpOf(ctx, helper)).toBe(0);
        // Back home, the same pile goes.
        ctx.sql.exec('UPDATE creatures SET away_expedition_id = NULL WHERE id = ?', explorer);
        expect((await dismantlePile(p, helper, [plain, lucky])).status).toBe(200);
        expect(itemCount(ctx, p.id)).toBe(0);
      },
      {},
    );
  });

  it('reads a creature on a Workshop job the same way: Apprentice is read at the claim, Busy paws is not', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 10 });
        skipWelcome(ctx, p.id);
        const [worker, helper] = p.creatureIds as [string, string];
        const busyPaws = give(ctx, p.id, 'static-charm', {
          rarity: 'rare',
          level: 8,
          lines: lines('busy-paws'),
        });
        const apprentice = give(ctx, p.id, 'kelp-cap', {
          rarity: 'rare',
          level: 8,
          lines: lines('apprentice'),
        });
        wear(ctx, busyPaws, worker);
        wear(ctx, apprentice, worker);
        putOnJob(ctx, p.id, worker);
        const check = await p.call('POST', '/api/gear/dismantle-check', {
          itemIds: [busyPaws, apprentice],
        });
        expect(check.body['result']).toEqual({
          locked: [{ itemId: apprentice, creatureId: worker, reason: 'job' }],
        });
        expect(await dismantlePile(p, helper, [apprentice])).toMatchObject({
          status: 409,
          body: { error: 'item_locked' },
        });
        expect((await dismantlePile(p, helper, [busyPaws])).status).toBe(200);
        expect(count(ctx.sql, 'gear_items', `id = '${apprentice}'`)).toBe(1);
        expect(count(ctx.sql, 'gear_items', `equipped_on = '${worker}'`)).toBe(1);
      },
      {},
    );
  });

  it('does not lock an item of a free creature, or a worn item with nothing a running activity reads', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 14 });
        skipWelcome(ctx, p.id);
        const [free, away, helper] = p.creatureIds as [string, string, string];
        const lucky = give(ctx, p.id, 'static-charm', {
          rarity: 'epic',
          level: 13,
          lines: lines('lucky-find'),
        });
        const attack = give(ctx, p.id, 'trail-cap', {
          seed: 'atk',
          lines: lines('attack-local-pct'),
        });
        wear(ctx, lucky, free);
        wear(ctx, attack, away);
        sendAway(ctx, away);
        const check = await p.call('POST', '/api/gear/dismantle-check', {
          itemIds: [lucky, attack],
        });
        expect(check.body['result']).toEqual({ locked: [] });
        expect((await dismantlePile(p, helper, [lucky, attack])).status).toBe(200);
      },
      {},
    );
  });

  it('checks the items: strict body, 404 for a foreign or unknown item, 400 for a repeat', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-cap');
        const theirs = give(ctx, other.id, 'trail-cap');
        const ask = (body: unknown) => p.call('POST', '/api/gear/dismantle-check', body);
        expect((await ask({ itemIds: [a] })).status).toBe(200);
        expect((await ask({ itemIds: [theirs] })).status).toBe(404);
        expect((await ask({ itemIds: [crypto.randomUUID()] })).status).toBe(404);
        expect((await ask({ itemIds: [a, a] })).status).toBe(400);
        for (const body of [{ itemIds: [] }, { itemIds: [a], extra: 1 }, {}, { itemIds: ['x'] }]) {
          expect((await ask(body)).status).toBe(400);
        }
      },
      {},
    );
  });
});

describe('dismantling a pile', () => {
  it('takes every item at once, pays the refund, the Crafting XP and no creature experience', async () => {
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
        const res = await dismantlePile(p, c1, ids);
        expect(res.status).toBe(200);
        const result = resultOf(res);
        expect(result.kind).toBe('dismantle');
        expect(result.creatureId).toBe(c1);
        // The most valuable first.
        expect(result.items.map((i) => i.rarity)).toEqual(['rare', 'common', 'common', 'common']);
        // The items are gone, the unmarked one stays, the parts are in the bank.
        expect(count(ctx.sql, 'gear_items', `user_id = '${p.id}'`)).toBe(1);
        expect(count(ctx.sql, 'gear_items', `id = '${kept}'`)).toBe(1);
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
        const result = resultOf(await dismantlePile(p, c1, ids));
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
        const result = resultOf(await dismantlePile(p, c1, ids));
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

  it('refuses a busy creature (away or on a job), a foreign creature and a body with anything extra', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 8 });
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        const [away, working, free] = p.creatureIds as [string, string, string];
        const a = give(ctx, p.id, 'trail-cap', { seed: 'a' });
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
        expect((await dismantlePile(p, c3, [a])).status).toBe(200);
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
            const done = resultOf(await dismantlePile(p, who, [item]));
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
        const result = resultOf(await dismantlePile(p, c1, [known, fresh]));
        // Every chance hits: the new base is learned, the known one gets its tenth mark.
        expect(result.learned).toEqual(['kelp-cap']);
        expect(result.marked).toEqual([{ baseId: 'trail-cap', marks: 10 }]);
        // At 10 marks a find adds nothing more.
        const more = give(ctx, p.id, 'trail-cap', { seed: 'k2' });
        expect(resultOf(await dismantlePile(p, c1, [more]))).toMatchObject({
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
        expect(resultOf(await dismantlePile(p, c1, [bell, lantern]))).toMatchObject({
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
        const without = resultOf(await dismantlePile(p, plain, [mk('a'), mk('b')]));
        expect(without.tinkered).toBeUndefined();
        expect(without.parts.scrap).toBe(range.scrap.min * 2);
        const withLine = resultOf(await dismantlePile(p, worker, [mk('c'), mk('d'), mk('e')]));
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
        const done = resultOf(await dismantlePile(p, worker, [item]));
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
      },
      { gearRng: rng },
    );
  });

  it('refuses a foreign item, repeats and more than 60 items, and previews a worn one', async () => {
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
        const result = resultOf(await dismantlePile(p, c1, [low, high, mid, common]));
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
        expect(resultOf(await dismantlePile(p, c1, [mk('a')])).boosted).toBe(1);
        expect(resultOf(await dismantlePile(p, c1, [mk('b'), mk('c'), mk('d')])).boosted).toBe(1);
        expect(resultOf(await dismantlePile(p, c1, [mk('e')])).boosted).toBe(0);
        // The preview of a pile says the same before it is dismantled.
        const preview = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: c1,
          itemIds: [mk('f')],
        });
        expect((preview.body['result'] as { boosted: number }).boosted).toBe(0);
        // Without the Boon nothing is boosted.
        market(ctx, 'fair-winds');
        expect(resultOf(await dismantlePile(p, c1, [mk('g')])).boosted).toBe(0);
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
        expect(resultOf(await dismantlePile(p, c1, items)).boosted).toBe(1);
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

describe('migration 49', () => {
  it('drops the mark column, keeps the day count table, and can be redone', async () => {
    expect(SCHEMA_VERSION).toBe(49);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-cap');
        expect(count(ctx.sql, "pragma_table_info('gear_items')", "name = 'dismantle_mark'")).toBe(
          0,
        );
        // Back to before 49: the column is there again (staging's state), the item untouched.
        undoDismantleUnmarkMigration(ctx.sql);
        expect(count(ctx.sql, "pragma_table_info('gear_items')", "name = 'dismantle_mark'")).toBe(
          1,
        );
        ctx.core.migrate();
        ctx.core.migrate();
        expect(count(ctx.sql, "pragma_table_info('gear_items')", "name = 'dismantle_mark'")).toBe(
          0,
        );
        expect(count(ctx.sql, 'gear_items', `id = '${a}'`)).toBe(1);
        expect(count(ctx.sql, 'sqlite_master', "name = 'dismantle_days'")).toBe(1);
        expect(
          rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
        ).toBe(49);
        expect((await dismantlePile(p, p.creatureIds[0] as string, [a])).status).toBe(200);
      },
      {},
    );
  });

  it('also runs from before 48: the column is added by 48 and dropped by 49, the day counts stay', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        undoDismantleMarkMigration(ctx.sql);
        expect(count(ctx.sql, 'sqlite_master', "name = 'dismantle_days'")).toBe(0);
        ctx.core.migrate();
        expect(count(ctx.sql, "pragma_table_info('gear_items')", "name = 'dismantle_mark'")).toBe(
          0,
        );
        expect(count(ctx.sql, 'sqlite_master', "name = 'dismantle_days'")).toBe(1);
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
        const result = resultOf(await dismantlePile(p, c1, [common, rare]));
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
