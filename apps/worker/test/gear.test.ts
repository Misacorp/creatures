import {
  PART_KINDS,
  RULES,
  createSeededRng,
  craftCost,
  craftRarity,
  dismantleYield,
  gearBase,
  gearContent,
  jobDuration,
  rerollSecondary,
  rollGear,
  rollWelcomeKit,
  skillLevel,
  upgradeCost,
  type GearRarity,
  type GearRolls,
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

interface ItemBody {
  id: string;
  baseId: string;
  rarity: GearRarity;
  level: number;
  maxLevel: number;
  primary: { stat: string; bp: number };
  secondaries: { stat: string; bp: number }[];
  enchantId: string | null;
  enchantActive: boolean | null;
  equippedOn: string | null;
  jobId: string | null;
  upgradeCost: { essence: number; scrap: number } | null;
  dismantle: PartsBundle;
  source: string;
  createdAt: number;
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
  gear: { id: string; baseId: string; rarity: string }[];
  converted: { baseId: string; rarity: string }[];
  parts: PartsBundle;
  blueprints: { baseId: string; rarity: string; duplicate: boolean }[];
}

interface GearBody {
  serverNow: number;
  balances: { bait: number; essence: number };
  inventory: { cap: number; used: number; reserved: number };
  items: ItemBody[];
  parts: Record<PartKind, number>;
  blueprints: { baseId: string; rarity: string; learnedAt: number }[];
  jobs: JobBody[];
  slots: { total: number; used: number };
  skills: { creatureId: string; xp: number; level: number; nextLevelXp: number | null }[];
  grants: GrantBody[];
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

const give = (
  ctx: CoreContext,
  userId: string,
  baseId: string,
  rarity: GearRarity = 'common',
  seed = 'give',
): string =>
  insertItem(
    ctx.sql,
    userId,
    {
      baseId,
      rarity,
      rolls: rollGear(createSeededRng(`${seed}:${baseId}:${rarity}`), baseId, rarity),
    },
    'test',
    ctx.clock.t,
  );

const parts = (ctx: CoreContext, userId: string, bundle: PartsBundle): void =>
  creditParts(ctx.sql, userId, bundle);

const essence = (ctx: CoreContext, userId: string, amount: number): void => {
  ctx.core.credit({
    userId,
    currency: 'essence',
    amount,
    source: 'test',
    idempotencyKey: `gear-test:${userId}:${String(++keyCounter)}`,
  });
};

const learn = (ctx: CoreContext, userId: string, baseId: string): void => {
  ctx.sql.exec(
    'INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, ?, ?, ?)',
    userId,
    baseId,
    gearBase(baseId)?.blueprint ?? 'common',
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

describe('migration 17', () => {
  it('creates the gear tables on a fresh database, with the constraints', async () => {
    await runCore(nextGuild(), ({ sql }) => {
      const names = rows<{ name: string }>(
        sql,
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ).map((r) => r.name);
      for (const t of [
        'gear_items',
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
      // Amounts cannot go negative.
      expect(() =>
        sql.exec("INSERT INTO parts (user_id, kind, amount) VALUES ('u', 'scrap', -1)"),
      ).toThrow();
      expect(() =>
        sql.exec("INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES ('u', 'c', -1)"),
      ).toThrow();
      // A creature wears at most one item.
      const item = (id: string, creature: string | null) =>
        sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, rarity, level, rolls_json, equipped_on, source, created_at)
           VALUES (?, 'u', 'trail-charm', 'common', 0, '{}', ?, 't', 0)`,
          id,
          creature,
        );
      item('a', 'c1');
      expect(() => item('b', 'c1')).toThrow();
      item('c', null);
      item('d', null); // unequipped items do not collide
      expect(() =>
        sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, rarity, level, rolls_json, source, created_at)
           VALUES ('e', 'u', 'trail-charm', 'common', 6, '{}', 't', 0)`,
        ),
      ).toThrow(); // level 0 to 5
      expect(() =>
        sql.exec(
          `INSERT INTO gear_items (id, user_id, base_id, rarity, level, rolls_json, source, created_at)
           VALUES ('f', 'u', 'trail-charm', 'legendary', 0, '{}', 't', 0)`,
        ),
      ).toThrow();
      // A creature is on at most one open job, an item in at most one open job.
      const job = (id: string, creature: string, gear: string | null, claimed: number | null) =>
        sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at)
           VALUES (?, 'u', ?, 'improve', ?, '{}', 0, 1, ?)`,
          id,
          creature,
          gear,
          claimed,
        );
      job('j1', 'c1', 'g1', null);
      expect(() => job('j2', 'c1', 'g2', null)).toThrow();
      expect(() => job('j3', 'c2', 'g1', null)).toThrow();
      job('j4', 'c2', 'g2', 1);
      job('j5', 'c2', 'g1', 1); // finished jobs do not hold anything
      expect(() =>
        sql.exec(
          "INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at) VALUES ('j6', 'u', 'c9', 'sing', '{}', 0, 1)",
        ),
      ).toThrow();
      return Promise.resolve();
    });
  });

  it('applies on a schema-16 database, keeping its data, and can be replayed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1);
      expect(count(ctx.sql, 'creatures')).toBe(3);
      undoGearMigration(ctx.sql);
      expect(
        rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
      ).toBe(16);
      expect(
        rows(ctx.sql, "SELECT name FROM sqlite_master WHERE name IN ('gear_items', 'parts')"),
      ).toEqual([]);
      ctx.core.migrate();
      expect(
        rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
      ).toBe(LATEST_SCHEMA_VERSION);
      expect(count(ctx.sql, 'creatures')).toBe(3);
      expect(count(ctx.sql, 'gear_items')).toBe(0);
      ctx.core.migrate();
      expect(count(ctx.sql, 'schema_version')).toBe(LATEST_SCHEMA_VERSION);
      expect((await p.gear()).inventory.used).toBe(1); // the welcome kit, on first load
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
            'parts',
            'serverNow',
            'skills',
            'slots',
          ].sort(),
        );
        const body = res.body as unknown as GearBody;
        expect(body.serverNow).toBe(T0);
        expect(body.inventory).toEqual({ cap: 60, used: 1, reserved: 0 });
        expect(body.slots).toEqual({ total: 2, used: 0 });
        expect(Object.keys(body.parts).sort()).toEqual([...PART_KINDS].sort());
        expect(body.skills).toHaveLength(3);
        expect(body.skills[0]).toEqual({
          creatureId: p.creatureIds[0],
          xp: 0,
          level: 1,
          nextLevelXp: RULES.gear.skill.xpForLevel[1],
        });
        const [item] = body.items;
        expect(Object.keys(item as ItemBody).sort()).toEqual(
          [
            'baseId',
            'createdAt',
            'dismantle',
            'enchantActive',
            'enchantId',
            'equippedOn',
            'id',
            'jobId',
            'level',
            'maxLevel',
            'primary',
            'rarity',
            'secondaries',
            'source',
            'upgradeCost',
          ].sort(),
        );
        expect(item).toMatchObject({
          rarity: 'common',
          level: 0,
          maxLevel: 5,
          source: 'welcome',
          equippedOn: null,
          jobId: null,
          enchantId: null,
          enchantActive: null,
          secondaries: [],
          upgradeCost: { essence: 20, scrap: 2 },
        });
      },
      opts(),
    );
  });

  it('gives the kit once: a common item, a common blueprint and enough scrap to craft', async () => {
    const rng = counting('welcome');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const first = await a.gear();
        const kit = rollWelcomeKit(createSeededRng('welcome'));
        expect(first.items).toHaveLength(1);
        expect(first.items[0]).toMatchObject({ baseId: kit.item.baseId, rarity: 'common' });
        expect(first.items[0]?.primary.bp).toBe(kit.item.rolls.primary);
        expect(first.blueprints).toMatchObject([{ baseId: kit.blueprint, rarity: 'common' }]);
        expect(first.parts.scrap).toBe(RULES.gear.drops.welcomeScrap);
        expect(first.grants).toHaveLength(1);
        expect(first.grants[0]).toMatchObject({ key: 'welcome', source: 'welcome' });
        const drawn = rng.drawn();
        expect(drawn).toBeGreaterThan(0);
        // The welcome scrap pays for the blueprint's craft: crafting can start on day 1.
        expect(first.parts.scrap).toBeGreaterThanOrEqual(craftCost(kit.blueprint).scrap ?? 0);

        // Loading again (and again) gives nothing and draws nothing.
        await a.gear();
        await a.gear();
        expect(count(ctx.sql, 'gear_items')).toBe(1);
        expect(count(ctx.sql, 'blueprints')).toBe(1);
        expect(partsOf(ctx, a.id).scrap).toBe(RULES.gear.drops.welcomeScrap);
        expect(rng.drawn()).toBe(drawn);

        // Every player gets their own kit, once.
        const b = await player(ctx, 2);
        await b.gear();
        expect(count(ctx.sql, 'gear_items')).toBe(2);
        expect(count(ctx.sql, 'gear_grants', "key = 'welcome'")).toBe(2);
        // One analytics event per grant, with content ids and numbers only.
        const logged = events(ctx, 'gear_drop');
        expect(logged).toHaveLength(2);
        expect(logged[0]).toMatchObject({
          source: 'welcome',
          converted: 0,
          scrap: RULES.gear.drops.welcomeScrap,
          shards: 0,
          glimmer: 0,
          blueprint: kit.blueprint,
          blueprintDuplicate: false,
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
        give(ctx, a.id, 'trail-charm');
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

describe('equip', () => {
  it('puts an item on one of your creatures and shows it in the collection', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { species: ['cindle', 'splashet', 'sproutle'] });
        skipWelcome(ctx, p.id);
        const itemId = give(ctx, p.id, 'cinder-charm', 'epic');
        const [cindle] = p.creatureIds as [string];
        const res = await p.call('POST', `/api/gear/${itemId}/equip`, { creatureId: cindle });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['gear', 'result', 'state']);
        const result = res.body['result'] as { item: ItemBody; unequipped: ItemBody | null };
        expect(result.item.equippedOn).toBe(cindle);
        expect(result.unequipped).toBeNull();
        // The collection view carries the summary and the fight stats with gear.
        const state = res.body['state'] as {
          creatures: {
            id: string;
            stats: { hp: number; atk: number; spd: number };
            statsWithGear: { hp: number; atk: number; spd: number };
            gear: Record<string, unknown> | null;
            busy: unknown;
          }[];
        };
        const view = state.creatures.find((c) => c.id === cindle);
        expect(view?.gear).toEqual({
          id: itemId,
          baseId: 'cinder-charm',
          rarity: 'epic',
          level: 0,
          enchantId: null,
        });
        expect(view?.statsWithGear.atk).toBeGreaterThan(view?.stats.atk ?? 0);
        expect(view?.statsWithGear.hp).toBe(view?.stats.hp);
        expect(state.creatures.filter((c) => c.gear !== null)).toHaveLength(1);
        expect(events(ctx, 'gear_equip')).toEqual([
          {
            base: 'cinder-charm',
            rarity: 'epic',
            level: 0,
            species: 'cindle',
            action: 'equip',
            swap: false,
          },
        ]);
      },
      opts(),
    );
  });

  it('swaps: the item that was on the creature goes back to the inventory; a worn item moves', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const [c1, c2] = p.creatureIds as [string, string];
        const a = give(ctx, p.id, 'trail-charm');
        const b = give(ctx, p.id, 'patch-band');
        const equip = (id: string, creatureId: string | null) =>
          p.call('POST', `/api/gear/${id}/equip`, { creatureId });
        await equip(a, c1);
        // B onto the same creature: A comes off.
        const swap = await equip(b, c1);
        expect(swap.status).toBe(200);
        const out = swap.body['result'] as { item: ItemBody; unequipped: ItemBody };
        expect(out.item.id).toBe(b);
        expect(out.unequipped.id).toBe(a);
        expect(out.unequipped.equippedOn).toBeNull();
        expect(events(ctx, 'gear_equip').at(-1)).toMatchObject({ action: 'equip', swap: true });
        // B (worn by c1) onto c2: it moves, c1 is empty.
        await equip(b, c2);
        const gear = await p.gear();
        expect(gear.items.find((i) => i.id === b)?.equippedOn).toBe(c2);
        expect(gear.items.find((i) => i.id === a)?.equippedOn).toBeNull();
        expect(rows(ctx.sql, 'SELECT id FROM gear_items WHERE equipped_on = ?', c1)).toEqual([]);
        // Unequip.
        const off = await equip(b, null);
        expect(off.status).toBe(200);
        expect((await p.gear()).items.every((i) => i.equippedOn === null)).toBe(true);
        expect(events(ctx, 'gear_equip').at(-1)).toMatchObject({ action: 'unequip' });
      },
      opts(),
    );
  });

  it('changes nothing and logs nothing when the item is already where you ask', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-charm');
        const [c1] = p.creatureIds as [string];
        await p.call('POST', `/api/gear/${a}/equip`, { creatureId: c1 });
        await p.call('POST', `/api/gear/${a}/equip`, { creatureId: c1 });
        expect(events(ctx, 'gear_equip')).toHaveLength(1);
        const b = give(ctx, p.id, 'patch-band');
        await p.call('POST', `/api/gear/${b}/equip`, { creatureId: null });
        expect(events(ctx, 'gear_equip')).toHaveLength(1);
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
        const mine = give(ctx, a.id, 'trail-charm');
        const theirs = give(ctx, b.id, 'patch-band');
        const unknown = '00000000-0000-4000-8000-000000000000';
        const own = a.creatureIds[0] as string;
        const stolen = await a.call('POST', `/api/gear/${theirs}/equip`, { creatureId: own });
        const missing = await a.call('POST', `/api/gear/${unknown}/equip`, { creatureId: own });
        expect(stolen).toEqual(missing);
        expect(stolen.status).toBe(404);
        const foreignCreature = await a.call('POST', `/api/gear/${mine}/equip`, {
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
        const item = give(ctx, p.id, 'trail-charm');
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
          const res = await p.call('POST', `/api/gear/${item}/equip`, body);
          expect(res.status, JSON.stringify(body)).toBe(400);
        }
        expect(
          (await p.call('POST', '/api/gear/not-an-id/equip', { creatureId: null })).status,
        ).toBe(400);
      },
      opts(),
    );
  });
});

describe('upgrade', () => {
  it('spends Essence and scrap and raises the level, one step at a time up to +5', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'cinder-charm', 'rare');
        essence(ctx, p.id, 1000);
        parts(ctx, p.id, { scrap: 100 });
        let essenceLeft = 1000;
        let scrapLeft = 100;
        for (let level = 0; level < RULES.gear.maxLevel; level++) {
          const cost = upgradeCost({ rarity: 'rare', level });
          const res = await p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: newKey() });
          expect(res.status).toBe(200);
          expect(res.body['result']).toEqual({ gearId: id, level: level + 1 });
          essenceLeft -= cost?.essence ?? 0;
          scrapLeft -= cost?.scrap ?? 0;
          expect(ctx.core.balances(p.id).essence).toBe(essenceLeft);
          expect(partsOf(ctx, p.id).scrap).toBe(scrapLeft);
        }
        const gear = await p.gear();
        expect(gear.items[0]).toMatchObject({ level: 5, upgradeCost: null });
        // The main stat grew by the fixed step per level.
        const base = gearBase('cinder-charm');
        expect(base?.primary).toBe('atk');
        expect(gear.items[0]?.primary.bp).toBe(
          (
            JSON.parse(
              rows<{ rolls_json: string }>(ctx.sql, 'SELECT rolls_json FROM gear_items')[0]
                ?.rolls_json ?? '{}',
            ) as { primary: number }
          ).primary +
            5 * RULES.gear.upgradeStepBp.atk,
        );
        // At the top there is nothing left to buy and nothing is charged.
        const before = ctx.core.balances(p.id).essence;
        const top = await p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: newKey() });
        expect(top).toMatchObject({ status: 409, body: { error: 'max_level' } });
        expect(ctx.core.balances(p.id).essence).toBe(before);
        expect(events(ctx, 'gear_upgrade')).toHaveLength(5);
        expect(events(ctx, 'gear_upgrade')[0]).toEqual({
          base: 'cinder-charm',
          rarity: 'rare',
          from: 0,
          to: 1,
          essence: upgradeCost({ rarity: 'rare', level: 0 })?.essence,
          scrap: upgradeCost({ rarity: 'rare', level: 0 })?.scrap,
        });
      },
      opts(),
    );
  });

  it('charges nothing and changes nothing without enough Essence or scrap', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-charm');
        const cost = upgradeCost({ rarity: 'common', level: 0 }) as {
          essence: number;
          scrap: number;
        };
        const attempt = () =>
          p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: newKey() });

        // Nothing at all.
        expect(await attempt()).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        // Scrap but not enough Essence: the scrap stays too.
        parts(ctx, p.id, { scrap: cost.scrap });
        essence(ctx, p.id, cost.essence - 1);
        expect(await attempt()).toMatchObject({
          status: 409,
          body: { error: 'insufficient_funds' },
        });
        expect(partsOf(ctx, p.id).scrap).toBe(cost.scrap);
        expect(ctx.core.balances(p.id).essence).toBe(cost.essence - 1);
        // Essence but not enough scrap.
        essence(ctx, p.id, 1);
        ctx.sql.exec(
          "UPDATE parts SET amount = ? WHERE user_id = ? AND kind = 'scrap'",
          cost.scrap - 1,
          p.id,
        );
        expect(await attempt()).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        expect(ctx.core.balances(p.id).essence).toBe(cost.essence);
        expect(count(ctx.sql, 'gear_items', 'level > 0')).toBe(0);
        expect(count(ctx.sql, 'gear_actions')).toBe(0); // a refusal stores nothing
        expect(events(ctx, 'gear_upgrade')).toEqual([]);
      },
      opts(),
    );
  });

  it('is idempotent: a retry with the same key returns the stored result and charges nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-charm');
        essence(ctx, p.id, 500);
        parts(ctx, p.id, { scrap: 50 });
        const key = newKey();
        const first = await p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: key });
        const essenceAfter = ctx.core.balances(p.id).essence;
        const scrapAfter = partsOf(ctx, p.id).scrap;
        const again = await p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: key });
        expect(again.status).toBe(200);
        expect(again.body['result']).toEqual(first.body['result']);
        expect(ctx.core.balances(p.id).essence).toBe(essenceAfter);
        expect(partsOf(ctx, p.id).scrap).toBe(scrapAfter);
        expect((await p.gear()).items[0]?.level).toBe(1);
        expect(events(ctx, 'gear_upgrade')).toHaveLength(1);
        // The ledger holds one debit for the key.
        expect(count(ctx.sql, 'ledger', `idempotency_key = '${key}'`)).toBe(1);
      },
      opts(),
    );
  });

  it('refuses a key that was used for something else, and keeps the stored result', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const a = give(ctx, p.id, 'trail-charm');
        const b = give(ctx, p.id, 'patch-band');
        essence(ctx, p.id, 500);
        parts(ctx, p.id, { scrap: 50 });
        const key = newKey();
        await p.call('POST', `/api/gear/${a}/upgrade`, { idempotencyKey: key });
        // Same key, another item or another action.
        expect(
          await p.call('POST', `/api/gear/${b}/upgrade`, { idempotencyKey: key }),
        ).toMatchObject({
          status: 409,
          body: { error: 'key_conflict' },
        });
        expect(
          await p.call('POST', `/api/gear/${a}/dismantle`, { idempotencyKey: key }),
        ).toMatchObject({
          status: 409,
          body: { error: 'key_conflict' },
        });
        // A key a training spend already used is a conflict too.
        parts(ctx, p.id, { scrap: 0 });
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 100,
          source: 'test',
          idempotencyKey: 'bait-for-training',
        });
        const trainKey = newKey();
        expect(
          (
            await p.call('POST', `/api/creatures/${p.creatureIds[0]}/train`, {
              idempotencyKey: trainKey,
            })
          ).status,
        ).toBe(200);
        expect(
          await p.call('POST', `/api/gear/${b}/upgrade`, { idempotencyKey: trainKey }),
        ).toMatchObject({
          status: 409,
          body: { error: 'key_conflict' },
        });
        const gear = await p.gear();
        expect(gear.items.find((i) => i.id === a)?.level).toBe(1);
        expect(gear.items.find((i) => i.id === b)?.level).toBe(0);
        // Rejected keys charged nothing more.
        expect(ctx.core.balances(p.id).essence).toBe(500 - 20);
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
        const theirs = give(ctx, b.id, 'trail-charm');
        essence(ctx, a.id, 500);
        parts(ctx, a.id, { scrap: 50 });
        expect(
          await a.call('POST', `/api/gear/${theirs}/upgrade`, { idempotencyKey: newKey() }),
        ).toMatchObject({
          status: 404,
        });
        expect(ctx.core.balances(a.id).essence).toBe(500);
        for (const body of [
          {},
          { idempotencyKey: 'short' },
          { idempotencyKey: newKey(), extra: true },
          { idempotencyKey: 7 },
        ]) {
          expect((await b.call('POST', `/api/gear/${theirs}/upgrade`, body)).status).toBe(400);
        }
      },
      opts(),
    );
  });

  it('cannot be double-spent: many requests at once charge once, and two keys with money for one succeed once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-charm');
        const cost = upgradeCost({ rarity: 'common', level: 0 }) as {
          essence: number;
          scrap: number;
        };
        essence(ctx, p.id, cost.essence);
        parts(ctx, p.id, { scrap: cost.scrap * 5 });
        // The same key five times at once.
        const key = newKey();
        const same = await Promise.all(
          Array.from({ length: 5 }, () =>
            p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: key }),
          ),
        );
        expect(same.every((r) => r.status === 200)).toBe(true);
        expect(new Set(same.map((r) => JSON.stringify(r.body['result']))).size).toBe(1);
        expect(ctx.core.balances(p.id).essence).toBe(0);
        expect(partsOf(ctx, p.id).scrap).toBe(cost.scrap * 4);
        expect((await p.gear()).items[0]?.level).toBe(1);

        // Five different keys, Essence for none: nothing is charged, no level is gained.
        const broke = await Promise.all(
          Array.from({ length: 5 }, () =>
            p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: newKey() }),
          ),
        );
        expect(broke.every((r) => r.status === 409)).toBe(true);
        expect((await p.gear()).items[0]?.level).toBe(1);

        // Essence for exactly one more: five different keys, exactly one wins.
        const second = upgradeCost({ rarity: 'common', level: 1 }) as {
          essence: number;
          scrap: number;
        };
        essence(ctx, p.id, second.essence);
        const race = await Promise.all(
          Array.from({ length: 5 }, () =>
            p.call('POST', `/api/gear/${id}/upgrade`, { idempotencyKey: newKey() }),
          ),
        );
        expect(race.filter((r) => r.status === 200)).toHaveLength(1);
        expect(race.filter((r) => r.status === 409)).toHaveLength(4);
        expect((await p.gear()).items[0]?.level).toBe(2);
        expect(ctx.core.balances(p.id).essence).toBe(0);
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
        const id = give(ctx, p.id, 'storm-trinket', 'epic');
        const expected = dismantleYield({ baseId: 'storm-trinket', rarity: 'epic', level: 0 });
        const res = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: newKey() });
        expect(res.status).toBe(200);
        expect(res.body['result']).toEqual({
          gearId: id,
          baseId: 'storm-trinket',
          rarity: 'epic',
          level: 0,
          parts: expected,
          unequipped: false,
        });
        expect(expected).toEqual({ scrap: 10, 'spark-shard': 2, glimmer: 1 });
        expect(count(ctx.sql, 'gear_items')).toBe(0);
        expect(partsOf(ctx, p.id)).toMatchObject({ scrap: 10, 'spark-shard': 2, glimmer: 1 });
        expect(events(ctx, 'gear_dismantle')).toEqual([
          {
            base: 'storm-trinket',
            rarity: 'epic',
            level: 0,
            scrap: 10,
            shards: 2,
            glimmer: 1,
            unequipped: false,
            parts: { scrap: 10, 'spark-shard': 2, glimmer: 1 },
          },
        ]);
        // A second, fresh request for the gone item is a plain not-found.
        const gone = await p.call('POST', `/api/gear/${id}/dismantle`, {
          idempotencyKey: newKey(),
        });
        expect(gone.status).toBe(404);
      },
      opts(),
    );
  });

  it('returns some of the scrap its upgrades cost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-charm');
        ctx.sql.exec('UPDATE gear_items SET level = 5 WHERE id = ?', id);
        const res = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: newKey() });
        expect(res.status).toBe(200);
        const spent = RULES.gear.upgrade.scrap.reduce((a, b) => a + b, 0);
        expect(partsOf(ctx, p.id).scrap).toBe(
          RULES.gear.dismantle.scrap.common +
            Math.floor((spent * RULES.gear.upgrade.refundBp) / 10_000),
        );
      },
      opts(),
    );
  });

  it('takes a worn item off first (the in-page confirmation is the safeguard)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-charm');
        await p.call('POST', `/api/gear/${id}/equip`, { creatureId: p.creatureIds[0] });
        const res = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: newKey() });
        expect(res.status).toBe(200);
        expect((res.body['result'] as { unequipped: boolean }).unequipped).toBe(true);
        const state = res.body['state'] as { creatures: { gear: unknown }[] };
        expect(state.creatures.every((c) => c.gear === null)).toBe(true);
        expect(events(ctx, 'gear_dismantle')[0]).toMatchObject({ unequipped: true });
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
        const id = give(ctx, p.id, 'cinder-charm', 'rare');
        const key = newKey();
        const first = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: key });
        const scrap = partsOf(ctx, p.id).scrap;
        const again = await p.call('POST', `/api/gear/${id}/dismantle`, { idempotencyKey: key });
        expect(again.status).toBe(200);
        expect(again.body['result']).toEqual(first.body['result']);
        expect(partsOf(ctx, p.id).scrap).toBe(scrap);
        expect(events(ctx, 'gear_dismantle')).toHaveLength(1);
        // Many at once, too.
        const other = give(ctx, p.id, 'patch-band');
        const k2 = newKey();
        const many = await Promise.all(
          Array.from({ length: 5 }, () =>
            p.call('POST', `/api/gear/${other}/dismantle`, { idempotencyKey: k2 }),
          ),
        );
        expect(many.every((r) => r.status === 200)).toBe(true);
        expect(partsOf(ctx, p.id).scrap).toBe(scrap + RULES.gear.dismantle.scrap.common);
        expect(events(ctx, 'gear_dismantle')).toHaveLength(2);
      },
      opts(),
    );
  });

  it("refuses someone else's item and an item in an open job", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await player(ctx, 1);
        const b = await player(ctx, 2);
        skipWelcome(ctx, a.id);
        skipWelcome(ctx, b.id);
        const theirs = give(ctx, b.id, 'trail-charm');
        expect(
          await a.call('POST', `/api/gear/${theirs}/dismantle`, { idempotencyKey: newKey() }),
        ).toMatchObject({
          status: 404,
        });
        expect(count(ctx.sql, 'gear_items')).toBe(1);
        const mine = give(ctx, a.id, 'cinder-charm', 'rare');
        parts(ctx, a.id, { scrap: 20 });
        const job = await a.call('POST', '/api/workshop/jobs', {
          kind: 'improve',
          creatureId: a.creatureIds[0],
          gearId: mine,
          secondaryIndex: 0,
          idempotencyKey: newKey(),
        });
        expect(job.status).toBe(200);
        expect(
          await a.call('POST', `/api/gear/${mine}/dismantle`, { idempotencyKey: newKey() }),
        ).toMatchObject({
          status: 409,
          body: { error: 'item_busy' },
        });
        expect(count(ctx.sql, 'gear_items', `id = '${mine}'`)).toBe(1);
      },
      opts(),
    );
  });
});

describe('workshop jobs: starting', () => {
  it('starts a craft: pays the parts now, takes the blueprint time, holds a place and the creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'wave-band');
        parts(ctx, p.id, { scrap: 30, 'tide-shard': 3 });
        const [c1] = p.creatureIds as [string];
        const res = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'wave-band',
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['gear', 'result', 'state']);
        const jobId = (res.body['result'] as { jobId: string }).jobId;
        const gear = res.body['gear'] as GearBody;
        const job = gear.jobs.find((j) => j.id === jobId) as JobBody;
        // wave-band: a Rare blueprint: 18 scrap and a Tide shard, 8 hours.
        expect(job).toMatchObject({
          creatureId: c1,
          kind: 'craft',
          input: { baseId: 'wave-band' },
          cost: { scrap: RULES.gear.craft.rare.scrap, 'tide-shard': 1 },
          startedAt: T0,
          endsAt: T0 + 8 * HOUR,
          status: 'running',
          claimedAt: null,
          result: null,
        });
        expect(partsOf(ctx, p.id)).toMatchObject({
          scrap: 30 - RULES.gear.craft.rare.scrap,
          'tide-shard': 2,
        });
        expect(gear.slots).toEqual({ total: 2, used: 1 });
        expect(gear.inventory).toEqual({ cap: 60, used: 0, reserved: 1 });
        // The collection says the creature is busy with a job, not away.
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
            base: 'wave-band',
            rarity: 'rare',
            species: rows<{ species: string }>(
              ctx.sql,
              'SELECT species FROM creatures WHERE id = ?',
              c1,
            )[0]?.species,
            hours: 8,
            skillLevel: 1,
            parts: { scrap: 18, 'tide-shard': 1 },
          },
        ]);
      },
      opts(),
    );
  });

  it('rejects: unknown blueprint, too few parts, and a blueprint outside the content', async () => {
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
        expect(await craft('trail-charm')).toMatchObject({
          status: 409,
          body: { error: 'blueprint_unknown' },
        });
        learn(ctx, p.id, 'trail-charm');
        expect(await craft('trail-charm')).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        parts(ctx, p.id, { scrap: 5 });
        expect(await craft('trail-charm')).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        expect(partsOf(ctx, p.id).scrap).toBe(5); // nothing was taken
        expect((await craft('no-such-base')).status).toBe(400);
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
        learn(ctx, p.id, 'trail-charm');
        parts(ctx, p.id, { scrap: 100 });
        const [c1, c2, c3] = p.creatureIds as [string, string, string];
        const craft = (creatureId: string) =>
          p.call('POST', '/api/workshop/jobs', {
            kind: 'craft',
            creatureId,
            blueprintId: 'trail-charm',
            idempotencyKey: newKey(),
          });
        // 59 items: one place left, which the first craft takes.
        for (let i = 0; i < RULES.gear.inventoryCap - 1; i++)
          give(ctx, p.id, 'trail-charm', 'common', `bulk${String(i)}`);
        expect((await craft(c1)).status).toBe(200);
        // 59 items and a craft that will become the 60th: full.
        expect(await craft(c2)).toMatchObject({ status: 409, body: { error: 'inventory_full' } });
        expect(partsOf(ctx, p.id).scrap).toBe(100 - RULES.gear.craft.common.scrap);

        // A full workshop: free the inventory and fill both slots.
        ctx.sql.exec("DELETE FROM gear_items WHERE source = 'test'");
        expect((await craft(c2)).status).toBe(200);
        expect(await craft(c3)).toMatchObject({ status: 409, body: { error: 'workshop_full' } });
        expect(count(ctx.sql, 'workshop_jobs')).toBe(2);
      },
      opts(),
    );
  });

  it('rejects a creature that is busy: on an expedition, or already on a job; and not yours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        const other = await player(ctx, 2);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-charm');
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
            blueprintId: 'trail-charm',
            idempotencyKey: newKey(),
          });
        // On an expedition: no job.
        const sent = await p.call('POST', '/api/expeditions', {
          creatureId: c1,
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(sent.status).toBe(200);
        expect(await craft(c1)).toMatchObject({ status: 409, body: { error: 'creature_away' } });
        // On a job: no second job, no expedition.
        expect((await craft(c2)).status).toBe(200);
        expect(await craft(c2)).toMatchObject({ status: 409, body: { error: 'creature_on_job' } });
        const trip = await p.call('POST', '/api/expeditions', {
          creatureId: c2,
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(trip).toMatchObject({ status: 409, body: { error: 'creature_on_job' } });
        // Another player's creature is a plain not-found.
        const foreign = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: other.creatureIds[0],
          blueprintId: 'trail-charm',
          idempotencyKey: newKey(),
        });
        expect(foreign.status).toBe(404);
        // Nothing but the one job and the one expedition exists, and Bait was only spent on the trip.
        expect(count(ctx.sql, 'workshop_jobs')).toBe(1);
        expect(count(ctx.sql, 'expeditions')).toBe(1);
      },
      opts(),
    );
  });

  it('frees the creature for an expedition once the job is claimed, and a busy creature still fights', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-charm');
        parts(ctx, p.id, { scrap: 100 });
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 100,
          source: 'test',
          idempotencyKey: 'b',
        });
        const [c1] = p.creatureIds as [string];
        const started = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-charm',
          idempotencyKey: newKey(),
        });
        const jobId = (started.body['result'] as { jobId: string }).jobId;
        ctx.clock.t += 4 * HOUR;
        const claimed = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(claimed.status).toBe(200);
        const trip = await p.call('POST', '/api/expeditions', {
          creatureId: c1,
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(trip.status).toBe(200);
        // And the creature can go on a job after the expedition is claimed.
        ctx.clock.t += HOUR;
        const exp = (trip.body['expedition'] as { id: string }).id;
        expect((await p.call('POST', `/api/expeditions/${exp}/claim`, {})).status).toBe(200);
        expect(
          (
            await p.call('POST', '/api/workshop/jobs', {
              kind: 'craft',
              creatureId: c1,
              blueprintId: 'trail-charm',
              idempotencyKey: newKey(),
            })
          ).status,
        ).toBe(200);
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
        learn(ctx, p.id, 'trail-charm');
        parts(ctx, p.id, { scrap: 100 });
        const [c1, c2] = p.creatureIds as [string, string];
        const key = newKey();
        const body = {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-charm',
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
        expect(partsOf(ctx, p.id).scrap).toBe(100 - RULES.gear.craft.common.scrap);
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
        const item = give(ctx, p.id, 'cinder-charm', 'rare');
        const [c1] = p.creatureIds as [string];
        const key = newKey();
        const bad: unknown[] = [
          {},
          { kind: 'sing', creatureId: c1, idempotencyKey: key },
          { kind: 'craft', creatureId: c1, idempotencyKey: key },
          {
            kind: 'craft',
            creatureId: c1,
            blueprintId: 'trail-charm',
            gearId: item,
            idempotencyKey: key,
          },
          {
            kind: 'craft',
            creatureId: c1,
            blueprintId: 'trail-charm',
            idempotencyKey: key,
            extra: 1,
          },
          { kind: 'craft', creatureId: 'nope', blueprintId: 'trail-charm', idempotencyKey: key },
          { kind: 'improve', creatureId: c1, gearId: item, idempotencyKey: key },
          { kind: 'improve', creatureId: c1, gearId: item, secondaryIndex: 2, idempotencyKey: key },
          {
            kind: 'improve',
            creatureId: c1,
            gearId: item,
            secondaryIndex: -1,
            idempotencyKey: key,
          },
          {
            kind: 'improve',
            creatureId: c1,
            gearId: item,
            secondaryIndex: 0.5,
            idempotencyKey: key,
          },
          {
            kind: 'improve',
            creatureId: c1,
            gearId: item,
            secondaryIndex: 0,
            enchantId: 'spark-luck',
            idempotencyKey: key,
          },
          { kind: 'enchant', creatureId: c1, gearId: item, idempotencyKey: key },
          {
            kind: 'enchant',
            creatureId: c1,
            gearId: item,
            enchantId: 'not-an-enchant',
            idempotencyKey: key,
          },
          {
            kind: 'enchant',
            creatureId: c1,
            gearId: item,
            enchantId: 'spark-luck',
            idempotencyKey: 'x',
          },
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
});

describe('workshop jobs: claiming', () => {
  /** Starts a craft of a Rare blueprint (8 hours) on the first creature; returns the job id. */
  async function startCraft(p: Api, baseId = 'wave-band', creatureIndex = 0): Promise<string> {
    const res = await p.call('POST', '/api/workshop/jobs', {
      kind: 'craft',
      creatureId: p.creatureIds[creatureIndex],
      blueprintId: baseId,
      idempotencyKey: newKey(),
    });
    expect(res.status).toBe(200);
    return (res.body['result'] as { jobId: string }).jobId;
  }

  it('rolls the item when claimed, with the live rng at that moment, and gives Crafting XP', async () => {
    const rng = counting('claim');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'wave-band');
        parts(ctx, p.id, { scrap: 30, 'tide-shard': 3 });
        // 10 XP already: the 96 XP of the 8 hour craft (12 per nominal hour) takes it over level 2 (100).
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 10)',
          p.id,
          p.creatureIds[0],
        );
        const jobId = await startCraft(p);
        // Starting a job draws nothing: the result is not decided yet.
        expect(rng.drawn()).toBe(0);

        // Not before the time is up.
        ctx.clock.t = T0 + 8 * HOUR - 1;
        expect(
          await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: newKey() }),
        ).toMatchObject({ status: 409, body: { error: 'not_ready' } });
        expect(rng.drawn()).toBe(0);
        expect(count(ctx.sql, 'gear_items')).toBe(0);

        ctx.clock.t = T0 + 8 * HOUR;
        const res = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        // The same draws a direct call with the same seed makes: craft rarity first, then the rolls.
        const expectRng = createSeededRng('claim');
        const rarity = craftRarity(expectRng, 'rare', 1);
        const rolls = rollGear(expectRng, 'wave-band', rarity);
        const result = res.body['result'] as Record<string, unknown>;
        expect(result).toMatchObject({
          kind: 'craft',
          baseId: 'wave-band',
          rarity,
          upgraded: false,
          xp: 96,
          skillXp: 106,
          skillLevel: 2,
          leveledUp: true,
        });
        const stored = rows<{
          rolls_json: string;
          rarity: string;
          source: string;
          base_id: string;
        }>(ctx.sql, 'SELECT rolls_json, rarity, source, base_id FROM gear_items');
        expect(stored).toHaveLength(1);
        expect(JSON.parse(stored[0]?.rolls_json ?? '{}')).toEqual(rolls);
        expect(stored[0]).toMatchObject({ source: 'craft', base_id: 'wave-band' });
        expect(rng.drawn()).toBeGreaterThan(0);

        const gear = res.body['gear'] as GearBody;
        expect(gear.inventory).toEqual({ cap: 60, used: 1, reserved: 0 });
        expect(gear.slots.used).toBe(0);
        expect(gear.skills[0]).toMatchObject({ xp: 106, level: 2 });
        expect(gear.jobs[0]).toMatchObject({ status: 'claimed', claimedAt: T0 + 8 * HOUR });
        expect(events(ctx, 'job_claim')).toEqual([
          {
            job: 'craft',
            base: 'wave-band',
            rarity,
            upgraded: false,
            enchant: null,
            xp: 96,
            skillLevel: 2,
            leveledUp: true,
          },
        ]);
      },
      { gearRng: rng },
    );
  });

  it('is idempotent: claiming again, with the same or another key, rolls nothing and pays nothing more', async () => {
    const rng = counting('claim-twice');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'wave-band');
        parts(ctx, p.id, { scrap: 30, 'tide-shard': 3 });
        const jobId = await startCraft(p);
        ctx.clock.t = T0 + 8 * HOUR;
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
          { xp: 96 },
        ]);
        expect(events(ctx, 'job_claim')).toHaveLength(1);
        // Same key on a different job is a conflict.
        expect(
          await p.call(
            'POST',
            `/api/workshop/jobs/${'00000000-0000-4000-8000-000000000000'}/claim`,
            {
              idempotencyKey: key,
            },
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
        learn(ctx, a.id, 'trail-charm');
        parts(ctx, a.id, { scrap: 20 });
        const jobId = await startCraft(a, 'trail-charm');
        ctx.clock.t = T0 + 4 * HOUR;
        const stolen = await b.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
          idempotencyKey: newKey(),
        });
        const missing = await b.call(
          'POST',
          '/api/workshop/jobs/00000000-0000-4000-8000-000000000000/claim',
          {
            idempotencyKey: newKey(),
          },
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
        learn(ctx, p.id, 'trail-charm');
        parts(ctx, p.id, { scrap: 100 });
        const [c1] = p.creatureIds as [string];
        // A level 2 creature (100 XP).
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 100)',
          p.id,
          c1,
        );
        const start = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: c1,
          blueprintId: 'trail-charm',
          idempotencyKey: newKey(),
        });
        const job = (start.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job.endsAt - job.startedAt).toBe(jobDuration('craft', 'common', 2));
        expect(job.endsAt - job.startedAt).toBeLessThan(4 * HOUR);
        ctx.clock.t = job.endsAt;
        const res = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        // 4 nominal hours is 48 XP whatever the skill.
        expect(res.body['result']).toMatchObject({
          xp: 48,
          skillXp: 148,
          skillLevel: 2,
          leveledUp: false,
        });
        expect(skillLevel(148)).toBe(2);
      },
      opts(),
    );
  });

  it('a craft can come out one rarity higher, by the crafter’s skill', async () => {
    // Level 10 gives a 9% chance: pick a seed whose first draw is an upgrade.
    let seed = 'up-0';
    for (let i = 0; i < 200; i++) {
      if (craftRarity(createSeededRng(`up-${String(i)}`), 'common', 10) === 'rare') {
        seed = `up-${String(i)}`;
        break;
      }
    }
    expect(craftRarity(createSeededRng(seed), 'common', 10)).toBe('rare');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        learn(ctx, p.id, 'trail-charm');
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
          blueprintId: 'trail-charm',
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
        });
        const row = rows<{ rarity: string; rolls_json: string }>(
          ctx.sql,
          'SELECT rarity, rolls_json FROM gear_items',
        )[0];
        expect(row?.rarity).toBe('rare');
        expect(
          (JSON.parse(row?.rolls_json ?? '{}') as { secondary: unknown[] }).secondary,
        ).toHaveLength(1);
        expect(events(ctx, 'job_claim')[0]).toMatchObject({ upgraded: true, rarity: 'rare' });
      },
      { gearRng: createSeededRng(seed) },
    );
  });

  it('improve: pays scrap, locks the item, and re-rolls one secondary when claimed', async () => {
    const rng = counting('improve');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'cinder-charm', 'epic');
        parts(ctx, p.id, { scrap: 20 });
        const before = JSON.parse(
          rows<{ rolls_json: string }>(ctx.sql, 'SELECT rolls_json FROM gear_items')[0]
            ?.rolls_json ?? '{}',
        ) as GearRolls;
        const start = await p.call('POST', '/api/workshop/jobs', {
          kind: 'improve',
          creatureId: p.creatureIds[0],
          gearId: id,
          secondaryIndex: 1,
          idempotencyKey: newKey(),
        });
        expect(start.status).toBe(200);
        const gear = start.body['gear'] as GearBody;
        const job = gear.jobs[0] as JobBody;
        expect(job).toMatchObject({
          kind: 'improve',
          cost: { scrap: 12 },
          input: { gearId: id, secondaryIndex: 1 },
        });
        expect(job.endsAt - job.startedAt).toBe(2 * HOUR);
        expect(partsOf(ctx, p.id).scrap).toBe(8);
        expect(gear.items[0]?.jobId).toBe(job.id);
        expect(rng.drawn()).toBe(0);
        // While it runs: the item cannot go into another job or be dismantled.
        expect(
          await p.call('POST', '/api/workshop/jobs', {
            kind: 'enchant',
            creatureId: p.creatureIds[1],
            gearId: id,
            enchantId: 'steady-hand',
            idempotencyKey: newKey(),
          }),
        ).toMatchObject({ status: 409, body: { error: 'item_busy' } });

        ctx.clock.t = job.endsAt;
        const res = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        const expected = rerollSecondary(createSeededRng('improve'), 'cinder-charm', before, 1);
        const after = JSON.parse(
          rows<{ rolls_json: string }>(ctx.sql, 'SELECT rolls_json FROM gear_items')[0]
            ?.rolls_json ?? '{}',
        ) as { primary: number; secondary: { stat: string; bp: number }[] };
        expect(after).toEqual(expected);
        expect(after.primary).toBe(before.primary);
        expect(after.secondary[0]).toEqual(before.secondary[0]); // the other one is kept
        expect(res.body['result']).toMatchObject({
          kind: 'improve',
          gearId: id,
          secondaryIndex: 1,
          from: before.secondary[1],
          to: after.secondary[1],
          xp: 24, // 2 nominal hours at 12 XP per hour
        });
        // Unlocked again.
        expect((res.body['gear'] as GearBody).items[0]?.jobId).toBeNull();
      },
      { gearRng: rng },
    );
  });

  it('improve is refused for an item with nothing to re-roll, an index it does not have and no scrap', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const common = give(ctx, p.id, 'trail-charm');
        const rare = give(ctx, p.id, 'cinder-charm', 'rare');
        const [c1] = p.creatureIds as [string];
        const improve = (gearId: string, secondaryIndex: number) =>
          p.call('POST', '/api/workshop/jobs', {
            kind: 'improve',
            creatureId: c1,
            gearId,
            secondaryIndex,
            idempotencyKey: newKey(),
          });
        parts(ctx, p.id, { scrap: 100 });
        expect(await improve(common, 0)).toMatchObject({
          status: 409,
          body: { error: 'nothing_to_improve' },
        });
        expect(await improve(rare, 1)).toMatchObject({
          status: 400,
          body: { error: 'invalid_secondary' },
        });
        ctx.sql.exec("UPDATE parts SET amount = 5 WHERE kind = 'scrap'");
        expect(await improve(rare, 0)).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        expect(partsOf(ctx, p.id).scrap).toBe(5);
        expect(count(ctx.sql, 'workshop_jobs')).toBe(0);
      },
      opts(),
    );
  });

  it('enchant: pays glimmer and shards, adds the enchant when claimed, and may replace one', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1);
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'volt-band', 'rare');
        parts(ctx, p.id, { glimmer: 3, 'spark-shard': 9, 'ember-shard': 9 });
        const [c1, c2] = p.creatureIds as [string, string];
        const enchant = (creatureId: string, enchantId: string) =>
          p.call('POST', '/api/workshop/jobs', {
            kind: 'enchant',
            creatureId,
            gearId: id,
            enchantId,
            idempotencyKey: newKey(),
          });
        const start = await enchant(c1, 'spark-luck');
        expect(start.status).toBe(200);
        const job = (start.body['gear'] as GearBody).jobs[0] as JobBody;
        expect(job.cost).toEqual({ glimmer: 1, 'spark-shard': 3 });
        expect(job.endsAt - job.startedAt).toBe(6 * HOUR);
        expect(partsOf(ctx, p.id)).toMatchObject({ glimmer: 2, 'spark-shard': 6 });
        ctx.clock.t = job.endsAt;
        const res = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(res.body['result']).toMatchObject({
          kind: 'enchant',
          gearId: id,
          enchantId: 'spark-luck',
          xp: 72, // 6 nominal hours at 12 XP per hour
        });
        expect(rows(ctx.sql, 'SELECT enchant_id FROM gear_items')).toEqual([
          { enchant_id: 'spark-luck' },
        ]);
        expect(events(ctx, 'job_claim')[0]).toMatchObject({
          job: 'enchant',
          enchant: 'spark-luck',
        });

        // The same enchant again is refused; a different one replaces it.
        expect(await enchant(c2, 'spark-luck')).toMatchObject({
          status: 409,
          body: { error: 'same_enchant' },
        });
        const again = await enchant(c2, 'ember-fury');
        expect(again.status).toBe(200);
        const job2 = (again.body['gear'] as GearBody).jobs.find(
          (j) => j.status === 'running',
        ) as JobBody;
        ctx.clock.t = job2.endsAt;
        await p.call('POST', `/api/workshop/jobs/${job2.id}/claim`, { idempotencyKey: newKey() });
        expect(rows(ctx.sql, 'SELECT enchant_id FROM gear_items')).toEqual([
          { enchant_id: 'ember-fury' },
        ]);
      },
      opts(),
    );
  });

  it('enchant is refused without the parts, and shows whether the enchant works for the wearer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { species: ['cindle', 'splashet', 'sproutle'] });
        skipWelcome(ctx, p.id);
        const id = give(ctx, p.id, 'trail-charm');
        parts(ctx, p.id, { glimmer: 1, 'ember-shard': 2 });
        const body = {
          kind: 'enchant',
          creatureId: p.creatureIds[0],
          gearId: id,
          enchantId: 'ember-fury',
          idempotencyKey: newKey(),
        };
        expect(await p.call('POST', '/api/workshop/jobs', body)).toMatchObject({
          status: 409,
          body: { error: 'insufficient_parts' },
        });
        expect(partsOf(ctx, p.id)).toMatchObject({ glimmer: 1, 'ember-shard': 2 });
        // Wearer matters: Ember Fury works for Ember creatures only.
        ctx.sql.exec("UPDATE gear_items SET enchant_id = 'ember-fury' WHERE id = ?", id);
        const onCindle = await p.call('POST', `/api/gear/${id}/equip`, {
          creatureId: p.creatureIds[0],
        });
        expect((onCindle.body['result'] as { item: ItemBody }).item.enchantActive).toBe(true);
        const onSplashet = await p.call('POST', `/api/gear/${id}/equip`, {
          creatureId: p.creatureIds[1],
        });
        expect((onSplashet.body['result'] as { item: ItemBody }).item.enchantActive).toBe(false);
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
        const a = give(ctx, p.id, 'cinder-charm', 'rare');
        essence(ctx, p.id, 100);
        await p.call('POST', `/api/gear/${a}/equip`, { creatureId: p.creatureIds[0] });
        const key = newKey();
        await p.call('POST', `/api/gear/${a}/upgrade`, { idempotencyKey: key });
        await p.call('POST', `/api/gear/${a}/upgrade`, { idempotencyKey: key });
        await p.call('POST', `/api/gear/${a}/dismantle`, { idempotencyKey: newKey() });
        const all = rows<{ kind: string; actor_hash: string | null; props_json: string }>(
          ctx.sql,
          "SELECT kind, actor_hash, props_json FROM analytics_events WHERE kind LIKE 'gear_%' OR kind LIKE 'job_%' ORDER BY id",
        );
        expect(all.map((e) => e.kind)).toEqual([
          'gear_drop',
          'gear_equip',
          'gear_upgrade',
          'gear_dismantle',
        ]);
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
        gear: [{ base: 'Misa the Mighty', rarity: 'legendary' as never }],
        converted: -3,
        scrap: 1.9,
        shards: 2,
        glimmer: 3,
        blueprint: '<b>x</b>',
        blueprintDuplicate: 1 as never,
      }),
    ).toEqual({
      source: 'raid_phase',
      gear: [{ base: 'unknown', rarity: 'common' }],
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
        enchant: 'free text',
        xp: -1,
        skillLevel: 1000,
        leveledUp: false,
      }),
    ).toEqual({
      job: 'craft',
      base: 'unknown',
      rarity: 'festival',
      upgraded: false,
      enchant: 'unknown',
      xp: 0,
      skillLevel: 99,
      leveledUp: false,
    });
    expect(gearContent.bases.length).toBeGreaterThan(0);
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
    // An empty bundle writes no key at all.
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
        enchant: null,
        xp: 1,
        skillLevel: 1,
        leveledUp: false,
        yield: 4.9,
      })['yield'],
    ).toBe(4);
  });
});
