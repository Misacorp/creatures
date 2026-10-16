import {
  PART_KINDS,
  RULES,
  createSeededRng,
  craftCost,
  dismantleYield,
  gearBase,
  itemOf,
  jobDuration,
  rollCraft,
  rollItem,
  rollWelcomeKit,
  skillLevel,
  type GearRarity,
  type PartKind,
  type PartsBundle,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { creditParts, insertItem } from '../src/gear-store';
import { T0, runCore, undoGearMigration, type CoreContext, LATEST_SCHEMA_VERSION } from './helpers';
import { count, nextGuild, rows, seedPlayer, type SeedOptions } from './raid-helpers';

const HOUR = 3_600_000;

let keyCounter = 0;
/** A valid client idempotency key, unique per call. */
const newKey = () => `gear-${String(++keyCounter).padStart(8, '0')}-test`;

interface Json {
  status: number;
  body: Record<string, unknown>;
}

interface LineBody {
  id: string;
  name: string;
  text: string;
  about: string;
  source: string;
  tier: number | null;
  bestTier: number | null;
  active: boolean | null;
}

interface ItemBody {
  id: string;
  baseId: string;
  slot: string;
  tag: string;
  rarity: GearRarity;
  itemLevel: number;
  lines: LineBody[];
  needs: { level: number; role: string | null };
  equippedOn: string | null;
  dismantle: PartsBundle;
  source: string;
  createdAt: number;
  madeBy: { name: string; at: number } | null;
  origin: Record<string, unknown> | null;
}

interface JobBody {
  id: string;
  creatureId: string;
  kind: string;
  input: Record<string, unknown>;
  cost: PartsBundle;
  startedAt: number;
  endsAt: number;
  status: string;
  claimedAt: number | null;
  result: Record<string, unknown> | null;
}

interface GrantBody {
  key: string;
  source: string;
  at: number;
  gear: { id: string; baseId: string; rarity: string; itemLevel?: number }[];
  converted: { baseId: string; rarity: string }[];
  parts: PartsBundle;
  blueprints: { baseId: string; duplicate: boolean }[];
}

interface GearBody {
  serverNow: number;
  balances: { bait: number; essence: number };
  inventory: { cap: number; used: number; reserved: number };
  items: ItemBody[];
  slotOpens: Record<string, number>;
  parts: Record<PartKind, number>;
  blueprints: { baseId: string; learnedAt: number; marks: number }[];
  jobs: JobBody[];
  slots: { total: number; used: number };
  skills: { creatureId: string; xp: number; level: number; nextLevelXp: number | null }[];
  grants: GrantBody[];
  notice: unknown;
}

interface Api {
  id: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  gear: () => Promise<GearBody>;
}

/** A seeded player (creatures straight into the tables) with a session. */
async function player(ctx: CoreContext, n: number, options: SeedOptions = {}): Promise<Api> {
  const seeded = seedPlayer(ctx, n, { level: 5, ...options });
  const user = { id: seeded.id, displayName: seeded.name };
  let secret = await ctx.core.createSession(ctx.guildId, user);
  let loggedInAt = ctx.clock.t;
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    // Tests jump the clock by hours; sessions idle out, so sign in again as needed.
    if (ctx.clock.t - loggedInAt >= 30 * 60_000) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      loggedInAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    call,
    gear: async () => (await call('GET', '/api/gear')).body as unknown as GearBody,
  };
}

interface GiveOptions {
  rarity?: GearRarity;
  level?: number;
  /** Lines to give: `[id, tier index 0 to 4]`; rolled from a seed when absent. */
  lines?: [string, number][];
  seed?: string;
}

/** Puts an item straight in the table (not through a drop). */
const give = (ctx: CoreContext, userId: string, baseId: string, o: GiveOptions = {}): string => {
  const rarity = o.rarity ?? 'common';
  const level = o.level ?? 1;
  const item =
    o.lines === undefined
      ? rollItem(createSeededRng(`${o.seed ?? 'give'}:${baseId}:${rarity}`), {
          baseId,
          rarity,
          itemLevel: level,
        })
      : itemOf(
          baseId,
          rarity,
          level,
          o.lines.map(([id, tier]) => ({ id, tier })),
        );
  return insertItem(ctx.sql, userId, item, { source: 'test', now: ctx.clock.t });
};

const parts = (ctx: CoreContext, userId: string, bundle: PartsBundle): void =>
  creditParts(ctx.sql, userId, bundle);

const learn = (ctx: CoreContext, userId: string, baseId: string): void => {
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, ?, 'common', ?)",
    userId,
    baseId,
    ctx.clock.t,
  );
};

/** Welcome kit already given (so tests that count items start from nothing). */
const skipWelcome = (ctx: CoreContext, userId: string): void => {
  ctx.sql.exec(
    "INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, 'welcome', 'welcome', ?, ?)",
    userId,
    JSON.stringify({ gear: [], converted: [], parts: {}, blueprints: [] }),
    ctx.clock.t,
  );
};

const partsOf = (ctx: CoreContext, userId: string): Record<PartKind, number> => {
  const out = Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>;
  for (const row of rows<{ kind: PartKind; amount: number }>(
    ctx.sql,
    'SELECT kind, amount FROM parts WHERE user_id = ?',
    userId,
  )) {
    out[row.kind] = row.amount;
  }
  return out;
};

const events = (ctx: CoreContext, kind: string): Record<string, unknown>[] =>
  rows<{ props_json: string }>(
    ctx.sql,
    'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
    kind,
  ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

/** An rng that counts its draws. */
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

const opts = (seed = 'gear-tests') => ({ gearRng: createSeededRng(seed) });

const equipPath = (id: string) => `/api/gear/${id}/equip`;

describe('migration 27', () => {
  it('creates the item table with its constraints, and keeps the other gear tables', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      const names = rows<{ name: string }>(
        sql,
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ).map((r) => r.name);
      for (const t of [
        'gear_items',
        'gear_legacy',
        'gear_conversion',
        'parts',
        'blueprints',
        'workshop_jobs',
        'crafting_skill',
        'gear_grants',
        'gear_actions',
      ]) {
        expect(names).toContain(t);
      }
      expect(rows<{ v: number }>(sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v).toBe(
        LATEST_SCHEMA_VERSION,
      );
      expect(LATEST_SCHEMA_VERSION).toBe(27);
      const item = (
        id: string,
        creature: string | null,
        slot = 'hat',
        level = 1,
        rarity = 'common',
      ) =>
        sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, slot, tag, rarity, item_level, lines_json, equipped_on, source, created_at)
           VALUES (?, 'u', 'trail-cap', ?, 'neutral', ?, ?, '[]', ?, 't', 0)`,
          id,
          slot,
          rarity,
          level,
          creature,
        );
      // A creature wears one item per slot: two slots at once are fine, two of one slot are not.
      item('a', 'c1', 'hat');
      item('b', 'c1', 'scarf');
      item('c', 'c1', 'charm');
      expect(() => item('d', 'c1', 'hat')).toThrow();
      item('e', null, 'hat');
      item('f', null, 'hat'); // unequipped items do not collide
      item('g', 'c2', 'hat');
      expect(() => item('h', 'c3', 'boots')).toThrow();
      expect(() => item('i', 'c3', 'hat', 0)).toThrow(); // item level 1 to 20
      expect(() => item('j', 'c3', 'hat', 21)).toThrow();
      expect(() => item('k', 'c3', 'hat', 1, 'legendary')).toThrow();
      // Amounts cannot go negative.
      expect(() =>
        sql.exec("INSERT INTO parts (user_id, kind, amount) VALUES ('u', 'scrap', -1)"),
      ).toThrow();
      // A creature is on at most one open job.
      const job = (id: string, creature: string, claimed: number | null) =>
        sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at)
           VALUES (?, 'u', ?, 'craft', NULL, '{}', 0, 1, ?)`,
          id,
          creature,
          claimed,
        );
      job('j1', 'c1', null);
      expect(() => job('j2', 'c1', null)).toThrow();
      job('j3', 'c1', 1);
      return Promise.resolve();
    });
  });

  it('applies on a schema-26 database, keeps its gear for the conversion, and can be replayed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1);
      expect(count(ctx.sql, 'creatures')).toBe(3);
      ctx.sql.exec('DELETE FROM gear_conversion');
      // Back to the first gear model with one worn item and one blueprint.
      const sql = ctx.sql;
      sql.exec('DROP TABLE gear_conversion');
      sql.exec('DROP TABLE gear_legacy');
      sql.exec('DROP TABLE gear_items');
      sql.exec(`CREATE TABLE gear_items (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, base_id TEXT NOT NULL, rarity TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0, rolls_json TEXT NOT NULL, enchant_id TEXT,
        equipped_on TEXT UNIQUE, source TEXT NOT NULL, created_at INTEGER NOT NULL)`);
      sql.exec('ALTER TABLE blueprints DROP COLUMN marks');
      sql.exec('DELETE FROM schema_version WHERE version = 27');
      sql.exec(
        `INSERT INTO gear_items (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on, source, created_at)
         VALUES ('old1', ?, 'cinder-charm', 'epic', 2, '{}', NULL, ?, 'test', 5)`,
        p.id,
        p.creatureIds[0],
      );
      sql.exec(
        "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'cinder-charm', 'common', 1)",
        p.id,
      );
      ctx.core.migrate();
      expect(rows<{ v: number }>(sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v).toBe(
        LATEST_SCHEMA_VERSION,
      );
      expect(count(sql, 'creatures')).toBe(3);
      // The conversion ran right after the migration: the old item is a new one, same id. The old row
      // stays in `gear_legacy` (the player's conversion stamp marks it done).
      expect(count(sql, 'gear_legacy')).toBe(1);
      expect(
        rows<{ done: number }>(
          sql,
          'SELECT converted_at IS NOT NULL AS done FROM gear_conversion WHERE user_id = ?',
          p.id,
        ),
      ).toEqual([{ done: 1 }]);
      expect(rows<{ slot: string }>(sql, "SELECT slot FROM gear_items WHERE id = 'old1'")).toEqual([
        { slot: 'hat' },
      ]);
      ctx.core.migrate();
      expect(count(sql, 'schema_version')).toBe(LATEST_SCHEMA_VERSION);
      expect(count(sql, 'gear_items')).toBe(1);
    });
  });

  it('undoing the first gear migration still takes everything away', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      undoGearMigration(sql);
      expect(
        rows(sql, "SELECT name FROM sqlite_master WHERE name IN ('gear_items', 'parts')"),
      ).toEqual([]);
      return Promise.resolve();
    });
  });
});

describe('GET /api/gear and the welcome kit', () => {
  it('has the documented shape', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const res = await p.call('GET', '/api/gear');
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(
          [
            'balances',
            'blueprints',
            'grants',
            'inventory',
            'items',
            'jobs',
            'notice',
            'parts',
            'serverNow',
            'skills',
            'slotOpens',
            'slots',
          ].sort(),
        );
        const body = res.body as unknown as GearBody;
        expect(body.serverNow).toBe(T0);
        expect(body.inventory).toEqual({ cap: 60, used: 1, reserved: 0 });
        expect(body.slots).toEqual({ total: 2, used: 0 });
        expect(body.slotOpens).toEqual({ hat: 1, scarf: 7, charm: 13 });
        expect(body.notice).toBeNull();
        expect(Object.keys(body.parts).sort()).toEqual([...PART_KINDS].sort());
        expect(body.skills).toHaveLength(3);
        const [item] = body.items;
        expect(Object.keys(item as ItemBody).sort()).toEqual(
          [
            'baseId',
            'createdAt',
            'dismantle',
            'equippedOn',
            'id',
            'itemLevel',
            'lines',
            'madeBy',
            'needs',
            'origin',
            'rarity',
            'slot',
            'source',
            'tag',
          ].sort(),
        );
        expect(item).toMatchObject({
          baseId: 'trail-cap',
          slot: 'hat',
          tag: 'neutral',
          rarity: 'common',
          itemLevel: 1,
          source: 'welcome',
          equippedOn: null,
          madeBy: null,
          origin: { kind: 'welcome' },
          needs: { level: 1, role: null },
        });
        // The base line and one rolled line, with tier pips for the rolled one.
        expect(item?.lines).toHaveLength(2);
        expect(item?.lines[0]).toMatchObject({ source: 'base', text: 'Attack +2%', tier: null });
        expect(item?.lines[1]).toMatchObject({ source: 'rolled', tier: 1, bestTier: 1 });
      },
      opts(),
    );
  });

  it('gives the kit once: a common level 1 Hat, a blueprint and enough scrap to craft', async () => {
    const rng = counting('welcome');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const first = await a.gear();
        const kit = rollWelcomeKit(createSeededRng('welcome'));
        expect(first.items).toHaveLength(1);
        expect(first.items[0]).toMatchObject({
          baseId: kit.item.baseId,
          rarity: 'common',
          itemLevel: 1,
        });
        expect(first.items[0]?.lines.filter((l) => l.source === 'rolled').map((l) => l.id)).toEqual(
          kit.item.lines.map((l) => l.id),
        );
        expect(first.blueprints).toMatchObject([{ baseId: kit.blueprint, marks: 0 }]);
        expect(first.parts.scrap).toBe(RULES.gear.drops.welcomeScrap);
        expect(first.grants).toHaveLength(1);
        expect(first.grants[0]).toMatchObject({ key: 'welcome', source: 'welcome' });
        const drawn = rng.drawn();
        expect(drawn).toBeGreaterThan(0);
        expect(first.parts.scrap).toBeGreaterThanOrEqual(craftCost(kit.blueprint).scrap ?? 0);

        // Loading again (and again) gives nothing and draws nothing.
        await a.gear();
        await a.gear();
        expect(count(ctx.sql, 'gear_items')).toBe(1);
        expect(count(ctx.sql, 'blueprints')).toBe(1);
        expect(partsOf(ctx, a.id).scrap).toBe(RULES.gear.drops.welcomeScrap);
        expect(rng.drawn()).toBe(drawn);

        const b = await player(ctx, 2);
        await b.gear();
        expect(count(ctx.sql, 'gear_items')).toBe(2);
        expect(count(ctx.sql, 'gear_grants', "key = 'welcome'")).toBe(2);
        const logged = events(ctx, 'gear_drop');
        expect(logged).toHaveLength(2);
        expect(logged[0]).toMatchObject({
          source: 'welcome',
          converted: 0,
          scrap: RULES.gear.drops.welcomeScrap,
          blueprint: kit.blueprint,
          blueprintDuplicate: false,
          gear: [
            {
              base: kit.item.baseId,
              rarity: 'common',
              level: 1,
              lines: kit.item.lines.map((l) => ({ id: l.id, tier: l.tier })),
            },
          ],
        });
      },
      { gearRng: rng },
    );
  });

  it('shows only the caller their own items, parts and loot', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const b = await player(ctx, 2);
        await a.gear();
        await b.gear();
        give(ctx, a.id, 'trail-cap');
        parts(ctx, b.id, { glimmer: 7 });
        const seenByA = await a.gear();
        const seenByB = await b.gear();
        expect(seenByA.items).toHaveLength(2);
        expect(seenByB.items).toHaveLength(1);
        expect(seenByA.parts.glimmer).toBe(0);
        expect(seenByB.parts.glimmer).toBe(7);
        expect(JSON.stringify(seenByA)).not.toContain(b.id);
      },
      opts(),
    );
  });

  it('rejects unauthenticated requests and other methods', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const res = await ctx.core.handle(new Request('https://creatures.test/api/gear'));
      expect(res.status).toBe(401);
      const p = await player(ctx, 1);
      expect((await p.call('POST', '/api/gear', {})).status).toBe(405);
      expect((await p.call('GET', '/api/workshop/jobs')).status).toBe(405);
    });
  });
});

describe('equip and the wear rule', () => {
  it('puts an item on one of your creatures and shows it in the collection', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { species: ['cindle', 'splashet', 'sproutle'] });
        skipWelcome(ctx, p.id);
        const itemId = give(ctx, p.id, 'coal-warm-cap', { rarity: 'epic', level: 5 });
        const [cindle] = p.creatureIds as [string];
        const res = await p.call('POST', equipPath(itemId), { creatureId: cindle });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['gear', 'result', 'state']);
        const result = res.body['result'] as { item: ItemBody; unequipped: ItemBody | null };
        expect(result.item.equippedOn).toBe(cindle);
        expect(result.item.lines.every((l) => l.active === true)).toBe(true);
        expect(result.unequipped).toBeNull();
        const state = res.body['state'] as {
          creatures: {
            id: string;
            stats: { hp: number; atk: number; spd: number };
            statsWithGear: { hp: number; atk: number; spd: number };
            gear: Record<string, unknown>[];
          }[];
        };
        const view = state.creatures.find((c) => c.id === cindle);
        expect(view?.gear).toEqual([
          { id: itemId, baseId: 'coal-warm-cap', slot: 'hat', rarity: 'epic', itemLevel: 5 },
        ]);
        expect(view?.statsWithGear.atk).toBeGreaterThan(view?.stats.atk ?? 0);
        expect(view?.statsWithGear.spd).toBe(view?.stats.spd);
        expect(state.creatures.filter((c) => c.gear.length > 0)).toHaveLength(1);
        expect(events(ctx, 'gear_equip')).toEqual([
          {
            base: 'coal-warm-cap',
            rarity: 'epic',
            level: 5,
            slot: 'hat',
            species: 'cindle',
            action: 'equip',
            swap: false,
          },
        ]);
      },
      opts(),
    );
  });

  it('refuses an item above the creature level, a locked slot and a role Charm of another role', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, {
          species: ['cindle', 'sproutle', 'splashet'],
          level: 6,
        });
        skipWelcome(ctx, p.id);
        const [cindle, sproutle] = p.creatureIds as [string, string, string];
        const high = give(ctx, p.id, 'trail-cap', { level: 7 });
        const scarf = give(ctx, p.id, 'patch-scarf', { level: 1 });
        const charm = give(ctx, p.id, 'trail-charm', { level: 1 });
        const bell = give(ctx, p.id, 'wardens-bell', { level: 1 });
        // Item level 7 on a level 6 creature.
        expect(await p.call('POST', equipPath(high), { creatureId: cindle })).toMatchObject({
          status: 409,
          body: { error: 'item_level_too_high' },
        });
        // The Scarf opens at 7, the Charm at 13.
        expect(await p.call('POST', equipPath(scarf), { creatureId: cindle })).toMatchObject({
          status: 409,
          body: { error: 'slot_locked' },
        });
        expect(await p.call('POST', equipPath(charm), { creatureId: cindle })).toMatchObject({
          status: 409,
          body: { error: 'slot_locked' },
        });
        // A creature of level 13 may wear a Charm, but a Guard's bell only fits a Guard.
        ctx.sql.exec('UPDATE creatures SET level = 13 WHERE user_id = ?', p.id);
        expect(await p.call('POST', equipPath(bell), { creatureId: cindle })).toMatchObject({
          status: 409,
          body: { error: 'wrong_role' },
        });
        expect((await p.call('POST', equipPath(bell), { creatureId: sproutle })).status).toBe(200);
        expect((await p.call('POST', equipPath(high), { creatureId: cindle })).status).toBe(200);
        expect((await p.call('POST', equipPath(scarf), { creatureId: cindle })).status).toBe(200);
        // Nothing the server refused was written.
        expect(count(ctx.sql, 'gear_items', 'equipped_on IS NOT NULL')).toBe(3);
      },
      opts(),
    );
  });

  it('wears one item per slot: a second Hat swaps, a Scarf sits next to it, a worn item moves', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 13 });
        skipWelcome(ctx, p.id);
        const [c1, c2] = p.creatureIds as [string, string];
        const hatA = give(ctx, p.id, 'trail-cap');
        const hatB = give(ctx, p.id, 'kelp-cap');
        const scarf = give(ctx, p.id, 'patch-scarf');
        const equip = (id: string, creatureId: string | null) =>
          p.call('POST', equipPath(id), { creatureId });
        await equip(hatA, c1);
        await equip(scarf, c1);
        const swap = await equip(hatB, c1);
        expect(swap.status).toBe(200);
        const out = swap.body['result'] as { item: ItemBody; unequipped: ItemBody };
        expect(out.item.id).toBe(hatB);
        expect(out.unequipped.id).toBe(hatA);
        expect(out.unequipped.equippedOn).toBeNull();
        expect(events(ctx, 'gear_equip').at(-1)).toMatchObject({ action: 'equip', swap: true });
        // The Scarf stayed on.
        expect(
          rows<{ id: string }>(
            ctx.sql,
            'SELECT id FROM gear_items WHERE equipped_on = ? ORDER BY slot',
            c1,
          ).map((r) => r.id),
        ).toEqual([hatB, scarf]);
        // The worn Hat moves to c2; c1 keeps only the Scarf.
        await equip(hatB, c2);
        const gear = await p.gear();
        expect(gear.items.find((i) => i.id === hatB)?.equippedOn).toBe(c2);
        expect(rows(ctx.sql, 'SELECT id FROM gear_items WHERE equipped_on = ?', c1)).toEqual([
          { id: scarf },
        ]);
        const off = await equip(hatB, null);
        expect(off.status).toBe(200);
        expect(events(ctx, 'gear_equip').at(-1)).toMatchObject({ action: 'unequip' });
        // Putting an item where it is changes nothing and logs nothing.
        const logged = events(ctx, 'gear_equip').length;
        await equip(scarf, c1);
        expect(events(ctx, 'gear_equip')).toHaveLength(logged);
      },
      opts(),
    );
  });

  it('marks a worn line that does nothing for the wearer as inactive', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { species: ['cindle', 'splashet', 'sproutle'], level: 13 });
        skipWelcome(ctx, p.id);
        const [cindle, , sproutle] = p.creatureIds as [string, string, string];
        const bell = give(ctx, p.id, 'wardens-bell', {
          rarity: 'rare',
          lines: [
            ['armor', 2],
            ['boost', 0],
          ],
        });
        const cinder = give(ctx, p.id, 'cinder-charm', { lines: [['attack', 0]] });
        const activeOf = (res: Json): [string, boolean | null][] =>
          (res.body['result'] as { item: ItemBody }).item.lines.map((l) => [l.id, l.active]);
        // A Cinder Charm's Ember Attunement idles on a Grove creature and works on an Ember one.
        expect(activeOf(await p.call('POST', equipPath(cinder), { creatureId: sproutle }))).toEqual(
          [
            ['ember-attunement', false],
            ['attack', true],
          ],
        );
        expect(activeOf(await p.call('POST', equipPath(cinder), { creatureId: cindle }))).toEqual([
          ['ember-attunement', true],
          ['attack', true],
        ]);
        const onGuild = await p.call('POST', equipPath(bell), { creatureId: sproutle });
        expect(onGuild.status).toBe(200);
        expect(
          (onGuild.body['result'] as { item: ItemBody }).item.lines.map((l) => [l.id, l.active]),
        ).toEqual([
          ['armor', true],
          ['armor', true],
          ['boost', false],
        ]);
      },
      opts(),
    );
  });

  it("refuses someone else's item and someone else's creature, with the same answer as 'not found'", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const b = await player(ctx, 2);
        skipWelcome(ctx, a.id);
        skipWelcome(ctx, b.id);
        const mine = give(ctx, a.id, 'trail-cap');
        const theirs = give(ctx, b.id, 'trail-cap');
        const unknown = '00000000-0000-4000-8000-000000000000';
        const own = a.creatureIds[0] as string;
        const stolen = await a.call('POST', equipPath(theirs), { creatureId: own });
        const missing = await a.call('POST', equipPath(unknown), { creatureId: own });
        expect(stolen).toEqual(missing);
        expect(stolen.status).toBe(404);
        const foreignCreature = await a.call('POST', equipPath(mine), {
          creatureId: b.creatureIds[0],
        });
        expect(foreignCreature.status).toBe(404);
        expect(count(ctx.sql, 'gear_items', 'equipped_on IS NOT NULL')).toBe(0);
      },
      opts(),
    );
  });

  it('validates the body strictly: unknown keys, wrong types and a bad id are rejected', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const item = give(ctx, p.id, 'trail-cap');
        const own = p.creatureIds[0] as string;
        const bad: unknown[] = [
          {},
          { creatureId: own, extra: 1 },
          { creatureId: 5 },
          { creatureId: 'not-a-uuid' },
          { creatureId: undefined },
          [],
          'x',
        ];
        for (const body of bad) {
          const res = await p.call('POST', equipPath(item), body);
          expect(res.status, JSON.stringify(body)).toBe(400);
        }
        expect((await p.call('POST', equipPath('not-an-id'), { creatureId: null })).status).toBe(
          400,
        );
      },
      opts(),
    );
  });
});

describe('Equip best', () => {
  const bestPath = '/api/gear/equip-best';

  it('puts the best wearable item in every open slot of a creature, and nothing that does not fit', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { species: ['cindle', 'splashet', 'sproutle'], level: 8 });
        skipWelcome(ctx, p.id);
        const [cindle] = p.creatureIds as [string];
        const weakHat = give(ctx, p.id, 'trail-cap');
        const goodHat = give(ctx, p.id, 'coal-warm-cap', {
          rarity: 'epic',
          level: 8,
          lines: [
            ['attack', 2],
            ['crit-damage', 2],
            ['ember-reaction', 2],
          ],
        });
        const tooHigh = give(ctx, p.id, 'coal-warm-cap', {
          rarity: 'epic',
          level: 12,
          lines: [
            ['attack', 3],
            ['crit-damage', 3],
            ['ember-reaction', 3],
          ],
        });
        const scarf = give(ctx, p.id, 'ember-muffler', { level: 7 });
        const charm = give(ctx, p.id, 'cinder-charm', { level: 5 });
        const res = await p.call('POST', bestPath, { creatureIds: [cindle] });
        expect(res.status).toBe(200);
        expect(res.body['result']).toEqual({
          changes: expect.arrayContaining([
            { creatureId: cindle, slot: 'hat', itemId: goodHat },
            { creatureId: cindle, slot: 'scarf', itemId: scarf },
          ]) as unknown,
          skipped: [],
        });
        const worn = rows<{ id: string }>(
          ctx.sql,
          'SELECT id FROM gear_items WHERE equipped_on = ?',
          cindle,
        ).map((r) => r.id);
        expect(worn.sort()).toEqual([goodHat, scarf].sort());
        expect(worn).not.toContain(tooHigh);
        expect(worn).not.toContain(weakHat);
        expect(worn).not.toContain(charm); // level 8 cannot wear a Charm yet
        // Repeating it changes nothing.
        const again = await p.call('POST', bestPath, { creatureIds: [cindle] });
        expect((again.body['result'] as { changes: unknown[] }).changes).toEqual([]);
      },
      opts(),
    );
  });

  it('shares the bag across a team, takes nothing from creatures outside it, and never takes a better item away from its wearer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, {
          species: ['cindle', 'sproutle', 'splashet'],
          level: 10,
        });
        skipWelcome(ctx, p.id);
        const [cindle, sproutle, splashet] = p.creatureIds as [string, string, string];
        const attackHat = give(ctx, p.id, 'coal-warm-cap', {
          rarity: 'rare',
          level: 10,
          lines: [
            ['attack', 2],
            ['crit-chance', 2],
          ],
        });
        const otherHat = give(ctx, p.id, 'acorn-cap', {
          rarity: 'rare',
          level: 10,
          lines: [
            ['attack', 1],
            ['crit-chance', 1],
          ],
        });
        // The Splashet (outside the team) wears the best Scarf: it is not taken.
        const keeper = give(ctx, p.id, 'leafknit-scarf', {
          rarity: 'epic',
          level: 10,
          lines: [
            ['hp', 2],
            ['aimed-ward', 2],
            ['brace', 2],
          ],
        });
        await p.call('POST', equipPath(keeper), { creatureId: splashet });
        // The Sproutle (a Guard) wears the better Hat: the team plan never takes it for a worse one
        // (a slot changes only for a better item), and the Cindle, whose Hat slot is empty, gets the other.
        await p.call('POST', equipPath(attackHat), { creatureId: sproutle });
        const res = await p.call('POST', bestPath, { creatureIds: [cindle, sproutle] });
        expect(res.status).toBe(200);
        const wornBy = (id: string) =>
          rows<{ equipped_on: string | null }>(
            ctx.sql,
            'SELECT equipped_on FROM gear_items WHERE id = ?',
            id,
          )[0]?.equipped_on;
        expect(wornBy(keeper)).toBe(splashet);
        expect(wornBy(attackHat)).toBe(sproutle);
        expect(wornBy(otherHat)).toBe(cindle);
        // The unique index (creature, slot) held throughout: no creature wears two of a slot.
        expect(
          rows(
            ctx.sql,
            'SELECT equipped_on, slot, COUNT(*) AS n FROM gear_items WHERE equipped_on IS NOT NULL GROUP BY equipped_on, slot HAVING n > 1',
          ),
        ).toEqual([]);
      },
      opts(),
    );
  });

  it("is the player's own: unknown, foreign and malformed creature lists are refused", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const b = await player(ctx, 2);
        skipWelcome(ctx, a.id);
        give(ctx, a.id, 'trail-cap');
        const foreign = await a.call('POST', bestPath, { creatureIds: [b.creatureIds[0]] });
        const unknown = await a.call('POST', bestPath, {
          creatureIds: ['00000000-0000-4000-8000-000000000000'],
        });
        expect(foreign).toEqual(unknown);
        expect(foreign.status).toBe(404);
        for (const body of [
          {},
          { creatureIds: [] },
          { creatureIds: 'x' },
          { creatureIds: [5] },
          { creatureIds: a.creatureIds, extra: 1 },
          { creatureIds: Array.from({ length: 25 }, () => a.creatureIds[0]) },
        ]) {
          expect((await a.call('POST', bestPath, body)).status, JSON.stringify(body)).toBe(400);
        }
        expect(count(ctx.sql, 'gear_items', 'equipped_on IS NOT NULL')).toBe(0);
      },
      opts(),
    );
  });
});

describe('dismantle', () => {
  it('returns the parts, removes the item and cannot be undone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'kelp-cap', { rarity: 'epic', level: 12 });
        const expected = dismantleYield({ baseId: 'kelp-cap', rarity: 'epic' });
        expect(expected).toEqual({ scrap: 10, 'tide-shard': 2, glimmer: 1 });
        const view = (await p.gear()).items[0] as ItemBody;
        expect(view.dismantle).toEqual(expected);
        const res = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: newKey() });
        expect(res.status).toBe(200);
        expect(res.body['result']).toEqual({
          gearId: id,
          baseId: 'kelp-cap',
          rarity: 'epic',
          itemLevel: 12,
          parts: expected,
          unequipped: false,
        });
        expect(count(ctx.sql, 'gear_items')).toBe(0);
        expect(partsOf(ctx, p.id)).toMatchObject({ scrap: 10, 'tide-shard': 2, glimmer: 1 });
        expect(events(ctx, 'gear_dismantle')[0]).toMatchObject({
          base: 'kelp-cap',
          rarity: 'epic',
          level: 12,
          scrap: 10,
          shards: 2,
          glimmer: 1,
        });
        // The item is gone: dismantling it again with a new key is a plain not-found.
        expect(
          (await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: newKey() })).status,
        ).toBe(404);
      },
      opts(),
    );
  });

  it('gives no shard for neutral, explorer and role items, and takes a worn item off first', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 13, species: ['sproutle', 'cindle', 'splashet'] });
        skipWelcome(ctx, p.id);
        const bell = give(ctx, p.id, 'wardens-bell', { rarity: 'rare' });
        await p.call('POST', equipPath(bell), { creatureId: p.creatureIds[0] });
        const res = await p.call('POST', `/api/gear/${bell}/dismantle`, {
          idempotencyKey: newKey(),
        });
        expect(res.body['result']).toMatchObject({ parts: { scrap: 5 }, unequipped: true });
        expect(count(ctx.sql, 'gear_items', 'equipped_on IS NOT NULL')).toBe(0);
      },
      opts(),
    );
  });

  it('is idempotent: a retry returns the stored result and credits the parts once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-cap');
        const key = newKey();
        const first = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: key });
        const again = await Promise.all(
          Array.from({ length: 3 }, () =>
            p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: key }),
          ),
        );
        for (const r of again) expect(r.body['result']).toEqual(first.body['result']);
        expect(partsOf(ctx, p.id).scrap).toBe(2);
        expect(events(ctx, 'gear_dismantle')).toHaveLength(1);
        // The same key for another item is a conflict.
        const other = give(ctx, p.id, 'trail-cap', { seed: 'other' });
        expect(
          await p.call('POST', `/api/gear/${other}/dismantle`, { idempotencyKey: key }),
        ).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
        expect(count(ctx.sql, 'gear_items')).toBe(1);
      },
      opts(),
    );
  });

  it("refuses someone else's item and malformed bodies", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const b = await player(ctx, 2);
        skipWelcome(ctx, a.id);
        skipWelcome(ctx, b.id);
        const theirs = give(ctx, b.id, 'trail-cap');
        expect(
          (await a.call('POST', `/api/gear/${theirs}/dismantle`, { idempotencyKey: newKey() }))
            .status,
        ).toBe(404);
        for (const body of [{}, { idempotencyKey: 'x' }, { idempotencyKey: newKey(), extra: 1 }]) {
          expect((await a.call('POST', `/api/gear/${theirs}/dismantle`, body)).status).toBe(400);
        }
        expect(count(ctx.sql, 'gear_items')).toBe(1);
      },
      opts(),
    );
  });
});

describe('what gear v2 removed', () => {
  it('answers an old upgrade with a clear code and changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-cap');
        ctx.core.credit({
          userId: p.id,
          currency: 'essence',
          amount: 100,
          source: 'test',
          idempotencyKey: 'removed-essence',
        });
        parts(ctx, p.id, { scrap: 10 });
        const res = await p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: newKey() });
        expect(res).toEqual({ status: 410, body: { error: 'gear_upgrade_removed' } });
        expect((await p.gear()).balances.essence).toBe(100);
        expect(partsOf(ctx, p.id).scrap).toBe(10);
      },
      opts(),
    );
  });

  it('answers Improve and Enchant jobs with a clear code, before anything is paid or validated', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 50, glimmer: 3, 'tide-shard': 5 });
        const [c1] = p.creatureIds as [string];
        for (const body of [
          {
            kind: 'improve',
            creatureId: c1,
            gearId: id,
            secondaryIndex: 0,
            idempotencyKey: newKey(),
          },
          {
            kind: 'enchant',
            creatureId: c1,
            gearId: id,
            enchantId: 'steady-hand',
            idempotencyKey: newKey(),
          },
          { kind: 'improve' },
        ]) {
          expect(await p.call('POST', '/api/workshop/jobs', body)).toEqual({
            status: 410,
            body: { error: 'job_kind_removed' },
          });
        }
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
        expect(partsOf(ctx, p.id).scrap).toBe(50);
      },
      opts(),
    );
  });
});

describe('workshop jobs: starting', () => {
  it('starts a craft: pays the parts now, takes 3 hours, holds a place and the creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'kelp-cap');
        parts(ctx, p.id, { scrap: 30, 'tide-shard': 3 });
        const [c1] = p.creatureIds as [string];
        const res = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'kelp-cap',
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['gear', 'result', 'state']);
        const jobId = (res.body['result'] as { jobId: string }).jobId;
        const gear = res.body['gear'] as GearBody;
        const job = gear.jobs.find((j) => j.id === jobId) as JobBody;
        expect(job).toMatchObject({
          creatureId: c1,
          kind: 'craft',
          input: { baseId: 'kelp-cap' },
          cost: { scrap: 6, 'tide-shard': 1 },
          startedAt: T0,
          endsAt: T0 + 3 * HOUR,
          status: 'running',
          claimedAt: null,
          result: null,
        });
        expect(partsOf(ctx, p.id)).toMatchObject({ scrap: 24, 'tide-shard': 2 });
        expect(gear.slots).toEqual({ total: 2, used: 1 });
        expect(gear.inventory).toEqual({ cap: 60, used: 0, reserved: 1 });
        const state = res.body['state'] as {
          creatures: { id: string; away: boolean; busy: unknown }[];
        };
        expect(state.creatures.find((c) => c.id === c1)).toMatchObject({
          away: false,
          busy: { kind: 'job', id: jobId },
        });
        expect(events(ctx, 'job_start')).toEqual([
          {
            job: 'craft',
            base: 'kelp-cap',
            rarity: 'common',
            species: rows<{ species: string }>(
              ctx.sql,
              'SELECT species FROM creatures WHERE id = ?',
              c1,
            )[0]?.species,
            hours: 3,
            skillLevel: 1,
            parts: { scrap: 6, 'tide-shard': 1 },
          },
        ]);
      },
      opts(),
    );
  });

  it('a neutral base takes plain scrap and no shard', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 8 });
        const res = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: p.creatureIds[0],
          blueprintId: 'trail-cap',
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        expect(partsOf(ctx, p.id).scrap).toBe(0);
      },
      opts(),
    );
  });

  it('rejects: unknown blueprint, too few parts, a base outside the content and a role Charm', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const craft = (blueprintId: string) =>
          p.call('POST', '/api/workshop/jobs', {
            kind: 'craft',
            creatureId: c1,
            blueprintId,
            idempotencyKey: newKey(),
          });
        expect(await craft('trail-cap')).toMatchObject({
          status: 409,
          body: { error: 'blueprint_unknown' },
        });
        learn(ctx, p.id, 'trail-cap');
        expect(await craft('trail-cap')).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        parts(ctx, p.id, { scrap: 5 });
        expect(await craft('trail-cap')).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        expect(partsOf(ctx, p.id).scrap).toBe(5);
        expect((await craft('no-such-base')).status).toBe(400);
        // A Warden's Bell and a Festival piece cannot be crafted at all.
        expect((await craft('wardens-bell')).status).toBe(400);
        expect((await craft('festival-lantern-charm')).status).toBe(400);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
      },
      opts(),
    );
  });

  it('rejects a full inventory (counting crafts still in the workshop) and a full workshop', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 3 });
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 100 });
        const [c1, c2, c3] = p.creatureIds as [string, string, string];
        const craft = (creatureId: string) =>
          p.call('POST', '/api/workshop/jobs', {
            kind: 'craft',
            creatureId,
            blueprintId: 'trail-cap',
            idempotencyKey: newKey(),
          });
        for (let i = 0; i < RULES.gear.inventoryCap - 1; i++) {
          give(ctx, p.id, 'trail-cap', { seed: `bulk${String(i)}` });
        }
        expect((await craft(c1)).status).toBe(200);
        expect(await craft(c2)).toMatchObject({ status: 409, body: { error: 'inventory_full' } });
        expect(partsOf(ctx, p.id).scrap).toBe(100 - RULES.gear.craft.plainScrap);
        ctx.sql.exec("DELETE FROM gear_items WHERE source = 'test'");
        expect((await craft(c2)).status).toBe(200);
        expect(await craft(c3)).toMatchObject({ status: 409, body: { error: 'workshop_full' } });
        expect(count(ctx.sql, 'workshop_jobs')).toBe(2);
      },
      opts(),
    );
  });

  it('rejects a creature that is busy, or not yours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 100 });
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 100,
          source: 'test',
          idempotencyKey: 'bait',
        });
        const [c1, c2] = p.creatureIds as [string, string];
        const craft = (creatureId: string) =>
          p.call('POST', '/api/workshop/jobs', {
            kind: 'craft',
            creatureId,
            blueprintId: 'trail-cap',
            idempotencyKey: newKey(),
          });
        const sent = await p.call('POST', '/api/expeditions', {
          creatureId: c1,
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(sent.status).toBe(200);
        expect(await craft(c1)).toMatchObject({ status: 409, body: { error: 'creature_away' } });
        expect((await craft(c2)).status).toBe(200);
        expect(await craft(c2)).toMatchObject({ status: 409, body: { error: 'creature_on_job' } });
        const foreign = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: other.creatureIds[0],
          blueprintId: 'trail-cap',
          idempotencyKey: newKey(),
        });
        expect(foreign.status).toBe(404);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(1);
      },
      opts(),
    );
  });

  it('is idempotent: the same key starts one job and pays once; a different job on the key is a conflict', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 100 });
        const [c1, c2] = p.creatureIds as [string, string];
        const key = newKey();
        const body = {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-cap',
          idempotencyKey: key,
        };
        const first = await p.call('POST', '/api/workshop/jobs', body);
        const many = await Promise.all(
          Array.from({ length: 4 }, () => p.call('POST', '/api/workshop/jobs', body)),
        );
        for (const r of many) {
          expect(r.status).toBe(200);
          expect(r.body['result']).toEqual(first.body['result']);
        }
        expect(count(ctx.sql, 'workshop_jobs')).toBe(1);
        expect(partsOf(ctx, p.id).scrap).toBe(100 - RULES.gear.craft.plainScrap);
        expect(events(ctx, 'job_start')).toHaveLength(1);
        const other = await p.call('POST', '/api/workshop/jobs', { ...body, creatureId: c2 });
        expect(other).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
      },
      opts(),
    );
  });

  it('validates the body strictly, per kind', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        const key = newKey();
        const bad: unknown[] = [
          {},
          { kind: 'sing', creatureId: c1, idempotencyKey: key },
          { kind: 'craft', creatureId: c1, idempotencyKey: key },
          {
            kind: 'craft',
            creatureId: c1,
            blueprintId: 'trail-cap',
            gearId: 'x',
            idempotencyKey: key,
          },
          {
            kind: 'craft',
            creatureId: c1,
            blueprintId: 'trail-cap',
            idempotencyKey: key,
            extra: 1,
          },
          { kind: 'craft', creatureId: 'nope', blueprintId: 'trail-cap', idempotencyKey: key },
          { kind: 'craft', creatureId: c1, blueprintId: 'trail-cap', idempotencyKey: 'x' },
          { kind: 'supply', creatureId: c1, idempotencyKey: key },
          { kind: 'supply', creatureId: c1, supplyId: 'not-a-supply', idempotencyKey: key },
        ];
        for (const body of bad) {
          const res = await p.call('POST', '/api/workshop/jobs', body);
          expect(res.status, JSON.stringify(body)).toBe(400);
        }
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
      },
      opts(),
    );
  });

  it('Busy paws on the creature shorten the job, and the job still pays its nominal XP', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 10 });
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 50 });
        const [c1] = p.creatureIds as [string];
        const hat = give(ctx, p.id, 'trail-cap', {
          rarity: 'rare',
          level: 10,
          lines: [
            ['busy-paws', 2],
            ['apprentice', 2],
          ],
        });
        await p.call('POST', equipPath(hat), { creatureId: c1 });
        const start = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-cap',
          idempotencyKey: newKey(),
        });
        const job = (start.body['gear'] as GearBody).jobs[0] as JobBody;
        // Busy paws tier III is -7%.
        expect(job.endsAt - job.startedAt).toBe(jobDuration(1, 700));
        expect(job.endsAt - job.startedAt).toBeLessThan(3 * HOUR);
        ctx.clock.t = job.endsAt;
        const res = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        // 3 nominal hours is 36 XP, +20% (Apprentice tier III).
        expect(res.body['result']).toMatchObject({ xp: 43 });
      },
      opts(),
    );
  });
});

describe('workshop jobs: claiming', () => {
  async function startCraft(p: Api, baseId = 'kelp-cap', creatureIndex = 0): Promise<string> {
    const res = await p.call('POST', '/api/workshop/jobs', {
      kind: 'craft',
      creatureId: p.creatureIds[creatureIndex],
      blueprintId: baseId,
      idempotencyKey: newKey(),
    });
    expect(res.status).toBe(200);
    return (res.body['result'] as { jobId: string }).jobId;
  }

  it('rolls the item when claimed, with the live rng at that moment: item level, lines, maker', async () => {
    const rng = counting('claim');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'kelp-cap');
        parts(ctx, p.id, { scrap: 30, 'tide-shard': 3 });
        // 70 XP already (Crafting level 1): the 36 XP of the 3 hour craft takes it over level 2 (100).
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 70)',
          p.id,
          p.creatureIds[0],
        );
        ctx.sql.exec('UPDATE creatures SET nickname = ? WHERE id = ?', 'Pebble', p.creatureIds[0]);
        const jobId = await startCraft(p);
        expect(rng.drawn()).toBe(0);

        ctx.clock.t = T0 + 3 * HOUR - 1;
        expect(
          await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: newKey() }),
        ).toMatchObject({ status: 409, body: { error: 'not_ready' } });
        expect(rng.drawn()).toBe(0);
        expect(count(ctx.sql, 'gear_items')).toBe(0);

        ctx.clock.t = T0 + 3 * HOUR;
        const res = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        // The same draws a direct call with the same seed makes (Crafting level 1: item level 2).
        const expected = rollCraft(createSeededRng('claim'), 'kelp-cap', 1);
        expect(res.body['result']).toMatchObject({
          kind: 'craft',
          baseId: 'kelp-cap',
          rarity: expected.rarity,
          itemLevel: 2,
          upgraded: false,
          xp: 36,
          skillXp: 106,
          skillLevel: 2,
          leveledUp: true,
        });
        const stored = rows<{
          lines_json: string;
          item_level: number;
          made_by: string;
          made_by_name: string;
          made_at: number;
          source: string;
          origin_json: string;
        }>(ctx.sql, 'SELECT * FROM gear_items');
        expect(stored).toHaveLength(1);
        expect(JSON.parse(stored[0]?.lines_json ?? '[]')).toEqual(expected.lines);
        expect(stored[0]).toMatchObject({
          item_level: 2,
          made_by: p.creatureIds[0],
          made_by_name: 'Pebble',
          made_at: T0 + 3 * HOUR,
          source: 'craft',
        });
        expect(rng.drawn()).toBeGreaterThan(0);
        const gear = res.body['gear'] as GearBody;
        expect(gear.inventory).toEqual({ cap: 60, used: 1, reserved: 0 });
        expect(gear.items[0]).toMatchObject({
          madeBy: { name: 'Pebble', at: T0 + 3 * HOUR },
          origin: { kind: 'craft' },
          itemLevel: 2,
        });
        expect(events(ctx, 'job_claim')).toEqual([
          {
            job: 'craft',
            base: 'kelp-cap',
            rarity: expected.rarity,
            upgraded: false,
            xp: 36,
            skillLevel: 2,
            leveledUp: true,
          },
        ]);
      },
      { gearRng: rng },
    );
  });

  it('a crafter of Crafting level 5 makes item level 10', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 20 });
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 700)',
          p.id,
          p.creatureIds[0],
        );
        expect(skillLevel(700)).toBe(5);
        const jobId = await startCraft(p, 'trail-cap');
        ctx.clock.t += 4 * HOUR;
        const res = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.body['result']).toMatchObject({ itemLevel: 10 });
        expect(rows<{ item_level: number }>(ctx.sql, 'SELECT item_level FROM gear_items')).toEqual([
          { item_level: 10 },
        ]);
      },
      opts(),
    );
  });

  it('is idempotent: claiming again, with the same or another key, rolls nothing and pays nothing more', async () => {
    const rng = counting('claim-twice');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'kelp-cap');
        parts(ctx, p.id, { scrap: 30, 'tide-shard': 3 });
        const jobId = await startCraft(p);
        ctx.clock.t = T0 + 3 * HOUR;
        const key = newKey();
        const first = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: key,
        });
        const drawn = rng.drawn();
        const same = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: key,
        });
        const other = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        const many = await Promise.all(
          Array.from({ length: 4 }, () =>
            p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: newKey() }),
          ),
        );
        for (const r of [same, other, ...many]) {
          expect(r.status).toBe(200);
          expect(r.body['result']).toEqual(first.body['result']);
        }
        expect(rng.drawn()).toBe(drawn);
        expect(count(ctx.sql, 'gear_items')).toBe(1);
        expect(rows<{ xp: number }>(ctx.sql, 'SELECT xp FROM crafting_skill')).toEqual([
          { xp: 36 },
        ]);
        expect(events(ctx, 'job_claim')).toHaveLength(1);
        expect(
          await p.call(
            'POST',
            `/api/workshop/jobs/${'00000000-0000-4000-8000-000000000000'}/claim`,
            { idempotencyKey: key },
          ),
        ).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
      },
      { gearRng: rng },
    );
  });

  it("404s for an unknown job and for someone else's, and rejects bad bodies", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const b = await player(ctx, 2);
        skipWelcome(ctx, a.id);
        learn(ctx, a.id, 'trail-cap');
        parts(ctx, a.id, { scrap: 20 });
        const jobId = await startCraft(a, 'trail-cap');
        ctx.clock.t = T0 + 4 * HOUR;
        const stolen = await b.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        const missing = await b.call(
          'POST',
          '/api/workshop/jobs/00000000-0000-4000-8000-000000000000/claim',
          { idempotencyKey: newKey() },
        );
        expect(stolen).toEqual(missing);
        expect(stolen.status).toBe(404);
        expect(count(ctx.sql, 'gear_items')).toBe(0);
        for (const body of [{}, { idempotencyKey: 'x' }, { idempotencyKey: newKey(), extra: 1 }]) {
          expect((await a.call('POST', `/api/workshop/jobs/${jobId}/claim`, body)).status).toBe(
            400,
          );
        }
        expect(
          (await a.call('POST', '/api/workshop/jobs/nope/claim', { idempotencyKey: newKey() }))
            .status,
        ).toBe(400);
      },
      opts(),
    );
  });

  it('shortens later jobs by 3% per skill level and keeps XP at the nominal hours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 100 });
        const [c1] = p.creatureIds as [string];
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 100)',
          p.id,
          c1,
        );
        const start = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-cap',
          idempotencyKey: newKey(),
        });
        const job = (start.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job.endsAt - job.startedAt).toBe(jobDuration(2));
        expect(job.endsAt - job.startedAt).toBeLessThan(3 * HOUR);
        ctx.clock.t = job.endsAt;
        const res = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.body['result']).toMatchObject({
          xp: 36,
          skillXp: 136,
          skillLevel: 2,
          leveledUp: false,
        });
      },
      opts(),
    );
  });

  it('a craft can come out Rare (one rarity up), by the crafter’s skill', async () => {
    let seed = 'up-0';
    for (let i = 0; i < 400; i++) {
      if (rollCraft(createSeededRng(`up-${String(i)}`), 'trail-cap', 10).rarity === 'rare') {
        seed = `up-${String(i)}`;
        break;
      }
    }
    expect(rollCraft(createSeededRng(seed), 'trail-cap', 10).rarity).toBe('rare');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-cap');
        parts(ctx, p.id, { scrap: 100 });
        const [c1] = p.creatureIds as [string];
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 6000)',
          p.id,
          c1,
        );
        const start = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-cap',
          idempotencyKey: newKey(),
        });
        const job = (start.body['gear'] as GearBody).jobs[0] as JobBody;
        ctx.clock.t = job.endsAt;
        const res = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.body['result']).toMatchObject({
          rarity: 'rare',
          upgraded: true,
          skillLevel: 10,
          itemLevel: 20,
        });
        const row = rows<{ rarity: string; lines_json: string }>(
          ctx.sql,
          'SELECT rarity, lines_json FROM gear_items',
        )[0];
        expect(row?.rarity).toBe('rare');
        expect(JSON.parse(row?.lines_json ?? '[]')).toHaveLength(2);
        expect(events(ctx, 'job_claim')[0]).toMatchObject({ upgraded: true, rarity: 'rare' });
      },
      { gearRng: createSeededRng(seed) },
    );
  });

  it('finishes an Improve job started before gear v2: its XP, and the parts come back', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1] = p.creatureIds as [string];
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES ('00000000-0000-4000-8000-0000000000aa', ?, ?, 'improve', NULL, ?, ?, ?)`,
          p.id,
          c1,
          JSON.stringify({ rarity: 'rare', gearId: 'gone', secondaryIndex: 0, cost: { scrap: 6 } }),
          T0,
          T0 + 2 * HOUR,
        );
        ctx.clock.t = T0 + 2 * HOUR;
        const res = await p.call(
          'POST',
          '/api/workshop/jobs/00000000-0000-4000-8000-0000000000aa/claim',
          {
            idempotencyKey: newKey(),
          },
        );
        expect(res.status).toBe(200);
        expect(res.body['result']).toMatchObject({
          kind: 'retired',
          was: 'improve',
          refund: { scrap: 6 },
          xp: 24,
        });
        expect(partsOf(ctx, p.id).scrap).toBe(6);
        const again = await p.call(
          'POST',
          '/api/workshop/jobs/00000000-0000-4000-8000-0000000000aa/claim',
          {
            idempotencyKey: newKey(),
          },
        );
        expect(again.body['result']).toEqual(res.body['result']);
        expect(partsOf(ctx, p.id).scrap).toBe(6);
      },
      opts(),
    );
  });
});

describe('analytics and privacy', () => {
  it('logs gear events once per action, with content ids and numbers only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        await p.gear(); // welcome kit
        const a = give(ctx, p.id, 'kelp-cap', { rarity: 'rare', level: 4 });
        await p.call('POST', equipPath(a), { creatureId: p.creatureIds[0] });
        await p.call('POST', `/api/gear/${a}/dismantle`, { idempotencyKey: newKey() });
        const all = rows<{ kind: string; actor_hash: string | null; props_json: string }>(
          ctx.sql,
          "SELECT kind, actor_hash, props_json FROM analytics_events WHERE kind LIKE 'gear_%' OR kind LIKE 'job_%' ORDER BY id",
        );
        expect(all.map((e) => e.kind)).toEqual(['gear_drop', 'gear_equip', 'gear_dismantle']);
        const haystack = JSON.stringify(all);
        expect(haystack).not.toContain(p.id);
        expect(haystack).not.toContain('Player 1');
        for (const e of all) expect(e.actor_hash).toMatch(/^[0-9a-f]{32}$/);
      },
      opts(),
    );
  });

  it('rebuilds every gear prop from checked values', async () => {
    const { propsOf } = await import('../src/analytics');
    expect(
      propsOf({
        kind: 'gear_drop',
        source: 'someone typed this' as never,
        gear: [
          {
            base: 'Misa the Mighty',
            rarity: 'legendary' as never,
            level: 99,
            lines: [{ id: '<b>x</b>', tier: 9 }],
          },
        ],
        converted: -3,
        scrap: 1.9,
        shards: 2,
        glimmer: 3,
        blueprint: '<b>x</b>',
        blueprintDuplicate: 1 as never,
      }),
    ).toEqual({
      source: 'raid_phase',
      gear: [{ base: 'unknown', rarity: 'common', level: 20, lines: [{ id: 'unknown', tier: 4 }] }],
      converted: 0,
      scrap: 1,
      shards: 2,
      glimmer: 3,
      blueprint: 'unknown',
      blueprintDuplicate: true,
    });
    expect(
      propsOf({
        kind: 'job_claim',
        job: 'sing' as never,
        base: 'x',
        rarity: 'festival',
        upgraded: false,
        xp: -1,
        skillLevel: 1000,
        leveledUp: false,
      }),
    ).toEqual({
      job: 'craft',
      base: 'unknown',
      rarity: 'festival',
      upgraded: false,
      xp: 0,
      skillLevel: 99,
      leveledUp: false,
    });
    expect(gearBase('trail-cap')).toBeDefined();
  });

  it('writes the per-kind parts of a grant, a dismantle and a job only for real kinds and amounts', async () => {
    const { propsOf } = await import('../src/analytics');
    const messy = { scrap: 3.7, 'tide-shard': -2, glimmer: 0, 'free-text': 9, 'spark-shard': 1 };
    const drop = propsOf({
      kind: 'gear_drop',
      source: 'dungeon',
      gear: [],
      converted: 0,
      scrap: 3,
      shards: 1,
      glimmer: 0,
      blueprint: null,
      blueprintDuplicate: false,
      parts: messy,
    });
    expect(drop['parts']).toEqual({ scrap: 3, 'spark-shard': 1 });
    const none = propsOf({
      kind: 'gear_dismantle',
      base: 'x',
      rarity: 'common',
      level: 0,
      scrap: 0,
      shards: 0,
      glimmer: 0,
      unequipped: false,
      parts: {},
    });
    expect('parts' in none).toBe(false);
    const job = propsOf({
      kind: 'job_start',
      job: 'craft',
      base: 'x',
      rarity: 'common',
      species: 'splashet',
      hours: 1,
      skillLevel: 1,
      parts: messy,
    });
    expect(job['parts']).toEqual({ scrap: 3, 'spark-shard': 1 });
    expect(
      propsOf({
        kind: 'job_claim',
        job: 'supply',
        base: 'x',
        rarity: 'common',
        upgraded: false,
        xp: 1,
        skillLevel: 1,
        leveledUp: false,
        yield: 4.9,
      })['yield'],
    ).toBe(4);
  });
});
