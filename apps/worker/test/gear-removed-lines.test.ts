import { createSeededRng, gearLine, linePool, gearBase, specialLinesOf } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { normaliseGearRows } from '../src/gear-normalise';
import { parseLines } from '../src/gear-store';
import { giveItem } from './gear-helpers';
import { runCore } from './helpers';
import { nextGuild, rows, seedPlayer } from './raid-helpers';

/**
 * Lines the content removed (Warm heart, Second breath, Opening mark, Lingering; Misa 2026-11-06) on items players already own:
 * the start-up normalisation replaces each with a fresh random roll of the item's own pool (CLAUDE.md, "Content changes are not
 * held back by what players already own"). Items keep their id, worn state, level, rarity and the lines that still exist.
 */

const REMOVED = ['warm-heart', 'second-breath', 'opening-mark', 'lingering'];

const storedLines = (sql: SqlStorage, id: string): { id: string; tier: number }[] =>
  JSON.parse(
    rows<{ lines_json: string }>(sql, 'SELECT lines_json FROM gear_items WHERE id = ?', id)[0]
      ?.lines_json ?? '[]',
  ) as { id: string; tier: number }[];

/** Writes lines straight into a row, as an item rolled before the removal holds them (the content can no longer build it). */
const setLines = (sql: SqlStorage, id: string, lines: { id: string; tier: number }[]): void => {
  sql.exec('UPDATE gear_items SET lines_json = ? WHERE id = ?', JSON.stringify(lines), id);
};

describe('items that hold a removed line', () => {
  it('replaces each removed line with a fresh roll of the item pool, and keeps the rest and the wearer', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { level: 12 });
      const creature = p.creatureIds[0] as string;
      const charm = giveItem(ctx.sql, p.id, 'trail-charm', {
        rarity: 'epic',
        level: 20,
        lines: [],
      });
      ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creature, charm);
      setLines(ctx.sql, charm, [
        { id: 'cover', tier: 2 },
        { id: 'warm-heart', tier: 3 },
        { id: 'lingering', tier: 0 },
      ]);
      const report = normaliseGearRows(ctx.storage, createSeededRng('removed-lines'));
      expect(report.items).toBe(1);
      const after = storedLines(ctx.sql, charm);
      expect(after).toHaveLength(3);
      expect(after[0]).toEqual({ id: 'cover', tier: 2 });
      for (const line of after) {
        expect(gearLine(line.id), line.id).toBeDefined();
        expect(REMOVED).not.toContain(line.id);
      }
      expect(new Set(after.map((l) => l.id)).size).toBe(3);
      // At most one special line, as `rollLines` keeps.
      expect(specialLinesOf(after).length).toBeLessThanOrEqual(1);
      // Every new line is one the item's pool can roll.
      const base = gearBase('trail-charm');
      const pool = linePool(base as NonNullable<typeof base>, 'epic', 20).map((x) => x.line.id);
      for (const line of after.slice(1)) expect(pool).toContain(line.id);
      // The item is still worn, with its level and rarity.
      const row = rows<{ equipped_on: string; item_level: number; rarity: string }>(
        ctx.sql,
        'SELECT equipped_on, item_level, rarity FROM gear_items WHERE id = ?',
        charm,
      )[0];
      expect(row).toEqual({ equipped_on: creature, item_level: 20, rarity: 'epic' });
      // A second run changes nothing: the lines are all current now.
      expect(normaliseGearRows(ctx.storage, createSeededRng('again'))).toEqual({
        items: 0,
        jobs: 0,
        grants: 0,
        unreadable: 0,
      });
      expect(storedLines(ctx.sql, charm)).toEqual(after);
    });
  });

  it('is a function of the draw: another stream gives another roll', async () => {
    const roll = async (seed: string): Promise<string> => {
      let out = '';
      await runCore(nextGuild(), (ctx) => {
        const p = seedPlayer(ctx, 1, { level: 12 });
        const hat = giveItem(ctx.sql, p.id, 'trail-cap', { rarity: 'epic', level: 20, lines: [] });
        setLines(ctx.sql, hat, [
          { id: 'second-breath', tier: 1 },
          { id: 'opening-mark', tier: 0 },
        ]);
        normaliseGearRows(ctx.storage, createSeededRng(seed));
        out = JSON.stringify(storedLines(ctx.sql, hat));
      });
      return out;
    };
    const seen = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) seen.add(await roll(seed));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('without a random source the removed line is only dropped, and a read never sees it', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { level: 12 });
      const hat = giveItem(ctx.sql, p.id, 'trail-cap', { rarity: 'rare', level: 10, lines: [] });
      setLines(ctx.sql, hat, [
        { id: 'opening-mark', tier: 0 },
        { id: 'crit-damage', tier: 1 },
      ]);
      expect(parseLines(JSON.stringify(storedLines(ctx.sql, hat)))).toEqual([
        { id: 'crit-damage', tier: 1 },
      ]);
      normaliseGearRows(ctx.storage);
      expect(storedLines(ctx.sql, hat)).toEqual([{ id: 'crit-damage', tier: 1 }]);
    });
  });
});
