import { RULES, createSeededRng, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../src/index';
import {
  GUILD_ID,
  ORIGIN,
  T0,
  USER_ID,
  callHandler,
  runCore,
  undoLoungerMigration,
  LATEST_SCHEMA_VERSION,
  type CoreContext,
} from './helpers';
import { count, nextGuild, rows, seedPlayer, type Seeded } from './raid-helpers';

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

interface Json {
  status: number;
  body: Record<string, unknown>;
}

interface Session {
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
}

/** Seeds a player with creatures and a chosen starter, and signs them in. */
async function member(
  ctx: CoreContext,
  n: number,
  options: { creatures?: number; starter?: boolean; name?: string } = {},
): Promise<Seeded & Session> {
  const seeded = seedPlayer(ctx, n, {
    creatures: options.creatures ?? 3,
    ...(options.name === undefined ? {} : { name: options.name }),
  });
  if (options.starter !== false) {
    ctx.sql.exec(
      `INSERT INTO player_progress (user_id, starter_species) VALUES (?, 'splashet')
       ON CONFLICT(user_id) DO UPDATE SET starter_species = excluded.starter_species`,
      seeded.id,
    );
  }
  const secret = await ctx.core.createSession(ctx.guildId, {
    id: seeded.id,
    displayName: seeded.name,
  });
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  return { ...seeded, call };
}

const storedLounger = (ctx: CoreContext, userId: string): string | null =>
  rows<{ lounger_id: string | null }>(
    ctx.sql,
    'SELECT lounger_id FROM players WHERE user_id = ?',
    userId,
  )[0]?.lounger_id ?? null;

const loungerIdOf = async (p: Session): Promise<string | null> =>
  (await p.call('GET', '/api/state')).body['loungerId'] as string | null;

let jobCounter = 0;
/** An open workshop job: the creature is busy with it. Returns the job id. */
function startJob(ctx: CoreContext, userId: string, creatureId: string): string {
  const id = `00000000-0000-4000-8000-${String(++jobCounter).padStart(12, '0')}`;
  ctx.sql.exec(
    `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
     VALUES (?, ?, ?, 'craft', '{}', 0, 1)`,
    id,
    userId,
    creatureId,
  );
  return id;
}

/** Puts creatures on the player's raid team of the current week (the raid week exists once any request ran). */
function putOnRaidTeam(ctx: CoreContext, userId: string, creatureIds: string[]): void {
  const week = rows<{ week_id: string }>(ctx.sql, 'SELECT week_id FROM raid_weeks LIMIT 1')[0];
  if (week === undefined) throw new Error('no raid week');
  ctx.sql.exec(
    'INSERT INTO raid_teams (week_id, user_id, creature_ids) VALUES (?, ?, ?)',
    week.week_id,
    userId,
    JSON.stringify(creatureIds),
  );
}

/** Sends a creature on a real (free) expedition through the API. */
async function sendOnTrip(p: Session, creatureId: string): Promise<Json> {
  return p.call('POST', '/api/expeditions', {
    creatureId,
    destination: 'tidepools',
    duration: 'short',
    supplies: [],
    idempotencyKey: `trip-${creatureId}`,
  });
}

interface RoomBody {
  residents: {
    userId: string;
    name: string;
    creature: {
      id: string;
      species: string;
      shiny: boolean;
      level: number;
      nickname: string | null;
      quirk: string | null;
      craftingLevel: number;
      explorerRank: number;
    } | null;
  }[];
}

const room = async (p: Session, userIds: string[]): Promise<Json & { body: RoomBody }> =>
  (await p.call('POST', '/api/room', { userIds })) as Json & { body: RoomBody };

describe('the lounger in /api/state', () => {
  it('picks an idle creature at random on first read and stores it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        expect(storedLounger(ctx, a.id)).toBeNull();
        // Draw 1 of 3 candidates (in the order caught): the second creature.
        expect(await loungerIdOf(a)).toBe(a.creatureIds[1]);
        expect(storedLounger(ctx, a.id)).toBe(a.creatureIds[1]);
      },
      { loungerRng: scriptedRng([1]) },
    );
  });

  it('keeps the stored lounger on later reads without drawing again', async () => {
    const rng = scriptedRng([2]);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        expect(await loungerIdOf(a)).toBe(a.creatureIds[2]);
        expect(await loungerIdOf(a)).toBe(a.creatureIds[2]);
        expect(await loungerIdOf(a)).toBe(a.creatureIds[2]);
        expect(rng.drawn()).toBe(1);
      },
      { loungerRng: rng },
    );
  });

  it('is null for a player without creatures and stores nothing', async () => {
    const rng = scriptedRng([]);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1, { creatures: 0, starter: false });
        expect(await loungerIdOf(a)).toBeNull();
        expect(storedLounger(ctx, a.id)).toBeNull();
        expect(rng.drawn()).toBe(0);
      },
      { loungerRng: rng },
    );
  });

  it('is in the state echoed by POST routes too', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1, { creatures: 1 });
      const res = await a.call('PATCH', `/api/creatures/${a.creatureIds[0] as string}`, {
        nickname: 'Mellow',
      });
      expect(res.status).toBe(200);
      expect((res.body['state'] as { loungerId: string }).loungerId).toBe(a.creatureIds[0]);
    });
  });

  it('re-picks, at random, when the lounger goes on an expedition', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        const first = a.creatureIds[0] as string;
        expect(await loungerIdOf(a)).toBe(first);
        expect((await sendOnTrip(a, first)).status).toBe(200);
        // Idle now: creatures 1 and 2. Draw 1 picks the second of the two.
        expect(await loungerIdOf(a)).toBe(a.creatureIds[2]);
        expect(storedLounger(ctx, a.id)).toBe(a.creatureIds[2]);
      },
      { loungerRng: scriptedRng([0, 1]) },
    );
  });

  it('re-picks when the lounger starts a workshop job, and never picks a creature on a job', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        const [c0, c1, c2] = a.creatureIds as [string, string, string];
        expect(await loungerIdOf(a)).toBe(c0);
        startJob(ctx, a.id, c0);
        startJob(ctx, a.id, c1);
        // Only the third is idle: no draw is needed.
        expect(await loungerIdOf(a)).toBe(c2);
        expect(storedLounger(ctx, a.id)).toBe(c2);
      },
      { loungerRng: scriptedRng([0]) },
    );
  });

  it('re-picks when the lounger no longer exists', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        expect(await loungerIdOf(a)).toBe(a.creatureIds[0]);
        ctx.sql.exec('DELETE FROM creatures WHERE id = ?', a.creatureIds[0]);
        expect(await loungerIdOf(a)).toBe(a.creatureIds[1]);
        expect(storedLounger(ctx, a.id)).toBe(a.creatureIds[1]);
      },
      { loungerRng: scriptedRng([0, 0]) },
    );
  });

  it('ignores a stored lounger that belongs to someone else', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1, { creatures: 1 });
        const b = await member(ctx, 2, { creatures: 1 });
        ctx.sql.exec('UPDATE players SET lounger_id = ? WHERE user_id = ?', b.creatureIds[0], a.id);
        expect(await loungerIdOf(a)).toBe(a.creatureIds[0]);
        expect(storedLounger(ctx, a.id)).toBe(a.creatureIds[0]);
      },
      { loungerRng: scriptedRng([]) },
    );
  });

  it('is null and stored as NULL while everything is busy, and picks again once one is free', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1, { creatures: 2 });
        const [c0, c1] = a.creatureIds as [string, string];
        expect(await loungerIdOf(a)).toBe(c0);
        const job0 = startJob(ctx, a.id, c0);
        startJob(ctx, a.id, c1);
        expect(await loungerIdOf(a)).toBeNull();
        expect(storedLounger(ctx, a.id)).toBeNull();
        // A job is claimed: its creature can lounge again.
        ctx.sql.exec('UPDATE workshop_jobs SET claimed_at = 5 WHERE id = ?', job0);
        expect(await loungerIdOf(a)).toBe(c0);
        expect(storedLounger(ctx, a.id)).toBe(c0);
      },
      { loungerRng: scriptedRng([0]) },
    );
  });

  it('does not count a raid as busy: a raider keeps lounging', async () => {
    const rng = scriptedRng([0]);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1, { creatures: 3 });
        const [c0, c1, c2] = a.creatureIds as [string, string, string];
        expect(await loungerIdOf(a)).toBe(c0);
        putOnRaidTeam(ctx, a.id, [c0, c1, c2]);
        expect(await loungerIdOf(a)).toBe(c0);
        expect(rng.drawn()).toBe(1);
      },
      { loungerRng: rng },
    );
  });

  it('works with the live crypto source by default', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const picked = await loungerIdOf(a);
      expect(a.creatureIds).toContain(picked);
    });
  });
});

describe('PUT /api/lounger', () => {
  it('stores the choice, answers { loungerId } and shows it in the state', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        const target = a.creatureIds[2] as string;
        const res = await a.call('PUT', '/api/lounger', { creatureId: target });
        expect(res).toEqual({ status: 200, body: { loungerId: target } });
        expect(storedLounger(ctx, a.id)).toBe(target);
        expect(await loungerIdOf(a)).toBe(target);
      },
      { loungerRng: scriptedRng([]) },
    );
  });

  it('answers 404 creature_not_found for a creature of another player, and changes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const b = await member(ctx, 2);
      const before = await loungerIdOf(a);
      const res = await a.call('PUT', '/api/lounger', { creatureId: b.creatureIds[0] });
      expect(res).toEqual({ status: 404, body: { error: 'creature_not_found' } });
      expect(storedLounger(ctx, a.id)).toBe(before);
      expect(storedLounger(ctx, b.id)).toBeNull();
    });
  });

  it('answers 404 creature_not_found for an id that does not exist', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const res = await a.call('PUT', '/api/lounger', {
        creatureId: '00000000-0000-4000-8000-0000000000ff',
      });
      expect(res).toEqual({ status: 404, body: { error: 'creature_not_found' } });
    });
  });

  it('answers 409 creature_busy for a creature on an expedition', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const target = a.creatureIds[1] as string;
      expect((await sendOnTrip(a, target)).status).toBe(200);
      const res = await a.call('PUT', '/api/lounger', { creatureId: target });
      expect(res).toEqual({ status: 409, body: { error: 'creature_busy' } });
      expect(storedLounger(ctx, a.id)).not.toBe(target);
    });
  });

  it('answers 409 creature_busy for a creature on a workshop job', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const target = a.creatureIds[1] as string;
      startJob(ctx, a.id, target);
      const res = await a.call('PUT', '/api/lounger', { creatureId: target });
      expect(res).toEqual({ status: 409, body: { error: 'creature_busy' } });
    });
  });

  it('accepts a creature that is in a raid team', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const target = a.creatureIds[1] as string;
      putOnRaidTeam(ctx, a.id, a.creatureIds);
      expect((await a.call('PUT', '/api/lounger', { creatureId: target })).status).toBe(200);
      expect(storedLounger(ctx, a.id)).toBe(target);
    });
  });

  it('rejects invalid bodies and unknown keys with 400 invalid_body', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const good = a.creatureIds[0] as string;
      const bad: unknown[] = [
        {},
        { creatureId: 'not-a-uuid' },
        { creatureId: 42 },
        { creatureId: null },
        { creatureId: good, userId: '999999999999999999' },
        { creatureId: good, extra: true },
        [good],
        'creatureId',
      ];
      for (const body of bad) {
        expect(await a.call('PUT', '/api/lounger', body)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
      expect(storedLounger(ctx, a.id)).toBeNull();
    });
  });

  it('only allows PUT', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      expect((await a.call('GET', '/api/lounger')).status).toBe(405);
      expect((await a.call('POST', '/api/lounger', {})).status).toBe(405);
    });
  });
});

describe('POST /api/room', () => {
  it('answers the residents in the order asked, with the room view of their lounger', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1, { name: 'Alice' });
        const b = await member(ctx, 2, { name: 'Bob' });
        // Bob's lounger has a nickname and is shiny; crafting and explorer XP are stored per creature.
        const bobCreature = b.creatureIds[0] as string;
        ctx.sql.exec(
          "UPDATE creatures SET nickname = 'Puddle', shiny = 1 WHERE id = ?",
          bobCreature,
        );
        const craftXp = RULES.gear.skill.xpForLevel[2] as number;
        const exploreXp = RULES.expeditions.rank.xpForRank[1] as number;
        ctx.sql.exec(
          'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, ?)',
          b.id,
          bobCreature,
          craftXp,
        );
        ctx.sql.exec(
          'INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 1)',
          b.id,
          bobCreature,
          exploreXp,
        );
        const res = await room(a, [b.id, a.id]);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body)).toEqual(['residents']);
        expect(res.body.residents.map((r) => r.userId)).toEqual([b.id, a.id]);
        const [rb, ra] = res.body.residents as [
          RoomBody['residents'][number],
          RoomBody['residents'][number],
        ];
        expect(rb.name).toBe('Bob');
        expect(ra.name).toBe('Alice');
        expect(Object.keys(rb).sort()).toEqual(['creature', 'name', 'userId']);
        expect(rb.creature).toMatchObject({
          id: bobCreature,
          nickname: 'Puddle',
          shiny: true,
          craftingLevel: 3,
          explorerRank: 2,
        });
        expect(Object.keys(rb.creature ?? {}).sort()).toEqual([
          'craftingLevel',
          'explorerRank',
          'id',
          'level',
          'nickname',
          'quirk',
          'shiny',
          'species',
        ]);
        // Fresh creatures: level 1 crafting and rank 1, no nickname, not shiny.
        expect(ra.creature).toMatchObject({
          id: a.creatureIds[0],
          nickname: null,
          shiny: false,
          craftingLevel: 1,
          explorerRank: 1,
        });
        expect(typeof ra.creature?.species).toBe('string');
        expect(typeof ra.creature?.level).toBe('number');
        expect(typeof ra.creature?.quirk).toBe('string');
      },
      { loungerRng: scriptedRng([0, 0]) },
    );
  });

  it('uses (and stores) the same lounger as the player sees in their own state', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        const b = await member(ctx, 2);
        const res = await room(a, [b.id]);
        const seen = res.body.residents[0]?.creature?.id;
        expect(seen).toBe(b.creatureIds[1]);
        expect(storedLounger(ctx, b.id)).toBe(seen);
        expect(await loungerIdOf(b)).toBe(seen);
      },
      { loungerRng: scriptedRng([1]) },
    );
  });

  it('leaves out ids that are unknown, have no starter, or have no creatures, silently', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const noStarter = await member(ctx, 2, { creatures: 0, starter: false });
      const unknown = '123456789012345678';
      const res = await room(a, [unknown, noStarter.id, a.id]);
      expect(res.status).toBe(200);
      expect(res.body.residents.map((r) => r.userId)).toEqual([a.id]);
      expect(await room(a, [unknown])).toMatchObject({ status: 200, body: { residents: [] } });
    });
  });

  it('shows creature null for a player whose creatures are all busy', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const b = await member(ctx, 2, { creatures: 2 });
      for (const id of b.creatureIds) startJob(ctx, b.id, id);
      const res = await room(a, [b.id]);
      expect(res.body.residents).toEqual([{ userId: b.id, name: b.name, creature: null }]);
      expect(storedLounger(ctx, b.id)).toBeNull();
    });
  });

  it('re-picks for a resident whose lounger went on an expedition', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        const b = await member(ctx, 2, { creatures: 2 });
        expect((await room(a, [b.id])).body.residents[0]?.creature?.id).toBe(b.creatureIds[0]);
        expect((await sendOnTrip(b, b.creatureIds[0] as string)).status).toBe(200);
        expect((await room(a, [b.id])).body.residents[0]?.creature?.id).toBe(b.creatureIds[1]);
      },
      { loungerRng: scriptedRng([0]) },
    );
  });

  it('does not show the stored display name of a player from another guild', async () => {
    const other = nextGuild();
    const strangerId = await runCore(other, async (ctx) => (await member(ctx, 7)).id);
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const res = await room(a, [strangerId, a.id]);
      expect(res.body.residents.map((r) => r.userId)).toEqual([a.id]);
    });
  });

  it('accepts exactly 25 ids and rejects 26', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const players: (Seeded & Session)[] = [];
      for (let n = 1; n <= 26; n++) players.push(await member(ctx, n, { creatures: 1 }));
      const asker = players[0] as Seeded & Session;
      const ids = players.map((p) => p.id);
      const ok = await room(asker, ids.slice(0, 25));
      expect(ok.status).toBe(200);
      expect(ok.body.residents).toHaveLength(25);
      expect(await asker.call('POST', '/api/room', { userIds: ids })).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    });
  });

  it('rejects bad bodies with 400 invalid_body', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const id = a.id;
      const bad: unknown[] = [
        {},
        { userIds: [] },
        { userIds: id },
        { userIds: [id, id] },
        { userIds: ['abc'] },
        { userIds: ['1234567890123456'] },
        { userIds: ['123456789012345678901'] },
        { userIds: ['12345678901234567x'] },
        { userIds: [1234567] },
        { userIds: [null] },
        { userIds: [id], extra: 1 },
        { userIds: [id], userId: id },
        [id],
        null,
      ];
      for (const body of bad) {
        expect(await a.call('POST', '/api/room', body)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
    });
  });

  it('only allows POST', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      expect((await a.call('GET', '/api/room')).status).toBe(405);
    });
  });

  it('is rate limited per player like the other routes', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      let last = 200;
      for (let i = 0; i < 40 && last === 200; i++) last = (await room(a, [a.id])).status;
      expect(last).toBe(429);
    });
  });
});

describe('session auth', () => {
  it('turns away /api/room and /api/lounger without a valid session', async () => {
    const handler = createHandler();
    for (const [method, path, body] of [
      ['POST', '/api/room', { userIds: [USER_ID] }],
      ['PUT', '/api/lounger', { creatureId: '00000000-0000-4000-8000-000000000001' }],
    ] as const) {
      const none = await callHandler(
        handler,
        new Request(`${ORIGIN}${path}`, { method, body: JSON.stringify(body) }),
      );
      expect(none.status).toBe(401);
      const forged = await callHandler(
        handler,
        new Request(`${ORIGIN}${path}`, {
          method,
          headers: { Authorization: 'Bearer forged' },
          body: JSON.stringify(body),
        }),
      );
      expect(forged.status).toBe(401);
    }
  });

  it('answers 401 from the guild for a made-up secret', async () => {
    await runCore(GUILD_ID, async (ctx) => {
      const res = await ctx.request('nope', '/api/room', 'POST', { userIds: [USER_ID] });
      expect(res.status).toBe(401);
    });
  });
});

describe('migration 21', () => {
  it('adds a nullable lounger_id to players and backfills nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      expect(
        rows<{ type: string; notnull: number }>(
          ctx.sql,
          "SELECT type, \"notnull\" FROM pragma_table_info('players') WHERE name = 'lounger_id'",
        ),
      ).toEqual([{ type: 'TEXT', notnull: 0 }]);
      // Take the column away again and migrate: the player is still there, with no lounger stored.
      undoLoungerMigration(ctx.sql);
      expect(
        rows(ctx.sql, "SELECT 1 FROM pragma_table_info('players') WHERE name = 'lounger_id'"),
      ).toHaveLength(0);
      ctx.core.migrate();
      expect(
        ctx.sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v,
      ).toBe(LATEST_SCHEMA_VERSION);
      expect(storedLounger(ctx, a.id)).toBeNull();
      expect(count(ctx.sql, 'players', 'lounger_id IS NOT NULL')).toBe(0);
    });
  });
});

// Keeps the seeded RNG import honest: a seeded stream also satisfies the injected type.
describe('loungerRng option', () => {
  it('accepts a seeded stream and is deterministic for a seed', async () => {
    const pick = (): Promise<string | null> =>
      runCore(
        nextGuild(),
        async (ctx) => {
          const a = await member(ctx, 1, { creatures: 5 });
          const index = a.creatureIds.indexOf((await loungerIdOf(a)) as string);
          return String(index);
        },
        { loungerRng: createSeededRng('lounger-determinism') },
      );
    expect(await pick()).toBe(await pick());
  });
});

void T0;
