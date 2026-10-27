import { ribbonsForLevel } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState } from '../../activity/src/api';
import { parseDungeonToday } from '../../activity/src/dungeon-parse';
import { parseDestinations, parseProfile } from '../../activity/src/expedition-parse';
import {
  parseCraftPreview,
  parseDismantlePreview,
  parseGearState,
  parseJobResult,
} from '../../activity/src/gear-parse';
import { normaliseGearRows } from '../src/gear-normalise';
import { rowToItem, type GearRow } from '../src/gear-store';
import { getBalance } from '../src/ledger';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows } from './raid-helpers';
import { rewindToB9cb38d, seedStagingPlayer, type Staging } from './staging-b9cb38d';
import { HOUR, newKey, type Json, captureConsole } from './kit';

/**
 * Staging ran b9cb38d (the first gear v2: Festival a rarity, percentage implicits, the old lines), then
 * 20b9c42, which changed migration 27 and the item shape in place. The Workshop said "could not be loaded"
 * for the one player who had used the old build: `GET /api/gear` answered 500 because a stored item line
 * (`sturdy-blow`) no longer exists. These tests put a database in the old state, start the new code on it
 * (`migrate`, what a Durable Object does on its first start) and read it through the real router, with the
 * client's own parsers deciding whether the answer is acceptable.
 */

/** A database as staging held it, with one player, after the new code's first start. */
async function stagingStarted(
  ctx: CoreContext,
  openJobs: readonly string[] = ['dismantleReady', 'improveReady'],
): Promise<Staging> {
  rewindToB9cb38d(ctx);
  const s = await seedStagingPlayer(ctx, 1, openJobs);
  ctx.core.migrate();
  return s;
}

const gear = async (s: Staging): Promise<ReturnType<typeof parseGearState>> => {
  const res = await s.player.call('GET', '/api/gear');
  expect(res.status).toBe(200);
  return parseGearState(res.body);
};

const linesOf = (ctx: CoreContext, id: string): { id: string; tier: number }[] =>
  JSON.parse(
    rows<{ lines_json: string }>(ctx.sql, 'SELECT lines_json FROM gear_items WHERE id = ?', id)[0]
      ?.lines_json ?? '[]',
  ) as { id: string; tier: number }[];

describe('a staging database from b9cb38d, started by the new code', () => {
  it('serves GET /api/gear in a shape the client accepts, with every item, job and loot record', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      const state = await gear(s);
      expect(state.items).toHaveLength(7);
      expect(state.jobs).toHaveLength(6);
      expect(state.grants).toHaveLength(3);
      expect(state.blueprints.map((b) => b.baseId).sort()).toEqual([
        'cinder-charm',
        'kelp-cap',
        'trail-cap',
      ]);
      // Festival is a base, not a rarity: the old Festival pieces read as Epic and are still Festival pieces.
      const festival = state.items.filter((i) => i.festival);
      expect(festival.map((i) => [i.baseId, i.rarity])).toEqual([
        ['festival-hearth-scarf', 'epic'],
        ['festival-lantern-charm', 'epic'],
      ]);
      // Worn items stay worn, unless the halved level cannot wear them (the scarf of the level 12 creature,
      // now level 6, and the charm of the level 20 one, now level 10, are back in the bag).
      const worn = Object.fromEntries(state.items.map((i) => [i.id, i.equippedOn]));
      expect(worn[s.items['i1'] as string]).toBe(s.c[0]);
      expect(worn[s.items['i4'] as string]).toBe(s.c[0]);
      expect(worn[s.items['i3'] as string]).toBeNull();
      expect(worn[s.items['i5'] as string]).toBeNull();
    });
  });

  it('moves the removed and moved lines to their nearest current line at the same tier, and keeps the rest', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      const id = (k: string): string => s.items[k] as string;
      // Hat: Sturdy blow became the item's own flat Attack, HP its own percent HP.
      expect(linesOf(ctx, id('i1'))).toEqual([
        { id: 'attack-local-flat', tier: 2 },
        { id: 'hp-local-pct', tier: 1 },
      ]);
      // Scarf: Thick coat became its own flat HP, Attack its own percent Attack.
      expect(linesOf(ctx, id('i2'))).toEqual([
        { id: 'hp-local-flat', tier: 3 },
        { id: 'attack-local-pct', tier: 1 },
        { id: 'attack-local-flat', tier: 0 },
      ]);
      // Charm: Sturdy blow became Creature Attack; the Charm's own Attack and HP stay as they were.
      expect(linesOf(ctx, id('i5'))).toEqual([{ id: 'attack', tier: 1 }]);
      expect(linesOf(ctx, id('i7'))).toEqual([
        { id: 'attack', tier: 3 },
        { id: 'hp', tier: 2 },
      ]);
      // Rarity, base, level and wearer are not touched; Festival-rarity rows read as Epic.
      const row = rows<{ base_id: string; rarity: string; item_level: number }>(
        ctx.sql,
        'SELECT base_id, rarity, item_level FROM gear_items WHERE id = ?',
        id('i3'),
      )[0];
      expect(row).toEqual({ base_id: 'festival-hearth-scarf', rarity: 'epic', item_level: 4 });
      expect(count(ctx, "SELECT COUNT(*) AS n FROM gear_items WHERE rarity = 'festival'")).toBe(0);
    });
  });

  it('rewrites the Festival rarity in job snapshots, job results and loot records', async () => {
    await runCore(nextGuild(), async (ctx) => {
      await stagingStarted(ctx);
      for (const table of ['workshop_jobs', 'gear_grants']) {
        for (const column of table === 'workshop_jobs'
          ? ['input_json', 'result_json']
          : ['result_json']) {
          expect(
            count(
              ctx,
              `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} LIKE '%"rarity":"festival"%'`,
            ),
          ).toBe(0);
        }
      }
    });
  });

  it('is idempotent: a second start changes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      await stagingStarted(ctx);
      const snapshot = (): unknown[] => [
        rows(ctx.sql, 'SELECT * FROM gear_items ORDER BY id'),
        rows(ctx.sql, 'SELECT * FROM workshop_jobs ORDER BY id'),
        rows(ctx.sql, 'SELECT * FROM gear_grants ORDER BY key'),
        rows(ctx.sql, 'SELECT id, level, exp, ribbons FROM creatures ORDER BY id'),
      ];
      const before = snapshot();
      const report = normaliseGearRows(ctx.storage);
      expect(report).toEqual({ items: 0, jobs: 0, grants: 0, unreadable: 0 });
      ctx.core.migrate();
      expect(snapshot()).toEqual(before);
    });
  });

  it('answers the preview routes and starts jobs on the old rows', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      const p = s.player;
      const craft = await p.call('POST', '/api/workshop/preview', {
        kind: 'craft',
        creatureId: s.c[0],
        blueprintId: 'trail-cap',
      });
      expect(craft.status).toBe(200);
      parseCraftPreview(craft.body['result']);
      // The item with a Festival piece in it, and one that had a removed line.
      for (const itemId of [s.items['i3'], s.items['i1']]) {
        const dismantle = await p.call('POST', '/api/workshop/preview', {
          kind: 'dismantle',
          creatureId: s.c[0],
          itemIds: [itemId],
        });
        expect(dismantle.status).toBe(200);
        parseDismantlePreview(dismantle.body['result']);
      }
      // The finished old jobs free their workshop slots; then a pile takes an old item apart
      // and a new craft starts from an old blueprint.
      ctx.clock.t += 6 * HOUR;
      for (const name of ['dismantleReady', 'improveReady']) {
        const claim = await p.call('POST', `/api/workshop/jobs/${s.jobs[name] as string}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(claim.status).toBe(200);
      }
      // Dismantling is a pile now: mark an old item and dismantle it with a free creature.
      await p.call('POST', `/api/gear/${s.items['i1'] as string}/equip`, { creatureId: null });
      const marked = await p.call('POST', '/api/gear/mark', {
        itemIds: [s.items['i1']],
        marked: true,
      });
      expect(marked.status, JSON.stringify(marked.body)).toBe(200);
      const start = await p.call('POST', '/api/gear/dismantle', {
        creatureId: s.c[0],
        itemIds: [s.items['i1']],
        idempotencyKey: newKey(),
      });
      expect(start.status, JSON.stringify(start.body)).toBe(200);
      parseGearState(start.body['gear']);
      const craftStart = await p.call('POST', '/api/workshop/jobs', {
        kind: 'craft',
        creatureId: s.c[1],
        blueprintId: 'kelp-cap',
        idempotencyKey: newKey(),
      });
      expect(craftStart.status, JSON.stringify(craftStart.body)).toBe(200);
      parseGearState(craftStart.body['gear']);
    });
  });

  it.each([
    ['a dismantle of a Festival piece and a retired Improve', ['dismantleReady', 'improveReady']],
    ['a craft and a supply that were still running', ['craftRunning', 'supplyRunning']],
  ])('claims the old open jobs: %s', async (_name, open) => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx, open);
      ctx.clock.t += 6 * HOUR;
      // The staging session is renewed as the test clock moves (see `apiPlayer`).
      for (const name of open) {
        const res: Json = await s.player.call(
          'POST',
          `/api/workshop/jobs/${s.jobs[name] as string}/claim`,
          { idempotencyKey: newKey() },
        );
        expect(res.status, name).toBe(200);
        parseJobResult(res.body['result']);
        parseGearState(res.body['gear']);
      }
      const state = await gear(s);
      expect(state.jobs.every((j) => j.status === 'claimed')).toBe(true);
    });
  });

  it('equips, unequips and equips the best on old items', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      const p = s.player;
      // The scarf goes on the level 10 creature (the scarf slot opens at level 7).
      const equip = await p.call('POST', `/api/gear/${s.items['i2'] as string}/equip`, {
        creatureId: s.c[2],
      });
      expect(equip.status, JSON.stringify(equip.body)).toBe(200);
      parseGearState(equip.body['gear']);
      const off = await p.call('POST', `/api/gear/${s.items['i2'] as string}/equip`, {
        creatureId: null,
      });
      expect(off.status).toBe(200);
      const best = await p.call('POST', '/api/gear/equip-best', {
        creatureIds: [s.c[0], s.c[1], s.c[2]],
      });
      expect(best.status).toBe(200);
      parseGearState(best.body['gear']);
    });
  });

  it('serves the Creatures view: levels halved once, Bait refunded, worn gear read, ribbons for the new level', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      const creatures = rows<{ id: string; level: number; exp: number; ribbons: number }>(
        ctx.sql,
        'SELECT id, level, exp, ribbons FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        s.player.id,
      );
      expect(creatures.map((c) => c.level)).toEqual([15, 6, 10, 3, 3, 3]);
      expect(creatures.every((c) => c.exp === 0)).toBe(true);
      expect(creatures.map((c) => c.ribbons)).toEqual(
        creatures.map((c) => ribbonsForLevel(c.level)),
      );
      expect(getBalance(ctx.sql, s.player.id, 'bait')).toBeGreaterThan(0);
      // The wear rule holds after the halving: nothing is worn above its wearer's level.
      const state = await gear(s);
      for (const item of state.items) {
        if (item.equippedOn === null) continue;
        const level = creatures.find((c) => c.id === item.equippedOn)?.level ?? 0;
        expect(level).toBeGreaterThanOrEqual(item.needs.level);
      }
      const res = await s.player.call('GET', '/api/state');
      expect(res.status).toBe(200);
      const game = parseGameState(res.body);
      expect(game.creatures).toHaveLength(6);
      expect(res.body['levelReset']).not.toBeNull();
      // Reading it again does not halve again.
      ctx.core.migrate();
      expect(
        rows<{ level: number }>(
          ctx.sql,
          'SELECT level FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
          s.player.id,
        ).map((c) => c.level),
      ).toEqual([15, 6, 10, 3, 3, 3]);
    });
  });

  it('serves the expedition and dungeon views', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      for (const [path, parse] of [
        ['/api/profile', parseProfile],
        ['/api/destinations', parseDestinations],
        ['/api/dungeon/today', parseDungeonToday],
      ] as const) {
        const res = await s.player.call('GET', path);
        expect(res.status, path).toBe(200);
        parse(res.body);
      }
    });
  });
});

describe('rows the normalisation cannot fix never take the Workshop down', () => {
  it('maps an unknown base and a damaged line list instead of failing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      rewindToB9cb38d(ctx);
      const s = await seedStagingPlayer(ctx, 1);
      const insert = (id: string, base: string, slot: string, tag: string, lines: string): void => {
        ctx.sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, slot, tag, rarity, item_level, lines_json, origin_json, source, created_at)
           VALUES (?, ?, ?, ?, ?, 'rare', 7, ?, '{}', 'test', ?)`,
          id,
          s.player.id,
          base,
          slot,
          tag,
          lines,
          ctx.clock.t,
        );
      };
      insert('00000000-0000-4000-8000-0000000000a1', 'ghost-hat', 'hat', 'ember', '[]');
      insert('00000000-0000-4000-8000-0000000000a2', 'trail-cap', 'hat', 'neutral', '{not json');
      insert(
        '00000000-0000-4000-8000-0000000000a3',
        'trail-cap',
        'hat',
        'neutral',
        '[{"id":"never-existed","tier":1},{"id":"sturdy-blow","tier":9},{"id":"hp","tier":2}]',
      );
      ctx.core.migrate();
      const state = await gear(s);
      expect(state.items).toHaveLength(10);
      const byId = new Map(state.items.map((i) => [i.id, i]));
      // The unknown base became the best Ember hat a level 7 item can be.
      expect(byId.get('00000000-0000-4000-8000-0000000000a1')?.baseId).toBe('forge-hood');
      expect(linesOf(ctx, '00000000-0000-4000-8000-0000000000a2')).toEqual([]);
      expect(linesOf(ctx, '00000000-0000-4000-8000-0000000000a3')).toEqual([
        { id: 'attack-local-flat', tier: 4 },
        { id: 'hp-local-pct', tier: 2 },
      ]);
    });
  });

  it('leaves out one item, job, blueprint or loot record it cannot read and sends the rest', async () => {
    const log = captureConsole();
    await runCore(nextGuild(), async (ctx) => {
      const s = await stagingStarted(ctx);
      // Damage written after the start (the normalisation has already run): an unknown base, a job with
      // broken JSON, a blueprint of a base that is gone and a loot record that is not JSON.
      ctx.sql.exec("UPDATE gear_items SET base_id = 'ghost-hat' WHERE id = ?", s.items['i6']);
      ctx.sql.exec(
        "UPDATE workshop_jobs SET input_json = '{oops' WHERE id = ?",
        s.jobs['supplyClaimed'],
      );
      ctx.sql.exec(
        "INSERT INTO blueprints (user_id, base_id, rarity, learned_at, marks) VALUES (?, 'ghost-hat', 'common', 0, 0)",
        s.player.id,
      );
      ctx.sql.exec(
        "UPDATE gear_grants SET result_json = 'nope' WHERE user_id = ? AND key = 'welcome'",
        s.player.id,
      );
      const state = await gear(s);
      expect(state.items).toHaveLength(6);
      expect(state.jobs).toHaveLength(5);
      expect(state.blueprints).toHaveLength(3);
      expect(state.grants).toHaveLength(2);
      // The collection view of a creature that wears an unreadable item still loads.
      ctx.sql.exec("UPDATE gear_items SET base_id = 'ghost-hat' WHERE id = ?", s.items['i1']);
      const res = await s.player.call('GET', '/api/state');
      expect(res.status).toBe(200);
      // The living room shows what every creature wears; the unreadable item is left out of it.
      const room = await s.player.call('POST', '/api/room', { userIds: [s.player.id] });
      expect(room.status).toBe(200);
      // Each skipped record is logged by kind only: the unknown base id never appears.
      expect(log.text()).toContain('gear view: item skipped');
      expect(log.text()).toContain('gear view: blueprint skipped');
      expect(log.text()).toContain('worn gear skipped');
      expect(log.text()).not.toContain('ghost-hat');
    });
  });

  it('reads an item row with a line the content no longer has, or the rarity festival, as a plain item', () => {
    // The wear rule and the folds work on `rowToItem`: one old line never makes the item unreadable.
    const row = {
      id: 'x',
      user_id: 'u',
      base_id: 'trail-cap',
      slot: 'hat',
      tag: 'neutral',
      rarity: 'festival',
      item_level: 4,
      lines_json: '[{"id":"sturdy-blow","tier":2},{"id":"attack-local-pct","tier":1}]',
      made_by: null,
      made_by_name: null,
      made_at: null,
      origin_json: '{}',
      equipped_on: null,
      source: 'test',
      created_at: 0,
    } as unknown as GearRow;
    const item = rowToItem(row);
    expect(item.rarity).toBe('epic');
    expect(item.lines).toEqual([{ id: 'attack-local-pct', tier: 1 }]);
    // A damaged line list is still an error (it is written only by the game).
    expect(() => rowToItem({ ...row, lines_json: '{bad' })).toThrow();
  });
});

function count(ctx: CoreContext, query: string): number {
  return rows<{ n: number }>(ctx.sql, query)[0]?.n ?? -1;
}
