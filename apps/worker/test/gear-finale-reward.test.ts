import {
  RULES,
  createSeededRng,
  droppableBases,
  dismantleYield,
  finaleUpgradeLevel,
  rollFinaleReward,
  upgradeCost,
  type GearRarity,
  type PartsBundle,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { grantRaidFinale, recentGrants, type GrantDeps } from '../src/gear-grants';
import { learnBlueprint } from '../src/gear-store';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows, seedPlayer } from './raid-helpers';

/** The finale's reward slot through the real grant, ledger and routes (docs/design/gear.md). */

const WEEK = '2027-W03';

function deps(ctx: CoreContext, seed: string): GrantDeps & { drawn: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    storage: ctx.storage,
    now: () => ctx.clock.t,
    rng: {
      nextU32() {
        n++;
        return inner.nextU32();
      },
    },
    drawn: () => n,
  };
}

/** A player who knows every blueprint, so the slot can only be gear. */
function seedKnowingAll(ctx: CoreContext, n: number): string {
  const player = seedPlayer(ctx, n, { level: 10 });
  for (const base of droppableBases()) {
    learnBlueprint(ctx.sql, player.id, base.id, base.blueprint, ctx.clock.t);
  }
  return player.id;
}

describe('the finale reward slot at the server', () => {
  it('pays gear pre-upgraded by Boss Rank: +0, +0, +1, +4, +5, +5 at ranks 1, 2, 3, 9, 11, 30', async () => {
    await runCore(nextGuild(), (ctx) => {
      const d = deps(ctx, 'finale-levels');
      const expected = new Map([
        [1, 0],
        [2, 0],
        [3, 1],
        [9, 4],
        [11, 5],
        [30, 5],
      ]);
      let i = 1;
      for (const [rank, level] of expected) {
        const userId = seedKnowingAll(ctx, i++);
        const view = grantRaidFinale(d, userId, WEEK, rank);
        expect(finaleUpgradeLevel(rank)).toBe(level);
        expect(view.gear).toHaveLength(1);
        expect(view.blueprints).toEqual([]);
        // The view says "+N" only when N > 0 (older grants have no level at all).
        expect(view.gear[0]?.level).toBe(level === 0 ? undefined : level);
        const row = rows<{ level: number }>(
          ctx.sql,
          'SELECT level FROM gear_items WHERE user_id = ?',
          userId,
        )[0];
        expect(row?.level).toBe(level);
      }
    });
  });

  it('pays a blueprint instead of gear about as often as blueprintBp, never a known one, and takes the same key', async () => {
    await runCore(nextGuild(), (ctx) => {
      const d = deps(ctx, 'finale-split');
      const n = 400;
      let blueprints = 0;
      for (let i = 1; i <= n; i++) {
        const player = seedPlayer(ctx, i, { level: 10 });
        const known = new Set(
          rows<{ base_id: string }>(
            ctx.sql,
            'SELECT base_id FROM blueprints WHERE user_id = ?',
            player.id,
          ).map((r) => r.base_id),
        );
        const view = grantRaidFinale(d, player.id, WEEK, 6);
        // Exactly one reward, ever.
        expect(view.gear.length + view.blueprints.length).toBe(1);
        const [bp] = view.blueprints;
        if (bp !== undefined) {
          blueprints++;
          expect(bp.duplicate).toBe(false);
          expect(known.has(bp.baseId)).toBe(false);
          expect(view.parts).toEqual({});
          const learned = rows<{ base_id: string; rarity: GearRarity }>(
            ctx.sql,
            'SELECT base_id, rarity FROM blueprints WHERE user_id = ?',
            player.id,
          );
          expect(learned).toEqual([{ base_id: bp.baseId, rarity: bp.rarity }]);
        }
        const keys = rows<{ key: string }>(
          ctx.sql,
          'SELECT key FROM gear_grants WHERE user_id = ?',
          player.id,
        );
        expect(keys).toEqual([{ key: `raid:${WEEK}:finale` }]);
      }
      const target = RULES.gear.drops.finale.blueprintBp / 10_000;
      expect(blueprints / n).toBeGreaterThan(target - 0.08);
      expect(blueprints / n).toBeLessThan(target + 0.08);
    });
  });

  it('draws the same reward the game rolls for the same stream, and a retry draws and pays nothing', async () => {
    await runCore(nextGuild(), (ctx) => {
      const player = seedPlayer(ctx, 1, { level: 10 });
      const d = deps(ctx, 'finale-retry');
      const expected = rollFinaleReward(createSeededRng('finale-retry'), 8, new Set());
      const first = grantRaidFinale(d, player.id, WEEK, 8);
      const drawn = d.drawn();
      expect(drawn).toBeGreaterThan(0);
      if (expected.kind === 'gear') expect(first.gear[0]?.baseId).toBe(expected.baseId);
      else expect(first.blueprints[0]?.baseId).toBe(expected.baseId);

      const again = grantRaidFinale(d, player.id, WEEK, 8);
      expect(again).toEqual(first);
      // Even at another rank: the stored grant wins.
      expect(grantRaidFinale(d, player.id, WEEK, 30)).toEqual(first);
      expect(d.drawn()).toBe(drawn);
      const owned = (table: 'gear_items' | 'blueprints'): number =>
        rows<{ n: number }>(
          ctx.sql,
          `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`,
          player.id,
        )[0]?.n ?? 0;
      expect(owned('gear_items') + owned('blueprints')).toBe(1);
    });
  });

  it('still reads a grant stored before the reward slot (no level), and shows it next to new ones', async () => {
    await runCore(nextGuild(), (ctx) => {
      const player = seedPlayer(ctx, 1, { level: 10 });
      const old = {
        gear: [{ id: 'old-item', baseId: 'trail-charm', rarity: 'common' }],
        converted: [],
        parts: {},
        blueprints: [],
      };
      ctx.sql.exec(
        'INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, ?, ?, ?, ?)',
        player.id,
        'raid:2026-W40:finale',
        'raid_finale',
        JSON.stringify(old),
        ctx.clock.t,
      );
      const d = deps(ctx, 'finale-old');
      // The old key is never paid again.
      expect(grantRaidFinale(d, player.id, '2026-W40', 9)).toEqual(old);
      expect(d.drawn()).toBe(0);
      const listed = recentGrants(ctx.sql, player.id, 10);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.gear[0]).toEqual(old.gear[0]);
      expect(listed[0]?.gear[0]?.level).toBeUndefined();
    });
  });

  it('turns an upgraded drop that does not fit into the scrap it is worth, upgrades included', async () => {
    await runCore(nextGuild(), (ctx) => {
      const userId = seedKnowingAll(ctx, 1);
      for (let i = 0; i < RULES.gear.inventoryCap; i++) {
        ctx.sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on, source, created_at)
           VALUES (?, ?, 'trail-charm', 'common', 0, '{"primary":300,"secondary":[]}', NULL, NULL, 'test', ?)`,
          `filler-${String(i)}`,
          userId,
          ctx.clock.t,
        );
      }
      const view = grantRaidFinale(deps(ctx, 'finale-full'), userId, WEEK, 30);
      expect(view.gear).toEqual([]);
      const [converted] = view.converted;
      expect(converted?.level).toBe(RULES.gear.maxLevel);
      expect(view.parts).toEqual(
        dismantleYield({
          baseId: converted?.baseId ?? '',
          rarity: converted?.rarity ?? 'common',
          level: RULES.gear.maxLevel,
        }),
      );
    });
  });

  it('is a valid item everywhere: stats, the next upgrade price, the upgrade itself and dismantling', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const userId = seedKnowingAll(ctx, 1);
      const user = { id: userId, displayName: 'Player 1' };
      // Rank 7 gives +3.
      const view = grantRaidFinale(deps(ctx, 'finale-valid'), userId, WEEK, 7);
      const id = view.gear[0]?.id as string;
      const rarity = view.gear[0]?.rarity as GearRarity;
      const baseId = view.gear[0]?.baseId as string;
      ctx.core.credit({
        userId,
        currency: 'essence',
        amount: 100_000,
        source: 'test',
        idempotencyKey: 'finale-valid-essence',
      });
      ctx.sql.exec(
        "INSERT INTO parts (user_id, kind, amount) VALUES (?, 'scrap', 10000) ON CONFLICT(user_id, kind) DO UPDATE SET amount = 10000",
        userId,
      );
      const secret = await ctx.core.createSession(ctx.guildId, user);
      const get = async () => {
        const res = await ctx.request(secret, '/api/gear');
        return (
          await res.json<{
            items: {
              id: string;
              level: number;
              maxLevel: number;
              primary: { bp: number };
              upgradeCost: { essence: number; scrap: number } | null;
              dismantle: PartsBundle;
            }[];
          }>()
        ).items.find((i) => i.id === id);
      };
      const before = await get();
      expect(before?.level).toBe(3);
      expect(before?.upgradeCost).toEqual(upgradeCost({ rarity, level: 3 }));
      expect(before?.dismantle).toEqual(dismantleYield({ baseId, rarity, level: 3 }));
      // Price and refund count the three levels it came with: it is worth more than a +0 one.
      expect(before?.dismantle.scrap ?? 0).toBeGreaterThan(
        dismantleYield({ baseId, rarity, level: 0 }).scrap ?? 0,
      );

      // The step for each level is added to the roll: the shown main stat is roll + 3 steps.
      const rolls = JSON.parse(
        rows<{ rolls_json: string }>(
          ctx.sql,
          'SELECT rolls_json FROM gear_items WHERE id = ?',
          id,
        )[0]?.rolls_json ?? '{}',
      ) as { primary: number };
      const stat = before?.primary.bp;
      expect(stat).toBeGreaterThan(rolls.primary);

      // Upgrading continues from +3 at +3's price, to +4 and then +5, and stops at the top.
      for (const level of [4, 5]) {
        const res = await ctx.request(secret, `/api/gear/${id}/upgrade`, 'POST', {
          idempotencyKey: `finale-valid-up-${String(level)}-key`,
        });
        expect(res.status).toBe(200);
        expect((await get())?.level).toBe(level);
      }
      expect((await get())?.upgradeCost).toBeNull();
      const top = await ctx.request(secret, `/api/gear/${id}/upgrade`, 'POST', {
        idempotencyKey: 'finale-valid-up-top-key',
      });
      expect(top.status).toBe(409);
    });
  });
});
