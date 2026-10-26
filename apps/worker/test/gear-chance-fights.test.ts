import { createSeededRng, type GearRarity } from '@creatures/game';
import { simulateFight, type FightInput } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { giveItem } from './gear-helpers';
import type { CoreContext } from './helpers';
import { HELSINKI, W02, forcePool, joinRaid, rows, runRaid, seedPlayer } from './raid-helpers';

/**
 * Chance lines and trigger lines in the fights the server builds: a worn line reaches the creature's sheet
 * (with the Epic bonus of a chance line), the stored fight input carries the numbers, and the stored fight
 * replays with the luck dice drawn from its own seed.
 */

const BIG = 50_000_000;

/** Gives a creature an item with exact lines (item level 5) and puts it on. */
function wear(
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  baseId: string,
  lines: [string, number][],
  rarity: GearRarity,
): void {
  const id = giveItem(ctx.sql, userId, baseId, { rarity, level: 5, now: ctx.clock.t, lines });
  ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, id);
}

describe('the raid fight with chance and trigger lines worn', () => {
  it('stores the sheet numbers (an Epic chance line has 2 points more), replays, and a creature without them has none', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3].map((n) => seedPlayer(ctx, n, { level: 12 }));
        joinRaid(ctx, players);
        const [a] = players as [(typeof players)[number]];
        const [c0, c1, c2] = a.creatureIds as [string, string, string];
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        // c0: an Echo (Epic: tier V 12% + 2 points) and a Stubborn scarf; c1: a Payback and a Rare Echo.
        wear(ctx, a.id, c0, 'trail-cap', [['echo', 4]], 'epic');
        wear(ctx, a.id, c0, 'patch-scarf', [['stubborn', 0]], 'epic');
        wear(ctx, a.id, c1, 'patch-scarf', [['payback', 4]], 'rare');
        wear(ctx, a.id, c1, 'trail-cap', [['echo', 4]], 'rare');

        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        const stored = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 1',
        )[0];
        const input = JSON.parse(stored?.input ?? '{}') as FightInput;
        const slotOf = (id: string) => input.row.find((s) => s.id === id);
        expect(slotOf(c0)?.mods).toMatchObject({ echoBp: 1_400, stubborn: 1 });
        expect(slotOf(c1)?.mods).toMatchObject({ echoBp: 1_200, paybackBp: 3_000 });
        // A creature with no such line has none of the fields (the sheet is the plain one it was).
        const plain = slotOf(c2)?.mods;
        expect(plain === undefined || !('echoBp' in plain)).toBe(true);

        // The stored fight replays: luck dice are drawn (a chance line is in the row) and procs are written.
        const result = simulateFight(input, createSeededRng('replay'));
        expect(result.events.some((e) => e.t === 'proc')).toBe(true);
        const again = simulateFight(input, createSeededRng('replay'));
        expect(JSON.stringify(again.events)).toBe(JSON.stringify(result.events));
      },
      { core: { raidPractice: true, gearRng: createSeededRng('chance-fights') } },
    );
  });
});
