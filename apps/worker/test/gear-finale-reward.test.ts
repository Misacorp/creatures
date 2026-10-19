import {
  RULES,
  blueprintBases,
  content,
  createSeededRng,
  dismantleRange,
  dismantleYield,
  finaleItemLevel,
  festivalBases,
  rollFinaleReward,
  type DismantleRange,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  grantFestivalGear,
  grantRaidFinale,
  normaliseGrant,
  recentGrants,
  type GrantDeps,
} from '../src/gear-grants';
import { learnBlueprint } from '../src/gear-store';
import { giveItem } from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows, seedPlayer } from './raid-helpers';

/** The finale's reward slot through the real grant, ledger and routes (docs/design/gear-and-creatures-v2.md). */

const WEEK = '2027-W03';
const BOSS = content.bosses[0]?.id ?? '';
const ELEMENT = content.bosses[0]?.element ?? 'tide';

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
  for (const base of blueprintBases()) {
    learnBlueprint(ctx.sql, player.id, base.id, ctx.clock.t);
  }
  return player.id;
}

describe('the finale reward slot at the server', () => {
  it('pays gear at item level 3 + Boss Rank, at most 20: 5, 10, 15, 20 at ranks 2, 7, 12, 17', async () => {
    await runCore(nextGuild(), (ctx) => {
      const d = deps(ctx, 'finale-levels');
      let i = 1;
      for (const [rank, level] of [
        [1, 4],
        [2, 5],
        [7, 10],
        [12, 15],
        [17, 20],
        [30, 20],
      ] as const) {
        const userId = seedKnowingAll(ctx, i++);
        const view = grantRaidFinale(d, userId, WEEK, rank, BOSS);
        expect(finaleItemLevel(rank)).toBe(level);
        expect(view.gear).toHaveLength(1);
        expect(view.blueprints).toEqual([]);
        expect(view.gear[0]?.itemLevel).toBe(level);
        const row = rows<{ item_level: number; origin_json: string; source: string }>(
          ctx.sql,
          'SELECT item_level, origin_json, source FROM gear_items WHERE user_id = ?',
          userId,
        )[0];
        expect(row?.item_level).toBe(level);
        expect(row?.source).toBe('raid_finale');
        // Where it came from: the boss and the rank.
        expect(JSON.parse(row?.origin_json ?? '{}')).toEqual({ kind: 'raid', boss: BOSS, rank });
      }
    });
  });

  it('gives the piece the boss’s element as its tag (a role Charm now and then)', async () => {
    await runCore(nextGuild(), (ctx) => {
      const d = deps(ctx, 'finale-tag');
      for (let i = 1; i <= 120; i++) {
        const userId = seedKnowingAll(ctx, i);
        grantRaidFinale(d, userId, WEEK, 5, BOSS);
      }
      const tags = rows<{ tag: string; slot: string }>(ctx.sql, 'SELECT tag, slot FROM gear_items');
      expect(tags).toHaveLength(120);
      for (const t of tags) {
        if (['setter', 'payoff', 'support', 'guard'].includes(t.tag)) expect(t.slot).toBe('charm');
        else expect(t.tag).toBe(ELEMENT);
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
        const view = grantRaidFinale(d, player.id, WEEK, 6, BOSS);
        expect(view.gear.length + view.blueprints.length).toBe(1);
        const [bp] = view.blueprints;
        if (bp !== undefined) {
          blueprints++;
          expect(bp.duplicate).toBe(false);
          expect(known.has(bp.baseId)).toBe(false);
          expect(view.parts).toEqual({});
          const learned = rows<{ base_id: string }>(
            ctx.sql,
            'SELECT base_id FROM blueprints WHERE user_id = ?',
            player.id,
          );
          expect(learned).toEqual([{ base_id: bp.baseId }]);
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
      const expected = rollFinaleReward(createSeededRng('finale-retry'), 8, ELEMENT, new Set());
      const first = grantRaidFinale(d, player.id, WEEK, 8, BOSS);
      const drawn = d.drawn();
      expect(drawn).toBeGreaterThan(0);
      if (expected.kind === 'gear') {
        expect(first.gear[0]?.baseId).toBe(expected.item.baseId);
        const lines = rows<{ lines_json: string }>(
          ctx.sql,
          'SELECT lines_json FROM gear_items WHERE user_id = ?',
          player.id,
        )[0]?.lines_json;
        expect(JSON.parse(lines ?? '[]')).toEqual(expected.item.lines);
      } else expect(first.blueprints[0]?.baseId).toBe(expected.baseId);

      const again = grantRaidFinale(d, player.id, WEEK, 8, BOSS);
      expect(again).toEqual(first);
      // Even at another rank: the stored grant wins.
      expect(grantRaidFinale(d, player.id, WEEK, 30, BOSS)).toEqual(first);
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

  it('still reads a grant stored before gear v2: its old bases map to the new ones, nothing is paid again', async () => {
    await runCore(nextGuild(), (ctx) => {
      const player = seedPlayer(ctx, 1, { level: 10 });
      const old = {
        // The old Tidepool Charm (an HP charm, Tide) and an old rare blueprint of the Wave Band (speed, Tide).
        gear: [{ id: 'old-item', baseId: 'tidepool-charm', rarity: 'common', level: 3 }],
        converted: [],
        parts: {},
        blueprints: [{ baseId: 'wave-band', rarity: 'rare', duplicate: false }],
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
      const shown = grantRaidFinale(d, player.id, '2026-W40', 9, BOSS);
      expect(d.drawn()).toBe(0);
      // An old HP piece is a Scarf now; an old speed piece is a Charm.
      expect(shown.gear[0]).toMatchObject({
        id: 'old-item',
        baseId: 'seafoam-scarf',
        itemLevel: 1,
      });
      expect(shown.blueprints).toEqual([{ baseId: 'tidepool-charm', duplicate: false }]);
      const listed = recentGrants(ctx.sql, player.id, 10);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.gear[0]?.baseId).toBe('seafoam-scarf');
      // A grant already in the new shape is left alone.
      const fresh = {
        gear: [{ id: 'x', baseId: 'trail-cap', rarity: 'common' as const, itemLevel: 4 }],
        converted: [],
        parts: {},
        blueprints: [{ baseId: 'trail-charm', duplicate: true }],
      };
      expect(normaliseGrant(fresh)).toEqual(fresh);
    });
  });

  it('turns a drop that does not fit into the scrap it is worth', async () => {
    await runCore(nextGuild(), (ctx) => {
      const userId = seedKnowingAll(ctx, 1);
      for (let i = 0; i < RULES.gear.inventoryCap; i++) {
        giveItem(ctx.sql, userId, 'trail-cap', { seed: `filler-${String(i)}`, now: ctx.clock.t });
      }
      const view = grantRaidFinale(deps(ctx, 'finale-full'), userId, WEEK, 30, BOSS);
      expect(view.gear).toEqual([]);
      const [converted] = view.converted;
      expect(converted?.itemLevel).toBe(20);
      expect(view.parts).toEqual(
        dismantleYield({
          baseId: converted?.baseId ?? '',
          rarity: converted?.rarity ?? 'common',
          itemLevel: converted?.itemLevel ?? 1,
        }),
      );
    });
  });

  it('is a valid item everywhere: its card, its refund and dismantling', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const userId = seedKnowingAll(ctx, 1);
      const user = { id: userId, displayName: 'Player 1' };
      const view = grantRaidFinale(deps(ctx, 'finale-valid'), userId, WEEK, 7, BOSS);
      const id = view.gear[0]?.id as string;
      const rarity = view.gear[0]?.rarity as 'common' | 'rare' | 'epic';
      const baseId = view.gear[0]?.baseId as string;
      const secret = await ctx.core.createSession(ctx.guildId, user);
      const res = await ctx.request(secret, '/api/gear');
      const item = (
        await res.json<{
          items: {
            id: string;
            itemLevel: number;
            lines: { source: string; tier: number | null; bestTier: number | null }[];
            dismantle: DismantleRange;
          }[];
        }>()
      ).items.find((i) => i.id === id);
      expect(item?.itemLevel).toBe(10);
      expect(item?.dismantle).toEqual(dismantleRange([{ baseId, rarity, itemLevel: 10 }]));
      // The card says the best tier this item level allows (III at item level 10).
      const rolled = item?.lines.filter((l) => l.source === 'rolled') ?? [];
      expect(rolled).toHaveLength(RULES.gear.rolledLines[rarity]);
      for (const l of rolled) {
        expect(l.bestTier).toBe(3);
        expect(l.tier ?? 0).toBeLessThanOrEqual(3);
      }
      // It can be taken apart in a Workshop job.
      const creatureId = rows<{ id: string }>(
        ctx.sql,
        'SELECT id FROM creatures WHERE user_id = ? LIMIT 1',
        userId,
      )[0]?.id;
      const out = await ctx.request(secret, '/api/workshop/jobs', 'POST', {
        kind: 'dismantle',
        creatureId,
        itemIds: [id],
        idempotencyKey: 'finale-valid-dismantle',
      });
      expect(out.status).toBe(200);
    });
  });

  it('the Festival piece is one the player does not own yet (in the bag or worn), and any one once they own them all', async () => {
    await runCore(nextGuild(), (ctx) => {
      const d = deps(ctx, 'festival-missing');
      const all = festivalBases().map((b) => b.id);
      expect(all.length).toBeGreaterThanOrEqual(3);
      const player = seedPlayer(ctx, 1, { level: 10 });
      const baseOf = (itemId: string): string | undefined =>
        rows<{ base_id: string }>(ctx.sql, 'SELECT base_id FROM gear_items WHERE id = ?', itemId)[0]
          ?.base_id;
      // One piece in the bag, one worn: the grant gives the one that is left, week after week it is not repeated.
      giveItem(ctx.sql, player.id, all[0] as string);
      const worn = giveItem(ctx.sql, player.id, all[1] as string);
      ctx.sql.exec(
        'UPDATE gear_items SET equipped_on = ? WHERE id = ?',
        player.creatureIds[0],
        worn,
      );
      const first = grantFestivalGear(d, player.id, '2027-W10', 4, BOSS);
      expect(first.gear).toHaveLength(1);
      expect(all.slice(2)).toContain(first.gear[0]?.baseId);
      expect(baseOf(first.gear[0]?.id as string)).toBe(first.gear[0]?.baseId);
      // The same week again pays nothing and draws nothing.
      const drawn = d.drawn();
      expect(grantFestivalGear(d, player.id, '2027-W10', 4, BOSS).gear).toEqual(first.gear);
      expect(d.drawn()).toBe(drawn);
      // They own all of them now: the next Festival week gives any one of them.
      const seen = new Set<string>();
      for (let week = 11; week < 40; week++) {
        const view = grantFestivalGear(d, player.id, `2027-W${String(week)}`, 4, BOSS);
        expect(view.gear).toHaveLength(1);
        seen.add(view.gear[0]?.baseId as string);
      }
      for (const id of seen) expect(all).toContain(id);
      expect(seen.size).toBeGreaterThan(1);
      // A player who owns none gets any piece, each of them over enough weeks.
      const other = seedPlayer(ctx, 2, { level: 10 });
      const gotAll = new Set<string>();
      for (let week = 50; week < 50 + all.length; week++) {
        const piece = grantFestivalGear(d, other.id, `2027-W${String(week)}`, 4, BOSS).gear[0];
        gotAll.add(piece?.baseId as string);
      }
      // Each win gave a piece it lacked: as many wins as pieces, every piece once.
      expect(gotAll).toEqual(new Set(all));
    });
  });
});
