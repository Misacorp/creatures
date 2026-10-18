import {
  RULES,
  content,
  createSeededRng,
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
  certainCatches,
  callHandler,
  fakeDiscord,
  getWithToken,
  postAuth,
  runCore,
  tokenFor,
  undoRaidMigration,
  type CoreContext,
  LATEST_SCHEMA_VERSION,
} from './helpers';
import { createHandler } from '../src/index';

const HOUR = 3_600_000;

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

/**
 * Draws for one catch of a non-zipmouse common species that is not shiny: [the roll brings a creature,
 * rarity, species, shiny].
 */
const COMMON_SPLASHET_PLAIN = [0, 0, 0, 1];
/** Same, but shiny. */
const COMMON_SPLASHET_SHINY = [0, 0, 0, 0];

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
  exp: number;
  expNeeded: number | null;
  waiting: boolean;
  ribbons: number;
  nextUnlock: { level: number; name: string } | null;
  ribbon: { id: string; level: number } | null;
  treatCost: number;
  evolution?: { toSpecies: string; level: number; essence: number; available: boolean };
  ability: { id: string; unlocked: boolean; unlockLevel: number; nextId?: string } | null;
}

interface CatchBody {
  species: string;
  shiny: boolean;
  outcome: string;
  talent?: {
    id: string;
    name: string;
    golden: boolean;
    text: string;
    about: string;
    idle: boolean;
  };
  pendingId?: string;
  firstOnServer: boolean;
}

interface PendingBody {
  id: string;
  species: string;
  line: string;
  shiny: boolean;
  source: string;
  talent: { id: string; golden: boolean };
  offered: { teach: string[]; fuse: string[]; release: boolean; keep: boolean };
  recommended: { choice: string; creatureId?: string; slot?: number };
}

interface ExpeditionBody {
  id: string;
  creatureId: string;
  duration: string;
  supplies: string;
  kit: string[];
  destination: string;
  readyAt: number;
  offer: { goals: { id: string; risk: string; extraHours: number; oddsBp: number }[] } | null;
  pushOn: { goalId: string; startedAt: number; endsAt: number; oddsBp: number } | null;
  rolls: number;
  cost: number;
  startedAt: number;
  endsAt: number;
  status: string;
  claimedAt: number | null;
  result: { recalled: boolean; catches: CatchBody[]; noCatch?: number } | null;
}

interface StateBody {
  serverNow: number;
  /** Only in GET /api/state, not in the `state` echoed by POST routes. */
  timezone: string;
  /** Only in GET /api/state too. */
  attention: { dungeon: boolean; raid: boolean; recheckAt: number | null } | null;
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
  pending: PendingBody[];
  bookSlotBait: number;
  expeditions: ExpeditionBody[];
  slots: {
    total: number;
    used: number;
    rankSum: number;
    tripsFinished: number;
    next: { kind: 'trips' | 'rank_sum'; at: number } | null;
  };
  supplies: Record<string, number>;
  cancelled: { id: string; reason: string }[];
  serverFirsts: { kind: string; species: string; at: number; mine: boolean; holders: string[] }[];
  loungerId: string | null;
  loungeSpot: { id: string; at: number } | null;
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

/** Puts supplies in a player's stock (they are carried for nothing with `source: 'owned'`). */
function stock(sql: SqlStorage, userId: string, id: string, amount: number): void {
  sql.exec(
    `INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, supply_id) DO UPDATE SET amount = excluded.amount`,
    userId,
    id,
    amount,
  );
}

/** A map scrap of the best tier: doubles the rolls of a 1-roll trip. */
const OWNED_ATLAS = [{ id: 'map-scrap-great', source: 'owned' as const }];

/** A supply taken from stock for a trip (the only way to carry one: supplies cannot be bought). */
const own = (id: string) => ({ id, source: 'owned' as const });

/** The old way to send a supply, which is refused now. */
const buy = (id: string) => ({ id, source: 'buy' as const });

/** Sends a creature to the Tidepools (open to every explorer) with the given supplies; free without. */
function send(
  player: Player,
  creatureId: string,
  duration: 'short' | 'medium' | 'long' | 'day' = 'short',
  supplies: { id: string; source: 'buy' | 'owned' }[] = [],
  idempotencyKey = newKey(),
  destination = 'tidepools',
) {
  return player.call('POST', '/api/expeditions', {
    creatureId,
    destination,
    duration,
    supplies,
    idempotencyKey,
  });
}

/**
 * Opens `slots` expedition slots for a player: the second comes from finished trips (the stat is set), the
 * rest from a rank sum that reaches the rule's threshold (ten ranks on creatures, nine ranks above 1 each).
 */
function unlockSlots(sql: SqlStorage, userId: string, creatureId: string, slots: number): void {
  if (slots >= 2) {
    sql.exec(
      `INSERT INTO account_stats (user_id, stat, value) VALUES (?, 'trips_finished', ?)
       ON CONFLICT(user_id, stat) DO UPDATE SET value = MAX(value, excluded.value)`,
      userId,
      RULES.expeditions.slots.secondAfterTrips,
    );
  }
  const needed = slots <= 2 ? 0 : (RULES.expeditions.slots.thresholds[slots - 3] ?? 0);
  const top = RULES.expeditions.rank.xpForRank.at(-1) ?? 0;
  const rows = Math.ceil(needed / 9);
  const creatures = sql
    .exec<{ id: string }>(
      'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      userId,
    )
    .toArray();
  const ids = [creatureId, ...creatures.map((c) => c.id).filter((id) => id !== creatureId)];
  for (const id of ids.slice(0, rows)) {
    sql.exec(
      `INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 0)
       ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
      userId,
      id,
      top,
    );
  }
}

const claim = (player: Player, id: string) =>
  player.call('POST', `/api/expeditions/${id}/claim`, {});

function expeditionOf(res: Json): ExpeditionBody {
  return res.body['expedition'] as ExpeditionBody;
}

function resultOf(res: Json): { recalled: boolean; catches: CatchBody[]; noCatch?: number } {
  return res.body['result'] as { recalled: boolean; catches: CatchBody[]; noCatch?: number };
}

function count(sql: SqlStorage, table: string, where = '1 = 1'): number {
  return sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).one().n;
}

/** Marks the player as past their first expedition, so the zipmouse guarantee does not apply. */
function skipFirstExpedition(sql: SqlStorage, userId: string): void {
  sql.exec('UPDATE player_progress SET expeditions_claimed = 1 WHERE user_id = ?', userId);
}

const seeded = (): GuildCoreOptions => ({
  rng: createSeededRng('m2b-tests'),
  gearRng: createSeededRng('m2b-gear'),
  tripRng: createSeededRng('m2b-trip'),
});

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
        LATEST_SCHEMA_VERSION,
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
            'attention',
            'balances',
            'bookSlotBait',
            'cancelled',
            'creatures',
            'expeditions',
            'leetSync',
            'levelReset',
            'loungeSpot',
            'loungerId',
            'pending',
            'serverFirsts',
            'serverNow',
            'slots',
            'starterChosen',
            'starterOptions',
            'supplies',
            'timezone',
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
        expect(before.pending).toEqual([]);
        expect(before.bookSlotBait).toBe(RULES.talents.bookSlotBait);
        expect(before.slots).toEqual({
          total: 1,
          used: 0,
          rankSum: 0,
          tripsFinished: 0,
          next: { kind: 'trips', at: RULES.expeditions.slots.secondAfterTrips },
        });
        expect(before.supplies).toEqual({});
        expect(before.cancelled).toEqual([]);
        expect(before.serverFirsts).toEqual([]);
        expect(before.loungerId).toBeNull();
        expect(before.loungeSpot).toBeNull();
        // Only the plain GET carries the pips: no creatures yet, so nothing to run or to place.
        expect(before.attention).toEqual({
          dungeon: false,
          raid: false,
          recheckAt: expect.any(Number) as number,
        });

        await player.call('POST', '/api/starter', { species: 'cindle', idempotencyKey: newKey() });
        const after = await player.state();
        expect(after.starterChosen).toBe(true);
        expect('starterOptions' in after).toBe(false);
        const [cindle] = after.creatures;
        // The only creature is the one that lounges.
        expect(after.loungerId).toBe(cindle?.id);
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
          lineSlot: 1,
          // The scripted talent draws are the second talent of the Cindle line, not golden.
          talents: {
            slots: [
              {
                slot: 1,
                opensAt: 1,
                open: true,
                talent: {
                  id: 'warm-to-the-touch',
                  name: 'Warm to the Touch',
                  golden: false,
                  text: 'Wildfire bonus +13%',
                  about: expect.any(String) as string,
                  idle: false,
                },
              },
              { slot: 2, opensAt: 20, open: false, talent: null },
            ],
            signature: null,
            book: [
              {
                id: 'warm-to-the-touch',
                name: 'Warm to the Touch',
                golden: false,
                text: 'Wildfire bonus +13%',
                about: expect.any(String) as string,
                idle: false,
                slot: 1,
              },
            ],
          },
          origin: 'starter',
          caughtAt: T0,
          explorer: { rank: 1, xp: 0, nextRankXp: RULES.expeditions.rank.xpForRank[1], trips: 0 },
          stats: { hp: 96, atk: 40, spd: 28 },
          // No gear yet: the fight stats are the same, nothing is worn and nothing is busy.
          statsWithGear: { hp: 96, atk: 40, spd: 28 },
          gear: [],
          busy: null,
          exp: 0,
          expNeeded: 27,
          waiting: false,
          ribbons: 0,
          nextUnlock: { level: 7, name: 'Scarf' },
          ribbon: null,
          treatCost: 4,
          evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: false },
          ability: {
            id: 'flare-strike',
            unlocked: false,
            unlockLevel: 10,
            nextId: 'flare-strike-2',
          },
        });
      },
      { ...seeded(), talentRng: scriptedRng([1, 5]) },
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
        expect(state.slots).toMatchObject({
          total: 1,
          used: 1,
          rankSum: 0,
          next: { kind: 'trips', at: RULES.expeditions.slots.secondAfterTrips },
        });
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
  it('is free without supplies: marks the explorer away and sets the end time', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const res = await send(p, p.starterId, 'medium');
        expect(res.status).toBe(200);
        const exp = expeditionOf(res);
        expect(exp).toMatchObject({
          creatureId: p.starterId,
          duration: 'medium',
          supplies: 'basic',
          kit: [],
          destination: 'tidepools',
          rolls: RULES.expeditions.lengths.medium.rolls,
          cost: 0,
          startedAt: T0,
          endsAt: T0 + 6 * HOUR,
          readyAt: T0 + 6 * HOUR,
          status: 'active',
          claimedAt: null,
          result: null,
          offer: null,
          pushOn: null,
        });
        const state = res.body['state'] as StateBody;
        expect(state.balances.bait).toBe(100);
        expect(state.creatures[0]?.away).toBe(true);
        expect(state.slots).toMatchObject({
          total: 1,
          used: 1,
          rankSum: 0,
          next: { kind: 'trips', at: RULES.expeditions.slots.secondAfterTrips },
        });
        expect(count(ctx.sql, 'ledger', "source = 'expedition'")).toBe(0);
      },
      seeded(),
    );
  });

  it('takes a supply from stock and charges nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        stock(ctx.sql, USER_ID, 'lure-good', 1);
        const res = await send(p, p.starterId, 'medium', [own('lure-good')]);
        expect(res.status).toBe(200);
        expect(expeditionOf(res)).toMatchObject({ kit: ['lure-good'], supplies: 'good', cost: 0 });
        expect((res.body['state'] as StateBody).balances.bait).toBe(100);
        expect((res.body['state'] as StateBody).supplies).toEqual({});
        expect(count(ctx.sql, 'ledger', "source = 'expedition'")).toBe(0);
      },
      seeded(),
    );
  });

  it('refuses to buy a supply (an old client), with a clear error and nothing written', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const res = await send(p, p.starterId, 'medium', [buy('lure-good')]);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'supplies_not_for_sale' });
        expect(count(ctx.sql, 'expeditions')).toBe(0);
        expect(count(ctx.sql, 'ledger', "source = 'expedition'")).toBe(0);
        expect(ctx.core.balances(USER_ID).bait).toBe(100);
        expect((await p.state()).creatures[0]?.away).toBe(false);
      },
      seeded(),
    );
  });

  it('replays the same key: same expedition, the supply taken once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const key = newKey();
        stock(ctx.sql, USER_ID, 'lure-basic', 2);
        const first = await send(p, p.starterId, 'short', [own('lure-basic')], key);
        ctx.clock.t += 5000;
        const second = await send(p, p.starterId, 'short', [own('lure-basic')], key);
        expect(second.status).toBe(200);
        expect(expeditionOf(second)).toEqual(expeditionOf(first));
        expect(count(ctx.sql, 'expeditions')).toBe(1);
        expect((second.body['state'] as StateBody).supplies).toEqual({ 'lure-basic': 1 });
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
        stock(ctx.sql, USER_ID, 'lure-basic', 1);
        stock(ctx.sql, USER_ID, 'lure-good', 1);
        await send(p, p.starterId, 'short', [own('lure-basic')], key);
        const other = await send(p, p.starterId, 'short', [own('lure-good')], key);
        expect(other.status).toBe(409);
        expect(other.body).toEqual({ error: 'key_conflict' });
        expect(count(ctx.sql, 'expeditions')).toBe(1);
        expect((await p.state()).supplies).toEqual({ 'lure-good': 1 });
      },
      seeded(),
    );
  });

  it('writes nothing when the supply is not in stock', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 1_000);
        const ledgerBefore = count(ctx.sql, 'ledger');
        const res = await send(p, p.starterId, 'short', [own('lure-basic')]);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'supply_missing', reason: 'lure-basic' });
        expect(count(ctx.sql, 'expeditions')).toBe(0);
        expect(count(ctx.sql, 'ledger')).toBe(ledgerBefore);
        expect(ctx.core.balances(USER_ID).bait).toBe(1_000);
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
        expect(ctx.core.balances(USER_ID).bait).toBe(100);
        expect(count(ctx.sql, 'expeditions')).toBe(1);
      },
      seeded(),
    );
  });

  it('409s when every slot is used (one to begin with, more with explorer rank)', async () => {
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
        // One slot to begin with: the second creature has to wait.
        expect((await send(p, ids[0] as string)).status).toBe(200);
        const second = await send(p, ids[1] as string);
        expect(second.status).toBe(409);
        expect(second.body).toEqual({ error: 'slots_full' });
        // Explorer rank opens more slots; three are enough for three trips and the 4th is refused.
        unlockSlots(ctx.sql, USER_ID, ids[0] as string, 3);
        for (const id of ids.slice(1, 3)) expect((await send(p, id)).status).toBe(200);
        const res = await send(p, ids[3] as string);
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'slots_full' });
        expect(ctx.core.balances(USER_ID).bait).toBe(500);
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
    ['unknown supplies', { supplies: [{ id: 'epic', source: 'owned' }] }],
    ['the old supplies tier', { supplies: 'basic' }],
    ['an unknown destination', { destination: 'atlantis' }],
    ['an unknown supply source', { supplies: [{ id: 'lure-basic', source: 'steal' }] }],
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
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
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
  it('are not caught at the everyday destinations, and are not starters', async () => {
    const festival = content.creatures.filter((c) => c.festival === true);
    expect(festival.length).toBeGreaterThan(0);
    for (const species of festival) {
      expect(species.catchable).toBe(false);
      expect(species.starter).toBe(false);
    }
    // Every roll brings a creature, so 100 long trips are 100 catches (the shipped chance is small).
    const restore = certainCatches(['long']);
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await joinWithStarter(ctx, USER, 1_000_000);
          // The Old Crossroads need explorer rank 2.
          ctx.sql.exec(
            'INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 0)',
            USER_ID,
            p.starterId,
            RULES.expeditions.rank.xpForRank[1] ?? 0,
          );
          const seen = new Set<string>();
          const places = [
            'tidepools',
            'ember-caves',
            'verdant-hollow',
            'storm-ridge',
            'old-crossroads',
          ];
          for (let i = 0; i < 100; i++) {
            const exp = expeditionOf(
              await send(p, p.starterId, 'long', [], newKey(), places[i % places.length]),
            );
            ctx.clock.t = exp.endsAt;
            const res = await claim(p, exp.id);
            expect(res.status).toBe(200);
            for (const c of resultOf(res).catches) seen.add(c.species);
          }
          // Plenty of the catchable species showed up, and no Festival species did. (A Festival
          // species comes from a won Festival finale, or from the Festival Grounds in a Festival week.)
          expect(seen.size).toBeGreaterThan(6);
          for (const species of festival) expect(seen.has(species.id)).toBe(false);
        },
        seeded(),
      );
    } finally {
      restore();
    }
  });
});

describe('POST /api/expeditions/{id}/claim', () => {
  it('after the end gives every roll and frees the explorer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const exp = expeditionOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(res.status).toBe(200);
        const result = resultOf(res);
        expect(result.recalled).toBe(false);
        // Every roll either brought a creature or came up empty (a small find instead).
        expect(result.catches.length + (result.noCatch ?? 0)).toBe(
          RULES.expeditions.lengths.long.rolls,
        );
        const state = res.body['state'] as StateBody;
        expect(state.creatures.find((c) => c.id === p.starterId)?.away).toBe(false);
        expect(state.slots.used).toBe(0);
        const claimed = state.expeditions.find((e) => e.id === exp.id);
        expect(claimed).toMatchObject({ status: 'claimed', claimedAt: exp.endsAt });
        expect(claimed?.result).toEqual(result);
        // Every catch ends up in the collection (a new creature) or waits as a card (a duplicate).
        for (const c of result.catches) {
          const line = content.creatures.find((s) => s.id === c.species)?.line;
          expect(state.creatures.some((own) => own.line === line)).toBe(true);
          if (c.outcome === 'duplicate') {
            expect(state.pending.some((card) => card.id === c.pendingId)).toBe(true);
          }
        }
      },
      seeded(),
    );
  });

  it('before the end recalls with floor(rolls x elapsed / duration) catches and gives the supply back to no one', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 200);
        stock(ctx.sql, USER_ID, 'lure-basic', 1);
        const exp = expeditionOf(await send(p, p.starterId, 'long', [own('lure-basic')]));
        ctx.clock.t = exp.startedAt + 8 * HOUR; // 8 of 12 hours: floor(rolls * 2/3)
        const expected = recallCatches(exp.rolls, exp.startedAt, exp.endsAt, ctx.clock.t);
        expect(expected).toBe(Math.floor((RULES.expeditions.lengths.long.rolls * 2) / 3));
        const res = await claim(p, exp.id);
        expect(res.status).toBe(200);
        expect(resultOf(res).recalled).toBe(true);
        expect(resultOf(res).catches).toHaveLength(expected);
        expect((res.body['state'] as StateBody).balances.bait).toBe(200);
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
        const exp = expeditionOf(await send(p, p.starterId, 'medium'));
        ctx.clock.t = exp.startedAt + 2 * HOUR; // floor(2 * 1/3) = 0
        const res = await claim(p, exp.id);
        // Nothing was caught, so the trip brought back no scrap and nothing else.
        expect(resultOf(res)).toEqual({
          recalled: true,
          catches: [],
          loot: { gear: [], converted: [], parts: {}, blueprints: [] },
        });
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
        const exp = expeditionOf(await send(p, p.starterId, 'long'));
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
          const exp = expeditionOf(await send(p, p.starterId, 'long'));
          ctx.clock.t = exp.endsAt;
          const all = await Promise.all(Array.from({ length: times }, () => claim(p, exp.id)));
          expect(count(ctx.sql, 'expeditions', "status = 'claimed'")).toBe(1);
          const lines = ctx.sql
            .exec<{ n: number }>('SELECT COUNT(DISTINCT line) AS n FROM creatures')
            .one().n;
          expect(count(ctx.sql, 'creatures')).toBe(lines);
          return all;
        },
        {
          rng,
          gearRng: createSeededRng('concurrent-gear'),
          tripRng: createSeededRng('concurrent-trip'),
        },
      );
      return { drawn: rng.drawn(), results };
    };
    const single = await run(1);
    const many = await run(5);
    expect(many.drawn).toBe(single.drawn);
    // The creature ids are random per database: everything else in the result is the same.
    const plain = (r: Json) => {
      const { experience, ...rest } = resultOf(r) as ReturnType<typeof resultOf> & {
        experience?: Record<string, unknown>;
      };
      const exp = { ...(experience ?? {}) };
      delete exp['creatureId'];
      return { ...rest, experience: exp };
    };
    for (const r of many.results) {
      expect(r.status).toBe(200);
      expect(plain(r)).toEqual(plain(single.results[0] as Json));
      expect(resultOf(r)).toEqual(resultOf(many.results[0] as Json));
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
        const exp = expeditionOf(await send(p, p.starterId, 'short'));
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
        const early = expeditionOf(await send(p, p.starterId, 'medium'));
        expect(resultOf(await claim(p, early.id)).catches).toEqual([]);
        const next = expeditionOf(await send(p, p.starterId, 'short'));
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
        const exp = expeditionOf(await send(p, p.starterId, 'short'));
        ctx.clock.t = exp.endsAt;
        // A scripted common/splashet catch: the guarantee would have given a zipmouse instead.
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches).toHaveLength(1);
      },
      { rng: scriptedRng(COMMON_SPLASHET_PLAIN) },
    );
  });

  it('a duplicate waits as a card with the talent it rolled, and changes nothing else', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        const before = (await p.state()).creatures[0];
        const exp = expeditionOf(await send(p, p.starterId));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        const [dupe] = resultOf(res).catches;
        expect(dupe).toMatchObject({
          species: 'splashet',
          shiny: false,
          outcome: 'duplicate',
          firstOnServer: true,
        });
        expect(dupe?.talent?.name).toBeTypeOf('string');
        const state = res.body['state'] as StateBody;
        // The creature the player owns is untouched: no fusion happened by itself.
        expect(state.creatures).toHaveLength(1);
        expect(state.creatures[0]?.fusionCount).toBe(0);
        expect(state.creatures[0]?.stats).toEqual(before?.stats);
        // The card is in the state, with the same talent, and four ways to answer.
        expect(state.pending).toHaveLength(1);
        expect(state.pending[0]).toMatchObject({
          id: dupe?.pendingId,
          species: 'splashet',
          source: 'expedition',
          talent: { id: dupe?.talent?.id, golden: dupe?.talent?.golden },
          offered: { fuse: [p.starterId], release: true, keep: false },
        });
        expect(
          ctx.sql.exec<{ s: number }>('SELECT dupe_streak AS s FROM player_progress').one().s,
        ).toBe(1);
      },
      { rng: scriptedRng(COMMON_SPLASHET_PLAIN) },
    );
  });
  it('a duplicate of a fully fused creature still waits as a card and pays no Bait, once even on a replayed claim', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        skipFirstExpedition(ctx.sql, USER_ID);
        ctx.sql.exec('UPDATE creatures SET fusion_count = 5');
        stock(ctx.sql, USER_ID, 'map-scrap-great', 1);
        const exp = expeditionOf(await send(p, p.starterId, 'medium', OWNED_ATLAS)); // 2 rolls
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        expect(resultOf(res).catches.map((c) => c.outcome)).toEqual(['duplicate', 'duplicate']);
        expect(ctx.core.balances(USER_ID).bait).toBe(100);
        expect(count(ctx.sql, 'ledger', "source = 'fusion'")).toBe(0);
        const state = res.body['state'] as StateBody;
        // Fusing is not offered any more; teaching, releasing are.
        expect(state.pending).toHaveLength(2);
        for (const card of state.pending) expect(card.offered.fuse).toEqual([]);
        // A replayed claim adds nothing: no second card, no Bait.
        const again = await claim(p, exp.id);
        expect(resultOf(again)).toEqual(resultOf(res));
        expect(count(ctx.sql, 'pending_catches')).toBe(2);
        expect(ctx.core.balances(USER_ID).bait).toBe(100);
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
        expect(resultOf(res).catches[0]).toMatchObject({ outcome: 'duplicate', shiny: true });
        expect((res.body['state'] as StateBody).creatures[0]?.shiny).toBe(true);
      },
      { rng: scriptedRng(COMMON_SPLASHET_SHINY) },
    );
  });

  it('a shiny new catch is a shiny creature, and a shiny duplicate of a fully fused creature also upgrades', async () => {
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
        expect(resultOf(res).catches[0]).toMatchObject({ outcome: 'duplicate', shiny: true });
        expect((res.body['state'] as StateBody).creatures[0]?.shiny).toBe(true);
      },
      { rng: scriptedRng(COMMON_SPLASHET_SHINY) },
    );
  });

  it('a second catch of a species within one claim is a duplicate of the first', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100, 'cindle');
        skipFirstExpedition(ctx.sql, USER_ID);
        stock(ctx.sql, USER_ID, 'map-scrap-great', 1);
        const exp = expeditionOf(await send(p, p.starterId, 'medium', OWNED_ATLAS));
        ctx.clock.t = exp.endsAt;
        const res = await claim(p, exp.id);
        const [first, second] = resultOf(res).catches;
        expect(first).toMatchObject({ species: 'splashet', outcome: 'new', firstOnServer: true });
        expect(second).toMatchObject({
          species: 'splashet',
          outcome: 'duplicate',
          firstOnServer: false,
        });
        expect((res.body['state'] as StateBody).pending.map((c) => c.id)).toEqual([
          second?.pendingId,
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
  it('is gone: levels come from experience, and an old client gets a clear answer and pays nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await joinWithStarter(ctx, USER, 100);
        const res = await p.call('POST', `/api/creatures/${p.starterId}/train`, {
          idempotencyKey: newKey(),
        });
        expect(res.status).toBe(410);
        expect(res.body).toEqual({ error: 'training_is_by_activity' });
        // Whatever the body (or none), nothing is charged and the level does not move.
        expect((await p.call('POST', `/api/creatures/${p.starterId}/train`, {})).status).toBe(410);
        const state = await p.state();
        expect(state.balances.bait).toBe(100);
        expect(state.creatures[0]).toMatchObject({ level: 1, exp: 0 });
        expect(count(ctx.sql, 'ledger', "source = 'training'")).toBe(0);
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

  it('gives a caught creature a quirk, and a replayed claim changes nothing', async () => {
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

  it('keeps the quirk of an existing creature when a duplicate arrives, and draws no quirk', async () => {
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
        expect(resultOf(res).catches[0]).toMatchObject({
          species: 'splashet',
          outcome: 'duplicate',
        });
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
