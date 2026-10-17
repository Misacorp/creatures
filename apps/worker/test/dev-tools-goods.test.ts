/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument --
   These tests read parts of many different response bodies (`Json.body` is `any` on purpose): typing
   each body would only repeat the server's view types. */
import { RULES, blueprintBases, expeditionContent, gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { ON, newKey, player } from './dev-helpers';
import { runCore } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

describe('goods tools', () => {
  it('sets Bait and Essence exactly, through the ledger', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        expect((await p.tool('set-balances', { bait: 777, essence: 5 })).balances).toEqual({
          bait: 777,
          essence: 5,
        });
        expect((await p.tool('set-balances', { bait: 100 })).balances).toEqual({
          bait: 100,
          essence: 5,
        });
        const ledgerRows = count(ctx.sql, 'ledger');
        await p.tool('set-balances', { bait: 100 });
        expect(count(ctx.sql, 'ledger')).toBe(ledgerRows);
        // The ledger still adds up to the balances, and /api/me shows them.
        const sums = rows<{ currency: string; total: number }>(
          ctx.sql,
          'SELECT currency, SUM(amount) AS total FROM ledger WHERE user_id = ? GROUP BY currency ORDER BY currency',
          p.id,
        );
        expect(sums).toEqual([
          { currency: 'bait', total: 100 },
          { currency: 'essence', total: 5 },
        ]);
        expect((await p.call('GET', '/api/me')).body.balances).toEqual({ bait: 100, essence: 5 });
      },
      ON,
    );
  });

  it('grants parts, supplies and blueprints', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        await p.tool('grant-parts', { scrap: 40, glimmer: 3 });
        const parts = (await p.tool('grant-parts', { scrap: 40 })).parts;
        expect(parts).toMatchObject({ scrap: 80, glimmer: 3, 'tide-shard': 0 });
        const supply = expeditionContent.supplies[0]?.id as string;
        await p.tool('grant-supplies', { supply, amount: 3 });
        expect((await p.call('GET', '/api/state')).body.supplies).toEqual({ [supply]: 3 });
        const base = blueprintBases()[0]?.id as string;
        expect(await p.tool('grant-blueprints', { baseId: base })).toMatchObject({
          learned: 1,
          known: 1,
        });
        expect(await p.tool('grant-blueprints', { all: true })).toMatchObject({
          learned: blueprintBases().length - 1,
          known: blueprintBases().length,
        });
        // Nothing for nothing, and no unknown kinds.
        expect((await p.dev('grant-parts', {})).status).toBe(400);
        expect((await p.dev('grant-parts', { rubies: 1 })).status).toBe(400);
        expect((await p.dev('grant-supplies', { supply: 'nope', amount: 1 })).status).toBe(400);
      },
      ON,
    );
  });

  it('grants creatures (shiny, level, fusions), evolves them and counts the first as the starter', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const empty = await player(ctx, 3, { creatures: 0 });
        expect((await empty.call('GET', '/api/state')).body.starterChosen).toBe(false);
        await empty.tool('grant-creature', { species: 'splashet' });
        expect((await empty.call('GET', '/api/state')).body.starterChosen).toBe(true);

        const p = await player(ctx);
        const made = await p.tool('grant-creature', {
          species: 'splashet',
          shiny: true,
          level: 7,
          fusion: 2,
        });
        expect(made.created).toBe(true);
        const find = async (id: string) =>
          ((await p.call('GET', '/api/state')).body.creatures as { id: string }[]).find(
            (c) => c.id === id,
          ) as unknown as Record<string, unknown>;
        expect(await find(made.creatureId)).toMatchObject({
          species: 'splashet',
          shiny: true,
          level: 7,
          fusionCount: 2,
          origin: 'dev',
        });
        // One creature per line: the same line becomes the new species and keeps what was not asked for.
        const again = await p.tool('grant-creature', { species: 'tidewing' });
        expect(again).toEqual({ creatureId: made.creatureId, created: false });
        expect(await find(made.creatureId)).toMatchObject({ species: 'tidewing', level: 7 });
        expect((await p.dev('grant-creature', { species: 'splashet', level: 16 })).body).toEqual({
          error: 'level_cap',
        });

        // Set level and fusion; evolve within the line only; the cap holds.
        const cindle = p.creatureIds[0] as string;
        await p.tool('set-creature', { creatureId: cindle, level: 15, fusion: 4 });
        expect(await find(cindle)).toMatchObject({ species: 'cindle', level: 15, fusionCount: 4 });
        await p.tool('set-creature', { creatureId: cindle, species: 'pyrelynx', level: 22 });
        expect(await find(cindle)).toMatchObject({ species: 'pyrelynx', level: 22 });
        expect(
          (await p.dev('set-creature', { creatureId: cindle, species: 'tidewing' })).body,
        ).toEqual({ error: 'wrong_line' });
        expect((await p.dev('set-creature', { creatureId: cindle, level: 31 })).body).toEqual({
          error: 'level_cap',
        });
        // Only the caller's own creatures: the same answer as for one that does not exist.
        const other = await player(ctx, 2);
        const theirs = other.creatureIds[0] as string;
        expect((await p.dev('set-creature', { creatureId: theirs, level: 3 })).status).toBe(404);
        expect(
          (await p.dev('set-creature', { creatureId: crypto.randomUUID(), level: 3 })).status,
        ).toBe(404);
        expect(
          rows<{ level: number }>(ctx.sql, 'SELECT level FROM creatures WHERE id = ?', theirs)[0]
            ?.level,
        ).toBe(8);
      },
      ON,
    );
  });

  it('sets explorer rank, familiarity and Crafting XP', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const id = p.creatureIds[0] as string;
        await p.tool('set-explorer', { creatureId: id, rank: 5 });
        const view = (await p.call('GET', '/api/state')).body.creatures[0];
        expect(view.explorer).toMatchObject({
          rank: 5,
          xp: RULES.expeditions.rank.xpForRank[4],
        });
        expect((await p.dev('set-explorer', { creatureId: id, rank: 3, xp: 5 })).status).toBe(400);
        expect(
          await p.tool('set-familiarity', {
            creatureId: id,
            destination: 'tidepools',
            trips: 5,
            foundAll: true,
            shiny: true,
          }),
        ).toMatchObject({ stars: 3 });
        const dest = (await p.call('GET', '/api/destinations')).body.familiarity as {
          destination: string;
          stars: number;
        }[];
        expect(dest).toMatchObject([{ destination: 'tidepools', stars: 3 }]);
        await p.tool('set-crafting-xp', { creatureId: id, xp: 500 });
        const skills = (await p.call('GET', '/api/gear')).body.skills as {
          creatureId: string;
          xp: number;
        }[];
        expect(skills.find((k) => k.creatureId === id)?.xp).toBe(500);
      },
      ON,
    );
  });

  it('grants a gear item, fills the bag to its cap and finishes Workshop jobs', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const base = gearContent.bases.find((b) => b.festival !== true);
        const granted = await p.tool('grant-gear', {
          baseId: base?.id,
          rarity: 'epic',
          itemLevel: 12,
        });
        const items = (await p.call('GET', '/api/gear')).body.items as {
          id: string;
          rarity: string;
          itemLevel: number;
          lines: unknown[];
          source: string;
        }[];
        expect(items.find((i) => i.id === granted.gearId)).toMatchObject({
          rarity: 'epic',
          itemLevel: 12,
          source: 'dev',
        });
        // Three rolled lines (a Hat's base is its stat, not a line).
        expect(items.find((i) => i.id === granted.gearId)?.lines).toHaveLength(3);
        // Festival is a base, not a rarity any more: the old value is refused.
        expect((await p.dev('grant-gear', { baseId: base?.id, rarity: 'festival' })).status).toBe(
          400,
        );
        // A Festival piece is granted like any other base, at a normal rarity.
        const piece = gearContent.bases.find((b) => b.festival === true);
        const festive = await p.tool('grant-gear', {
          baseId: piece?.id,
          rarity: 'rare',
          itemLevel: 5,
        });
        const all = (await p.call('GET', '/api/gear')).body.items as {
          id: string;
          rarity: string;
          festival: boolean;
        }[];
        expect(all.find((i) => i.id === festive.gearId)).toMatchObject({
          rarity: 'rare',
          festival: true,
        });

        // A craft that is running, finished now.
        await p.tool('grant-blueprints', { all: true });
        await p.tool('grant-parts', {
          scrap: 500,
          'tide-shard': 50,
          'ember-shard': 50,
          'grove-shard': 50,
          'spark-shard': 50,
          glimmer: 50,
        });
        const bp = (await p.call('GET', '/api/gear')).body.blueprints[0].baseId as string;
        const started = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: p.creatureIds[0],
          blueprintId: bp,
          idempotencyKey: newKey(),
        });
        expect(started.status).toBe(200);
        expect(await p.tool('finish-jobs')).toEqual({ finished: 1 });
        const jobs = (await p.call('GET', '/api/gear')).body.jobs as { status: string }[];
        expect(jobs[0]?.status).toBe('ready');
        expect(await p.tool('finish-jobs')).toEqual({ finished: 0 });

        // The bag fills to the cap (the pending craft counts), and then grants are refused.
        const filled = await p.tool('fill-bag');
        expect(filled.cap).toBe(RULES.gear.inventoryCap);
        const gear = (await p.call('GET', '/api/gear')).body;
        expect(gear.inventory.used + gear.inventory.reserved).toBe(RULES.gear.inventoryCap);
        expect((await p.dev('grant-gear', { baseId: base?.id, rarity: 'common' })).body).toEqual({
          error: 'bag_full',
        });
        expect((await p.tool('fill-bag')).added).toBe(0);
      },
      ON,
    );
  });
});
