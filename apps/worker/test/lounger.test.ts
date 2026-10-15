import { ROOM_SPOT_IDS, RULES, createSeededRng, rollGear, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../src/index';
import { insertItem } from '../src/gear-store';
import {
  GUILD_ID,
  ORIGIN,
  T0,
  USER_ID,
  callHandler,
  runCore,
  undoLoungerMigration,
  undoLoungeSpotMigration,
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

const storedSpot = (
  ctx: CoreContext,
  userId: string,
): { lounge_spot: string | null; lounge_spot_at: number | null } | undefined =>
  rows<{ lounge_spot: string | null; lounge_spot_at: number | null }>(
    ctx.sql,
    'SELECT lounge_spot, lounge_spot_at FROM players WHERE user_id = ?',
    userId,
  )[0];

const spotOf = async (p: Session): Promise<unknown> =>
  (await p.call('GET', '/api/state')).body['loungeSpot'];

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
      gear: {
        id: string;
        baseId: string;
        rarity: string;
        level: number;
        enchantId: string | null;
        primary: { stat: string; bp: number };
      } | null;
    } | null;
    spot: { id: string; at: number } | null;
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

describe('PUT /api/lounge-spot', () => {
  it('stores the spot with the core clock, answers { spot } and shows it in the state', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      expect(await spotOf(a)).toBeNull();
      ctx.clock.t = T0 + 5_000;
      const res = await a.call('PUT', '/api/lounge-spot', { spotId: 'couch-middle' });
      expect(res).toEqual({
        status: 200,
        body: { spot: { id: 'couch-middle', at: T0 + 5_000 } },
      });
      expect(storedSpot(ctx, a.id)).toEqual({
        lounge_spot: 'couch-middle',
        lounge_spot_at: T0 + 5_000,
      });
      expect(await spotOf(a)).toEqual({ id: 'couch-middle', at: T0 + 5_000 });
    });
  });

  it('moves the spot and takes a new time on every claim, even for the same spot', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      await a.call('PUT', '/api/lounge-spot', { spotId: 'couch-left' });
      ctx.clock.t = T0 + 1_000;
      expect((await a.call('PUT', '/api/lounge-spot', { spotId: 'shelf-top' })).body).toEqual({
        spot: { id: 'shelf-top', at: T0 + 1_000 },
      });
      ctx.clock.t = T0 + 2_000;
      expect((await a.call('PUT', '/api/lounge-spot', { spotId: 'shelf-top' })).body).toEqual({
        spot: { id: 'shelf-top', at: T0 + 2_000 },
      });
      expect(await spotOf(a)).toEqual({ id: 'shelf-top', at: T0 + 2_000 });
    });
  });

  it('accepts every spot id', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      for (const spotId of ROOM_SPOT_IDS) {
        const res = await a.call('PUT', '/api/lounge-spot', { spotId });
        expect(res.status, spotId).toBe(200);
        expect(res.body).toEqual({ spot: { id: spotId, at: T0 } });
      }
    });
  });

  it('clears both columns with null and answers { spot: null }', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      await a.call('PUT', '/api/lounge-spot', { spotId: 'fire-pouf' });
      const res = await a.call('PUT', '/api/lounge-spot', { spotId: null });
      expect(res).toEqual({ status: 200, body: { spot: null } });
      expect(storedSpot(ctx, a.id)).toEqual({ lounge_spot: null, lounge_spot_at: null });
      expect(await spotOf(a)).toBeNull();
      // Clearing again is fine.
      expect((await a.call('PUT', '/api/lounge-spot', { spotId: null })).status).toBe(200);
    });
  });

  it('only changes the spot of the player in the session', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const b = await member(ctx, 2);
      await b.call('PUT', '/api/lounge-spot', { spotId: 'table-stool' });
      await a.call('PUT', '/api/lounge-spot', { spotId: 'couch-left' });
      expect(storedSpot(ctx, b.id)?.lounge_spot).toBe('table-stool');
      expect(storedSpot(ctx, a.id)?.lounge_spot).toBe('couch-left');
      // A user id in the body is an unknown key and is rejected, never obeyed.
      const res = await a.call('PUT', '/api/lounge-spot', { spotId: 'shelf-top', userId: b.id });
      expect(res).toEqual({ status: 400, body: { error: 'invalid_body' } });
      expect(storedSpot(ctx, b.id)?.lounge_spot).toBe('table-stool');
    });
  });

  it('rejects unknown spot ids, bad types and unknown keys with 400 invalid_body', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const bad: unknown[] = [
        {},
        { spotId: 'attic' },
        { spotId: '' },
        { spotId: 'Couch-Left' },
        { spotId: ' couch-left' },
        { spotId: 'constructor' },
        { spotId: '__proto__' },
        { spotId: 3 },
        { spotId: true },
        { spotId: ['couch-left'] },
        { spotId: undefined },
        { spotId: 'couch-left', extra: true },
        { spotId: null, extra: 1 },
        { spot: 'couch-left' },
        ['couch-left'],
        'couch-left',
        null,
      ];
      for (const body of bad) {
        expect(await a.call('PUT', '/api/lounge-spot', body), JSON.stringify(body)).toEqual({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
      expect(storedSpot(ctx, a.id)).toEqual({ lounge_spot: null, lounge_spot_at: null });
    });
  });

  it('keeps the spot when the lounger changes, goes busy or is fused away', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        ctx.clock.t = T0 + 9_000;
        await a.call('PUT', '/api/lounge-spot', { spotId: 'window-sill' });
        const spot = { id: 'window-sill', at: T0 + 9_000 };
        // Choosing another lounger leaves the spot alone.
        await a.call('PUT', '/api/lounger', { creatureId: a.creatureIds[2] });
        expect(await spotOf(a)).toEqual(spot);
        // The lounger goes on an expedition and a new one is picked: same spot.
        expect((await sendOnTrip(a, a.creatureIds[2] as string)).status).toBe(200);
        expect(await loungerIdOf(a)).not.toBe(a.creatureIds[2]);
        expect(await spotOf(a)).toEqual(spot);
        // The lounger no longer exists: same spot.
        const current = (await loungerIdOf(a)) as string;
        ctx.sql.exec('DELETE FROM creatures WHERE id = ?', current);
        expect(await loungerIdOf(a)).not.toBe(current);
        expect(await spotOf(a)).toEqual(spot);
      },
      { loungerRng: scriptedRng([0, 0]) },
    );
  });

  it('works while every creature of the player is busy', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1, { creatures: 1 });
      startJob(ctx, a.id, a.creatureIds[0] as string);
      expect((await a.call('PUT', '/api/lounge-spot', { spotId: 'fire-rug-left' })).status).toBe(
        200,
      );
      expect(await spotOf(a)).toEqual({ id: 'fire-rug-left', at: T0 });
    });
  });

  it('only allows PUT', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      expect((await a.call('GET', '/api/lounge-spot')).status).toBe(405);
      expect((await a.call('POST', '/api/lounge-spot', {})).status).toBe(405);
      expect((await a.call('DELETE', '/api/lounge-spot')).status).toBe(405);
    });
  });

  it('is rate limited per player like the other routes', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      let last = 200;
      for (let i = 0; i < 60 && last === 200; i++) {
        last = (await a.call('PUT', '/api/lounge-spot', { spotId: 'couch-left' })).status;
      }
      expect(last).toBe(429);
    });
  });
});

describe('the spot in /api/state and /api/room', () => {
  it('shows loungeSpot in every echoed state', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1, { starter: false });
      await a.call('PUT', '/api/lounge-spot', { spotId: 'couch-right' });
      const spot = { id: 'couch-right', at: T0 };
      const trip = await sendOnTrip(a, a.creatureIds[0] as string);
      expect((trip.body['state'] as { loungeSpot: unknown }).loungeSpot).toEqual(spot);
      const nick = await a.call('PATCH', `/api/creatures/${a.creatureIds[1]}`, { nickname: 'Pip' });
      expect((nick.body['state'] as { loungeSpot: unknown }).loungeSpot).toEqual(spot);
    });
  });

  it('shows the spot and its time on each resident, and null for players who never chose', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        const b = await member(ctx, 2);
        const c = await member(ctx, 3);
        ctx.clock.t = T0 + 100;
        await a.call('PUT', '/api/lounge-spot', { spotId: 'fire-mantel' });
        ctx.clock.t = T0 + 200;
        await b.call('PUT', '/api/lounge-spot', { spotId: 'couch-middle' });
        await b.call('PUT', '/api/lounge-spot', { spotId: null });
        const res = await room(c, [a.id, b.id, c.id]);
        expect(res.body.residents.map((r) => r.spot)).toEqual([
          { id: 'fire-mantel', at: T0 + 100 },
          null,
          null,
        ]);
      },
      { loungerRng: scriptedRng([0, 0, 0]) },
    );
  });

  it('keeps the spot of a resident whose creature is busy', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1, { creatures: 1 });
      await a.call('PUT', '/api/lounge-spot', { spotId: 'shelf-beanbag' });
      startJob(ctx, a.id, a.creatureIds[0] as string);
      const res = await room(a, [a.id]);
      expect(res.body.residents).toEqual([
        {
          userId: a.id,
          name: a.name,
          creature: null,
          spot: { id: 'shelf-beanbag', at: T0 },
        },
      ]);
    });
  });

  it('reads a stored id that is no longer a spot as null, in the room and in the state', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1);
        ctx.sql.exec(
          "UPDATE players SET lounge_spot = 'removed-spot', lounge_spot_at = ? WHERE user_id = ?",
          T0,
          a.id,
        );
        expect((await room(a, [a.id])).body.residents[0]?.spot).toBeNull();
        expect(await spotOf(a)).toBeNull();
        // Half-set rows (no time) are also treated as not set.
        ctx.sql.exec(
          "UPDATE players SET lounge_spot = 'couch-left', lounge_spot_at = NULL WHERE user_id = ?",
          a.id,
        );
        expect((await room(a, [a.id])).body.residents[0]?.spot).toBeNull();
        expect(await spotOf(a)).toBeNull();
      },
      { loungerRng: scriptedRng([0]) },
    );
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
        expect(Object.keys(rb).sort()).toEqual(['creature', 'name', 'spot', 'userId']);
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
          'gear',
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
          gear: null,
        });
        expect(typeof ra.creature?.species).toBe('string');
        expect(typeof ra.creature?.level).toBe('number');
        expect(typeof ra.creature?.quirk).toBe('string');
      },
      { loungerRng: scriptedRng([0, 0]) },
    );
  });

  it('shows the worn item in the shape of the state view, and null when nothing is worn', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await member(ctx, 1, { creatures: 2 });
        const b = await member(ctx, 2, { creatures: 2 });
        const c = await member(ctx, 3, { creatures: 2 });
        const wear = (
          userId: string,
          creatureId: string | null,
          baseId: string,
          level: number,
          enchantId: string | null,
        ): string => {
          const id = insertItem(
            ctx.sql,
            userId,
            { baseId, rarity: 'rare', rolls: rollGear(createSeededRng(baseId), baseId, 'rare') },
            'test',
            T0,
          );
          ctx.sql.exec(
            'UPDATE gear_items SET equipped_on = ?, level = ?, enchant_id = ? WHERE id = ?',
            creatureId,
            level,
            enchantId,
            id,
          );
          return id;
        };
        const worn = wear(b.id, b.creatureIds[0] as string, 'bark-band', 3, 'steady-hand');
        // An unworn item of Bob's, and an item on his other creature, must not show up.
        wear(b.id, null, 'pearl-trinket', 0, null);
        wear(b.id, b.creatureIds[1] as string, 'trail-charm', 0, null);
        const res = await room(a, [a.id, b.id, c.id]);
        const [ra, rb, rc] = res.body.residents as [
          RoomBody['residents'][number],
          RoomBody['residents'][number],
          RoomBody['residents'][number],
        ];
        expect(ra.creature?.gear).toBeNull();
        expect(rc.creature?.gear).toBeNull();
        const owned = (await b.call('GET', '/api/gear')).body as {
          items: { id: string; primary: { stat: string; bp: number } }[];
        };
        const primary = owned.items.find((i) => i.id === worn)?.primary;
        expect(primary?.bp).toBeGreaterThan(0);
        expect(rb.creature?.gear).toEqual({
          id: worn,
          baseId: 'bark-band',
          rarity: 'rare',
          level: 3,
          enchantId: 'steady-hand',
          primary,
        });
        // The owner's own state view shows the same item (without the primary stat).
        const state = (await b.call('GET', '/api/state')).body as {
          creatures: { id: string; gear: unknown }[];
        };
        expect(state.creatures.find((x) => x.id === b.creatureIds[0])?.gear).toEqual({
          id: worn,
          baseId: 'bark-band',
          rarity: 'rare',
          level: 3,
          enchantId: 'steady-hand',
        });
      },
      { loungerRng: scriptedRng([0, 0, 0]) },
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
      expect(res.body.residents).toEqual([
        { userId: b.id, name: b.name, creature: null, spot: null },
      ]);
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
  it('turns away /api/room, /api/lounger and /api/lounge-spot without a valid session', async () => {
    const handler = createHandler();
    for (const [method, path, body] of [
      ['POST', '/api/room', { userIds: [USER_ID] }],
      ['PUT', '/api/lounger', { creatureId: '00000000-0000-4000-8000-000000000001' }],
      ['PUT', '/api/lounge-spot', { spotId: 'couch-left' }],
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

describe('migration 23', () => {
  it('adds nullable lounge_spot and lounge_spot_at to players and backfills nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await member(ctx, 1);
      const columns = (): { name: string; type: string; notnull: number }[] =>
        rows<{ name: string; type: string; notnull: number }>(
          ctx.sql,
          `SELECT name, type, "notnull" FROM pragma_table_info('players')
           WHERE name IN ('lounge_spot', 'lounge_spot_at') ORDER BY name`,
        );
      expect(columns()).toEqual([
        { name: 'lounge_spot', type: 'TEXT', notnull: 0 },
        { name: 'lounge_spot_at', type: 'INTEGER', notnull: 0 },
      ]);
      undoLoungeSpotMigration(ctx.sql);
      expect(columns()).toHaveLength(0);
      // Undoing migration 23 also undoes 24 (the allowance table), which sits above it.
      expect(
        ctx.sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v,
      ).toBe(LATEST_SCHEMA_VERSION - 2);
      ctx.core.migrate();
      expect(columns()).toHaveLength(2);
      expect(
        ctx.sql.exec<{ v: number }>('SELECT MAX(version) AS v FROM schema_version').one().v,
      ).toBe(LATEST_SCHEMA_VERSION);
      expect(storedSpot(ctx, a.id)).toEqual({ lounge_spot: null, lounge_spot_at: null });
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
