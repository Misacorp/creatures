import { RULES, createSeededRng, itemOf, ribbonsForLevel, talentContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { convertPendingGear } from '../src/gear-convert';
import { insertItem } from '../src/gear-store';
import {
  OLD_TRAINING_BASE,
  OLD_TRAINING_PER_LEVEL,
  convertPendingLevels,
  halvedLevel,
  levelResetRefund,
  type LevelResetNotice,
} from '../src/level-reset';
import { getBalance } from '../src/ledger';
import { runCore, type CoreContext } from './helpers';
import { count, nextGuild, rows, seedPlayer } from './raid-helpers';

/**
 * The one-time level reset at the switch to training by activity (decisions.md, 2026-10-17). A database
 * that has not seen the conversion has no `level_reset` table, so the tests drop it to play "the first
 * load after the deploy" on whatever they seeded.
 */

const dropList = (ctx: CoreContext): void => {
  ctx.sql.exec('DROP TABLE level_reset');
};
const reset = (ctx: CoreContext): number =>
  convertPendingLevels({ storage: ctx.storage, now: () => ctx.clock.t });

const setLevel = (ctx: CoreContext, id: string, level: number): void => {
  ctx.sql.exec(
    'UPDATE creatures SET level = ?, exp = 77, ribbons = ? WHERE id = ?',
    level,
    ribbonsForLevel(level),
    id,
  );
};

const creatureRows = (ctx: CoreContext, userId: string) =>
  rows<{ id: string; species: string; level: number; exp: number; ribbons: number }>(
    ctx.sql,
    'SELECT id, species, level, exp, ribbons FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
    userId,
  );

const noticeOf = (ctx: CoreContext, userId: string): LevelResetNotice | null => {
  const row = rows<{ notice_json: string | null }>(
    ctx.sql,
    'SELECT notice_json FROM level_reset WHERE user_id = ?',
    userId,
  )[0];
  return row?.notice_json == null ? null : (JSON.parse(row.notice_json) as LevelResetNotice);
};

/** An item worn by a creature (inserted the way the game does, then put on). */
function wear(ctx: CoreContext, userId: string, creatureId: string, baseId: string, level: number) {
  const id = insertItem(ctx.sql, userId, itemOf(baseId, 'common', level, []), {
    source: 'test',
    now: ctx.clock.t,
  });
  ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, id);
  return id;
}

const wornOn = (ctx: CoreContext, id: string): string | null =>
  rows<{ equipped_on: string | null }>(
    ctx.sql,
    'SELECT equipped_on FROM gear_items WHERE id = ?',
    id,
  )[0]?.equipped_on ?? null;

describe('the halved level and the refund', () => {
  it('halves, rounds down and never goes below 1', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 15, 21, 29, 30].map(halvedLevel)).toEqual([
      1, 1, 1, 2, 5, 5, 6, 7, 10, 14, 15,
    ]);
  });

  it('refunds the old price (3 + 2 x L) of every level from the new level up to the old one minus one', () => {
    expect(OLD_TRAINING_BASE).toBe(3);
    expect(OLD_TRAINING_PER_LEVEL).toBe(2);
    // Level 30 -> 15: L = 15..29, 15 levels: 3 x 15 + 2 x 330 = 705.
    expect(levelResetRefund(30)).toBe(705);
    // Level 12 -> 6: L = 6..11, 6 levels: 3 x 6 + 2 x 51 = 120.
    expect(levelResetRefund(12)).toBe(120);
    // Level 1 lost nothing; level 2 -> 1 gives back the 1 -> 2 step (5); level 3 -> 1: 5 + 7.
    expect(levelResetRefund(1)).toBe(0);
    expect(levelResetRefund(2)).toBe(5);
    expect(levelResetRefund(3)).toBe(12);
    // An odd level: 11 -> 5, L = 5..10: 3 x 6 + 2 x 45 = 108.
    expect(levelResetRefund(11)).toBe(108);
  });

  it('is never negative and grows with the level', () => {
    let last = -1;
    for (let level = 1; level <= RULES.experience.maxLevel; level++) {
      const bait = levelResetRefund(level);
      expect(Number.isInteger(bait) && bait >= 0).toBe(true);
      expect(bait).toBeGreaterThanOrEqual(last);
      last = bait;
    }
  });
});

describe('the one-time conversion', () => {
  it('halves every creature, clears banked experience, regrants ribbons for the new level and refunds the Bait once', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, {
        creatures: 4,
        species: ['tidewing', 'pyrelynx', 'thornbuck', 'voltaro'],
      });
      const levels = [30, 12, 1, 22];
      p.creatureIds.forEach((id, i) => {
        setLevel(ctx, id, levels[i] ?? 1);
      });
      const before = getBalance(ctx.sql, p.id, 'bait');
      dropList(ctx);
      expect(reset(ctx)).toBe(1);

      expect(creatureRows(ctx, p.id).map((c) => [c.level, c.exp, c.ribbons])).toEqual([
        [15, 0, 1], // 30 -> 15: Bronze (past 10) only, no Silver and no Gold
        [6, 0, 0], // 12 -> 6
        [1, 0, 0], // level 1 stays
        [11, 0, 1], // 22 -> 11: Bronze
      ]);
      const expected = levelResetRefund(30) + levelResetRefund(12) + levelResetRefund(22);
      expect(getBalance(ctx.sql, p.id, 'bait')).toBe(before + expected);
      expect(
        rows<{ amount: number; source: string; idempotency_key: string }>(
          ctx.sql,
          "SELECT amount, source, idempotency_key FROM ledger WHERE user_id = ? AND source = 'level_reset'",
          p.id,
        ),
      ).toEqual([
        { amount: expected, source: 'level_reset', idempotency_key: `level-reset:${p.id}` },
      ]);
      expect(noticeOf(ctx, p.id)).toEqual({
        creatures: 3,
        bait: expected,
        unequipped: 0,
        talentsToBook: 0,
      });

      // Run again: nothing changes, nothing is credited twice.
      expect(reset(ctx)).toBe(0);
      expect(creatureRows(ctx, p.id).map((c) => c.level)).toEqual([15, 6, 1, 11]);
      expect(getBalance(ctx.sql, p.id, 'bait')).toBe(before + expected);
      return Promise.resolve();
    });
  });

  it('leaves an evolved creature evolved below level 15, and keeps fusions, quirks and nicknames', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 1, species: ['tidewing'], fusion: 3 });
      setLevel(ctx, p.creatureIds[0] as string, 20);
      ctx.sql.exec("UPDATE creatures SET nickname = 'Keeper' WHERE id = ?", p.creatureIds[0]);
      const quirk = rows<{ quirk_id: string }>(ctx.sql, 'SELECT quirk_id FROM creatures')[0]
        ?.quirk_id;
      dropList(ctx);
      reset(ctx);
      expect(
        rows<{
          species: string;
          level: number;
          fusion_count: number;
          nickname: string;
          quirk_id: string;
        }>(ctx.sql, 'SELECT species, level, fusion_count, nickname, quirk_id FROM creatures'),
      ).toEqual([
        {
          species: 'tidewing',
          level: 10,
          fusion_count: 3,
          nickname: 'Keeper',
          quirk_id: quirk as string,
        },
      ]);
      return Promise.resolve();
    });
  });

  it('puts talents in slots the new level does not open back in the Talent Book', async () => {
    await runCore(nextGuild(), (ctx) => {
      // A rare evolved creature has three slots (opening at 1, 20 and 25).
      const p = seedPlayer(ctx, 1, { creatures: 2, species: ['tempestray', 'ancientshell'] });
      const [high, mid] = p.creatureIds as [string, string];
      setLevel(ctx, high, 30);
      setLevel(ctx, mid, 30);
      const ids = [...talentContent.byId.keys()].slice(0, 3);
      for (const creature of [high, mid]) {
        ids.forEach((talent, i) => {
          ctx.sql.exec(
            'INSERT INTO creature_talents (creature_id, talent_id, golden, slot, gained_at) VALUES (?, ?, 0, ?, 1)',
            creature,
            talent,
            i + 1,
          );
        });
      }
      dropList(ctx);
      reset(ctx);
      for (const creature of [high, mid]) {
        const held = rows<{ talent_id: string; slot: number | null }>(
          ctx.sql,
          'SELECT talent_id, slot FROM creature_talents WHERE creature_id = ? ORDER BY talent_id',
          creature,
        );
        // Nothing is lost: all three are still in the book; only slot 1 is still open at level 15.
        expect(held).toHaveLength(3);
        expect(held.filter((t) => t.slot !== null)).toEqual([{ talent_id: ids[0], slot: 1 }]);
      }
      expect(noticeOf(ctx, p.id)?.talentsToBook).toBe(4);
      return Promise.resolve();
    });
  });

  it('takes worn items the new level cannot wear off, into the bag, without changing how many items there are', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 2, species: ['tidewing', 'pyrelynx'] });
      const [a, b] = p.creatureIds as [string, string];
      setLevel(ctx, a, 30); // -> 15: Hat, Scarf and Charm slots are open
      setLevel(ctx, b, 12); // -> 6: the Scarf (7) and Charm (13) slots are closed
      const stays = wear(ctx, p.id, a, 'trail-cap', 12); // item level 12 <= 15
      const tooHigh = wear(ctx, p.id, a, 'patch-scarf', 20); // item level 20 > 15
      const charmOk = wear(ctx, p.id, a, 'trail-charm', 15);
      const hatOk = wear(ctx, p.id, b, 'trail-cap', 6);
      const scarfLocked = wear(ctx, p.id, b, 'patch-scarf', 1); // slot opens at 7
      const charmLocked = wear(ctx, p.id, b, 'trail-charm', 1);
      const items = count(ctx.sql, 'gear_items');
      dropList(ctx);
      reset(ctx);
      expect([stays, charmOk, hatOk].map((id) => wornOn(ctx, id))).toEqual([a, a, b]);
      expect([tooHigh, scarfLocked, charmLocked].map((id) => wornOn(ctx, id))).toEqual([
        null,
        null,
        null,
      ]);
      expect(count(ctx.sql, 'gear_items')).toBe(items);
      expect(noticeOf(ctx, p.id)?.unequipped).toBe(3);
      return Promise.resolve();
    });
  });

  it('only lists the players who owned creatures when the conversion first ran', async () => {
    await runCore(nextGuild(), (ctx) => {
      const early = seedPlayer(ctx, 1, { creatures: 1, species: ['tidewing'] });
      setLevel(ctx, early.creatureIds[0] as string, 20);
      dropList(ctx);
      expect(reset(ctx)).toBe(1);
      // A player who arrives later keeps their level, however often it starts.
      const late = seedPlayer(ctx, 2, { creatures: 1, species: ['tidewing'] });
      setLevel(ctx, late.creatureIds[0] as string, 20);
      expect(reset(ctx)).toBe(0);
      ctx.core.migrate();
      expect(creatureRows(ctx, early.id)[0]?.level).toBe(10);
      expect(creatureRows(ctx, late.id)[0]?.level).toBe(20);
      expect(count(ctx.sql, 'level_reset')).toBe(1);
      return Promise.resolve();
    });
  });

  it('does nothing on a fresh guild, and a player who has only level 1 creatures gets no card', async () => {
    await runCore(nextGuild(), (ctx) => {
      expect(count(ctx.sql, 'level_reset')).toBe(0);
      const p = seedPlayer(ctx, 1, { creatures: 2, level: 1 });
      dropList(ctx);
      expect(reset(ctx)).toBe(1);
      expect(noticeOf(ctx, p.id)).toBeNull();
      expect(
        rows<{ converted_at: number | null }>(ctx.sql, 'SELECT converted_at FROM level_reset')[0]
          ?.converted_at,
      ).not.toBeNull();
      expect(count(ctx.sql, 'ledger', "source = 'level_reset'")).toBe(0);
      return Promise.resolve();
    });
  });

  it('runs from the guild start (migrate) too, and a second start changes nothing', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 1, species: ['tidewing'] });
      setLevel(ctx, p.creatureIds[0] as string, 30);
      dropList(ctx);
      ctx.core.migrate();
      expect(creatureRows(ctx, p.id)[0]?.level).toBe(15);
      expect(getBalance(ctx.sql, p.id, 'bait')).toBe(705);
      // The talent rolls come after: a creature with none yet only rolls the slot level 15 opens.
      expect(count(ctx.sql, 'creature_talents', 'slot IS NOT NULL')).toBe(1);
      expect(count(ctx.sql, 'creature_talents')).toBe(1);
      ctx.core.migrate();
      expect(creatureRows(ctx, p.id)[0]?.level).toBe(15);
      expect(getBalance(ctx.sql, p.id, 'bait')).toBe(705);
      return Promise.resolve();
    });
  });

  it('leaves a player pending whole when their conversion fails, converts the others and retries later', async () => {
    await runCore(nextGuild(), (ctx) => {
      const bad = seedPlayer(ctx, 1, { creatures: 1, species: ['tidewing'] });
      const good = seedPlayer(ctx, 2, { creatures: 1, species: ['tidewing'] });
      setLevel(ctx, bad.creatureIds[0] as string, 20);
      setLevel(ctx, good.creatureIds[0] as string, 20);
      // The update of the bad player's creature aborts, after the refund would have been worked out.
      ctx.sql.exec(
        `CREATE TRIGGER boom BEFORE UPDATE ON creatures WHEN NEW.id = '${bad.creatureIds[0] as string}'
         BEGIN SELECT RAISE(ABORT, 'boom'); END`,
      );
      dropList(ctx);
      expect(reset(ctx)).toBe(1);
      expect(creatureRows(ctx, bad.id)[0]?.level).toBe(20);
      expect(getBalance(ctx.sql, bad.id, 'bait')).toBe(0);
      expect(count(ctx.sql, 'ledger', `user_id = '${bad.id}' AND source = 'level_reset'`)).toBe(0);
      expect(creatureRows(ctx, good.id)[0]?.level).toBe(10);
      expect(count(ctx.sql, 'level_reset', 'converted_at IS NULL')).toBe(1);
      // Fixed: the next start converts them, once.
      ctx.sql.exec('DROP TRIGGER boom');
      expect(reset(ctx)).toBe(1);
      expect(creatureRows(ctx, bad.id)[0]?.level).toBe(10);
      expect(getBalance(ctx.sql, bad.id, 'bait')).toBe(levelResetRefund(20));
      expect(reset(ctx)).toBe(0);
      return Promise.resolve();
    });
  });
});

describe('order with the gear conversion', () => {
  function legacyWorn(ctx: CoreContext): { userId: string; creatureId: string } {
    const p = seedPlayer(ctx, 1, { creatures: 1, species: ['pyrelynx'] });
    const creatureId = p.creatureIds[0] as string;
    setLevel(ctx, creatureId, 20); // -> 10: the Charm slot (13) is closed at the new level
    ctx.sql.exec(
      `INSERT INTO gear_legacy (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on, source, created_at)
       VALUES ('legacy-charm', ?, 'quick-trinket', 'epic', 0, '{}', NULL, ?, 'test', 1)`,
      p.id,
      creatureId,
    );
    ctx.sql.exec('INSERT OR IGNORE INTO gear_conversion (user_id) VALUES (?)', p.id);
    return { userId: p.id, creatureId };
  }
  const gear = (ctx: CoreContext) =>
    convertPendingGear({
      storage: ctx.storage,
      now: () => ctx.clock.t,
      rng: createSeededRng('order'),
    });

  it('gear first: the item is worn at the old level, then taken off by the reset', async () => {
    await runCore(nextGuild(), (ctx) => {
      const { creatureId } = legacyWorn(ctx);
      dropList(ctx);
      expect(gear(ctx)).toBe(1);
      expect(wornOn(ctx, 'legacy-charm')).toBe(creatureId);
      reset(ctx);
      expect(
        creatureRows(
          ctx,
          rows<{ user_id: string }>(ctx.sql, 'SELECT user_id FROM creatures')[0]?.user_id as string,
        )[0]?.level,
      ).toBe(10);
      expect(wornOn(ctx, 'legacy-charm')).toBeNull();
      expect(count(ctx.sql, 'gear_items')).toBe(1);
      return Promise.resolve();
    });
  });

  it('reset first: the gear conversion reads the halved level and never puts the item on', async () => {
    await runCore(nextGuild(), (ctx) => {
      legacyWorn(ctx);
      dropList(ctx);
      reset(ctx);
      expect(gear(ctx)).toBe(1);
      expect(count(ctx.sql, 'gear_items')).toBe(1);
      expect(wornOn(ctx, 'legacy-charm')).toBeNull();
      return Promise.resolve();
    });
  });
});

describe('the card and the state', () => {
  it('shows the notice in the state until it is dismissed, once, over the API', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 1, species: ['tidewing'] });
      setLevel(ctx, p.creatureIds[0] as string, 30);
      expect(ctx.core.collection.state(p.id).levelReset).toBeNull();
      dropList(ctx);
      ctx.core.migrate();
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const state = await (
        await ctx.request(secret, '/api/state')
      ).json<{
        levelReset: LevelResetNotice | null;
      }>();
      expect(state.levelReset).toEqual({
        creatures: 1,
        bait: 705,
        unequipped: 0,
        talentsToBook: 0,
      });

      const bad = await ctx.request(secret, '/api/level-reset/dismiss', 'POST', { extra: 1 });
      expect(bad.status).toBe(400);
      const ok = await ctx.request(secret, '/api/level-reset/dismiss', 'POST', {});
      expect(ok.status).toBe(200);
      expect((await ok.json<{ state: { levelReset: unknown } }>()).state.levelReset).toBeNull();
      // Dismissing again changes nothing, and the Bait stays.
      expect((await ctx.request(secret, '/api/level-reset/dismiss', 'POST', {})).status).toBe(200);
      expect(getBalance(ctx.sql, p.id, 'bait')).toBe(705);
      // The balance shown in the state agrees.
      expect(ctx.core.collection.state(p.id).balances.bait).toBe(705);
    });
  });

  it('writes one analytics event with counts only', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 2, species: ['tidewing', 'pyrelynx'] });
      setLevel(ctx, p.creatureIds[0] as string, 30);
      setLevel(ctx, p.creatureIds[1] as string, 12);
      dropList(ctx);
      ctx.core.migrate();
      const events = rows<{ kind: string; props_json: string }>(
        ctx.sql,
        "SELECT kind, props_json FROM analytics_events WHERE kind = 'level_reset'",
      );
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0]?.props_json ?? '{}')).toEqual({
        creatures: 2,
        levels: 15 + 6,
        bait: 705 + 120,
        unequipped: 0,
        talentsToBook: 0,
      });
      expect(events[0]?.props_json).not.toContain(p.id);
      return Promise.resolve();
    });
  });
});
