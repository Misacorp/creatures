import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { SettlersRecordSchema } from '../../src/reset/record-schema';
import { buildSettlersRecord, hmacHex } from '../../src/reset/settlers-record';
import { HELSINKI, nextGuild } from '../raid-helpers';
import { runCore } from '../helpers';
import { ANN, BOB, BOT, CY, HOSTILE, KEY, seedWorld } from './world';

const build = (ctx: Parameters<typeof seedWorld>[0] & { sql: SqlStorage }) =>
  buildSettlersRecord(ctx.sql, { tz: HELSINKI, now: ctx.clock.t, hmacKey: KEY });

describe('the settlers record', () => {
  it('records each settler, the creatures and the eight feats, read the way the plan says', async () => {
    await runCore(nextGuild(), async (ctx) => {
      seedWorld(ctx);
      const record = await build(ctx);
      expect(v.safeParse(SettlersRecordSchema, record).success).toBe(true);
      // The bot is not a settler; the others are in the order they first played.
      expect(record.settlers.map((s) => s.name)).toEqual(['Ann', 'Bob', 'Cy']);
      const [ann, bob, cy] = record.settlers;
      if (ann === undefined || bob === undefined || cy === undefined) throw new Error('settlers');

      expect(ann.firstPlayedDay).toBe('2026-12-16');
      expect(ann.creatures.map((c) => c.nickname ?? c.speciesName)).toEqual([
        'Pebbles',
        HOSTILE,
        'Zipmouse',
        'Splashet',
      ]);
      // The creatures are as stored: current form, line, level, shiny, how it came, the day, no note.
      expect(ann.creatures[0]).toMatchObject({
        species: 'pyrelynx',
        line: 'cindle',
        level: 20,
        shiny: false,
        origin: 'trip',
        caughtDay: '2026-12-26',
      });
      expect(ann.creatures[1]).toMatchObject({ shiny: true, origin: 'trip' });
      expect(ann.creatures.at(-1)).toMatchObject({ origin: 'starter' });
      expect(JSON.stringify(record)).not.toContain('private note');
      expect(bob.creatures.find((c) => c.species === 'zipmouse')?.origin).toBe('festival');

      expect(ann.feats).toEqual({
        deepestDepth: 18, // the cleared run, not the deeper one that was lost
        // Named by the line's first form (the cindle is a Pyrelynx now), starters not counted, a tie shared (zipmouse).
        firsts: ['Cindle', 'Sproutle', 'Zipmouse'],
        blueprints: 2,
        creatures: 4,
        highestLevel: {
          creature: { species: 'pyrelynx', speciesName: 'Pyrelynx', nickname: 'Pebbles' },
          level: 20,
        },
        totalLevels: 3 + 20 + 12 + 9,
        bestCrafter: {
          creature: { species: 'pyrelynx', speciesName: 'Pyrelynx', nickname: 'Pebbles' },
          level: 1,
        },
        bestExplorer: {
          creature: { species: 'pyrelynx', speciesName: 'Pyrelynx', nickname: 'Pebbles' },
          rank: expect.any(Number) as number,
        },
      });
      expect(ann.feats.bestExplorer?.rank).toBeGreaterThan(1);
      expect(bob.feats.deepestDepth).toBe(7);
      expect(bob.feats.firsts).toEqual(['Ashmole', 'Zipmouse']);
      expect(bob.feats.bestCrafter?.level).toBeGreaterThan(1);
      expect(bob.feats.bestCrafter?.creature.nickname).toBe('Ember');
      expect(bob.feats.bestExplorer).toBeNull();
      expect(bob.feats.highestLevel?.level).toBe(31);
      // A settler with only a dev-tool creature: nothing is first, no depth, no blueprints.
      expect(cy.feats).toMatchObject({
        deepestDepth: null,
        firsts: [],
        blueprints: 0,
        creatures: 1,
        bestCrafter: null,
        bestExplorer: null,
      });
    });
  });

  it('keeps no Discord ids or server ids; random ids and keyed hashes instead', async () => {
    await runCore(nextGuild(), async (ctx) => {
      seedWorld(ctx);
      ctx.sql.exec('INSERT OR REPLACE INTO guild_meta (id, guild_id) VALUES (1, ?)', ctx.guildId);
      const record = await build(ctx);
      const text = JSON.stringify(record);
      for (const id of [ANN, BOB, CY, BOT, ctx.guildId]) expect(text).not.toContain(id);
      const again = await build(ctx);
      const ids = record.settlers.map((s) => s.id);
      // Random every time (live), unique, and not the hash.
      expect(new Set(ids).size).toBe(3);
      expect(again.settlers.map((s) => s.id)).not.toEqual(ids);
      expect(again.archiveKey).not.toBe(record.archiveKey);
      // The hash is stable under the key, differs under another key, and is the HMAC of the Discord id.
      expect(record.settlers.map((s) => s.idHash)).toEqual(again.settlers.map((s) => s.idHash));
      expect(record.settlers[0]?.idHash).toBe(await hmacHex(KEY, ANN));
      expect(await hmacHex('another-key-another-key-1', ANN)).not.toBe(await hmacHex(KEY, ANN));
      expect(new Set(record.settlers.map((s) => s.idHash)).size).toBe(3);
      await expect(hmacHex('short', ANN)).rejects.toThrow();
    });
  });

  it('cuts a display name to 32 characters and keeps text as stored', async () => {
    await runCore(nextGuild(), async (ctx) => {
      seedWorld(ctx);
      const long = `\u{1F600}${'x'.repeat(60)}`;
      ctx.sql.exec('UPDATE players SET display_name = ? WHERE user_id = ?', long, ANN);
      const record = await build(ctx);
      expect(Array.from(record.settlers[0]?.name ?? '')).toHaveLength(32);
      expect(record.settlers[0]?.creatures.some((c) => c.nickname === HOSTILE)).toBe(true);
    });
  });

  it('writes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      seedWorld(ctx);
      const before = ctx.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n;
      await build(ctx);
      expect(ctx.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n).toBe(before);
    });
  });

  it('gives a tie for the highest level to the earliest caught creature', async () => {
    await runCore(nextGuild(), async (ctx) => {
      seedWorld(ctx);
      // Ann's sproutle (caught later) reaches the same level as Pebbles: Pebbles was caught first.
      ctx.sql.exec(
        "UPDATE creatures SET level = 20 WHERE user_id = ? AND species = 'sproutle'",
        ANN,
      );
      const record = await build(ctx);
      expect(record.settlers[0]?.feats.highestLevel?.creature.nickname).toBe('Pebbles');
    });
  });
});
