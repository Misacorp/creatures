import { SCHEMA_VERSION } from '../src/migrations';
import {
  RULES,
  applyGear,
  content,
  createSeededRng,
  effectiveStats,
  foldTalent,
  talentValue,
  slotsOpen,
  talentDef,
  talentPool,
  type Rng,
} from '@creatures/game';
import { simulateFight } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { wearerOf } from '../src/gear-store';
import { gearRulesOf } from '../src/gear-worn';
import { loadCreatures } from '../src/raid-teams';
import { activeTalentsOf, bookOf, holdTalent, rollMissingTalents } from '../src/talent-store';
import { runCore, undoCreaturesAMigration, type CoreContext } from './helpers';
import {
  HELSINKI,
  W02,
  count,
  forcePool,
  nextGuild,
  rows,
  runRaid,
  joinRaid,
  seedPlayer,
  storedRuns,
} from './raid-helpers';
import { setCreature } from './kit';

/** A seeded RNG that counts what it hands out. */
function counting(seed: string): Rng & { drawn: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    nextU32() {
      n++;
      return inner.nextU32();
    },
    drawn: () => n,
  };
}

const speciesRow = (ctx: CoreContext, id: string) => {
  const row = rows<{ species: string; level: number; fusion_count: number }>(
    ctx.sql,
    'SELECT species, level, fusion_count FROM creatures WHERE id = ?',
    id,
  )[0] as { species: string; level: number; fusion_count: number };
  const species = content.creatures.find((c) => c.id === row.species);
  if (species === undefined) throw new Error('species');
  return { row, species };
};

describe('rollMissingTalents (existing creatures, once, on the first load after migration 28)', () => {
  const seed = (ctx: CoreContext) => {
    const p = seedPlayer(ctx, 1, {
      level: 8,
      species: ['splashet', 'cindle', 'solmane', 'coralynx'],
      creatures: 4,
    });
    ctx.sql.exec("UPDATE creatures SET level = 25 WHERE species = 'coralynx'");
    return p;
  };

  it('rolls one talent for each open slot, never the same one twice, with the rng it is given', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seed(ctx);
      const rng = counting('backfill');
      const rolled = rollMissingTalents(ctx.storage, rng, ctx.clock.t);
      expect(rolled).toBe(4);
      expect(rng.drawn()).toBeGreaterThan(0);
      for (const id of p.creatureIds) {
        const { row, species } = speciesRow(ctx, id);
        const book = bookOf(ctx.sql, id);
        const slots = Math.max(1, slotsOpen(species.rarity, row.level));
        expect(book).toHaveLength(slots);
        expect(book.map((b) => b.slot).sort()).toEqual(
          Array.from({ length: slots }, (_, i) => i + 1),
        );
        // Distinct, and from the line's pool.
        expect(new Set(book.map((b) => b.talentId)).size).toBe(slots);
        const pool = new Set(talentPool(species.line).map((t) => t.id));
        for (const held of book) expect(pool.has(held.talentId)).toBe(true);
      }
      // The three-slot rare got three.
      const coralynx = p.creatureIds[3] as string;
      expect(bookOf(ctx.sql, coralynx)).toHaveLength(3);
      return Promise.resolve();
    });
  });

  it('is idempotent: a second call changes and draws nothing', async () => {
    await runCore(nextGuild(), (ctx) => {
      seed(ctx);
      rollMissingTalents(ctx.storage, counting('first'), ctx.clock.t);
      const before = rows(ctx.sql, 'SELECT * FROM creature_talents ORDER BY creature_id, slot');
      const rng = counting('second');
      expect(rollMissingTalents(ctx.storage, rng, ctx.clock.t + 1000)).toBe(0);
      expect(rng.drawn()).toBe(0);
      expect(rows(ctx.sql, 'SELECT * FROM creature_talents ORDER BY creature_id, slot')).toEqual(
        before,
      );
      return Promise.resolve();
    });
  });

  it('leaves a creature that already has talents alone, and one of an unknown species', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seed(ctx);
      const [splashet] = p.creatureIds as [string];
      holdTalent(ctx.sql, splashet, { talentId: 'playful', golden: false }, 1, ctx.clock.t);
      ctx.sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
         VALUES ('ghost', ?, 'ghost', 'ghost', 3, 'test', 1)`,
        p.id,
      );
      expect(rollMissingTalents(ctx.storage, counting('x'), ctx.clock.t)).toBe(4);
      expect(bookOf(ctx.sql, splashet)).toEqual([{ talentId: 'playful', golden: false, slot: 1 }]);
      expect(bookOf(ctx.sql, 'ghost')).toEqual([]);
      return Promise.resolve();
    });
  });

  it('is live randomness: different streams give different talents, roughly one in twenty golden', async () => {
    await runCore(nextGuild(), (ctx) => {
      for (let n = 1; n <= 20; n++)
        seedPlayer(ctx, n, { level: 8, species: ['splashet', 'cindle', 'sproutle'] });
      rollMissingTalents(ctx.storage, createSeededRng('stream-a'), ctx.clock.t);
      const a = rows<{ creature_id: string; talent_id: string; golden: number }>(
        ctx.sql,
        'SELECT creature_id, talent_id, golden FROM creature_talents ORDER BY creature_id',
      );
      expect(a).toHaveLength(60);
      // More than one talent shows up on one line, so it is not a fixed assignment.
      const splashets = rows<{ talent_id: string }>(
        ctx.sql,
        `SELECT t.talent_id FROM creature_talents t JOIN creatures c ON c.id = t.creature_id
         WHERE c.species = 'splashet'`,
      );
      expect(new Set(splashets.map((r) => r.talent_id)).size).toBeGreaterThan(2);
      const golden = a.filter((r) => r.golden === 1).length;
      expect(golden).toBeLessThan(15);
      return Promise.resolve();
    });
    // The same stream twice gives the same result (seeded streams are for tests).
    const run = (streamSeed: string) =>
      runCore(nextGuild(), (ctx) => {
        const p = seedPlayer(ctx, 1, { level: 8, species: ['splashet', 'cindle', 'sproutle'] });
        rollMissingTalents(ctx.storage, createSeededRng(streamSeed), ctx.clock.t);
        return Promise.resolve(p.creatureIds.map((id) => bookOf(ctx.sql, id)));
      });
    expect(await run('same')).toEqual(await run('same'));
  });

  it('rolls once when the Durable Object loads a database from before migration 28', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const p = seedPlayer(ctx, 1, { level: 8, species: ['splashet', 'cindle'], creatures: 2 });
        ctx.sql.exec(
          `INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, fusion_count, bait, first_on_server, created_at, talent_json)
           VALUES ('w1', ?, 'splashet', 'duplicate', NULL, NULL, 0, 1, NULL)`,
          p.id,
        );
        undoCreaturesAMigration(ctx.sql);
        expect(
          rows(ctx.sql, "SELECT name FROM sqlite_master WHERE name = 'creature_talents'"),
        ).toEqual([]);
        // The old table: one creature per line.
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
             VALUES ('dup', ?, 'splashet', 'splashet', 1, 'test', 1)`,
            p.id,
          ),
        ).toThrow();
        const ids = rows<{ id: string }>(ctx.sql, 'SELECT id FROM creatures ORDER BY rowid').map(
          (r) => r.id,
        );
        ctx.core.migrate();
        expect(
          rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
        ).toBe(SCHEMA_VERSION);
        // Same creatures, same ids and order, all in slot 1 of their line; each has its first talent.
        expect(
          rows<{ id: string }>(ctx.sql, 'SELECT id FROM creatures ORDER BY rowid').map((r) => r.id),
        ).toEqual(ids);
        expect(rows(ctx.sql, 'SELECT line_slot FROM creatures')).toEqual([
          { line_slot: 1 },
          { line_slot: 1 },
        ]);
        for (const id of ids) expect(bookOf(ctx.sql, id)).toHaveLength(1);
        const taken = rows<{ talent_id: string }>(
          ctx.sql,
          'SELECT talent_id FROM creature_talents',
        );
        expect(taken).toHaveLength(2);
        // The Festival grant of the old schema survived, and 'duplicate' is now a valid outcome.
        expect(count(ctx.sql, 'raid_festival_grants')).toBe(1);
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO raid_festival_grants (week_id, user_id, species, outcome, created_at)
             VALUES ('w2', ?, 'splashet', 'duplicate', 1)`,
            p.id,
          ),
        ).not.toThrow();
        // Running everything again changes nothing.
        const before = rows(ctx.sql, 'SELECT * FROM creature_talents ORDER BY creature_id');
        ctx.core.migrate();
        expect(rows(ctx.sql, 'SELECT * FROM creature_talents ORDER BY creature_id')).toEqual(
          before,
        );
        expect(count(ctx.sql, 'schema_version')).toBe(SCHEMA_VERSION);
        return Promise.resolve();
      },
      { talentRng: createSeededRng('migration-talents') },
    );
  });

  it('keeps the table limits: two creatures per line at most, three slots, one talent per slot', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { level: 8, species: ['splashet'], creatures: 1 });
      const insert = (id: string, slot: number) =>
        ctx.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at, line_slot)
           VALUES (?, ?, 'splashet', 'splashet', 1, 'test', 1, ?)`,
          id,
          p.id,
          slot,
        );
      expect(() => insert('a', 1)).toThrow();
      expect(() => insert('b', 3)).toThrow();
      expect(() => insert('c', 2)).not.toThrow();
      expect(() => insert('d', 2)).toThrow();
      const [id] = p.creatureIds as [string];
      holdTalent(ctx.sql, id, { talentId: 'playful', golden: false }, 1, 1);
      expect(() =>
        ctx.sql.exec(
          "INSERT INTO creature_talents (creature_id, talent_id, golden, slot, gained_at) VALUES (?, 'x', 0, 1, 1)",
          id,
        ),
      ).toThrow();
      expect(() =>
        ctx.sql.exec(
          "INSERT INTO creature_talents (creature_id, talent_id, golden, slot, gained_at) VALUES (?, 'y', 0, 4, 1)",
          id,
        ),
      ).toThrow();
      // The same talent can sit in the book plain and golden, but not twice at one quality.
      expect(holdTalent(ctx.sql, id, { talentId: 'playful', golden: true }, null, 1)).toBe(true);
      expect(holdTalent(ctx.sql, id, { talentId: 'playful', golden: true }, null, 2)).toBe(false);
      return Promise.resolve();
    });
  });
});

describe('talents in the numbers a creature fights and trips with', () => {
  /** What the fold must give a creature of `species`: the same function the worker and the sim use. */
  const expected = (ctx: CoreContext, id: string, talents: { id: string; golden: boolean }[]) => {
    const { row, species } = speciesRow(ctx, id);
    return applyGear(
      effectiveStats(species, row.level, row.fusion_count),
      species.crit,
      wearerOf(species),
      [],
      talents.map((t) =>
        foldTalent(talentDef(t.id) as NonNullable<ReturnType<typeof talentDef>>, t.golden),
      ),
    );
  };

  it('folds the active talents into the creature a raid or dungeon reads, and not a closed slot', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, {
        level: 12,
        species: ['splashet', 'cindle', 'solmane', 'sproutle'],
        creatures: 4,
      });
      const [splashet, cindle, solmane, sproutle] = p.creatureIds as [
        string,
        string,
        string,
        string,
      ];
      holdTalent(ctx.sql, splashet, { talentId: 'playful', golden: false }, 1, 1);
      holdTalent(ctx.sql, cindle, { talentId: 'quick-to-pounce', golden: true }, 1, 1);
      // Slot 2 holds a talent but a level 12 creature has not opened it: it does nothing.
      holdTalent(ctx.sql, sproutle, { talentId: 'stands-close', golden: false }, 1, 1);
      holdTalent(ctx.sql, sproutle, { talentId: 'mossy-bed', golden: false }, 2, 1);
      const team = new Map(loadCreatures(ctx.sql, p.id).map((c) => [c.id, c]));

      const plain = effectiveStats(
        content.creatures.find((c) => c.id === 'splashet') as NonNullable<unknown> as never,
        12,
        0,
      );
      expect(team.get(splashet)?.stats).toEqual(
        expected(ctx, splashet, [{ id: 'playful', golden: false }]).stats,
      );
      expect((team.get(splashet)?.stats.atk ?? 0) > plain.atk).toBe(true);
      expect(team.get(cindle)?.mods).toEqual(
        expected(ctx, cindle, [{ id: 'quick-to-pounce', golden: true }]).mods,
      );
      expect(team.get(cindle)?.mods).toBeDefined();
      expect(team.get(sproutle)?.mods).toEqual(
        expected(ctx, sproutle, [{ id: 'stands-close', golden: false }]).mods,
      );
      expect(team.get(sproutle)?.stats).toEqual(
        expected(ctx, sproutle, [{ id: 'stands-close', golden: false }]).stats,
      );
      // An epic's signature talent is active with no slot at all.
      expect(team.get(solmane)?.mods).toEqual(
        expected(ctx, solmane, [{ id: 'lights-up-a-room', golden: false }]).mods,
      );
      expect(team.get(solmane)?.mods).toBeDefined();
      return Promise.resolve();
    });
  });

  it('a golden talent is stronger than the plain one by the golden factor', () => {
    const def = talentDef('playful');
    if (def === undefined) throw new Error('playful');
    // 1.5 times, in whole percent: +6% becomes +9%.
    expect(talentValue(def, false)).toBe(600);
    expect(talentValue(def, true)).toBe(900);
    expect(RULES.talents.goldenBp).toBe(15_000);
  });

  it('opens a slot when the creature reaches its level', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { level: 19, species: ['tidewing'], creatures: 1 });
      const [id] = p.creatureIds as [string];
      holdTalent(ctx.sql, id, { talentId: 'playful', golden: false }, 1, 1);
      holdTalent(ctx.sql, id, { talentId: 'splashes-first', golden: false }, 2, 1);
      const active = (level: number) => {
        setCreature(ctx, id, { level });
        return activeTalentsOf(ctx.sql, { id, species: 'tidewing', level }).length;
      };
      expect(active(19)).toBe(1);
      expect(active(20)).toBe(2);
      return Promise.resolve();
    });
  });

  it('gives the trip and Workshop rules of a creature: Glimmer finds and Speed', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, {
        level: 8,
        species: ['splashet', 'zipmouse', 'cindle'],
        creatures: 3,
      });
      const [splashet, zipmouse, cindle] = p.creatureIds as [string, string, string];
      holdTalent(ctx.sql, splashet, { talentId: 'easily-distracted', golden: false }, 1, 1);
      holdTalent(ctx.sql, zipmouse, { talentId: 'zoomies', golden: false }, 1, 1);
      holdTalent(ctx.sql, cindle, { talentId: 'purrs-like-a-campfire', golden: true }, 1, 1);
      const rules = (id: string, species: string) =>
        gearRulesOf(ctx.sql, { id, species, level: 8 });
      expect(rules(splashet, 'splashet').glimmerFindBp).toBe(talentDef('easily-distracted')?.value);
      expect(rules(cindle, 'cindle').glimmerFindBp).toBe(0);
      expect(rules(cindle, 'cindle').busyPawsBp).toBe(1000);
      // Speed folds into the creature's own Speed.
      const base = effectiveStats(
        content.creatures.find((c) => c.id === 'zipmouse') as never,
        8,
        0,
      );
      const folded = loadCreatures(ctx.sql, p.id).find((c) => c.id === zipmouse);
      expect((folded?.stats.spd ?? 0) > base.spd).toBe(true);
      return Promise.resolve();
    });
  });

  it('stores talent stats and mods in a raid fight input, and the fight replays exactly from it', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 4 }, (_, i) =>
        seedPlayer(ctx, i + 1, { level: 12, species: ['splashet', 'cindle', 'sproutle'] }),
      );
      joinRaid(ctx, players);
      const [a] = players as [(typeof players)[number]];
      const [splashet, cindle] = a.creatureIds as [string, string, string];
      holdTalent(ctx.sql, splashet, { talentId: 'playful', golden: false }, 1, 1);
      holdTalent(ctx.sql, cindle, { talentId: 'quick-to-pounce', golden: false }, 1, 1);
      // What the fold gives them at the level they fight at (the stages pay experience afterwards).
      const wantSplashet = expected(ctx, splashet, [{ id: 'playful', golden: false }]);
      const wantCindle = expected(ctx, cindle, [{ id: 'quick-to-pounce', golden: false }]);
      forcePool(ctx.sql, 50_000_000);
      ctx.clock.t = W02.afterFinale;
      ctx.core.raid.runDue(HELSINKI);
      const runs = storedRuns(ctx.sql);
      expect(runs.length).toBeGreaterThan(0);
      const slotOf = (id: string) => runs[0]?.input.row.find((s) => s.id === id);
      expect(slotOf(splashet)?.stats).toEqual(wantSplashet.stats);
      expect(slotOf(cindle)?.mods).toEqual(wantCindle.mods);
      for (const run of runs) {
        expect(simulateFight(run.input, createSeededRng(run.seed))).toEqual(run.result);
      }
      // Changing the talents afterwards never touches a stored fight.
      const before = storedRuns(ctx.sql);
      ctx.sql.exec('DELETE FROM creature_talents WHERE creature_id = ?', splashet);
      expect(storedRuns(ctx.sql)).toEqual(before);
    });
  });

  it('shows the talent-folded stats on the creature card (statsWithGear)', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = seedPlayer(ctx, 1, { level: 8, species: ['splashet'], creatures: 1 });
      const [id] = p.creatureIds as [string];
      holdTalent(ctx.sql, id, { talentId: 'playful', golden: true }, 1, 1);
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const res = await ctx.request(secret, '/api/state');
      const body = await res.json<{
        creatures: { stats: { atk: number }; statsWithGear: { atk: number } }[];
      }>();
      expect(body.creatures[0]?.statsWithGear.atk).toBeGreaterThan(
        body.creatures[0]?.stats.atk ?? 0,
      );
      expect(body.creatures[0]?.statsWithGear.atk).toBe(
        expected(ctx, id, [{ id: 'playful', golden: true }]).stats.atk,
      );
    });
  });
});
