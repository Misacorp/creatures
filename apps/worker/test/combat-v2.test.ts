/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument --
   Response bodies are read loosely on purpose (`Json.body` is `any`): typing each would repeat the server's views. */
/**
 * Combat v2 storage (docs/design/combat/integration.md, slice 2): the COMBAT_V2 flag, the saved Knack, the v2
 * Talent Book (R20) with its learn and slot routes, a role change's replacements (R20.8), the staging
 * conversion tool and the two analytics events.
 */
import { env } from 'cloudflare:workers';
import {
  RULES,
  content,
  gearContent,
  slotOpensAt,
  slotsOpen,
  type CreatureSpecies,
  type Rng,
} from '@creatures/game';
import { combatV2, knownKnacks } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { canonicalDims } from '../src/analytics-rollup';
import { propsOf } from '../src/analytics-props';
import { knackLocked, statsV2Of, talentsLocked } from '../src/creature-v2';
import { fightNumbers, fighterV2 } from '../src/fighter-v2';
import { fighterOf, loadV2Creatures } from '../src/raid-v2-fighters';
import { equippedByCreature } from '../src/gear-store';
import { giveItem } from './gear-helpers';
import { formStats } from '@creatures/engine/v2';
import { createHandler } from '../src/index';
import { loadCreatures, loadCreaturesById } from '../src/raid-teams';
import { grantFirstTalent, learnedOf, lineBook, recordFound } from '../src/talent-v2-store';
import wranglerText from '../wrangler.jsonc?raw';
import { ON, player as devPlayer, type Json } from './dev-helpers';
import { ORIGIN, callHandler, runCore, undoKnackMigration, type CoreContext } from './helpers';
import { give, newKey, sessionCaller, setCreature } from './kit';
import { weekIdFor } from '../src/raid-schedule';
import { HELSINKI, count, nextGuild, rows, scriptedThenSeeded, seedPlayer } from './raid-helpers';

const V2 = { combatV2: true } as const;

/** What a creature learned, by talent id (the order the store reads them in is by time, then id). */
const learnedSorted = (sql: SqlStorage, creatureId: string) =>
  [...learnedOf(sql, creatureId)].sort((a, b) => a.talentId.localeCompare(b.talentId));

function parseWrangler(): {
  vars: Record<string, string>;
  env: Record<string, { vars: Record<string, string> }>;
} {
  const json = wranglerText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(json) as ReturnType<typeof parseWrangler>;
}

describe('the COMBAT_V2 flag: configuration', () => {
  it('is off at the top level and in production, and on only in staging', () => {
    const config = parseWrangler();
    expect(config.vars['COMBAT_V2']).toBe('off');
    expect(config.env['production']?.vars['COMBAT_V2']).toBe('off');
    expect(config.env['staging']?.vars['COMBAT_V2']).toBe('on');
    // Whatever environments exist, the only one that has it on is staging.
    const on = Object.entries(config.env)
      .filter(([, e]) => e.vars['COMBAT_V2'] === 'on')
      .map(([name]) => name);
    expect(on).toEqual(['staging']);
  });

  it('is off in the environment the tests run in (the top level)', () => {
    expect(env.COMBAT_V2).toBe('off');
  });

  it('tells the client through /api/config only when on (absent, never false)', async () => {
    const handler = createHandler();
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const off = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect(Object.hasOwn(await off.json<Record<string, unknown>>(), 'combatV2')).toBe(false);
    const onEnv = { ...env, COMBAT_V2: 'on' } as Env;
    const on = await handler.fetch?.(new Request(`${ORIGIN}/api/config`), onEnv, ctx);
    expect(((await on?.json()) as Record<string, unknown>)['combatV2']).toBe(true);
    const other = { ...env, COMBAT_V2: 'true' } as Env;
    const odd = await handler.fetch?.(new Request(`${ORIGIN}/api/config`), other, ctx);
    expect(Object.hasOwn((await odd?.json()) as Record<string, unknown>, 'combatV2')).toBe(false);
  });
});

describe('migrations 50 and 51', () => {
  it('add the Knack column and the Talent Book tables, and can be redone', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 1, level: 5 });
      ctx.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', 'steady-mark', p.creatureIds[0]);
      undoKnackMigration(ctx.sql);
      expect(count(ctx.sql, "pragma_table_info('creatures')", "name = 'knack'")).toBe(0);
      expect(count(ctx.sql, 'sqlite_master', "name = 'line_talents'")).toBe(0);
      ctx.core.migrate();
      ctx.core.migrate();
      expect(count(ctx.sql, "pragma_table_info('creatures')", "name = 'knack'")).toBe(1);
      expect(count(ctx.sql, 'sqlite_master', "name = 'line_talents'")).toBe(1);
      expect(count(ctx.sql, 'sqlite_master', "name = 'creature_talents_v2'")).toBe(1);
      // The creature survived and has no Knack.
      expect(rows(ctx.sql, 'SELECT knack FROM creatures')).toEqual([{ knack: null }]);
      return Promise.resolve();
    });
  });

  it('keep a slot to one talent per creature and a talent once per creature', async () => {
    await runCore(nextGuild(), (ctx) => {
      const insert = (talent: string, slot: number | null) => () =>
        ctx.sql.exec(
          'INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, ?, ?, 1)',
          'c1',
          talent,
          slot,
        );
      insert('hardy', 1)();
      expect(insert('brace', 1)).toThrow();
      expect(insert('hardy', null)).toThrow();
      expect(insert('brace', 4)).toThrow();
      insert('brace', null)();
      insert('stubborn', null)();
      return Promise.resolve();
    });
  });
});

/** A player with seeded creatures, a session and a call function. */
async function seeded(ctx: CoreContext, species: string[], level = 8) {
  const s = seedPlayer(ctx, 1, { species, creatures: species.length, level });
  const { call } = await sessionCaller<Json['body']>(ctx, { id: s.id, displayName: s.name });
  return { id: s.id, ids: s.creatureIds, call };
}

const knackOf = (ctx: CoreContext, id: string) =>
  rows<{ knack: string | null }>(ctx.sql, 'SELECT knack FROM creatures WHERE id = ?', id)[0]?.knack;

const eventsOf = (ctx: CoreContext, kind: string) =>
  rows<{ props_json: string }>(
    ctx.sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

describe('the flag off', () => {
  it('has no Knack or Talent Book routes, and the state carries nothing of v2', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await seeded(ctx, ['splashet']);
      const id = p.ids[0];
      for (const [method, path, body] of [
        ['PUT', `/api/creatures/${id}/knack`, { knack: null }],
        [
          'POST',
          `/api/creatures/${id}/talents-v2/learn`,
          { talentId: 'hardy', idempotencyKey: newKey() },
        ],
        ['PUT', `/api/creatures/${id}/talents-v2/slot`, { talentId: 'hardy', slot: 1 }],
      ] as const) {
        expect(await p.call(method, path, body), path).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
      }
      const state = await p.call('GET', '/api/state');
      const creature = state.body.creatures[0];
      expect(creature).not.toHaveProperty('knack');
      expect(creature).not.toHaveProperty('knownKnacks');
      expect(creature).not.toHaveProperty('talentsV2');
      expect(creature).not.toHaveProperty('statsV2');
    });
  });

  it('rolls no v2 talent for a new creature', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, { id: '9001', displayName: 'A' });
      const res = await ctx.request(secret, '/api/starter', 'POST', {
        species: 'splashet',
        idempotencyKey: newKey(),
      });
      expect(res.status).toBe(200);
      expect(count(ctx.sql, 'line_talents')).toBe(0);
      expect(count(ctx.sql, 'creature_talents_v2')).toBe(0);
      expect(count(ctx.sql, 'creature_talents')).toBe(1);
    });
  });
});

describe('a creature caught or granted with the flag on', () => {
  it('rolls a v2 talent from its line pool into the line book, learned and slotted in slot 1', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, { id: '9001', displayName: 'A' });
        const res = await ctx.request(secret, '/api/starter', 'POST', {
          species: 'sproutle',
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        const body = await res.json<Json['body']>();
        const creature = body.state.creatures[0];
        // Today's talent still rolls, so v1 keeps working.
        expect(count(ctx.sql, 'creature_talents')).toBe(1);
        expect(creature.talents.slots[0].talent).not.toBeNull();
        // The v2 talent: in the line's book, learned and in slot 1.
        const book = rows<{ line: string; talent_id: string; golden: number }>(
          ctx.sql,
          'SELECT line, talent_id, golden FROM line_talents',
        );
        expect(book).toHaveLength(1);
        expect(book[0]?.line).toBe('sproutle');
        expect(combatV2.pools['sproutle']).toContain(book[0]?.talent_id);
        expect(learnedSorted(ctx.sql, creature.id)).toEqual([
          { talentId: book[0]?.talent_id, slot: 1 },
        ]);
        // The payload says so.
        expect(creature.talentsV2.slots[0].talent).toMatchObject({ id: book[0]?.talent_id });
        expect(creature.talentsV2.book).toEqual([
          expect.objectContaining({ id: book[0]?.talent_id, learned: true, slot: 1 }),
        ]);
        expect(creature.talentsV2.learnBait).toBe(RULES.talents.bookSlotBait);
      },
      V2,
    );
  });

  it('rolls golden with today’s chance (a scripted draw)', async () => {
    // Draws: v1 pick, v1 golden, v2 pick, v2 golden (0 is golden).
    await runCore(
      nextGuild(),
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, { id: '9001', displayName: 'A' });
        await ctx.request(secret, '/api/starter', 'POST', {
          species: 'sproutle',
          idempotencyKey: newKey(),
        });
        expect(rows(ctx.sql, 'SELECT talent_id, golden FROM line_talents')).toEqual([
          { talent_id: combatV2.pools['sproutle']?.[2], golden: 1 },
        ]);
      },
      { ...V2, talentRng: scriptedThenSeeded([0, 5, 2, 0]) },
    );
  });

  it('a duplicate catch records its talent in the book, whatever is done with the duplicate', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['sproutle']);
        grantFirstTalent(ctx.sql, scriptedThenSeeded([0, 5]), {
          creatureId: p.ids[0] as string,
          userId: p.id,
          line: 'sproutle',
          now: ctx.clock.t,
        });
        const first = lineBook(ctx.sql, p.id, 'sproutle');
        expect(first.map((e) => e.talentId)).toEqual([combatV2.pools['sproutle']?.[0]]);
        const added = ctx.storage.transactionSync(() =>
          ctx.core.collection.choices.addPending(
            p.id,
            { species: 'sproutle', shiny: false },
            { kind: 'expedition', id: newKey('trip') },
          ),
        );
        expect(added.id).toEqual(expect.any(String));
        // The duplicate's v2 talent (pool index 3, not golden) is in the book; no creature learned it.
        const book = lineBook(ctx.sql, p.id, 'sproutle').map((e) => e.talentId);
        expect(book).toEqual([combatV2.pools['sproutle']?.[0], combatV2.pools['sproutle']?.[3]]);
        expect(learnedSorted(ctx.sql, p.ids[0] as string).map((l) => l.talentId)).toEqual([
          combatV2.pools['sproutle']?.[0],
        ]);
      },
      { ...V2, talentRng: scriptedThenSeeded([0, 5, 3, 5]) },
    );
  });

  it('a duplicate of a talent the book has keeps it once, and a golden find makes it golden', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['sproutle']);
        // Two finds of pool entry 0: normal, then golden.
        const rng = scriptedThenSeeded([0, 5]);
        grantFirstTalent(ctx.sql, rng, {
          creatureId: p.ids[0] as string,
          userId: p.id,
          line: 'sproutle',
          now: 1,
        });
        ctx.storage.transactionSync(() =>
          ctx.core.collection.choices.addPending(
            p.id,
            { species: 'sproutle', shiny: false },
            { kind: 'expedition', id: newKey('trip') },
          ),
        );
        // v1 roll drew [0,5]; v2 roll drew [0,0]: pool entry 0, golden.
        expect(lineBook(ctx.sql, p.id, 'sproutle')).toEqual([
          expect.objectContaining({ talentId: combatV2.pools['sproutle']?.[0], golden: true }),
        ]);
      },
      { ...V2, talentRng: scriptedThenSeeded([0, 5, 0, 0]) },
    );
  });

  it('one book per player and line: another player’s find is not in it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = seedPlayer(ctx, 1, { species: ['sproutle'], creatures: 1 });
        const b = seedPlayer(ctx, 2, { species: ['sproutle'], creatures: 1 });
        for (const s of [a, b]) {
          grantFirstTalent(ctx.sql, scriptedThenSeeded([1, 5]), {
            creatureId: s.creatureIds[0] as string,
            userId: s.id,
            line: 'sproutle',
            now: 1,
          });
        }
        expect(lineBook(ctx.sql, a.id, 'sproutle')).toHaveLength(1);
        expect(lineBook(ctx.sql, b.id, 'sproutle')).toHaveLength(1);
        expect(count(ctx.sql, 'line_talents')).toBe(2);
        return Promise.resolve();
      },
      V2,
    );
  });
});

describe('the stats a creature page shows under v2 (statsV2)', () => {
  const species = content.creatures.find((c) => c.id === 'mossback');
  if (species === undefined) throw new Error('mossback is not in the content');

  /** The page's numbers for a creature with no Knack, no fusion and nothing worn. */
  const page = (s: CreatureSpecies, level: number, talents: readonly string[]) =>
    statsV2Of({ species: s, level, fusionCount: 0, knack: null, talents, worn: undefined });

  it('is the form at its level with the base crit of the rules, when nothing is slotted or worn', () => {
    const form = formStats(combatV2, content, 'mossback', 12);
    expect(page(species, 12, [])).toEqual({
      hp: form.hp,
      atk: form.atk,
      spd: form.spd,
      armour: form.armour,
      critChanceBp: combatV2.rules.critChanceBp + form.critChanceBp,
      critMultBp: combatV2.rules.critBp + form.critDamageBp,
    });
  });

  it('adds the effects of the slotted talents: Hardy to HP, Sharp Claws to Attack', () => {
    const form = formStats(combatV2, content, 'mossback', 12);
    const stats = page(species, 12, ['hardy', 'sharp-claws']);
    expect(stats.hp).toBe(
      Math.floor((form.hp * (10_000 + (combatV2.talents['hardy']?.fx.hpBp ?? 0))) / 10_000),
    );
    expect(stats.atk).toBe(
      Math.floor((form.atk * (10_000 + (combatV2.talents['sharp-claws']?.fx.atkBp ?? 0))) / 10_000),
    );
    expect(stats.hp).toBeGreaterThan(form.hp);
    expect(stats.atk).toBeGreaterThan(form.atk);
    expect(stats.armour).toBe(form.armour);
  });

  it('adds a crit talent to the chance and the multiplier, and rises with the level', () => {
    const crit = Object.values(combatV2.talents).find(
      (t) => (t.fx.critChanceBp ?? 0) > 0 || (t.fx.critDamageBp ?? 0) > 0,
    );
    if (crit === undefined) throw new Error('no crit talent in the content');
    const plain = page(species, 12, []);
    const withCrit = page(species, 12, [crit.id]);
    expect(withCrit.critChanceBp).toBe(plain.critChanceBp + (crit.fx.critChanceBp ?? 0));
    expect(withCrit.critMultBp).toBe(plain.critMultBp + (crit.fx.critDamageBp ?? 0));
    expect(page(species, 20, []).hp).toBeGreaterThan(plain.hp);
  });

  it("equals the fighter's own numbers, for a creature with a Knack, talents, fusion and gear", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // A species with two slots open at its level cap (the common ones have one).
        const wide = content.creatures.find(
          (c) => c.festival !== true && slotsOpen(c.rarity, c.levelCap) >= 2,
        );
        if (wide === undefined) throw new Error('no species with two slots');
        const p = await seeded(ctx, [wide.id], wide.levelCap);
        const id = p.ids[0] as string;
        // Fusion, the first Knack its form knows, two slotted talents and three worn items.
        ctx.sql.exec(
          'UPDATE creatures SET fusion_count = 2, knack = ? WHERE id = ?',
          knownKnacks(wide.id)[0] ?? null,
          id,
        );
        ctx.sql.exec('DELETE FROM creature_talents_v2 WHERE creature_id = ?', id);
        for (const [talent, slot] of [
          ['hardy', 1],
          ['sharp-claws', 2],
        ] as const) {
          // In the line's book as well, as every real find is (the page reads the slots through the book).
          recordFound(ctx.sql, p.id, wide.line, { talentId: talent, golden: false }, 1);
          ctx.sql.exec(
            'INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, ?, ?, 1)',
            id,
            talent,
            slot,
          );
        }
        const slots = ['hat', 'scarf', 'charm'];
        const bases = slots.flatMap((slot) => {
          const base = gearContent.bases.find((b) => b.slot === slot);
          return base === undefined ? [] : [base];
        });
        expect(bases).toHaveLength(3);
        for (const base of bases) {
          const item = giveItem(ctx.sql, p.id, base.id, { rarity: 'rare', level: 20 });
          ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', id, item);
        }
        expect(equippedByCreature(ctx.sql, p.id).get(id)).toBeDefined();

        // The page's payload...
        const state = await p.call('GET', '/api/state');
        const shown = state.body.creatures[0].statsV2;
        // ...is what the dungeon's fighter and the raid's fighter are in the fight.
        const team = loadCreaturesById(ctx.sql, p.id, [id])[0];
        if (team === undefined) throw new Error('no creature');
        const dungeon = fightNumbers(fighterV2(team, learnedOf(ctx.sql, id)));
        const raid = loadV2Creatures(ctx.sql, [id]).get(id);
        if (raid === undefined) throw new Error('no raid creature');
        const weekend = fightNumbers(fighterOf(raid, 'm1', { row: 0, col: 0 }));
        expect(shown).toEqual(dungeon);
        expect(shown).toEqual(weekend);
        // The numbers are not the bare form's: the Knack, the talents, fusion and gear are all in.
        const bare = page(wide, wide.levelCap, []);
        expect(shown.hp).toBeGreaterThan(bare.hp);
        expect(shown.atk).toBeGreaterThan(bare.atk);
      },
      V2,
    );
  });

  it('comes with the creature in the state, from its slotted talent', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback'], 12);
        const state = await p.call('GET', '/api/state');
        const creature = state.body.creatures[0];
        const slots = creature.talentsV2.slots as { talent: { id: string } | null }[];
        const slotted = slots.flatMap((s) => (s.talent === null ? [] : [s.talent.id]));
        expect(creature.statsV2).toEqual(page(species, 12, slotted));
      },
      V2,
    );
  });
});

describe('Known Knacks and the saved Knack', () => {
  it('lists the Knacks a creature knows in its payload, with their text', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback']);
        const state = await p.call('GET', '/api/state');
        const creature = state.body.creatures[0];
        expect(creature.knack).toBeNull();
        expect((creature.knownKnacks as { id: string }[]).map((k) => k.id)).toEqual(
          knownKnacks('mossback'),
        );
        const first = combatV2.knacks[knownKnacks('mossback')[0] as string];
        expect(creature.knownKnacks[0]).toEqual({
          id: first?.id,
          name: first?.name,
          family: first?.family,
          text: first?.text,
        });
      },
      V2,
    );
  });

  it('saves a known Knack, saves none, and refuses one the creature does not know', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback', 'sproutle']);
        const id = p.ids[0] as string;
        const path = `/api/creatures/${id}/knack`;
        const set = await p.call('PUT', path, { knack: 'feed-the-marks' });
        expect(set.status).toBe(200);
        expect(set.body.knack).toBe('feed-the-marks');
        expect(set.body.state.creatures[0].knack).toBe('feed-the-marks');
        expect(knackOf(ctx, id)).toBe('feed-the-marks');
        // Another form's Knack, a Knack that does not exist, and an unknown key.
        expect(await p.call('PUT', path, { knack: 'wide-reach' })).toMatchObject({
          status: 409,
          body: { error: 'knack_not_known' },
        });
        expect((await p.call('PUT', path, { knack: 'nope-not-a-knack' })).status).toBe(400);
        expect((await p.call('PUT', path, { knack: null, extra: 1 })).status).toBe(400);
        expect((await p.call('PUT', path, {})).status).toBe(400);
        expect(knackOf(ctx, id)).toBe('feed-the-marks');
        const none = await p.call('PUT', path, { knack: null });
        expect(none.status).toBe(200);
        expect(knackOf(ctx, id)).toBeNull();
      },
      V2,
    );
  });

  it('is only for the caller’s own creature, with the same answer as for one that does not exist', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await seeded(ctx, ['mossback']);
        const other = seedPlayer(ctx, 2, { species: ['mossback'], creatures: 1 });
        const stranger = await a.call('PUT', `/api/creatures/${other.creatureIds[0]}/knack`, {
          knack: 'steady-mark',
        });
        const missing = await a.call(
          'PUT',
          '/api/creatures/00000000-0000-4000-8000-000000000000/knack',
          { knack: 'steady-mark' },
        );
        expect(stranger).toEqual({ status: 404, body: { error: 'not_found' } });
        expect(missing).toEqual(stranger);
        expect(knackOf(ctx, other.creatureIds[0] as string)).toBeNull();
        expect(
          (await a.call('PUT', '/api/creatures/not-an-id/knack', { knack: null })).status,
        ).toBe(400);
      },
      V2,
    );
  });

  it('is idempotent: the same Knack twice changes nothing and logs one event', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback']);
        const path = `/api/creatures/${p.ids[0]}/knack`;
        for (let i = 0; i < 3; i++) {
          expect((await p.call('PUT', path, { knack: 'steady-mark' })).status).toBe(200);
        }
        expect(eventsOf(ctx, 'knack_set')).toEqual([
          { form: 'mossback', knack: 'steady-mark', previous: 'none', where: 'page' },
        ]);
        // A swap names the previous Knack, and `where` says the screen.
        await p.call('PUT', path, { knack: 'feed-the-marks', where: 'raid' });
        await p.call('PUT', path, { knack: null });
        expect(eventsOf(ctx, 'knack_set')).toEqual([
          { form: 'mossback', knack: 'steady-mark', previous: 'none', where: 'page' },
          { form: 'mossback', knack: 'feed-the-marks', previous: 'steady-mark', where: 'raid' },
          { form: 'mossback', knack: 'none', previous: 'feed-the-marks', where: 'page' },
        ]);
      },
      V2,
    );
  });

  it('is read with the creature by the team loaders', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback', 'sproutle']);
        await p.call('PUT', `/api/creatures/${p.ids[0]}/knack`, { knack: 'feed-the-marks' });
        expect(loadCreatures(ctx.sql, p.id).map((c) => c.knack)).toEqual(['feed-the-marks', null]);
        expect(loadCreaturesById(ctx.sql, p.id, p.ids).map((c) => c.knack)).toEqual([
          'feed-the-marks',
          null,
        ]);
      },
      V2,
    );
  });

  it('has a lock hook that nothing uses yet', async () => {
    await runCore(nextGuild(), (ctx) => {
      expect(knackLocked(ctx.sql, 'any')).toBe(false);
      expect(talentsLocked(ctx.sql, 'any')).toBe(false);
      return Promise.resolve();
    });
  });
});

async function evolveTo(ctx: CoreContext, p: Awaited<ReturnType<typeof seeded>>, species: string) {
  give(ctx, p.id, { essence: 100 });
  setCreature(ctx, p.ids[0] as string, { level: 15 });
  return p.call('POST', `/api/creatures/${p.ids[0]}/evolve`, {
    species,
    idempotencyKey: newKey(),
  });
}

describe('evolution and the saved Knack', () => {
  it('keeps the Knack when the new form still knows it (the role stays)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback']);
        await p.call('PUT', `/api/creatures/${p.ids[0]}/knack`, { knack: 'steady-mark' });
        const res = await evolveTo(ctx, p, 'ancientshell');
        expect(res.status).toBe(200);
        expect(res.body.talentsReplaced).toEqual([]);
        expect(knackOf(ctx, p.ids[0] as string)).toBe('steady-mark');
        expect(res.body.state.creatures[0].knack).toBe('steady-mark');
        expect(
          (res.body.state.creatures[0].knownKnacks as { id: string }[]).map((k) => k.id),
        ).toEqual(knownKnacks('ancientshell'));
      },
      V2,
    );
  });

  it('sets the Knack to none, in the same transaction, when a role change drops it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback']);
        await p.call('PUT', `/api/creatures/${p.ids[0]}/knack`, { knack: 'steady-mark' });
        const res = await evolveTo(ctx, p, 'bloomback');
        expect(res.status).toBe(200);
        expect(res.body.species).toBe('bloomback');
        expect(knackOf(ctx, p.ids[0] as string)).toBeNull();
        expect(res.body.state.creatures[0].knack).toBeNull();
      },
      V2,
    );
  });

  it('clears a stale Knack on a role change even with the flag off', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await seeded(ctx, ['mossback']);
      ctx.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', 'steady-mark', p.ids[0]);
      const res = await evolveTo(ctx, p, 'bloomback');
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('talentsReplaced');
      expect(knackOf(ctx, p.ids[0] as string)).toBeNull();
    });
  });
});

/** A seeded mossback with a known v2 talent in slot 1 (pool entry `index`, not golden). */
async function withTalent(
  ctx: CoreContext,
  species: string[],
  index: number,
  rng?: Rng,
  line = 'mossback',
) {
  const p = await seeded(ctx, species);
  grantFirstTalent(ctx.sql, rng ?? scriptedThenSeeded([index, 5]), {
    creatureId: p.ids[0] as string,
    userId: p.id,
    line,
    now: ctx.clock.t,
  });
  return p;
}

describe('learning a talent from the line book', () => {
  const learnPath = (id: string) => `/api/creatures/${id}/talents-v2/learn`;
  const bait = (ctx: CoreContext, id: string) =>
    rows<{ amount: number }>(
      ctx.sql,
      "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
      id,
    )[0]?.amount ?? 0;

  /** Puts a talent of the line's pool in the player's book (found, not learned by anyone). */
  const find = (ctx: CoreContext, userId: string, talent: string, golden = false) =>
    ctx.sql.exec(
      'INSERT INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, ?, ?, ?, ?)',
      userId,
      'mossback',
      talent,
      golden ? 1 : 0,
      ctx.clock.t,
    );

  it('costs Bait once, learns it without slotting it, and a retry with the same key charges nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        find(ctx, p.id, 'hardy');
        give(ctx, p.id, { bait: 30 });
        const key = newKey();
        const body = { talentId: 'hardy', idempotencyKey: key };
        const res = await p.call('POST', learnPath(p.ids[0] as string), body);
        expect(res.status).toBe(200);
        expect(res.body.result).toEqual({ creatureId: p.ids[0], talentId: 'hardy' });
        expect(bait(ctx, p.id)).toBe(30 - RULES.talents.bookSlotBait);
        expect(learnedSorted(ctx.sql, p.ids[0] as string)).toEqual([
          { talentId: 'hardy', slot: null },
          { talentId: 'owners-mark', slot: 1 },
        ]);
        const entry = (res.body.state.creatures[0].talentsV2.book as { id: string }[]).find(
          (e) => e.id === 'hardy',
        );
        expect(entry).toMatchObject({ learned: true, slot: null });
        // The retry: the stored result, no second charge.
        const again = await p.call('POST', learnPath(p.ids[0] as string), body);
        expect(again.status).toBe(200);
        expect(again.body.result).toEqual(res.body.result);
        expect(bait(ctx, p.id)).toBe(30 - RULES.talents.bookSlotBait);
        // A new key for the same talent: it is already learned, and nothing is charged.
        const other = await p.call('POST', learnPath(p.ids[0] as string), {
          talentId: 'hardy',
          idempotencyKey: newKey(),
        });
        expect(other).toMatchObject({ status: 409, body: { error: 'already_learned' } });
        expect(bait(ctx, p.id)).toBe(30 - RULES.talents.bookSlotBait);
        expect(eventsOf(ctx, 'talent_learn')).toEqual([{ line: 'mossback', talent: 'hardy' }]);
      },
      V2,
    );
  });

  it('refuses without enough Bait and learns nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        find(ctx, p.id, 'hardy');
        give(ctx, p.id, { bait: RULES.talents.bookSlotBait - 1 });
        const res = await p.call('POST', learnPath(p.ids[0] as string), {
          talentId: 'hardy',
          idempotencyKey: newKey(),
        });
        expect(res).toMatchObject({ status: 409, body: { error: 'insufficient_funds' } });
        expect(learnedSorted(ctx.sql, p.ids[0] as string)).toHaveLength(1);
        expect(bait(ctx, p.id)).toBe(RULES.talents.bookSlotBait - 1);
      },
      V2,
    );
  });

  it('only learns what the line’s own book holds', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        give(ctx, p.id, { bait: 50 });
        const path = learnPath(p.ids[0] as string);
        // In the pool but not found yet; and a talent that is in no pool of this line.
        expect(
          await p.call('POST', path, { talentId: 'brace', idempotencyKey: newKey() }),
        ).toMatchObject({ status: 404, body: { error: 'not_in_book' } });
        expect(
          await p.call('POST', path, { talentId: 'first-pounce', idempotencyKey: newKey() }),
        ).toMatchObject({ status: 404, body: { error: 'not_in_book' } });
        expect(
          (await p.call('POST', path, { talentId: 'no-such', idempotencyKey: newKey() })).status,
        ).toBe(400);
        expect((await p.call('POST', path, { talentId: 'brace' })).status).toBe(400);
        // Another player's creature is not found, and their book is not this one's.
        const other = seedPlayer(ctx, 2, { species: ['mossback'], creatures: 1 });
        find(ctx, other.id, 'brace');
        expect(
          await p.call('POST', learnPath(other.creatureIds[0] as string), {
            talentId: 'brace',
            idempotencyKey: newKey(),
          }),
        ).toMatchObject({ status: 404, body: { error: 'not_found' } });
        expect(bait(ctx, p.id)).toBe(50);
      },
      V2,
    );
  });

  it('a key already used for another action is a key conflict', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        find(ctx, p.id, 'hardy');
        find(ctx, p.id, 'brace');
        give(ctx, p.id, { bait: 50 });
        const key = newKey();
        await p.call('POST', learnPath(p.ids[0] as string), {
          talentId: 'hardy',
          idempotencyKey: key,
        });
        const res = await p.call('POST', learnPath(p.ids[0] as string), {
          talentId: 'brace',
          idempotencyKey: key,
        });
        expect(res).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
        expect(bait(ctx, p.id)).toBe(50 - RULES.talents.bookSlotBait);
      },
      V2,
    );
  });
});

describe('slotting learned talents', () => {
  const slotPath = (id: string) => `/api/creatures/${id}/talents-v2/slot`;

  /** A level-25 Tidewing (a common Setter of the splashet line) that learned first-pounce (slot 1), hardy and momentum. */
  async function setup(ctx: CoreContext, level = 25) {
    const p = await withTalent(ctx, ['tidewing'], 0, undefined, 'splashet');
    const id = p.ids[0] as string;
    setCreature(ctx, id, { level });
    for (const talent of ['hardy', 'momentum']) {
      ctx.sql.exec(
        'INSERT INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, ?, ?, 0, 1)',
        p.id,
        'splashet',
        talent,
      );
      ctx.sql.exec(
        'INSERT INTO creature_talents_v2 (creature_id, talent_id, slot, learned_at) VALUES (?, ?, NULL, ?)',
        id,
        talent,
        ctx.clock.t,
      );
    }
    return { ...p, id: p.id, creature: id };
  }

  it('is free: slots a learned talent, swaps it with the one in the slot, and unslots', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await setup(ctx);
        give(ctx, p.id, { bait: 7 });
        const path = slotPath(p.creature);
        const res = await p.call('PUT', path, { talentId: 'hardy', slot: 2 });
        expect(res.status).toBe(200);
        expect(res.body.result).toEqual({ creatureId: p.creature, talentId: 'hardy', slot: 2 });
        // Into an occupied slot: the talent that sat there stays learned.
        await p.call('PUT', path, { talentId: 'momentum', slot: 1 });
        expect(learnedSorted(ctx.sql, p.creature)).toEqual([
          { talentId: 'first-pounce', slot: null },
          { talentId: 'hardy', slot: 2 },
          { talentId: 'momentum', slot: 1 },
        ]);
        // Moving a slotted talent frees its old slot (and takes the other's).
        await p.call('PUT', path, { talentId: 'hardy', slot: 1 });
        expect(learnedSorted(ctx.sql, p.creature).map((l) => l.slot)).toEqual([null, 1, null]);
        // Unslot, and unslot again (nothing to do).
        expect((await p.call('PUT', path, { talentId: 'hardy', slot: null })).status).toBe(200);
        expect((await p.call('PUT', path, { talentId: 'hardy', slot: null })).status).toBe(200);
        expect(learnedSorted(ctx.sql, p.creature).map((l) => l.slot)).toEqual([null, null, null]);
        // Never any Bait.
        expect(
          rows<{ amount: number }>(
            ctx.sql,
            "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
            p.id,
          )[0]?.amount,
        ).toBe(7);
        expect(count(ctx.sql, 'ledger', "source = 'talent_learn' OR source = 'talent_slot'")).toBe(
          0,
        );
      },
      V2,
    );
  });

  it('refuses a talent that is not learned, a closed slot and a slot that does not exist', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await setup(ctx, 5);
        const path = slotPath(p.creature);
        // In the book of the line but never learned by this creature.
        ctx.sql.exec(
          'INSERT INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, ?, ?, 0, 1)',
          p.id,
          'splashet',
          'finisher',
        );
        expect(await p.call('PUT', path, { talentId: 'finisher', slot: 1 })).toMatchObject({
          status: 404,
          body: { error: 'not_learned' },
        });
        // Level 5: slot 2 opens at the v1 level (20).
        const opens = slotOpensAt('common', 2);
        expect(opens).toBe(20);
        expect(await p.call('PUT', path, { talentId: 'hardy', slot: 2 })).toMatchObject({
          status: 409,
          body: { error: 'slot_closed', reason: 'needs_level_20' },
        });
        // A common species has two slots: the third does not exist for it.
        setCreature(ctx, p.creature, { level: 30 });
        expect(await p.call('PUT', path, { talentId: 'hardy', slot: 3 })).toMatchObject({
          status: 409,
          body: { error: 'slot_closed', reason: 'no_such_slot' },
        });
        expect((await p.call('PUT', path, { talentId: 'hardy', slot: 4 })).status).toBe(400);
        expect((await p.call('PUT', path, { talentId: 'hardy', slot: 0 })).status).toBe(400);
        expect((await p.call('PUT', path, { talentId: 'hardy' })).status).toBe(400);
        expect(learnedSorted(ctx.sql, p.creature).map((l) => l.slot)).toEqual([1, null, null]);
      },
      V2,
    );
  });

  it('is only for the caller’s own creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await setup(ctx);
        const other = seedPlayer(ctx, 2, { species: ['tidewing'], creatures: 1 });
        expect(
          await p.call('PUT', slotPath(other.creatureIds[0] as string), {
            talentId: 'hardy',
            slot: 1,
          }),
        ).toEqual({ status: 404, body: { error: 'not_found' } });
      },
      V2,
    );
  });
});

describe('a role-changing evolution (R20.8)', () => {
  const idleFor = (talent: string, role: 'payoff' | 'setter') =>
    !(combatV2.talents[talent]?.roles as readonly string[]).includes(role);

  it('replaces each slotted talent that is idle for the new role with a roll that works and is not in the book', async () => {
    // Pool of mossback: owners-mark (setter only) is idle for a Payoff; the roll is the 4th candidate
    // (index 3 among the Payoff talents that are not in the book).
    const rng = scriptedThenSeeded([0, 5, 3, 5]);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0, rng);
        expect(idleFor('owners-mark', 'payoff')).toBe(true);
        // The player already found `opportunist` (a Payoff talent): it must not be rolled again.
        ctx.sql.exec(
          "INSERT INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, 'mossback', 'opportunist', 0, 1)",
          p.id,
        );
        const res = await evolveTo(ctx, p, 'bloomback');
        expect(res.status).toBe(200);
        const replaced = res.body.talentsReplaced as {
          slot: number;
          from: string;
          to: string | null;
          golden: boolean;
        }[];
        expect(replaced).toHaveLength(1);
        const change = replaced[0];
        expect(change).toMatchObject({ slot: 1, from: 'owners-mark', golden: false });
        const to = change?.to as string;
        expect(combatV2.pools['mossback']).toContain(to);
        expect(idleFor(to, 'payoff')).toBe(false);
        expect(['owners-mark', 'opportunist']).not.toContain(to);
        // Candidates in pool order: finisher, stubborn, hardy, brace, rally-cry; index 3 is brace.
        expect(to).toBe('brace');
        // The old talent stays learned and in the book; the new one is in the book and the slot.
        expect(learnedSorted(ctx.sql, p.ids[0] as string)).toEqual([
          { talentId: 'brace', slot: 1 },
          { talentId: 'owners-mark', slot: null },
        ]);
        expect(
          lineBook(ctx.sql, p.id, 'mossback')
            .map((e) => e.talentId)
            .sort(),
        ).toEqual(['brace', 'opportunist', 'owners-mark']);
        // The payload shows the new slot and the idle talent in the book.
        const creature = res.body.state.creatures[0];
        expect(creature.talentsV2.slots[0].talent).toMatchObject({ id: 'brace', idle: false });
        expect(
          (creature.talentsV2.book as { id: string }[]).find((e) => e.id === 'owners-mark'),
        ).toMatchObject({ idle: true, learned: true, slot: null });
      },
      { ...V2, talentRng: rng },
    );
  });

  it('leaves talents that work for the new role, and a same-role evolution replaces nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // `finisher` works for Setters and Payoffs: it stays through Mossback into Bloomback.
        const p = await withTalent(ctx, ['mossback'], 2);
        const res = await evolveTo(ctx, p, 'bloomback');
        expect(res.body.talentsReplaced).toEqual([]);
        expect(learnedSorted(ctx.sql, p.ids[0] as string)).toEqual([
          { talentId: 'finisher', slot: 1 },
        ]);
      },
      V2,
    );
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        const res = await evolveTo(ctx, p, 'ancientshell');
        expect(res.body.talentsReplaced).toEqual([]);
        expect(learnedSorted(ctx.sql, p.ids[0] as string)).toEqual([
          { talentId: 'owners-mark', slot: 1 },
        ]);
      },
      V2,
    );
  });

  it('leaves the slot empty when no talent that works is left to roll', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        // The whole pool is in the book already.
        for (const talent of combatV2.pools['mossback'] ?? []) {
          ctx.sql.exec(
            "INSERT OR IGNORE INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, 'mossback', ?, 0, 1)",
            p.id,
            talent,
          );
        }
        const res = await evolveTo(ctx, p, 'bloomback');
        expect(res.body.talentsReplaced).toEqual([
          { slot: 1, from: 'owners-mark', to: null, golden: false },
        ]);
        expect(learnedSorted(ctx.sql, p.ids[0] as string)).toEqual([
          { talentId: 'owners-mark', slot: null },
        ]);
      },
      V2,
    );
  });

  it('a retried evolution returns the stored result and rolls nothing again', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await withTalent(ctx, ['mossback'], 0);
        give(ctx, p.id, { essence: 100 });
        setCreature(ctx, p.ids[0] as string, { level: 15 });
        const key = newKey();
        const body = { species: 'bloomback', idempotencyKey: key };
        const first = await p.call('POST', `/api/creatures/${p.ids[0]}/evolve`, body);
        const book = count(ctx.sql, 'line_talents');
        const again = await p.call('POST', `/api/creatures/${p.ids[0]}/evolve`, body);
        expect(again.status).toBe(200);
        expect(again.body.talentsReplaced).toEqual(first.body.talentsReplaced);
        expect(count(ctx.sql, 'line_talents')).toBe(book);
      },
      V2,
    );
  });
});

describe('the combat-v2-convert dev tool', () => {
  it('answers 404 without the COMBAT_V2 flag, even with the dev tools on', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await devPlayer(ctx);
        expect(await p.dev('combat-v2-convert', {})).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        expect(count(ctx.sql, 'line_talents')).toBe(0);
      },
      ON,
    );
  });

  it('gives each creature a v2 talent, clears Knacks and the open week’s finale choices, and does nothing twice', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await devPlayer(ctx, 1, { species: ['mossback', 'sproutle', 'cindle'] });
        const other = await devPlayer(ctx, 2, { species: ['splashet'], creatures: 1 });
        // A creature that already has a v2 talent and a Knack, and one without.
        grantFirstTalent(ctx.sql, scriptedThenSeeded([1, 5]), {
          creatureId: p.creatureIds[0] as string,
          userId: p.id,
          line: 'mossback',
          now: ctx.clock.t,
        });
        ctx.sql.exec(
          'UPDATE creatures SET knack = ? WHERE id = ?',
          'steady-mark',
          p.creatureIds[0],
        );
        ctx.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', 'wide-reach', p.creatureIds[1]);
        const result = (await p.tool('combat-v2-convert')) as {
          creatures: number;
          knacksCleared: number;
          abilitiesCleared: number;
        };
        // The three of the caller and the one of the other player: every creature of the guild.
        expect(result.creatures).toBe(3);
        expect(result.knacksCleared).toBe(1);
        expect(count(ctx.sql, 'creature_talents_v2')).toBe(4);
        expect(count(ctx.sql, 'creature_talents_v2', 'slot = 1')).toBe(4);
        expect(count(ctx.sql, 'line_talents')).toBe(4);
        // The creature that had one is untouched; the others rolled from their own line pools.
        expect(knackOf(ctx, p.creatureIds[0] as string)).toBe('steady-mark');
        expect(knackOf(ctx, p.creatureIds[1] as string)).toBeNull();
        for (const [i, line] of ['mossback', 'sproutle', 'cindle'].entries()) {
          const learned = learnedSorted(ctx.sql, p.creatureIds[i] as string);
          expect(learned).toHaveLength(1);
          expect(combatV2.pools[line]).toContain(learned[0]?.talentId);
        }
        expect(learnedSorted(ctx.sql, other.creatureIds[0] as string)).toHaveLength(1);
        // A second run changes nothing, and a Knack saved since is not touched.
        ctx.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', 'wide-reach', p.creatureIds[1]);
        const snapshot = rows(
          ctx.sql,
          'SELECT creature_id, talent_id, slot FROM creature_talents_v2',
        );
        const again = (await p.tool('combat-v2-convert')) as { creatures: number };
        expect(again).toEqual({ creatures: 0, knacksCleared: 0, abilitiesCleared: 0 });
        expect(
          rows(ctx.sql, 'SELECT creature_id, talent_id, slot FROM creature_talents_v2'),
        ).toEqual(snapshot);
        expect(knackOf(ctx, p.creatureIds[1] as string)).toBe('wide-reach');
        expect(count(ctx.sql, 'analytics_events', "kind = 'dev_action'")).toBe(2);
      },
      { ...ON, ...V2 },
    );
  });

  it('is wiped with the rest of the player’s data by the reset-account tool', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await devPlayer(ctx, 1, { species: ['mossback', 'sproutle'], creatures: 2 });
        const q = await devPlayer(ctx, 2, { species: ['splashet'], creatures: 1 });
        await p.tool('combat-v2-convert');
        expect(count(ctx.sql, 'creature_talents_v2')).toBe(3);
        await p.tool('reset-account', { confirm: 'RESET' });
        // Only the other player's rows are left.
        expect(count(ctx.sql, 'creature_talents_v2')).toBe(1);
        expect(count(ctx.sql, 'line_talents')).toBe(1);
        expect(learnedOf(ctx.sql, q.creatureIds[0] as string)).toHaveLength(1);
      },
      { ...ON, ...V2 },
    );
  });

  it('clears the finale ability choice of the open week for converted players only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await devPlayer(ctx, 1, { species: ['mossback'], creatures: 1 });
        const q = await devPlayer(ctx, 2, { species: ['sproutle'], creatures: 1 });
        grantFirstTalent(ctx.sql, scriptedThenSeeded([1, 5]), {
          creatureId: q.creatureIds[0] as string,
          userId: q.id,
          line: 'sproutle',
          now: ctx.clock.t,
        });
        const weekId = weekIdFor(ctx.clock.t, HELSINKI);
        for (const user of [p.id, q.id]) {
          ctx.sql.exec(
            "INSERT INTO raid_abilities (week_id, user_id, ability_id) VALUES (?, ?, 'rally')",
            weekId,
            user,
          );
        }
        ctx.sql.exec(
          "INSERT INTO raid_abilities (week_id, user_id, ability_id) VALUES ('1999-W01', ?, 'rally')",
          p.id,
        );
        const result = (await p.tool('combat-v2-convert')) as { abilitiesCleared: number };
        expect(result.abilitiesCleared).toBe(1);
        expect(
          rows<{ user_id: string; week_id: string }>(
            ctx.sql,
            'SELECT user_id, week_id FROM raid_abilities ORDER BY week_id, user_id',
          ),
        ).toEqual([
          { user_id: p.id, week_id: '1999-W01' },
          { user_id: q.id, week_id: weekId },
        ]);
      },
      { ...ON, ...V2 },
    );
  });
});

describe('analytics: knack_set and talent_learn', () => {
  it('store ids and enums only, and an id outside the content becomes "unknown"', () => {
    expect(
      propsOf({
        kind: 'knack_set',
        form: 'mossback',
        knack: 'steady-mark',
        previous: null,
        where: 'raid',
      }),
    ).toEqual({ form: 'mossback', knack: 'steady-mark', previous: 'none', where: 'raid' });
    expect(
      propsOf({
        kind: 'knack_set',
        form: 'Free text here',
        knack: null,
        previous: 'not a knack',
        where: 'page',
      }),
    ).toEqual({ form: 'unknown', knack: 'none', previous: 'unknown', where: 'page' });
    expect(propsOf({ kind: 'talent_learn', line: 'mossback', talent: 'hardy' })).toEqual({
      line: 'mossback',
      talent: 'hardy',
    });
    expect(propsOf({ kind: 'talent_learn', line: 'x', talent: 'y' })).toEqual({
      line: 'unknown',
      talent: 'unknown',
    });
  });

  it('roll up as feature counts, and a learn is a Bait sink', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await seeded(ctx, ['mossback']);
        grantFirstTalent(ctx.sql, scriptedThenSeeded([0, 5]), {
          creatureId: p.ids[0] as string,
          userId: p.id,
          line: 'mossback',
          now: ctx.clock.t,
        });
        ctx.sql.exec(
          "INSERT INTO line_talents (user_id, line, talent_id, golden, found_at) VALUES (?, 'mossback', 'hardy', 0, 1)",
          p.id,
        );
        give(ctx, p.id, { bait: 20 });
        await p.call('PUT', `/api/creatures/${p.ids[0]}/knack`, { knack: 'steady-mark' });
        await p.call('PUT', `/api/creatures/${p.ids[0]}/knack`, { knack: 'feed-the-marks' });
        await p.call('POST', `/api/creatures/${p.ids[0]}/talents-v2/learn`, {
          talentId: 'hardy',
          idempotencyKey: newKey(),
        });
        const today = ctx.core.rollup.rollToday();
        expect(today).toBeDefined();
        const metrics = rows<{ metric: string; dims_json: string; value: number }>(
          ctx.sql,
          "SELECT metric, dims_json, value FROM analytics_daily WHERE metric IN ('collection.knack_set', 'collection.talent_learn', 'flow') ORDER BY metric, dims_json",
        );
        const get = (metric: string, dims: Record<string, unknown>) =>
          metrics.find((m) => m.metric === metric && m.dims_json === canonicalDims(dims))?.value;
        expect(
          get('collection.knack_set', { where: 'page', knack: 'steady-mark', swap: false }),
        ).toBe(1);
        expect(
          get('collection.knack_set', { where: 'page', knack: 'feed-the-marks', swap: true }),
        ).toBe(1);
        expect(get('collection.talent_learn', { line: 'mossback' })).toBe(1);
        expect(get('flow', { currency: 'bait', dir: 'sink', label: 'talent_learn' })).toBe(
          RULES.talents.bookSlotBait,
        );
      },
      V2,
    );
  });
});
