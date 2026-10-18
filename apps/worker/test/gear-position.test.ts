import { createSeededRng, type GearRarity } from '@creatures/game';
import { simulateFight, type DungeonRunInput, type FightInput } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { loadCreatures } from '../src/raid-teams';
import { giveItem } from './gear-helpers';
import { dungeonPlayer } from './dungeon-helpers';
import { runCore, type CoreContext } from './helpers';
import { HELSINKI, W02, forcePool, nextGuild, rows, runRaid, seedPlayer } from './raid-helpers';

/**
 * Position lines and sets in the fights the server builds: the gear of every creature is folded again with
 * where it stands when the fight input is built (the raid's zones, the dungeon's one line), and the stored
 * input carries the numbers, so a replay never looks at gear.
 */

const BIG = 50_000_000;
const AFTER_RESET = Date.parse('2027-01-15T12:00:00Z');

/** Gives a creature an item with exact lines (item level 5) and puts it on. */
function wear(
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  baseId: string,
  lines: [string, number][],
  rarity: GearRarity = 'epic',
): string {
  const id = giveItem(ctx.sql, userId, baseId, { rarity, level: 5, now: ctx.clock.t, lines });
  ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, id);
  return id;
}

describe('the raid row', () => {
  it('folds position lines by the zone each creature is placed in, and stores the numbers in the fight', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3].map((n) => seedPlayer(ctx, n, { level: 12 }));
        ctx.core.raid.currentWeek(HELSINKI);
        const [a] = players as [(typeof players)[number]];
        const [c0, c1, c2] = a.creatureIds as [string, string, string];
        // A row of nine: slot 0 is the left end of the Front row, slot 4 the middle of the Middle row and
        // slot 8 the right end of the Back row.
        expect(ctx.core.raid.place(a.id, HELSINKI, c0, 0).ok).toBe(true);
        expect(ctx.core.raid.place(a.id, HELSINKI, c1, 4).ok).toBe(true);
        expect(ctx.core.raid.place(a.id, HELSINKI, c2, 8).ok).toBe(true);
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        wear(ctx, a.id, c0, 'trail-cap', [['edge-walker', 4]]);
        wear(ctx, a.id, c0, 'patch-scarf', [['front-liner', 4]]);
        wear(ctx, a.id, c1, 'trail-cap', [['edge-walker', 4]]);
        wear(ctx, a.id, c1, 'patch-scarf', [['heart-of-the-row', 4]]);
        wear(ctx, a.id, c2, 'trail-cap', [['back-row-patience', 4]]);
        const bare = new Map(
          players.flatMap((p) => loadCreatures(ctx.sql, p.id)).map((c) => [c.id, c]),
        );

        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        const stored = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 1',
        )[0];
        const input = JSON.parse(stored?.input ?? '{}') as FightInput;
        const slotOf = (id: string) => {
          const found = input.row.find((s) => s.id === id);
          if (found === undefined) throw new Error('not in the row');
          return found;
        };
        // Their places are the ones they were given.
        expect([c0, c1, c2].map((id) => input.row.findIndex((s) => s.id === id))).toEqual([
          0, 4, 8,
        ]);

        // Slot 0, the end of the Front row: Edge-walker gives 10% Attack and Front-liner 10% less damage.
        const front = slotOf(c0);
        const frontBare = bare.get(c0);
        expect(front.stats?.atk).toBeGreaterThan(frontBare?.stats.atk ?? Infinity);
        expect(front.mods?.takenBp).toBe(1_000);
        // Slot 4, the middle of its row: Edge-walker does nothing, Heart of the row gives 12% HP.
        const middle = slotOf(c1);
        const middleBare = bare.get(c1);
        expect(middle.stats?.atk).toBe(middleBare?.stats.atk);
        expect(middle.stats?.hp).toBeGreaterThan(middleBare?.stats.hp ?? Infinity);
        expect(middle.mods?.takenBp).toBeUndefined();
        // Slot 8, the Back row: Back-row patience gives 4 points of crit chance.
        const back = slotOf(c2);
        const backBare = bare.get(c2);
        expect((back.crit?.chanceBp ?? 0) - (backBare?.crit?.chanceBp ?? 0)).toBe(400);
        expect(back.stats).toEqual(backBare?.stats);

        // A creature with no position gear is exactly as it was, and the stored fight replays.
        const plain = input.row.find((s) => s.ownerId !== null && ![c0, c1, c2].includes(s.id));
        expect(plain?.stats).toEqual(bare.get(plain?.id ?? '')?.stats);
        expect(() => simulateFight(input, createSeededRng('replay'))).not.toThrow();
      },
      { core: { raidPractice: true, gearRng: createSeededRng('position') } },
    );
  });

  it('gives a Guard in the row of a Lantern Night wearer a longer Shield Wall, and the Lantern bearer HP to its neighbours', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3].map((n) =>
          seedPlayer(ctx, n, { level: 12, species: ['cindle', 'sproutle', 'zipmouse'] }),
        );
        ctx.core.raid.currentWeek(HELSINKI);
        const [a] = players as [(typeof players)[number]];
        const [cindle, sproutle, zipmouse] = a.creatureIds as [string, string, string];
        // Cindle (left), Sproutle the Guard (middle) and Zipmouse (right) stand in the Front row.
        expect(ctx.core.raid.place(a.id, HELSINKI, cindle, 0).ok).toBe(true);
        expect(ctx.core.raid.place(a.id, HELSINKI, sproutle, 1).ok).toBe(true);
        expect(ctx.core.raid.place(a.id, HELSINKI, zipmouse, 2).ok).toBe(true);
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        // Cindle wears all three pieces of Lantern Night; Zipmouse a Lantern bearer.
        wear(ctx, a.id, cindle, 'festival-lantern-cap', [], 'common');
        wear(ctx, a.id, cindle, 'festival-hearth-scarf', [], 'common');
        wear(ctx, a.id, cindle, 'festival-lantern-charm', [], 'common');
        wear(ctx, a.id, zipmouse, 'trail-cap', [['lantern-bearer', 4]]);
        const bare = new Map(loadCreatures(ctx.sql, a.id).map((c) => [c.id, c]));

        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        const stored = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 1',
        )[0];
        const input = JSON.parse(stored?.input ?? '{}') as FightInput;
        const guard = input.row.find((s) => s.id === sproutle);
        // One more round of Shield Wall for the Guard of the row, from Lantern Night.
        expect(guard?.mods?.lingerRounds).toBe(1);
        // The Guard stands beside the Lantern bearer (Zipmouse): 6% more HP (a Guard's own bonus is the engine's).
        expect(guard?.stats?.hp).toBe(
          Math.floor(((bare.get(sproutle)?.stats.hp ?? 0) * 10_600) / 10_000),
        );
        // The bearer itself gains nothing from it; Cindle's two-piece bonus (Attack and HP +3%) is in its numbers.
        expect(input.row.find((s) => s.id === zipmouse)?.stats?.hp).toBe(
          bare.get(zipmouse)?.stats.hp,
        );
        expect(input.row.find((s) => s.id === cindle)?.stats?.atk).toBe(
          bare.get(cindle)?.stats.atk,
        );
      },
      { core: { raidPractice: true, gearRng: createSeededRng('lantern') } },
    );
  });
});

describe('the raid board with empty slots', () => {
  it('a Lantern bearer gives HP only to a creature that stands right beside it, not across an empty slot', async () => {
    await runRaid(
      (ctx) => {
        const a = seedPlayer(ctx, 1, { level: 12, species: ['sproutle', 'zipmouse', 'cindle'] });
        const b = seedPlayer(ctx, 2, { level: 12, creatures: 1 });
        const c = seedPlayer(ctx, 3, { level: 12 });
        ctx.core.raid.currentWeek(HELSINKI);
        const [sproutle, zipmouse, cindle] = a.creatureIds as [string, string, string];
        // Seven creatures on a board of nine, all placed: the Guard at slot 0 and the bearer at slot 2
        // with slot 1 empty, Cindle in the Middle at slot 3.
        const place = (slot: number, userId: string, creatureId: string) =>
          ctx.sql.exec(
            'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, ?, ?, ?, ?)',
            W02.id,
            1,
            slot,
            userId,
            creatureId,
          );
        place(0, a.id, sproutle);
        place(2, a.id, zipmouse);
        place(3, a.id, cindle);
        place(4, b.id, b.creatureIds[0] as string);
        c.creatureIds.forEach((id, k) => place(6 + k, c.id, id));
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        wear(ctx, a.id, zipmouse, 'trail-cap', [['lantern-bearer', 4]]);
        const bare = new Map(loadCreatures(ctx.sql, a.id).map((x) => [x.id, x]));

        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        const stored = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 1',
        )[0];
        const input = JSON.parse(stored?.input ?? '{}') as FightInput;
        expect(input.board?.slots).toEqual([0, 2, 3, 4, 6, 7, 8]);
        // The Guard is two board slots from the bearer with a gap between: no gift, its numbers as built.
        expect(input.row.find((s) => s.id === sproutle)?.stats).toEqual(bare.get(sproutle)?.stats);
        expect(() => simulateFight(input, createSeededRng('replay'))).not.toThrow();
      },
      { core: { raidPractice: true, gearRng: createSeededRng('gap') } },
    );
  });
});

describe('the dungeon line', () => {
  it('folds position lines along the row in the order of the request, left to right', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 12 });
        const [a, b, c] = p.creatureIds as [string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        wear(ctx, p.id, b, 'patch-scarf', [['heart-of-the-row', 4]]);
        wear(ctx, p.id, c, 'patch-scarf', [['heart-of-the-row', 4]]);
        const bare = new Map(loadCreatures(ctx.sql, p.id).map((x) => [x.id, x]));
        ctx.clock.t = AFTER_RESET;
        const first = await p.run({ team: [a, b, c] });
        expect(first.status).toBe(200);
        const stored = rows<{ input_json: string }>(
          ctx.sql,
          'SELECT input_json FROM dungeon_runs WHERE user_id = ?',
          p.id,
        )[0];
        const input = JSON.parse(stored?.input_json ?? '{}') as DungeonRunInput;
        const at = (id: string) => input.team.find((s) => s.id === id);
        // `a` at the left end: Edge-walker works. `b` in the middle: Heart of the row works. `c` at the right end: it does not.
        expect(at(a)?.stats?.atk).toBeGreaterThan(bare.get(a)?.stats.atk ?? Infinity);
        expect(at(b)?.stats?.hp).toBeGreaterThan(bare.get(b)?.stats.hp ?? Infinity);
        expect(at(c)?.stats?.hp).toBe(bare.get(c)?.stats.hp);
      },
      { dungeonRng: createSeededRng('d-pos'), gearRng: createSeededRng('d-pos:gear') },
    );
  });

  it('follows the order: the same creatures swapped fold the other way', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { level: 12 });
        const [a, b, c] = p.creatureIds as [string, string, string];
        wear(ctx, p.id, a, 'trail-cap', [['edge-walker', 4]]);
        const bare = new Map(loadCreatures(ctx.sql, p.id).map((x) => [x.id, x]));
        ctx.clock.t = AFTER_RESET;
        // `a` in the middle: Edge-walker does nothing.
        expect((await p.run({ team: [b, a, c] })).status).toBe(200);
        const stored = rows<{ input_json: string }>(
          ctx.sql,
          'SELECT input_json FROM dungeon_runs WHERE user_id = ?',
          p.id,
        )[0];
        const input = JSON.parse(stored?.input_json ?? '{}') as DungeonRunInput;
        expect(input.team.find((s) => s.id === a)?.stats?.atk).toBe(bare.get(a)?.stats.atk);
      },
      { dungeonRng: createSeededRng('d-swap'), gearRng: createSeededRng('d-swap:gear') },
    );
  });
});
