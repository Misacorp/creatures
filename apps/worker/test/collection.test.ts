import {
  RULES,
  content,
  createSeededRng,
  expeditionCost,
  lore,
  pickQuirk,
  quirkText,
  recallCatches,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { GuildCoreOptions } from '../src/guild-core';
import type { LeetSource } from '../src/leet';
import {
  OTHER_USER_ID,
  T0,
  USER_ID,
  callHandler,
  fakeDiscord,
  getWithToken,
  postAuth,
  runCore,
  tokenFor,
  undoRaidMigration,
  type CoreContext,
} from './helpers';
import { createHandler } from '../src/index';

const HOUR = 3_600_000;

/** Bait to train from `level` to the next one (the game's rule, so retuning does not break tests). */
const trainCostAt = (level: number): number =>
  RULES.training.baseCost + RULES.training.perLevel * level;
const USER = { id: USER_ID, displayName: 'Misa' };
const OTHER = { id: OTHER_USER_ID, displayName: 'Other' };

let guildCounter = 0;
/** A fresh snowflake-shaped guild id per test, so Durable Object storage never overlaps. */
const nextGuild = () => String(740000000000000000n + BigInt(++guildCounter));

let keyCounter = 0;
/** A valid client idempotency key, unique per call. */
const newKey = () => `key-${String(++keyCounter).padStart(8, '0')}-test`;

/** Returns the scripted values in order, then fails loudly: tests must account for every draw. */
function scriptedRng(values: number[]): Rng & { drawn: () => number } {
  let i = 0;
  return {
    nextU32() {
      const value = values[i++];
      if (value === undefined) throw new Error('scripted rng exhausted');
      return value;
    },
    drawn: () => i,
  };
}

/** Draws for one catch of a non-zipmouse common species that is not shiny: [rarity, species, shiny]. */
const COMMON_SPLASHET_PLAIN = [0, 0, 1];
/** Same, but shiny. */
const COMMON_SPLASHET_SHINY = [0, 0, 0];

function countingRng(seed: string): Rng & { drawn: () => number } {
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

interface Json {
  status: number;
  body: Record<string, unknown>;
}

interface Player {
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  state: () => Promise<StateBody>;
}

interface CreatureBody {
  id: string;
  species: string;
  line: string;
  level: number;
  levelCap: number;
  fusionCount: number;
  shiny: boolean;
  nickname: string | null;
  away: boolean;
  quirk: string | null;
  stats: { hp: number; atk: number; spd: number };
  trainCost: number | null;
  evolution?: { toSpecies: string; level: number; essence: number; available: boolean };
  ability: { id: string; unlocked: boolean; unlockLevel: number; nextId?: string } | null;
}

interface CatchBody {
  species: string;
  shiny: boolean;
  outcome: string;
  fusionCount?: number;
  bait?: number;
  firstOnServer: boolean;
}

interface ExpeditionBody {
  id: string;
  creatureId: string;
  duration: string;
  supplies: string;
  rolls: number;
  cost: number;
  startedAt: number;
  endsAt: number;
  status: string;
  claimedAt: number | null;
  result: { recalled: boolean; catches: CatchBody[] } | null;
}

interface StateBody {
  serverNow: number;
  /** Only in GET /api/state, not in the `state` echoed by POST routes. */
  timezone: string;
  leetSync: {
    source: string;
    lastAttemptAt: number | null;
    lastSyncedAt: number | null;
    lastError: string | null;
    lastDays: number | null;
  };
  balances: { bait: number; essence: number };
  starterChosen: boolean;
  starterOptions?: string[];
  creatures: CreatureBody[];
  expeditions: ExpeditionBody[];
  slots: { total: number; used: number };
  trainingMedianLevel: number | null;
  serverFirsts: { kind: string; species: string; at: number; mine: boolean; holders: string[] }[];
}

async function join(
  ctx: CoreContext,
  user: { id: string; displayName: string },
  bait = 0,
): Promise<Player> {
  let secret = await ctx.core.createSession(ctx.guildId, user);
  let loggedInAt = ctx.clock.t;
  if (bait > 0) {
    ctx.core.credit({
      userId: user.id,
      currency: 'bait',
      amount: bait,
      source: 'test',
      idempotencyKey: `seed:${user.id}`,
    });
  }
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    // Tests jump the clock by hours; sessions idle out after an hour, so sign in again as needed.
    if (ctx.clock.t - loggedInAt >= 30 * 60_000) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      loggedInAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  return {
    call,
    state: async () => (await call('GET', '/api/state')).body as unknown as StateBody,
  };
}

/** Joins, picks a starter and returns the player with the starter creature id. */
async function joinWithStarter(
  ctx: CoreContext,
  user: { id: string; displayName: string },
  bait: number,
  species = 'splashet',
): Promise<Player & { starterId: string }> {
  const player = await join(ctx, user, bait);
  const res = await player.call('POST', '/api/starter', { species, idempotencyKey: newKey() });
  expect(res.status).toBe(200);
  const state = await player.state();
  const starter = state.creatures[0];
  if (starter === undefined) throw new Error('no starter');
  return { ...player, starterId: starter.id };
}

function send(
  player: Player,
  creatureId: string,
  duration: 'short' | 'medium' | 'long' = 'short',
  supplies: 'basic' | 'good' | 'great' = 'basic',
  idempotencyKey = newKey(),
) {
  return player.call('POST', '/api/expeditions', {
    creatureId,
    duration,
    supplies,
    idempotencyKey,
  });
}

const claim = (player: Player, id: string) =>
  player.call('POST', `/api/expeditions/${id}/claim`, {});

function expeditionOf(res: Json): ExpeditionBody {
  return res.body['expedition'] as ExpeditionBody;
}

function resultOf(res: Json): { recalled: boolean; catches: CatchBody[] } {
  return res.body['result'] as { recalled: boolean; catches: CatchBody[] };
}

function count(sql: SqlStorage, table: string, where = '1 = 1'): number {
  return sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).one().n;
}

/** Marks the player as past their first expedition, so the zipmouse guarantee does not apply. */
function skipFirstExpedition(sql: SqlStorage, userId: string): void {
  sql.exec('UPDATE player_progress SET expeditions_claimed = 1 WHERE user_id = ?', userId);
}

const seeded = (): GuildCoreOptions => ({ rng: createSeededRng('m2b-tests') });

describe('migration 4', () => {
  it('applies on a Durable Object that is at schema version 3, keeping its data', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const { core, sql, guildId } = ctx;
      const secret = await core.createSession(guildId, USER);
      core.credit({
        userId: USER_ID,
        currency: 'bait',
        amount: 42,
        source: 'test',
        idempotencyKey: 'seed:1',
      });
      // Put the database back the way it was at version 3.
      for (const table of ['creatures', 'expeditions', 'player_progress', 'server_firsts']) {
        sql.exec(`DROP TABLE ${table}`);
      }
      sql.exec('ALTER TABLE guild_meta DROP COLUMN timezone');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN last_attempt_at');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN last_error');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN last_days');
      sql.exec('ALTER TABLE leet_sync DROP COLUMN source');
      sql.exec('DELETE FROM schema_version WHERE version IN (4, 5, 6)');
      undoRaidMigration(sql);
      expect(sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v).toBe(
        3,
      );

      core.migrate();
      expect(sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v).toBe(
        15,
      );
      expect(core.balances(USER_ID).bait).toBe(42);
      const res = await ctx.request(secret, '/api/state');
      expect(res.status).toBe(200);
      expect(count(sql, 'creatures')).toBe(0);
    });
  });

  it('enforces the creature constraints', async () => {
    await runCore(
      nextGuild(),
      ({ sql }) => {
        const insert = (id: string, line: string, level: number, fusion: number) =>
          sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, origin, caught_at)
           VALUES (?, 'u', ?, 'splashet', ?, ?, 'test', 0)`,
            id,
            line,
            level,
            fusion,
          );
        insert('a', 'splashet', 1, 0);
        expect(() => insert('b', 'splashet', 1, 0)).toThrow(); // one creature per line
        expect(() => insert('c', 'cindle', 0, 0)).toThrow(); // level >= 1
        expect(() => insert('d', 'cindle', 1, 6)).toThrow(); // fusion count <= 5
        return Promise.resolve();
      },
      seeded(),
    );
  });
});

describe('GET /api/state', () => {
  it('has the documented shape before and after choosing a starter', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const player = await join(ctx, USER, 30);
        const before = await player.state();
        expect(Object.keys(before).sort()).toEqual(
          [
            'balances',
            'creatures',
            'expeditions',
            'leetSync',
            'serverFirsts',
            'serverNow',
            'slots',
            'starterChosen',
            'starterOptions',
            'timezone',
            'trainingMedianLevel',
          ].sort(),
        );
        expect(before.serverNow).toBe(T0);
        expect(before.timezone).toBe('Europe/Helsinki');
        // No leet source in this test, so the status reports it as switched off.
        expect(before.leetSync).toEqual({
          source: 'disabled',
          lastAttemptAt: T0,
          lastSyncedAt: null,
          lastError: 'disabled',
          lastDays: null,
        });
        expect(before.balances).toEqual({ bait: 30, essence: 0 });
        expect(before.starterChosen).toBe(false);
        expect(before.starterOptions).toEqual(['splashet', 'cindle', 'sproutle']);
        expect(before.creatures).toEqual([]);
        expect(before.expeditions).toEqual([]);
        expect(before.slots).toEqual({ total: 3, used: 0 });
        expect(before.trainingMedianLevel).toBeNull();
        expect(before.serverFirsts).toEqual([]);

        await player.call('POST', '/api/starter', { species: 'cindle', idempotencyKey: newKey() });
        const after = await player.state();
        expect(after.starterChosen).toBe(true);
        expect('starterOptions' in after).toBe(false);
        expect(after.trainingMedianLevel).toBe(1);
        const [cindle] = after.creatures;
        expect(cindle).toEqual({
          id: expect.any(String) as string,
          species: 'cindle',
          line: 'cindle',
          level: 1,
          levelCap: 15,
          fusionCount: 0,
          shiny: false,
          nickname: null,
          away: false,
          quirk: expect.any(String) as string,
          origin: 'starter',
          caughtAt: T0,
          stats: { hp: 96, atk: 40, spd: 28 },
          trainCost: trainCostAt(1),
          evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: false },
          ability: {
            id: 'flare-strike',
            unlocked: false,
            unlockLevel: 10,
            nextId: 'flare-strike-2',
          },
        });
      },
      seeded(),
    );
  });

  it("shows each creature's finale ability: locked below level 10, the evolved form's as nextId", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const player = await joinWithStarter(ctx, USER, 100, 'cindle');
        const insert = (id: string, species: string, level: number): void => {
          const def = content.creatures.find((c) => c.id === species);
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, origin, caught_at)
             VALUES (?, ?, ?, ?, ?, 0, 'test', ?)`,
            id,
            USER_ID,
            def?.line,
            species,
            level,
            T0 + 5,
          );
        };
        insert('c-low', 'splashet', 9);
        insert('c-unlocked', 'sproutle', 10);
        insert('c-evolved', 'tempestray', 12);
        insert('c-single', 'coralynx', 10);
        const byId = new Map((await player.state()).creatures.map((c) => [c.id, c.ability]));
        expect(byId.get('c-low')).toEqual({
          id: 'tidal-mark',
          unlocked: false,
          unlockLevel: 10,
          nextId: 'tidal-mark-2',
        });
        expect(byId.get('c-unlocked')).toEqual({
          id: 'bark-guard',
          unlocked: true,
          unlockLevel: 10,
          nextId: 'bark-guard-2',
        });
        // Stage 2 has no further evolution, so no teaser; so has a species that never evolves.
        expect(byId.get('c-evolved')).toEqual({
          id: 'thunder-strike-2',
          unlocked: true,
          unlockLevel: 10,
        });
        expect(byId.get('c-single')).toEqual({
          id: 'coral-lance',
          unlocked: true,
          unlockLevel: 10,
        });
        // Every id is a real creature ability in the content.
        for (const ability of byId.values()) {
          const def = content.finaleAbilities.find((a) => a.id === ability?.id);
          expect(def?.kind).toBe('creature');
        }
      },
      seeded(),
    );
  });

  it("never includes another player's creatures, expeditions or balances", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100, 'splashet');
        const b = await joinWithStarter(ctx, OTHER, 7, 'cindle');
        await send(b, b.starterId);
        const stateA = await a.state();
        expect(stateA.creatures.map((c) => c.species)).toEqual(['splashet']);
        expect(stateA.expeditions).toEqual([]);
        expect(stateA.balances.bait).toBe(100);
        expect(JSON.stringify(stateA)).not.toContain(b.starterId);
        expect(JSON.stringify(stateA)).not.toContain(OTHER_USER_ID);
      },
      seeded(),
    );
  });

  it('lists active expeditions plus the last five claimed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0);
        const insert = (id: string, status: string, claimedAt: number | null) =>
          ctx.sql.exec(
            `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost,
               started_at, ends_at, status, claimed_at, result)
             VALUES (?, ?, ?, 'short', 'basic', 1, 10, 0, 1, ?, ?, ?)`,
            id,
            USER_ID,
            p.starterId,
            status,
            claimedAt,
            status === 'claimed' ? '{"recalled":false,"catches":[]}' : null,
          );
        for (let i = 1; i <= 7; i++) insert(`claimed-${String(i)}`, 'claimed', 1000 + i);
        insert('active-1', 'active', null);
        const state = await p.state();
        expect(state.expeditions.map((e) => e.id)).toEqual([
          'active-1',
          'claimed-7',
          'claimed-6',
          'claimed-5',
          'claimed-4',
          'claimed-3',
        ]);
        expect(state.slots).toEqual({ total: 3, used: 1 });
      },
      seeded(),
    );
  });

  it('runs the throttled leet sync like /api/me', async () => {
    const guildId = nextGuild();
    let calls = 0;
    const source: LeetSource = {
      getDays() {
        calls++;
        return Promise.resolve({
          days: [
            {
              id: `${guildId}:2026-10-09`,
              date: '2026-10-09',
              participants: [{ userId: USER_ID, leetAt: '2026-10-09T11:37:00.000Z' }],
            },
          ],
          nextCursor: 'c1',
          hasMore: false,
        });
      },
    };
    await runCore(
      guildId,
      async (ctx) => {
        const p = await join(ctx, USER);
        const first = await p.state();
        expect(first.balances.bait).toBeGreaterThan(0);
        await p.state();
        expect(calls).toBe(1);
      },
      { createLeetSource: () => source },
    );
  });

  it("returns the guild's stored timezone", async () => {
    const guildId = nextGuild();
    await runCore(guildId, async (ctx) => {
      ctx.sql.exec(
        "INSERT INTO guild_meta (id, guild_id, timezone) VALUES (1, ?, 'America/New_York')",
        guildId,
      );
      const player = await join(ctx, USER);
      expect((await player.state()).timezone).toBe('America/New_York');
    });
  });

  it('requires a session', async () => {
    await runCore(nextGuild(), async ({ core }) => {
      const res = await core.handle(new Request('https://creatures.test/api/state'));
      expect(res.status).toBe(401);
    });
  });
});

describe('POST /api/starter', () => {
  it('creates the level-1 creature once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER);
        const res = await p.call('POST', '/api/starter', {
          species: 'sproutle',
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(200);
        const state = res.body['state'] as StateBody;
        expect(state.creatures).toHaveLength(1);
        expect(state.creatures[0]).toMatchObject({ species: 'sproutle', level: 1 });
        const row = ctx.sql
          .exec<{
            starter_species: string;
            expeditions_claimed: number;
          }>('SELECT * FROM player_progress WHERE user_id = ?', USER_ID)
          .one();
        expect(row.starter_species).toBe('sproutle');
        expect(row.expeditions_claimed).toBe(0);
        expect(count(ctx.sql, 'server_firsts')).toBe(0);
      },
      seeded(),
    );
  });

  it('rejects a second attempt with 409, even for another species or the same key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER);
        const key = newKey();
        await p.call('POST', '/api/starter', { species: 'splashet', idempotencyKey: key });
        for (const body of [
          { species: 'cindle', idempotencyKey: newKey() },
          { species: 'splashet', idempotencyKey: key },
        ]) {
          const res = await p.call('POST', '/api/starter', body);
          expect(res.status).toBe(409);
          expect(res.body).toEqual({ error: 'starter_already_chosen' });
        }
        expect(count(ctx.sql, 'creatures')).toBe(1);
      },
      seeded(),
    );
  });

  it('keeps starter choices per player', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await join(ctx, USER);
        const b = await join(ctx, OTHER);
        expect(
          (await a.call('POST', '/api/starter', { species: 'splashet', idempotencyKey: newKey() }))
            .status,
        ).toBe(200);
        expect(
          (await b.call('POST', '/api/starter', { species: 'splashet', idempotencyKey: newKey() }))
            .status,
        ).toBe(200);
      },
      seeded(),
    );
  });

  it.each([
    ['a non-starter species', { species: 'zipmouse' }],
    ['an evolved species', { species: 'tidewing' }],
    ['an unknown species', { species: 'nope' }],
    ['a missing species', {}],
    ['an unknown key', { species: 'splashet', userId: 'x' }],
    ['a bad idempotency key', { species: 'splashet', idempotencyKey: 'short' }],
  ])('400s on %s', async (_name, extra) => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER);
        const body = { idempotencyKey: newKey(), ...extra };
        const res = await p.call('POST', '/api/starter', body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_body' });
        expect(count(ctx.sql, 'creatures')).toBe(0);
      },
      seeded(),
    );
  });

  it('400s on a non-JSON body', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, USER);
      const res = await ctx.core.handle(
        new Request('https://creatures.test/api/starter', {
          method: 'POST',
          headers: { Authorization: `Bearer ${await tokenFor(ctx.guildId, secret)}` },
          body: 'not json',
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_body' });
    });
  });
});

describe('POST /api/expeditions', () => {
  it('charges once, marks the explorer away and sets the end time', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const res = await send(p, p.starterId, 'medium', 'good');
        expect(res.status).toBe(200);
        const exp = expeditionOf(res);
        expect(exp).toMatchObject({
          creatureId: p.starterId,
          duration: 'medium',
          supplies: 'good',
          rolls: 2,
          cost: 50,
          startedAt: T0,
          endsAt: T0 + 6 * HOUR,
          status: 'active',
          claimedAt: null,
          result: null,
        });
        const state = res.body['state'] as StateBody;
        expect(state.balances.bait).toBe(50);
        expect(state.creatures[0]?.away).toBe(true);
        expect(state.slots).toEqual({ total: 3, used: 1 });
        const entry = ctx.sql
          .exec<{
            amount: number;
            source: string;
          }>("SELECT amount, source FROM ledger WHERE source = 'expedition'")
          .toArray();
        expect(entry).toEqual([{ amount: -50, source: 'expedition' }]);
      },
      seeded(),
    );
  });

  it('replays the same key: same expedition, charged once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const key = newKey();
        const first = await send(p, p.starterId, 'short', 'basic', key);
        ctx.clock.t += 5000;
        const second = await send(p, p.starterId, 'short', 'basic', key);
        expect(second.status).toBe(200);
        expect(expeditionOf(second)).toEqual(expeditionOf(first));
        expect(count(ctx.sql, 'expeditions')).toBe(1);
        expect((second.body['state'] as StateBody).balances.bait).toBe(90);
      },
      seeded(),
    );
  });

  it('refuses a key reused for a different request', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const key = newKey();
        await send(p, p.starterId, 'short', 'basic', key);
        const other = await send(p, p.starterId, 'short', 'good', key);
        expect(other.status).toBe(409);
        expect(other.body).toEqual({ error: 'key_conflict' });
        expect(count(ctx.sql, 'expeditions')).toBe(1);
        expect(ctx.core.balances(USER_ID).bait).toBe(90);
      },
      seeded(),
    );
  });

  it('writes nothing when the player cannot afford it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 9);
        const ledgerBefore = count(ctx.sql, 'ledger');
        const res = await send(p, p.starterId, 'short', 'basic');
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'insufficient_funds' });
        expect(count(ctx.sql, 'expeditions')).toBe(0);
        expect(count(ctx.sql, 'ledger')).toBe(ledgerBefore);
        expect(ctx.core.balances(USER_ID).bait).toBe(9);
        expect((await p.state()).creatures[0]?.away).toBe(false);
      },
      seeded(),
    );
  });

  it('409s when the creature is already away, without charging', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        await send(p, p.starterId);
        const res = await send(p, p.starterId);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'creature_away' });
        expect(ctx.core.balances(USER_ID).bait).toBe(90);
        expect(count(ctx.sql, 'expeditions')).toBe(1);
      },
      seeded(),
    );
  });

  it('409s on the 4th slot', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 500);
        for (const [i, line] of ['cindle', 'sproutle', 'zipmouse'].entries()) {
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
             VALUES (?, ?, ?, ?, 1, 'test', ?)`,
            `00000000-0000-4000-8000-00000000000${String(i + 1)}`,
            USER_ID,
            line,
            line,
            T0,
          );
        }
        const ids = (await p.state()).creatures.map((c) => c.id);
        expect(ids).toHaveLength(4);
        for (const id of ids.slice(0, 3)) expect((await send(p, id)).status).toBe(200);
        const fourth = ids[3];
        if (fourth === undefined) throw new Error('missing creature');
        const res = await send(p, fourth);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'slots_full' });
        expect(ctx.core.balances(USER_ID).bait).toBe(470);
      },
      seeded(),
    );
  });

  it('404s for a creature that is not yours or does not exist', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        const b = await joinWithStarter(ctx, OTHER, 100, 'cindle');
        const res = await send(b, a.starterId);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
        const missing = await send(b, '00000000-0000-4000-8000-000000000000');
        expect(missing.status).toBe(404);
        expect(count(ctx.sql, 'expeditions')).toBe(0);
        expect(ctx.core.balances(OTHER_USER_ID).bait).toBe(100);
      },
      seeded(),
    );
  });

  it.each([
    ['an unknown duration', { duration: 'forever' }],
    ['unknown supplies', { supplies: 'epic' }],
    ['a malformed creature id', { creatureId: '../etc' }],
    ['an unknown key', { userId: OTHER_USER_ID }],
    ['a bad idempotency key', { idempotencyKey: 'x' }],
  ])('400s on %s', async (_name, extra) => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const body = {
          creatureId: p.starterId,
          duration: 'short',
          supplies: 'basic',
          idempotencyKey: newKey(),
          ...extra,
        };
        const res = await p.call('POST', '/api/expeditions', body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_body' });
        expect(count(ctx.sql, 'expeditions')).toBe(0);
      },
      seeded(),
    );
  });
});

describe('Festival species', () => {
  it('are never brought back from an expedition, and are not starters', async () => {
    const festival = content.creatures.filter((c) => c.festival === true);
    expect(festival.length).toBeGreaterThan(0);
    for (const species of festival) {
      expect(species.catchable).toBe(false);
      expect(species.starter).toBe(false);
    }
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 1_000_000);
        const seen = new Set<string>();
        for (let i = 0; i < 80; i++) {
          const exp = expeditionOf(await send(p, p.starterId, 'long', 'great'));
          ctx.clock.t = exp.endsAt;
          const res = await claim(p, exp.id);
          expect(res.status).toBe(200);
          for (const c of resultOf(res).catches) seen.add(c.species);
        }
        // Plenty of the catchable species showed up, and no Festival species did. (A Festival
        // species only ever comes from a won Festival finale, never from a claim.)
        expect(seen.size).toBeGreaterThan(5);
        for (const species of festival) expect(seen.has(species.id)).toBe(false);
      },
      seeded(),
    );
  });
});

describe('POST /api/expeditions/{id}/claim', () => {
  it('after the end gives every roll and frees the explorer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const exp = expeditionOf(await send(p, p.starterId, 'long', 'basic'));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(res.status).toBe(200);
        const result = resultOf(res);
        expect(result.recalled).toBe(false);
        expect(result.catches).toHaveLength(3);
        const state = res.body['state'] as StateBody;
        expect(state.creatures.find((c) => c.id === p.starterId)?.away).toBe(false);
        expect(state.slots.used).toBe(0);
        const claimed = state.expeditions.find((e) => e.id === exp.id);
        expect(claimed).toMatchObject({ status: 'claimed', claimedAt: exp.endsAt });
        expect(claimed?.result).toEqual(result);
        // Every catch ends up in the collection, as a new creature or a fusion.
        for (const c of result.catches) {
          const line = content.creatures.find((s) => s.id === c.species)?.line;
          expect(state.creatures.some((own) => own.line === line)).toBe(true);
        }
      },
      seeded(),
    );
  });

  it('before the end recalls with floor(rolls x elapsed / duration) catches and no refund', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 200);
        const exp = expeditionOf(await send(p, p.starterId, 'long', 'good'));
        const paid = expeditionCost('long', 'good');
        ctx.clock.t = exp.startedAt + 8 * HOUR; // 8 of 12 hours: floor(3 * 2/3) = 2
        const expected = recallCatches(exp.rolls, exp.startedAt, exp.endsAt, ctx.clock.t);
        expect(expected).toBe(2);
        const res = await claim(p, exp.id);
        expect(res.status).toBe(200);
        expect(resultOf(res).recalled).toBe(true);
        expect(resultOf(res).catches).toHaveLength(2);
        expect((res.body['state'] as StateBody).balances.bait).toBe(200 - paid);
        expect((res.body['state'] as StateBody).slots.used).toBe(0);
      },
      seeded(),
    );
  });

  it('a recall with less than one roll earned gives nothing and still frees the explorer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const exp = expeditionOf(await send(p, p.starterId, 'medium', 'basic'));
        ctx.clock.t = exp.startedAt + 2 * HOUR; // floor(2 * 1/3) = 0
        const res = await claim(p, exp.id);
        expect(resultOf(res)).toEqual({ recalled: true, catches: [] });
        expect((res.body['state'] as StateBody).creatures[0]?.away).toBe(false);
      },
      seeded(),
    );
  });

  it('claiming twice returns the identical result with no second roll or extra creatures', async () => {
    const rng = countingRng('claim-twice');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const exp = expeditionOf(await send(p, p.starterId, 'long', 'basic'));
        ctx.clock.t = exp.endsAt;
        const first = await claim(p, exp.id);
        const drawn = rng.drawn();
        expect(drawn).toBeGreaterThan(0);
        const creatures = count(ctx.sql, 'creatures');
        const bait = ctx.core.balances(USER_ID).bait;
        const firsts = count(ctx.sql, 'server_firsts');
        ctx.clock.t += 10 * HOUR;
        const second = await claim(p, exp.id);
        expect(second.status).toBe(200);
        expect(resultOf(second)).toEqual(resultOf(first));
        expect(rng.drawn()).toBe(drawn);
        expect(count(ctx.sql, 'creatures')).toBe(creatures);
        expect(count(ctx.sql, 'server_firsts')).toBe(firsts);
        expect(ctx.core.balances(USER_ID).bait).toBe(bait);
      },
      { rng },
    );
  });

  it('concurrent claims through the Durable Object roll once', async () => {
    /** Claims a 3-roll expedition `times` at once; returns the draws used and the results. */
    const run = async (times: number) => {
      const rng = countingRng('concurrent');
      const results = await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await joinWithStarter(ctx, USER, 100);
          const exp = expeditionOf(await send(p, p.starterId, 'long', 'basic'));
          ctx.clock.t = exp.endsAt;
          const all = await Promise.all(Array.from({ length: times }, () => claim(p, exp.id)));
          expect(count(ctx.sql, 'expeditions', "status = 'claimed'")).toBe(1);
          const lines = ctx.sql
            .exec<{ n: number }>('SELECT COUNT(DISTINCT line) AS n FROM creatures')
            .one().n;
          expect(count(ctx.sql, 'creatures')).toBe(lines);
          return all;
        },
        { rng },
      );
      return { drawn: rng.drawn(), results };
    };
    const single = await run(1);
    const many = await run(5);
    expect(many.drawn).toBe(single.drawn);
    for (const r of many.results) {
      expect(r.status).toBe(200);
      expect(resultOf(r)).toEqual(resultOf(single.results[0] as Json));
    }
  });

  it("404s for an unknown expedition and for another player's expedition", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        const b = await joinWithStarter(ctx, OTHER, 100, 'cindle');
        const exp = expeditionOf(await send(a, a.starterId));
        ctx.clock.t = exp.endsAt;
        for (const id of [exp.id, '00000000-0000-4000-8000-000000000000']) {
          const res = await claim(b, id);
          expect(res.status).toBe(404);
          expect(res.body).toEqual({ error: 'not_found' });
        }
        expect(count(ctx.sql, 'expeditions', "status = 'active'")).toBe(1);
      },
      seeded(),
    );
  });

  it('400s on a malformed id or a non-empty body', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const exp = expeditionOf(await send(p, p.starterId));
        for (const path of [
          '/api/expeditions/not-an-id/claim',
          '/api/expeditions/ABCDEF/claim',
          '/api/expeditions/:id/claim',
        ]) {
          const res = await p.call('POST', path, {});
          expect(res.status).toBe(400);
          expect(res.body).toEqual({ error: 'invalid_id' });
        }
        const extra = await p.call('POST', `/api/expeditions/${exp.id}/claim`, { userId: 'x' });
        expect(extra.status).toBe(400);
        expect(extra.body).toEqual({ error: 'invalid_body' });
        // An array is not an object, even though the claim schema has no keys.
        const array = await p.call('POST', `/api/expeditions/${exp.id}/claim`, []);
        expect(array.status).toBe(400);
        expect(array.body).toEqual({ error: 'invalid_body' });
        expect(count(ctx.sql, 'expeditions', "status = 'active'")).toBe(1);
      },
      seeded(),
    );
  });

  it('the first expedition always brings back a Zipmouse first', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const exp = expeditionOf(await send(p, p.starterId, 'short', 'basic'));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        const [first] = resultOf(res).catches;
        expect(first).toMatchObject({ species: 'zipmouse', outcome: 'new' });
        const state = res.body['state'] as StateBody;
        expect(state.creatures.map((c) => c.species)).toEqual(['splashet', 'zipmouse']);
        expect(state.creatures[1]).toMatchObject({ level: 1, origin: 'expedition' });
      },
      seeded(),
    );
  });

  it('a recall that earns nothing does not use up the first-expedition Zipmouse', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const early = expeditionOf(await send(p, p.starterId, 'medium', 'basic'));
        expect(resultOf(await claim(p, early.id)).catches).toEqual([]);
        const next = expeditionOf(await send(p, p.starterId, 'short', 'basic'));
        ctx.clock.t = next.endsAt;
        expect(resultOf(await claim(p, next.id)).catches[0]?.species).toBe('zipmouse');
        // Now it is used up.
        const progress = ctx.sql
          .exec<{ expeditions_claimed: number }>('SELECT expeditions_claimed FROM player_progress')
          .one();
        expect(progress.expeditions_claimed).toBe(1);
      },
      seeded(),
    );
  });

  it('does not force a Zipmouse when the player already owns the line', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        ctx.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
           VALUES ('00000000-0000-4000-8000-000000000009', ?, 'zipmouse', 'zipmouse', 1, 'test', ?)`,
          USER_ID,
          T0,
        );
        const exp = expeditionOf(await send(p, p.starterId, 'short', 'basic'));
        ctx.clock.t = exp.endsAt;
        // A scripted common/splashet catch: the guarantee would have given a zipmouse instead.
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches).toHaveLength(1);
      },
      { rng: scriptedRng(COMMON_SPLASHET_PLAIN) },
    );
  });

  it('a duplicate fuses into the existing creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        const before = (await p.state()).creatures[0];
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches).toEqual([
          {
            species: 'splashet',
            shiny: false,
            outcome: 'fused',
            fusionCount: 1,
            firstOnServer: true,
          },
        ]);
        const after = (res.body['state'] as StateBody).creatures;
        expect(after).toHaveLength(1);
        expect(after[0]?.fusionCount).toBe(1);
        // +6% stats on every stat, floored.
        expect(after[0]?.stats.hp).toBe(Math.floor(((before?.stats.hp ?? 0) * 10600) / 10000));
        expect(
          ctx.sql.exec<{ s: number }>('SELECT dupe_streak AS s FROM player_progress').one().s,
        ).toBe(1);
      },
      { rng: scriptedRng(COMMON_SPLASHET_PLAIN) },
    );
  });

  it('after five fusions a duplicate converts to Bait, exactly once even on a replayed claim', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        ctx.sql.exec('UPDATE creatures SET fusion_count = 5');
        const exp = expeditionOf(await send(p, p.starterId, 'medium', 'basic')); // 2 rolls, 20 Bait
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        const bait = RULES.fusion.convertBait.common;
        expect(resultOf(res).catches.map((c) => [c.outcome, c.bait])).toEqual([
          ['converted', bait],
          ['converted', bait],
        ]);
        expect(ctx.core.balances(USER_ID).bait).toBe(100 - 20 + 2 * bait);
        const credits = ctx.sql
          .exec<{
            amount: number;
            idempotency_key: string;
          }>("SELECT amount, idempotency_key FROM ledger WHERE source = 'fusion' ORDER BY id")
          .toArray();
        expect(credits).toEqual([
          { amount: bait, idempotency_key: `fusion:${exp.id}:0` },
          { amount: bait, idempotency_key: `fusion:${exp.id}:1` },
        ]);
        // A replayed claim pays nothing more.
        const again = await claim(p, exp.id);
        expect(resultOf(again)).toEqual(resultOf(res));
        expect(ctx.core.balances(USER_ID).bait).toBe(100 - 20 + 2 * bait);
        expect(count(ctx.sql, 'ledger', "source = 'fusion'")).toBe(2);
        expect((await p.state()).creatures[0]?.fusionCount).toBe(5);
      },
      { rng: scriptedRng([...COMMON_SPLASHET_PLAIN, ...COMMON_SPLASHET_PLAIN]) },
    );
  });

  it('a shiny duplicate makes the existing creature shiny', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        expect((await p.state()).creatures[0]?.shiny).toBe(false);
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches[0]).toMatchObject({ outcome: 'fused', shiny: true });
        expect((res.body['state'] as StateBody).creatures[0]?.shiny).toBe(true);
      },
      { rng: scriptedRng(COMMON_SPLASHET_SHINY) },
    );
  });

  it('a shiny new catch is a shiny creature, and a shiny conversion also upgrades', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Cindle owner: catching splashet (first in the common list) is a new line.
        const p = await joinWithStarter(ctx, USER, 100, 'cindle');
        skipFirstExpedition(ctx.sql, USER_ID);
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches[0]).toMatchObject({
          species: 'splashet',
          outcome: 'new',
          shiny: true,
        });
        const splashet = (res.body['state'] as StateBody).creatures.find(
          (c) => c.species === 'splashet',
        );
        expect(splashet?.shiny).toBe(true);
      },
      { rng: scriptedRng(COMMON_SPLASHET_SHINY) },
    );

    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        ctx.sql.exec('UPDATE creatures SET fusion_count = 5');
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches[0]).toMatchObject({ outcome: 'converted', shiny: true });
        expect((res.body['state'] as StateBody).creatures[0]?.shiny).toBe(true);
      },
      { rng: scriptedRng(COMMON_SPLASHET_SHINY) },
    );
  });

  it('a second catch of a species within one claim fuses into the first', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100, 'cindle');
        skipFirstExpedition(ctx.sql, USER_ID);
        const exp = expeditionOf(await send(p, p.starterId, 'medium', 'basic'));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches).toEqual([
          { species: 'splashet', shiny: false, outcome: 'new', firstOnServer: true },
          {
            species: 'splashet',
            shiny: false,
            outcome: 'fused',
            fusionCount: 1,
            firstOnServer: false,
          },
        ]);
        expect((res.body['state'] as StateBody).creatures.map((c) => c.line)).toEqual([
          'cindle',
          'splashet',
        ]);
      },
      { rng: scriptedRng([...COMMON_SPLASHET_PLAIN, ...COMMON_SPLASHET_PLAIN]) },
    );
  });

  it('records "first on server" once per species and shares it only within a drop', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100, 'splashet');
        const b = await joinWithStarter(ctx, OTHER, 100, 'cindle');
        skipFirstExpedition(ctx.sql, USER_ID);
        skipFirstExpedition(ctx.sql, OTHER_USER_ID);
        const expA = expeditionOf(await send(a, a.starterId));
        const expB = expeditionOf(await send(b, b.starterId));
        ctx.clock.t = expA.endsAt;
        const resA = await claim(a, expA.id);
        ctx.clock.t += 1000;
        const resB = await claim(b, expB.id);
        expect(resultOf(resA).catches[0]).toMatchObject({
          species: 'splashet',
          firstOnServer: true,
        });
        expect(resultOf(resB).catches[0]).toMatchObject({
          species: 'splashet',
          outcome: 'new',
          firstOnServer: false,
        });
        expect(
          ctx.sql
            .exec<{
              user_id: string;
              drop_id: string;
              at: number;
            }>(
              "SELECT user_id, drop_id, at FROM server_firsts WHERE kind = 'catch' AND species = 'splashet'",
            )
            .toArray(),
        ).toEqual([{ user_id: USER_ID, drop_id: expA.id, at: expA.endsAt }]);
        const stateA = resA.body['state'] as StateBody;
        const stateB = resB.body['state'] as StateBody;
        expect(stateA.serverFirsts).toEqual([
          { kind: 'catch', species: 'splashet', at: expA.endsAt, mine: true, holders: ['Misa'] },
        ]);
        expect(stateB.serverFirsts).toEqual([
          { kind: 'catch', species: 'splashet', at: expA.endsAt, mine: false, holders: ['Misa'] },
        ]);
      },
      { rng: scriptedRng([...COMMON_SPLASHET_PLAIN, ...COMMON_SPLASHET_PLAIN]) },
    );
  });

  it('shares a first between users of the same drop (ties for later raids)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        await join(ctx, USER);
        const record = (
          ctx.core.collection as unknown as {
            recordFirst: (k: string, s: string, u: string, d: string, at: number) => boolean;
          }
        ).recordFirst.bind(ctx.core.collection);
        expect(record('catch', 'gaiadrake', USER_ID, 'drop-1', T0)).toBe(true);
        expect(record('catch', 'gaiadrake', OTHER_USER_ID, 'drop-1', T0)).toBe(true);
        expect(record('catch', 'gaiadrake', '999999999999999999', 'drop-2', T0 + 1)).toBe(false);
        expect(record('catch', 'gaiadrake', USER_ID, 'drop-1', T0 + 2)).toBe(false);
        expect(count(ctx.sql, 'server_firsts')).toBe(2);
      },
      seeded(),
    );
  });

  it("does not touch another player's progress", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        await joinWithStarter(ctx, OTHER, 100, 'cindle');
        const exp = expeditionOf(await send(a, a.starterId));
        ctx.clock.t = exp.endsAt;
        await claim(a, exp.id);
        expect(
          ctx.sql
            .exec<{ n: number }>(
              'SELECT expeditions_claimed AS n FROM player_progress WHERE user_id = ?',
              OTHER_USER_ID,
            )
            .one().n,
        ).toBe(0);
      },
      seeded(),
    );
  });
});

describe('POST /api/creatures/{id}/train', () => {
  const train = (p: Player, id: string, key = newKey()) =>
    p.call('POST', `/api/creatures/${id}/train`, { idempotencyKey: key });

  it('charges the cost and raises the level by one', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const res = await train(p, p.starterId);
        expect(res.status).toBe(200);
        expect(res.body['level']).toBe(2);
        const state = res.body['state'] as StateBody;
        expect(state.balances.bait).toBe(100 - trainCostAt(1));
        expect(state.creatures[0]).toMatchObject({ level: 2, trainCost: trainCostAt(2) });
        expect(
          ctx.sql
            .exec<{ amount: number }>("SELECT amount FROM ledger WHERE source = 'training'")
            .toArray(),
        ).toEqual([{ amount: -trainCostAt(1) }]);
      },
      seeded(),
    );
  });

  it('replaying the key charges once and does not level twice', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const key = newKey();
        await train(p, p.starterId, key);
        const again = await train(p, p.starterId, key);
        expect(again.status).toBe(200);
        expect(again.body['level']).toBe(2);
        expect((again.body['state'] as StateBody).balances.bait).toBe(100 - trainCostAt(1));
        expect((again.body['state'] as StateBody).creatures[0]?.level).toBe(2);
        expect(count(ctx.sql, 'ledger', "source = 'training'")).toBe(1);
      },
      seeded(),
    );
  });

  it('refuses a key that was used for another creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        ctx.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
           VALUES ('00000000-0000-4000-8000-000000000008', ?, 'cindle', 'cindle', 1, 'test', ?)`,
          USER_ID,
          T0,
        );
        const key = newKey();
        await train(p, p.starterId, key);
        const res = await train(p, '00000000-0000-4000-8000-000000000008', key);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'key_conflict' });
        expect(ctx.core.balances(USER_ID).bait).toBe(100 - trainCostAt(1));
      },
      seeded(),
    );
  });

  it('409s when the creature is at its level cap', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 1000);
        ctx.sql.exec('UPDATE creatures SET level = 15');
        const res = await train(p, p.starterId);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'level_cap' });
        const state = await p.state();
        expect(state.creatures[0]).toMatchObject({ level: 15, trainCost: null });
        expect(state.balances.bait).toBe(1000);
      },
      seeded(),
    );
  });

  it('409s while the creature is away', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        await send(p, p.starterId);
        const res = await train(p, p.starterId);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'creature_away' });
        expect(ctx.core.balances(USER_ID).bait).toBe(90);
      },
      seeded(),
    );
  });

  it('409s without funds and writes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, trainCostAt(1) - 1);
        const ledger = count(ctx.sql, 'ledger');
        const res = await train(p, p.starterId);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'insufficient_funds' });
        expect(count(ctx.sql, 'ledger')).toBe(ledger);
        expect((await p.state()).creatures[0]?.level).toBe(1);
      },
      seeded(),
    );
  });

  it('applies the catch-up discount when far below the server median', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        await joinWithStarter(ctx, OTHER, 500, 'cindle');
        ctx.sql.exec('UPDATE creatures SET level = 15 WHERE user_id = ?', OTHER_USER_ID);
        // Top levels are 1 and 15: median 8, so level 1 < 8 - 5 gets half price (rounded up).
        const state = await a.state();
        expect(state.trainingMedianLevel).toBe(8);
        expect(state.creatures[0]?.trainCost).toBe(Math.ceil(trainCostAt(1) / 2));
        const res = await train(a, a.starterId);
        expect(res.status).toBe(200);
        expect((res.body['state'] as StateBody).balances.bait).toBe(
          100 - Math.ceil(trainCostAt(1) / 2),
        );
        // Level 2 is still more than 5 below 8 (2 < 3): half price again.
        expect((res.body['state'] as StateBody).creatures[0]?.trainCost).toBe(
          Math.ceil(trainCostAt(2) / 2),
        );
      },
      seeded(),
    );
  });

  it('charges full price near the median', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        await joinWithStarter(ctx, OTHER, 100, 'cindle');
        ctx.sql.exec('UPDATE creatures SET level = 6 WHERE user_id = ?', OTHER_USER_ID);
        // Tops 1 and 6: median 3.5; 1 < -1.5 is false.
        const state = await a.state();
        expect(state.trainingMedianLevel).toBe(3.5);
        expect(state.creatures[0]?.trainCost).toBe(trainCostAt(1));
      },
      seeded(),
    );
  });

  it("uses each player's highest creature, and ignores players without creatures", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        await join(ctx, OTHER); // no starter: not part of the median
        ctx.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
           VALUES ('00000000-0000-4000-8000-000000000007', ?, 'zipmouse', 'zipmouse', 9, 'test', ?)`,
          USER_ID,
          T0,
        );
        expect((await a.state()).trainingMedianLevel).toBe(9);
      },
      seeded(),
    );
  });

  it('404s for creatures that are not yours and 400s for malformed ids and bodies', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 100);
        const b = await joinWithStarter(ctx, OTHER, 100, 'cindle');
        const res = await train(b, a.starterId);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
        expect((await train(a, 'nope')).status).toBe(400);
        expect((await a.call('POST', `/api/creatures/${a.starterId}/train`, {})).status).toBe(400);
        expect(
          (
            await a.call('POST', `/api/creatures/${a.starterId}/train`, {
              idempotencyKey: newKey(),
              amount: 0,
            })
          ).status,
        ).toBe(400);
        expect(ctx.core.balances(OTHER_USER_ID).bait).toBe(100);
        expect(ctx.core.balances(USER_ID).bait).toBe(100);
      },
      seeded(),
    );
  });
});

describe('PATCH /api/creatures/{id}', () => {
  const rename = (p: Player, id: string, nickname: unknown) =>
    p.call('PATCH', `/api/creatures/${id}`, { nickname });
  const stored = (sql: SqlStorage) =>
    sql.exec<{ nickname: string | null }>('SELECT nickname FROM creatures').one().nickname;

  it('sets, sanitises and clears the nickname', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0);
        let res = await rename(p, p.starterId, 'Sparky');
        expect(res.status).toBe(200);
        expect((res.body['state'] as StateBody).creatures[0]?.nickname).toBe('Sparky');
        expect(stored(ctx.sql)).toBe('Sparky');

        res = await rename(p, p.starterId, '  Spar    ky  ');
        expect(res.body['nickname']).toBe('Spar ky');
        expect(stored(ctx.sql)).toBe('Spar ky');

        // NFKC: full-width letters become plain ones.
        await rename(p, p.starterId, 'ＡＢＣ');
        expect(stored(ctx.sql)).toBe('ABC');

        res = await rename(p, p.starterId, null);
        expect(res.status).toBe(200);
        expect(stored(ctx.sql)).toBeNull();

        await rename(p, p.starterId, 'Again');
        res = await rename(p, p.starterId, '   ');
        expect(res.status).toBe(200);
        expect(stored(ctx.sql)).toBeNull();
      },
      seeded(),
    );
  });

  it.each([
    ['a bidi override', 'abc‮def', 'forbidden_characters'],
    ['a zero-width space', 'a​b', 'forbidden_characters'],
    ['a control character', 'a\u0007b', 'forbidden_characters'],
    ['too many characters', 'x'.repeat(21), 'too_long'],
    ['a string over the raw length limit', 'x'.repeat(300), 'too_long'],
  ])('rejects %s', async (_name, nickname, reason) => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0);
        await rename(p, p.starterId, 'Keep');
        const res = await rename(p, p.starterId, nickname);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'invalid_nickname', reason });
        expect(stored(ctx.sql)).toBe('Keep');
      },
      seeded(),
    );
  });

  it('accepts exactly 20 code points, including emoji', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0);
        expect((await rename(p, p.starterId, '\u{1F40D}'.repeat(20))).status).toBe(200);
        expect((await rename(p, p.starterId, '\u{1F40D}'.repeat(21))).status).toBe(400);
      },
      seeded(),
    );
  });

  it('404s for creatures that are not yours', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await joinWithStarter(ctx, USER, 0);
        const b = await joinWithStarter(ctx, OTHER, 0, 'cindle');
        const res = await rename(b, a.starterId, 'Mine now');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'not_found' });
        expect(
          ctx.sql
            .exec<{ nickname: string | null }>(
              'SELECT nickname FROM creatures WHERE id = ?',
              a.starterId,
            )
            .one().nickname,
        ).toBeNull();
      },
      seeded(),
    );
  });

  it('400s on malformed bodies and ids', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0);
        for (const body of [
          {},
          { nickname: 5 },
          { nickname: 'a', extra: 1 },
          { nickname: undefined },
        ]) {
          const res = await p.call('PATCH', `/api/creatures/${p.starterId}`, body);
          expect(res.status).toBe(400);
          expect(res.body).toEqual({ error: 'invalid_body' });
        }
        expect((await rename(p, 'nope', 'x')).status).toBe(400);
        expect(stored(ctx.sql)).toBeNull();
      },
      seeded(),
    );
  });
});

describe('routing', () => {
  it('405s on wrong methods and 404s on unknown paths', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0);
        const wrongMethod: [string, string][] = [
          ['POST', '/api/state'],
          ['GET', '/api/starter'],
          ['GET', '/api/expeditions'],
          ['GET', `/api/creatures/${p.starterId}`],
          ['PUT', `/api/creatures/${p.starterId}`],
          ['GET', `/api/creatures/${p.starterId}/train`],
        ];
        for (const [method, path] of wrongMethod) {
          expect((await p.call(method, path)).status, `${method} ${path}`).toBe(405);
        }
        for (const path of [
          '/api/creatures',
          `/api/creatures/${p.starterId}/train/extra`,
          '/api/expeditions//claim',
          '/api/constructor',
        ]) {
          expect((await p.call('POST', path, {})).status, path).toBe(404);
        }
      },
      seeded(),
    );
  });
});

describe('nested credit inside a transaction', () => {
  it('rolls back with the outer transaction and stays idempotent inside it', async () => {
    await runCore(nextGuild(), ({ core, storage }) => {
      const input = {
        userId: USER_ID,
        currency: 'bait',
        amount: 5,
        source: 'fusion',
        idempotencyKey: 'fusion:e:0',
      } as const;
      expect(() =>
        storage.transactionSync(() => {
          expect(core.credit(input)).toEqual({ applied: true });
          expect(core.credit(input)).toEqual({ applied: false });
          expect(core.balances(USER_ID).bait).toBe(5);
          throw new Error('abort');
        }),
      ).toThrow('abort');
      expect(core.balances(USER_ID).bait).toBe(0);
      storage.transactionSync(() => core.credit(input));
      expect(core.balances(USER_ID).bait).toBe(5);
      return Promise.resolve();
    });
  });
});

describe('creature quirks', () => {
  const quirkOf = (ctx: CoreContext, id: string): string | null =>
    ctx.sql
      .exec<{ quirk_id: string | null }>('SELECT quirk_id FROM creatures WHERE id = ?', id)
      .one().quirk_id;

  it('gives the starter a quirk drawn from the quirk RNG at that moment, and shows it in the state', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 0, 'cindle');
        const expected = pickQuirk('cindle', createSeededRng('quirk-starter'));
        expect(quirkOf(ctx, p.starterId)).toBe(expected);
        const view = (await p.state()).creatures[0];
        expect(view?.quirk).toBe(expected);
        expect(quirkText(expected)).toBeDefined();
      },
      { ...seeded(), quirkRng: createSeededRng('quirk-starter') },
    );
  });

  it('uses the live crypto RNG by default: every creature has a quirk from the data', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const known = new Set([
        ...lore.quirks.general.map((q) => q.id),
        ...Object.values(lore.quirks.againstType).flatMap((list) => list.map((q) => q.id)),
      ]);
      const a = await joinWithStarter(ctx, USER, 0, 'splashet');
      const b = await joinWithStarter(ctx, OTHER, 0, 'sproutle');
      for (const player of [a, b]) {
        const creature = (await player.state()).creatures[0];
        expect(creature?.quirk).not.toBeNull();
        expect(known.has(creature?.quirk ?? '')).toBe(true);
      }
    });
  });

  it('gives a caught creature a quirk, and the fusion of a duplicate changes nothing', async () => {
    const quirkRng = createSeededRng('quirk-catch');
    const replay = createSeededRng('quirk-catch');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        // The first expedition always brings back a Zipmouse, a new line for this player.
        const first = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = first.endsAt;
        const res = await claim(p, first.id);
        expect(resultOf(res).catches[0]).toMatchObject({ species: 'zipmouse', outcome: 'new' });
        const zipmouse = (await p.state()).creatures.find((c) => c.species === 'zipmouse');
        // The starter took the first pick, the catch the second.
        pickQuirk('splashet', replay);
        const expected = pickQuirk('zipmouse', replay);
        expect(zipmouse?.quirk).toBe(expected);
        expect(quirkOf(ctx, zipmouse?.id ?? '')).toBe(expected);
        // A replayed claim returns the stored result: nothing new is drawn or changed.
        await claim(p, first.id);
        expect(quirkOf(ctx, zipmouse?.id ?? '')).toBe(expected);
      },
      { ...seeded(), quirkRng },
    );
  });

  it('keeps the quirk of an existing creature when a duplicate fuses, and draws nothing', async () => {
    const quirkRng = countingRng('quirk-fuse');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        const drawnAfterStarter = quirkRng.drawn();
        expect(drawnAfterStarter).toBeGreaterThanOrEqual(2);
        ctx.sql.exec("UPDATE creatures SET quirk_id = 'hums-quietly' WHERE id = ?", p.starterId);
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches[0]).toMatchObject({ species: 'splashet', outcome: 'fused' });
        expect(quirkOf(ctx, p.starterId)).toBe('hums-quietly');
        expect(quirkRng.drawn()).toBe(drawnAfterStarter);
        expect((await p.state()).creatures[0]?.quirk).toBe('hums-quietly');
      },
      { rng: scriptedRng(COMMON_SPLASHET_PLAIN), quirkRng },
    );
  });

  it('never draws a quirk from the catch RNG, so a catch uses exactly its own draws', async () => {
    const rng = scriptedRng([...COMMON_SPLASHET_PLAIN, 0, 1, 1]);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        // The starter was picked without touching the catch RNG.
        expect(rng.drawn()).toBe(0);
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        await claim(p, exp.id);
        expect(rng.drawn()).toBe(COMMON_SPLASHET_PLAIN.length);
      },
      { rng },
    );
  });

  it('shows no quirk for a missing or unknown quirk id, and keeps working', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await joinWithStarter(ctx, USER, 0);
      ctx.sql.exec('UPDATE creatures SET quirk_id = NULL WHERE id = ?', p.starterId);
      expect((await p.state()).creatures[0]?.quirk).toBeNull();
      ctx.sql.exec(
        "UPDATE creatures SET quirk_id = 'removed-from-the-data' WHERE id = ?",
        p.starterId,
      );
      expect((await p.state()).creatures[0]?.quirk).toBeNull();
    });
  });
});

describe('through the Worker', () => {
  it('serves the collection API end to end with the live RNG', async () => {
    const handler = createHandler({ createDiscord: () => fakeDiscord() });
    const auth = await postAuth(handler, { code: 'code', instanceId: 'instance' });
    expect(auth.status).toBe(200);
    const { sessionToken } = await auth.json<{ sessionToken: string }>();

    const state = await getWithToken(handler, '/api/state', sessionToken);
    expect(state.status).toBe(200);
    expect((await state.json<StateBody>()).starterOptions).toHaveLength(3);

    const res = await callHandler(
      handler,
      new Request('https://creatures.test/api/starter', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ species: 'cindle', idempotencyKey: newKey() }),
      }),
    );
    expect(res.status).toBe(200);
    const after = (await res.json<{ state: StateBody }>()).state;
    expect(after.creatures[0]?.species).toBe('cindle');

    const creatureId = after.creatures[0]?.id ?? '';
    const missing = await callHandler(
      handler,
      new Request(`https://creatures.test/api/creatures/${creatureId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ nickname: 'Ember' }),
      }),
    );
    expect(missing.status).toBe(200);
  });
});
