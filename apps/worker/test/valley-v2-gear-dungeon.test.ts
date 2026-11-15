/**
 * Combat v2 and the valley systems together (all three flags on), gear and the dungeon. V-GEAR-3: with the systems on any creature wears any
 * item in any slot from level 1, and the v2 fights read that gear as they read any (the raid's fighter and the dungeon's frozen fighters
 * share `buildFighter`, which asks for no slot level). A v2 run plays to its end with the valley's bag counter in step with what it drops.
 */
import { createSeededRng, gearContent } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../src/dungeon-state';
import { loadV2Creatures } from '../src/raid-v2-fighters';
import { dungeonPlayer, easyFoes, type DungeonPlayer } from './dungeon-helpers';
import { scaleV2Foes } from './dungeon-v2-reads';
import { giveItem } from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import { ON } from './dev-helpers';
import { nextGuild, rows } from './raid-helpers';
import { v2Ready } from './raid-v2-helpers';

const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');
const SPECIES = ['tidewing', 'pyrelynx', 'thornbuck'];
const ALL = {
  ...ON,
  combatV2: true,
  valleySystems: true,
  dungeonRng: createSeededRng('valley-v2-dungeon'),
  gearRng: createSeededRng('valley-v2-gear'),
} as const;

let restore: () => void = () => undefined;
let restoreV1: () => void = () => undefined;
beforeEach(() => {
  restore = scaleV2Foes(500, 500);
  restoreV1 = easyFoes();
});
afterEach(() => {
  restore();
  restoreV1();
});

/** A base for the slot that any role may wear (a neutral one), the strongest that an item level 20 allows. */
const baseOf = (slot: string): string => {
  const base = gearContent.bases
    .filter((b) => b.slot === slot && b.tag === 'neutral' && (b.minItemLevel ?? 1) <= 20)
    .sort((a, b) => (b.minItemLevel ?? 1) - (a.minItemLevel ?? 1))[0];
  if (base === undefined) throw new Error(`no neutral ${slot}`);
  return base.id;
};

/** Gives the player a level 20 item for each slot and wears all three on the creature, through the equip route. */
async function dress(ctx: CoreContext, p: DungeonPlayer, creatureId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const slot of ['hat', 'scarf', 'charm']) {
    const id = giveItem(ctx.sql, p.id, baseOf(slot), { level: 20, lines: [] });
    const res = await p.call('POST', `/api/gear/${id}/equip`, { creatureId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    ids.push(id);
  }
  return ids;
}

describe('V-GEAR-3 with combat v2', () => {
  it('equips a level 20 hat, scarf and charm on a level 2 creature, and the raid and the dungeon fight with their stat lines', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const worn = await dungeonPlayer(ctx, 1, { level: 2, species: SPECIES });
        const bare = await dungeonPlayer(ctx, 2, { level: 2, species: SPECIES });
        v2Ready(ctx, { id: worn.id, name: worn.name, creatureIds: worn.creatureIds });
        v2Ready(ctx, { id: bare.id, name: bare.name, creatureIds: bare.creatureIds });
        const wearer = worn.creatureIds[0] as string;
        const naked = bare.creatureIds[0] as string;
        await dress(ctx, worn, wearer);

        // The raid reads it: the same form and level, with and without the three pieces.
        const raid = loadV2Creatures(ctx.sql, [wearer, naked]);
        expect(raid.get(wearer)?.level).toBe(2);
        const gear = raid.get(wearer)?.gear;
        expect((gear?.hp ?? 0) + (gear?.atk ?? 0) + (gear?.spd ?? 0)).toBeGreaterThan(0);
        expect(raid.get(naked)?.gear.hp).toBe(0);

        // The dungeon freezes the same fighters when a run starts: the worn creature has more max HP and Attack.
        ctx.clock.t = AFTER_RESET;
        const a = await worn.start();
        const b = await bare.start();
        expect(a.status, JSON.stringify(a.body)).toBe(200);
        expect(b.status, JSON.stringify(b.body)).toBe(200);
        const fighter = (runId: string, id: string) =>
          (
            JSON.parse(
              rows<{ state_json: string }>(
                ctx.sql,
                'SELECT state_json FROM dungeon_runs WHERE id = ?',
                runId,
              )[0]?.state_json ?? '{}',
            ) as RunState
          ).fighters?.[id];
        const fw = fighter(a.body.state.id, wearer);
        const fn = fighter(b.body.state.id, naked);
        expect(fw?.maxHp).toBe((fn?.maxHp ?? 0) + (gear?.hp ?? 0));
        expect(fw?.atk).toBe((fn?.atk ?? 0) + (gear?.atk ?? 0));
        expect(fw?.spd).toBe((fn?.spd ?? 0) + (gear?.spd ?? 0));
      },
      ALL,
    );
  }, 60_000);
});

describe('a v2 dungeon run with the valley systems on', () => {
  it('plays to its end and pays: experience, the pack in the ledger, the loot in the bag with its counter in step', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 12, species: SPECIES });
        v2Ready(ctx, { id: p.id, name: p.name, creatureIds: p.creatureIds });
        ctx.clock.t = AFTER_RESET;
        // Open the valley first (the first visit), as a player would.
        expect((await p.call('GET', '/api/state')).status).toBe(200);
        const expBefore = rows<{ exp: number; level: number }>(
          ctx.sql,
          'SELECT exp, level FROM creatures WHERE user_id = ? ORDER BY caught_at',
          p.id,
        );
        const res = await p.run();
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.run?.outcome).toBeDefined();
        // Experience was paid to the row's creatures.
        const expAfter = rows<{ exp: number; level: number }>(
          ctx.sql,
          'SELECT exp, level FROM creatures WHERE user_id = ? ORDER BY caught_at',
          p.id,
        );
        expect(expAfter).not.toEqual(expBefore);
        // The loot that dropped is in the bag, and the valley's counter agrees with the table (worn items do not count).
        const bag = rows<{ items: number }>(
          ctx.sql,
          'SELECT items FROM valley_bag WHERE user_id = ?',
          p.id,
        )[0];
        const held = rows<{ n: number }>(
          ctx.sql,
          'SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ? AND equipped_on IS NULL',
          p.id,
        )[0]?.n;
        if (bag !== undefined) expect(bag.items).toBe(held);
        // The run's rewards reached the player once (the summary is stored).
        expect(
          rows(
            ctx.sql,
            'SELECT 1 FROM ledger WHERE user_id = ? AND source LIKE ?',
            p.id,
            'dungeon%',
          ).length,
        ).toBeGreaterThan(0);
      },
      ALL,
    );
  }, 120_000);
});
