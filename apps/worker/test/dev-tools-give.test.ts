/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of many different response bodies (`Json.body` is `any` on purpose). */
// The target player of the per-player dev tools, and the tools that give what the game gives
// (docs/design/dev-tools.md, "Give a target player anything").
import { RULES, gearContent } from '@creatures/game';
import { combatV2, knownKnacks, v2Pool } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { TARGETED_TOOLS } from '../src/dev-schemas';
import { ON, player, type Dev } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

const V2 = { ...ON, combatV2: true } as const;

const bait = (ctx: CoreContext, userId: string): number =>
  rows<{ n: number }>(
    ctx.sql,
    "SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE user_id = ? AND currency = 'bait'",
    userId,
  )[0]?.n ?? 0;

describe('a target player for the per-player tools', () => {
  it('defaults to the caller, and a named player gets the grant instead', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2);
        await me.tool('grant-currency', { bait: 40 });
        expect(bait(ctx, me.id)).toBe(40);
        expect(bait(ctx, ann.id)).toBe(0);
        const res = await me.dev('grant-currency', { userId: ann.id, bait: 25, essence: 3 });
        expect(res).toMatchObject({
          status: 200,
          body: { result: { balances: { bait: 25, essence: 3 } } },
        });
        expect(bait(ctx, me.id)).toBe(40);
        expect(bait(ctx, ann.id)).toBe(25);
        // Naming yourself is the same as naming nobody.
        await me.tool('grant-currency', { userId: me.id, bait: 1 });
        expect(bait(ctx, me.id)).toBe(41);
      },
      ON,
    );
  });

  it('refuses unknown keys, strangers and simulated players', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2);
        expect(await me.dev('grant-currency', { userId: ann.id, bait: 1, extra: 1 })).toMatchObject(
          { status: 400 },
        );
        expect(await me.dev('grant-currency', { userId: '', bait: 1 })).toMatchObject({
          status: 400,
        });
        expect(await me.dev('grant-currency', { userId: '123456789', bait: 1 })).toMatchObject({
          status: 404,
        });
        ctx.sql.exec(
          "INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES ('dev-guest-1', 'Guest', 0, 0)",
        );
        expect(await me.dev('grant-currency', { userId: 'dev-guest-1', bait: 1 })).toMatchObject({
          status: 404,
        });
        expect(bait(ctx, 'dev-guest-1')).toBe(0);
        // A tool that is not per-player does not take a target.
        expect(await me.dev('clock', { reset: true, userId: me.id })).toMatchObject({
          status: 400,
        });
      },
      ON,
    );
  });

  it('works for the older per-player tools too (parts, Bait set, gear, a creature)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2, { creatures: 0 });
        await me.tool('grant-parts', { userId: ann.id, scrap: 9 });
        expect(
          rows(ctx.sql, "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'", ann.id),
        ).toEqual([{ amount: 9 }]);
        await me.tool('set-balances', { userId: ann.id, bait: 12 });
        expect(bait(ctx, ann.id)).toBe(12);
        await me.tool('grant-gear', { userId: ann.id, rarity: 'rare' });
        expect(count(ctx.sql, 'gear_items', `user_id = '${ann.id}'`)).toBe(1);
        expect(count(ctx.sql, 'gear_items', `user_id = '${me.id}'`)).toBe(0);
        const made = await me.tool('grant-creature', { userId: ann.id, species: 'cindle' });
        expect(made.created).toBe(true);
        expect(count(ctx.sql, 'creatures', `user_id = '${ann.id}'`)).toBe(1);
        // A creature of the target is picked by its id; one of the caller is "not found" for the target.
        const mine = me.creatureIds[0] as string;
        expect(
          await me.dev('set-creature', { userId: ann.id, creatureId: mine, level: 3 }),
        ).toMatchObject({ status: 404 });
        const hers = made.creatureId as string;
        expect(
          await me.dev('set-creature', { userId: ann.id, creatureId: hers, level: 3 }),
        ).toMatchObject({ status: 200 });
      },
      ON,
    );
  });

  it('every per-player tool is a real tool, and the list has no duplicates', () => {
    expect(new Set(TARGETED_TOOLS).size).toBe(TARGETED_TOOLS.length);
    expect(TARGETED_TOOLS).not.toContain('reset-account');
    expect(TARGETED_TOOLS).not.toContain('apply-roster-preset');
  });

  it('answers 404 to a player who is not a server manager, as every dev route does', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2);
        for (const tool of ['grant-currency', 'grant-xp', 'grant-talent', 'set-knack']) {
          expect(await me.dev(tool, { userId: ann.id })).toMatchObject({ status: 404 });
        }
      },
      { devTools: true, raidPractice: true },
    );
  });
});

describe('grant-creature', () => {
  it('gives a line one creature by default and two with a count, at the level and shine asked', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const ann = await player(ctx, 2, { creatures: 0 });
        const me = await player(ctx, 1);
        const one = await me.tool('grant-creature', {
          userId: ann.id,
          species: 'cindle',
          level: 7,
          shiny: true,
        });
        expect(one.creatureIds).toHaveLength(1);
        const two = await me.tool('grant-creature', {
          userId: ann.id,
          species: 'cindle',
          count: 2,
          level: 9,
        });
        expect(two).toMatchObject({ createdCount: 1 });
        const list = rows<{ line_slot: number; level: number; shiny: number; origin: string }>(
          ctx.sql,
          'SELECT line_slot, level, shiny, origin FROM creatures WHERE user_id = ? ORDER BY line_slot',
          ann.id,
        );
        expect(list).toEqual([
          { line_slot: 1, level: 9, shiny: 1, origin: 'dev' },
          { line_slot: 2, level: 9, shiny: 0, origin: 'dev' },
        ]);
        expect(await me.dev('grant-creature', { species: 'cindle', count: 3 })).toMatchObject({
          status: 400,
        });
      },
      ON,
    );
  });
});

describe('grant-gear', () => {
  it('gives several random items of a slot, a rarity and an item level, to the target', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2);
        const res = await me.tool('grant-gear', {
          userId: ann.id,
          slot: 'scarf',
          rarity: 'epic',
          itemLevel: 5,
          count: 4,
        });
        expect(res.given).toBe(4);
        const items = rows<{ base_id: string; rarity: string; item_level: number }>(
          ctx.sql,
          'SELECT base_id, rarity, item_level FROM gear_items WHERE user_id = ?',
          ann.id,
        );
        expect(items).toHaveLength(4);
        for (const item of items) {
          const base = gearContent.bases.find((b) => b.id === item.base_id);
          expect(base?.slot).toBe('scarf');
          expect(item.rarity).toBe('epic');
          expect(item.item_level).toBe(5);
        }
        expect(count(ctx.sql, 'gear_items', `user_id = '${me.id}'`)).toBe(0);
      },
      ON,
    );
  });

  it('takes a named base, refuses a slot that does not match and a bag that is too full (giving nothing)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const hat = gearContent.bases.find((b) => b.slot === 'hat' && b.minItemLevel === undefined);
        if (hat === undefined) throw new Error('no hat');
        expect(
          await me.dev('grant-gear', { baseId: hat.id, slot: 'charm', rarity: 'common' }),
        ).toMatchObject({ status: 400, body: { error: 'wrong_slot' } });
        await me.tool('grant-gear', { baseId: hat.id, rarity: 'common', count: 2 });
        expect(count(ctx.sql, 'gear_items', `user_id = '${me.id}'`)).toBe(2);
        await me.tool('fill-bag');
        const full = count(ctx.sql, 'gear_items', `user_id = '${me.id}'`);
        expect(full).toBe(RULES.gear.inventoryCap);
        expect(await me.dev('grant-gear', { rarity: 'rare' })).toMatchObject({
          status: 409,
          body: { error: 'bag_full' },
        });
        expect(count(ctx.sql, 'gear_items', `user_id = '${me.id}'`)).toBe(full);
        // Several at once with room for fewer: nothing is given.
        ctx.sql.exec(
          'DELETE FROM gear_items WHERE id IN (SELECT id FROM gear_items WHERE user_id = ? LIMIT 2)',
          me.id,
        );
        expect(await me.dev('grant-gear', { rarity: 'rare', count: 3 })).toMatchObject({
          status: 409,
        });
        expect(count(ctx.sql, 'gear_items', `user_id = '${me.id}'`)).toBe(full - 2);
      },
      ON,
    );
  });
});

describe('grant-xp', () => {
  it('pays one creature, or all of the target player’s, through the game’s experience rules', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2, { level: 2, creatures: 2 });
        const before = rows<{ level: number }>(
          ctx.sql,
          'SELECT level FROM creatures WHERE user_id = ?',
          me.id,
        );
        const one = await me.tool('grant-xp', {
          userId: ann.id,
          creatureId: ann.creatureIds[0],
          amount: 1000,
        });
        expect(one.creatures).toBe(1);
        const [a0, a1] = ann.creatureIds;
        const level = (id = ''): number =>
          rows<{ level: number }>(ctx.sql, 'SELECT level FROM creatures WHERE id = ?', id)[0]
            ?.level ?? 0;
        expect(level(a0)).toBeGreaterThan(2);
        expect(level(a1)).toBe(2);
        const all = await me.tool('grant-xp', { userId: ann.id, all: true, amount: 1000 });
        expect(all.creatures).toBe(2);
        expect(level(a1)).toBeGreaterThan(2);
        expect(
          rows<{ level: number }>(ctx.sql, 'SELECT level FROM creatures WHERE user_id = ?', me.id),
        ).toEqual(before);
        // One creature of the target's is not yours to name without the target.
        expect(await me.dev('grant-xp', { creatureId: a0, amount: 5 })).toMatchObject({
          status: 404,
        });
        expect(await me.dev('grant-xp', { all: true, creatureId: a0, amount: 5 })).toMatchObject({
          status: 400,
        });
        expect(await me.dev('grant-xp', { all: true, amount: 0 })).toMatchObject({ status: 400 });
      },
      ON,
    );
  });
});

describe('grant-currency', () => {
  it('only adds, in whole numbers, and needs an amount', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        for (const body of [{}, { bait: 0 }, { bait: -5 }, { bait: 1.5 }, { gold: 3 }]) {
          expect(await me.dev('grant-currency', body)).toMatchObject({ status: 400 });
        }
        await me.tool('grant-currency', { bait: 10 });
        await me.tool('grant-currency', { bait: 10, essence: 2 });
        expect((await me.call('GET', '/api/me')).body.balances).toEqual({ bait: 20, essence: 2 });
      },
      ON,
    );
  });
});

describe('grant-talent and set-knack (combat v2, staging)', () => {
  /** A creature of the first player and its line's pool. */
  async function setup(ctx: CoreContext): Promise<{ me: Dev; ann: Dev; id: string; line: string }> {
    const me = await player(ctx, 1);
    const ann = await player(ctx, 2, { level: 30, creatures: 1 });
    const id = ann.creatureIds[0] as string;
    const line = rows<{ line: string }>(ctx.sql, 'SELECT line FROM creatures WHERE id = ?', id)[0]
      ?.line as string;
    return { me, ann, id, line };
  }

  it('teaches a talent of the line, slots it when the slot is open, and refuses another line’s', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { me, ann, id, line } = await setup(ctx);
        const pool = v2Pool(line);
        const talentId = pool[0] as string;
        const res = await me.tool('grant-talent', {
          userId: ann.id,
          creatureId: id,
          talentId,
          slot: 1,
        });
        expect(res).toMatchObject({ learned: true, slot: 1 });
        expect(
          rows(
            ctx.sql,
            'SELECT slot FROM creature_talents_v2 WHERE creature_id = ? AND talent_id = ?',
            id,
            talentId,
          ),
        ).toEqual([{ slot: 1 }]);
        expect(
          count(
            ctx.sql,
            'line_talents',
            `user_id = '${ann.id}' AND line = '${line}' AND talent_id = '${talentId}'`,
          ),
        ).toBe(1);
        // Again: nothing new is learned.
        expect(
          await me.tool('grant-talent', { userId: ann.id, creatureId: id, talentId }),
        ).toMatchObject({ learned: false });
        // Another line's talent.
        const other = Object.keys(combatV2.talents).find((t) => !pool.includes(t));
        expect(
          await me.dev('grant-talent', { userId: ann.id, creatureId: id, talentId: other }),
        ).toMatchObject({ status: 400 });
        expect(
          await me.dev('grant-talent', { userId: ann.id, creatureId: id, talentId, extra: 1 }),
        ).toMatchObject({ status: 400 });
      },
      V2,
    );
  });

  it('refuses a slot the level has not opened', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const low = await player(ctx, 2, { level: 1, creatures: 1 });
        const id = low.creatureIds[0] as string;
        const line = rows<{ line: string }>(
          ctx.sql,
          'SELECT line FROM creatures WHERE id = ?',
          id,
        )[0]?.line as string;
        const talentId = v2Pool(line)[0] as string;
        expect(
          await me.dev('grant-talent', { userId: low.id, creatureId: id, talentId, slot: 3 }),
        ).toMatchObject({ status: 409 });
        expect(count(ctx.sql, 'creature_talents_v2', `creature_id = '${id}'`)).toBe(0);
      },
      V2,
    );
  });

  it('saves a Knack the form knows (or none) on the target’s creature, and refuses one it does not', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { me, ann, id } = await setup(ctx);
        const species = rows<{ species: string }>(
          ctx.sql,
          'SELECT species FROM creatures WHERE id = ?',
          id,
        )[0]?.species as string;
        const knack = knownKnacks(species)[0];
        if (knack === undefined) throw new Error('no Knack');
        await me.tool('set-knack', { userId: ann.id, creatureId: id, knack });
        const saved = () =>
          rows<{ knack: string | null }>(ctx.sql, 'SELECT knack FROM creatures WHERE id = ?', id)[0]
            ?.knack;
        expect(saved()).toBe(knack);
        expect(
          await me.dev('set-knack', { userId: ann.id, creatureId: id, knack: 'no-such-knack' }),
        ).toMatchObject({ status: 409 });
        expect(saved()).toBe(knack);
        await me.tool('set-knack', { userId: ann.id, creatureId: id, knack: null });
        expect(saved()).toBeNull();
      },
      V2,
    );
  });

  it('answers 404 when combat v2 is off', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { me, id } = await setup(ctx);
        expect(await me.dev('set-knack', { creatureId: id, knack: null })).toMatchObject({
          status: 404,
        });
        expect(
          await me.dev('grant-talent', {
            creatureId: id,
            talentId: Object.keys(combatV2.talents)[0],
            slot: 1,
          }),
        ).toMatchObject({ status: 404 });
      },
      ON,
    );
  });
});

describe('GET /api/dev/players', () => {
  it('names the caller and lists each player’s creatures for the pickers', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const me = await player(ctx, 1);
        const ann = await player(ctx, 2, { creatures: 2 });
        const res = await me.call('GET', '/api/dev/players');
        expect(res.status).toBe(200);
        expect(res.body.you).toBe(me.id);
        const hers = (
          res.body.players as { userId: string; roster: unknown[]; creatures: number }[]
        ).find((p) => p.userId === ann.id);
        expect(hers?.roster).toHaveLength(2);
        expect(hers?.roster[0]).toMatchObject({
          species: expect.any(String),
          level: expect.any(Number),
        });
        expect(hers?.creatures).toBe(2);
      },
      ON,
    );
  });
});
