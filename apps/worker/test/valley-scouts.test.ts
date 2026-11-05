/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 2: scouts on the server (migration 57, `valley-seats.ts`, `valley-finds.ts`, the seat and kit routes). With the flag on a
 * posted creature scouts: its finds pile up in its seat's store by place profile, fit, mastery and kit, come home on arrival, and a
 * duplicate waits at the Paddock gate; trips answer 404. With the flag off the routes are not there and trips work as before.
 */
import { VALLEY_RULES, ValleyViewSchema, createSeededRng, type Rng } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller, give, type SessionCaller } from './kit';
import { count, nextGuild, seedPlayer } from './raid-helpers';
import { DESTINATION_IDS } from '../src/content-ids';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const R = VALLEY_RULES;
/** A source that never draws a find: every Poisson count is 0 (uniform 0), so only the expected values pay. */
const NONE: Rng = { nextU32: () => 0 };

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(
  ctx: CoreContext,
  n: number,
  creatures = 3,
  species?: string[],
): Promise<P> {
  const seeded = seedPlayer(ctx, n, {
    creatures,
    level: 3,
    ...(species === undefined ? {} : { species }),
  });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const buySeat = (p: P, key = newKey('seat')) =>
  p.api.call('POST', '/api/valley/seat/buy', { idempotencyKey: key });
const post = (p: P, body: Record<string, unknown>) => p.api.call('POST', '/api/valley/seat', body);

const bait = (sql: SqlStorage, userId: string): number =>
  sql
    .exec<{ amount: number }>(
      "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
      userId,
    )
    .toArray()[0]?.amount ?? 0;
const part = (sql: SqlStorage, userId: string, kind: string): number =>
  sql
    .exec<{ amount: number }>(
      'SELECT amount FROM parts WHERE user_id = ? AND kind = ?',
      userId,
      kind,
    )
    .toArray()[0]?.amount ?? 0;
const seatRow = (sql: SqlStorage, seatId: string) =>
  sql.exec('SELECT * FROM valley_seats WHERE seat_id = ?', seatId).one();

/** A player with one bought seat and a creature posted to it at `destination`. */
async function scouting(
  ctx: CoreContext,
  n: number,
  destination = 'tidepools',
  species?: string[],
): Promise<P & { seatId: string; creatureId: string }> {
  const p = await newPlayer(ctx, n, 3, species);
  await p.state();
  const bought = await buySeat(p);
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const creatureId = p.creatureIds[0] as string;
  const posted = await post(p, { seatId, creatureId, destination });
  expect(posted.status).toBe(200);
  return { ...p, seatId, creatureId };
}

describe('migration 57: seats, kit and the new columns', () => {
  it('creates the tables with their indexes, empty, and the new columns', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const columns = (table: string): string[] =>
          ctx.sql
            .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
            .toArray()
            .map((r) => r.name);
        expect(columns('valley_seats')).toEqual([
          'seat_id',
          'user_id',
          'place',
          'kind',
          'position',
          'destination_id',
          'prev_destination_id',
          'creature_id',
          'kit_id',
          'store_hours',
          'scrap',
          'scrap_carry',
          'shards',
          'shard_carry',
          'gear_finds',
          'blueprint_finds',
          'page_finds',
          'deep',
          'communal',
          'passed_at',
        ]);
        expect(columns('valley_kit')).toEqual(['user_id', 'kit_id', 'bought_at']);
        expect(columns('pending_catches')).toContain('auto_at');
        const indexes = ctx.sql
          .exec<{ name: string }>("SELECT name FROM pragma_index_list('valley_seats')")
          .toArray()
          .map((r) => r.name);
        expect(indexes).toContain('valley_seats_user');
        expect(indexes).toContain('valley_seats_creature');
        expect(count(ctx.sql, 'valley_seats') + count(ctx.sql, 'valley_kit')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('is cleared with the rest by valley-fresh (both tables carry user_id)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        give(ctx, p.id, { bait: 2000 });
        const kit = await p.api.call('POST', '/api/valley/kit', {
          action: 'buy',
          kit: 'lure',
          idempotencyKey: newKey('kit'),
        });
        expect(kit.status).toBe(200);
        expect(count(ctx.sql, 'valley_seats')).toBe(1);
        expect(count(ctx.sql, 'valley_kit')).toBe(1);
        expect((await p.api.call('POST', '/api/dev/valley-fresh', {})).status).toBe(200);
        expect(count(ctx.sql, 'valley_seats')).toBe(0);
        expect(count(ctx.sql, 'valley_kit')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('the flag: scouts on, trips off', () => {
  it('answers 404 on every valley route with the flag off, before reading the body', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        for (const path of ['/api/valley/seat', '/api/valley/seat/buy', '/api/valley/kit']) {
          // A body no schema accepts: a 400 would mean the body was read first.
          const res = await p.api.call('POST', path, { nonsense: true });
          expect(res.status).toBe(404);
        }
        expect(count(ctx.sql, 'valley_seats')).toBe(0);
        expect(Object.hasOwn((await p.state()).body as object, 'valley')).toBe(false);
      },
      FLAG_OFF,
    );
  });

  it('answers 404 on the trip routes with the flag on, and leaves them with it off', async () => {
    const trip = (p: P) => ({
      creatureId: p.creatureIds[0],
      destination: DESTINATION_IDS[0],
      duration: 'short',
      idempotencyKey: newKey('trip'),
    });
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await p.api.call('POST', '/api/expeditions', trip(p))).status).toBe(404);
        // Before the body is read: nonsense is a 404 as well.
        expect((await p.api.call('POST', '/api/expeditions', { nonsense: 1 })).status).toBe(404);
        const id = newKey('expedition');
        expect(
          (await p.api.call('POST', `/api/expeditions/${crypto.randomUUID()}/claim`, {})).status,
        ).toBe(404);
        expect(
          (
            await p.api.call('POST', `/api/expeditions/${crypto.randomUUID()}/push-on`, {
              goalId: id,
            })
          ).status,
        ).toBe(404);
        expect(count(ctx.sql, 'expeditions')).toBe(0);
      },
      SYSTEMS,
    );
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const res = await p.api.call('POST', '/api/expeditions', trip(p));
        expect(res.status).toBe(200);
        expect(count(ctx.sql, 'expeditions')).toBe(1);
      },
      FLAG_OFF,
    );
  });

  it('keeps trip DMs quiet with the flag on', async () => {
    const { scanDm, nextDmDueAt } = await import('../src/dm-notify');
    await runCore(
      nextGuild(),
      (ctx) => {
        const p = seedPlayer(ctx, 1, { creatures: 1 });
        const creature = p.creatureIds[0] as string;
        ctx.sql.exec(
          'INSERT INTO dm_prefs (user_id, trip_on_at) VALUES (?, ?)',
          p.id,
          ctx.clock.t - 10 * HOUR,
        );
        ctx.sql.exec(
          `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status, destination_id)
           VALUES (?, ?, ?, 'short', 'none', 1, 0, ?, ?, 'active', 'tidepools')`,
          crypto.randomUUID(),
          p.id,
          creature,
          ctx.clock.t - 3 * HOUR,
          ctx.clock.t - HOUR,
        );
        const context = { now: ctx.clock.t, tz: 'Europe/Helsinki', realAt: (t: number) => t };
        expect(scanDm(ctx.sql, { ...context, valleySystems: true })).toBe(0);
        expect(nextDmDueAt(ctx.sql, ctx.clock.t - 2 * HOUR, 'Europe/Helsinki', true)).toBeNull();
        // Flag off: the same trip is due.
        expect(scanDm(ctx.sql, context)).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('seats: the price ladder and the keyed buy (V-POST-2)', () => {
  it('sells the first seat free, the second at its rung, and no more at the Signpost level', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const before = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(before.seatPrices).toEqual({
          owned: 0,
          max: 2,
          next: 0,
          ladder: [R.seats.scoutPrices[0], R.seats.scoutPrices[1]],
        });
        const first = await buySeat(p);
        expect(first.status).toBe(200);
        expect(first.body.price).toBe(0);
        const acorns = bait(ctx.sql, p.id);
        // Too poor for the second.
        const poor = await buySeat(p);
        expect(poor.status).toBe(409);
        expect(poor.body).toEqual({ error: 'insufficient_funds' });
        give(ctx, p.id, { bait: 500 });
        const second = await buySeat(p);
        expect(second.status).toBe(200);
        expect(second.body.price).toBe(R.seats.scoutPrices[1]);
        expect(bait(ctx.sql, p.id)).toBe(acorns + 500 - (R.seats.scoutPrices[1] as number));
        const third = await buySeat(p);
        expect(third.status).toBe(409);
        expect(third.body).toEqual({ error: 'no_more_seats' });
        const view = v.parse(ValleyViewSchema, third.body.valley ?? (await p.state()).body.valley);
        expect(view.seats).toHaveLength(2);
        expect(view.seatPrices.next).toBeNull();
        expect(count(ctx.sql, 'valley_seats')).toBe(2);
      },
      SYSTEMS,
    );
  });

  it('is idempotent: a retry returns the stored seat and charges nothing, a reused key is a conflict', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        await buySeat(p);
        give(ctx, p.id, { bait: 500 });
        const key = newKey('seat-twice');
        const a = await buySeat(p, key);
        const acorns = bait(ctx.sql, p.id);
        const b = await buySeat(p, key);
        expect(b.status).toBe(200);
        expect(b.body.seatId).toBe(a.body.seatId);
        expect(bait(ctx.sql, p.id)).toBe(acorns);
        expect(count(ctx.sql, 'valley_seats')).toBe(2);
        // The same key for a different action.
        const clash = await p.api.call('POST', '/api/valley/kit', {
          action: 'buy',
          kit: 'lure',
          idempotencyKey: key,
        });
        expect(clash.status).toBe(409);
        expect(clash.body).toEqual({ error: 'key_conflict' });
        // The debit is one ledger row under a server-built key, never the client's.
        const rows = ctx.sql
          .exec<{ idempotency_key: string; amount: number }>(
            "SELECT idempotency_key, amount FROM ledger WHERE user_id = ? AND source = 'valley_seat'",
            p.id,
          )
          .toArray();
        expect(rows).toEqual([
          { idempotency_key: `seat:${key}`, amount: -(R.seats.scoutPrices[1] as number) },
        ]);
      },
      SYSTEMS,
    );
  });

  it('rejects unknown keys, a bad key and a missing key', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await p.api.call('POST', '/api/valley/seat/buy', {})).status).toBe(400);
        expect(
          (await p.api.call('POST', '/api/valley/seat/buy', { idempotencyKey: 'x' })).status,
        ).toBe(400);
        expect(
          (
            await p.api.call('POST', '/api/valley/seat/buy', {
              idempotencyKey: newKey('seat'),
              price: 0,
            })
          ).status,
        ).toBe(400);
        expect(count(ctx.sql, 'valley_seats')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('posting and moving (V-POST-1)', () => {
  it('posts a creature, shows it scouting, and moving it is free and a swap when the seat is taken', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const a = (await buySeat(p)).body.seatId as string;
        give(ctx, p.id, { bait: 500 });
        const b = (await buySeat(p)).body.seatId as string;
        const [c0, c1, c2] = p.creatureIds as [string, string, string];
        const acorns = bait(ctx.sql, p.id);
        expect((await post(p, { seatId: a, creatureId: c0 })).status).toBe(200);
        expect((await post(p, { seatId: b, creatureId: c1 })).status).toBe(200);
        let valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(valley.creatures.find((c) => c.id === c0)).toMatchObject({
          state: 'scouting',
          seatId: a,
        });
        expect(valley.creatures.find((c) => c.id === c2)).toMatchObject({
          state: 'resting',
          seatId: null,
        });
        // Drag c0 onto seat b: the two swap.
        expect((await post(p, { seatId: b, creatureId: c0 })).status).toBe(200);
        expect(seatRow(ctx.sql, a).creature_id).toBe(c1);
        expect(seatRow(ctx.sql, b).creature_id).toBe(c0);
        // Drag a resting creature onto a seat: the one standing there goes back to rest.
        expect((await post(p, { seatId: a, creatureId: c2 })).status).toBe(200);
        // Empty a seat.
        expect((await post(p, { seatId: a, creatureId: null })).status).toBe(200);
        valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(valley.creatures.find((c) => c.id === c2)?.state).toBe('resting');
        expect(valley.seats.find((s) => s.id === a)?.creatureId).toBeNull();
        expect(bait(ctx.sql, p.id)).toBe(acorns);
      },
      SYSTEMS,
    );
  });

  it("answers the same 404 for another player's seat or creature, and 400 for an unknown destination", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        const q = await newPlayer(ctx, 2);
        await q.state();
        const mine = await post(q, { seatId: p.seatId, creatureId: q.creatureIds[0] });
        expect(mine.status).toBe(404);
        const theirs = await post(p, { seatId: p.seatId, creatureId: q.creatureIds[0] });
        expect(theirs.status).toBe(404);
        expect(theirs.body).toEqual(mine.body);
        expect(seatRow(ctx.sql, p.seatId).creature_id).toBe(p.creatureId);
        expect((await post(p, { seatId: p.seatId, destination: 'nowhere' })).status).toBe(400);
        expect((await post(p, { seatId: p.seatId, extra: 1 })).status).toBe(400);
        expect((await post(p, { seatId: 'not-an-id' })).status).toBe(400);
      },
      SYSTEMS,
    );
  });

  it('keeps the festival places closed outside festival weeks and brings the store home when a seat moves', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'tidepools');
        const closed = await post(p, { seatId: p.seatId, destination: 'festival-grounds' });
        // Whether it is a festival week depends on the calendar of the test clock: either way the rule is consistent with the view.
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        const open = valley.places.find((x) => x.id === 'festival-grounds')?.open === true;
        expect(closed.status).toBe(open ? 200 : 409);
        if (!open) expect(closed.body).toEqual({ error: 'destination_closed', reason: 'festival' });
        // A seat that moves between open places brings its pile home first.
        ctx.sql.exec('UPDATE valley_seats SET scrap = 11, shards = 2 WHERE seat_id = ?', p.seatId);
        const scrap = part(ctx.sql, p.id, 'scrap');
        const moved = await post(p, { seatId: p.seatId, destination: 'ember-caves' });
        expect(moved.status).toBe(200);
        expect(part(ctx.sql, p.id, 'scrap')).toBe(scrap + 11);
        expect(part(ctx.sql, p.id, 'tide-shard')).toBe(2);
        expect(seatRow(ctx.sql, p.seatId)).toMatchObject({
          destination_id: 'ember-caves',
          scrap: 0,
          shards: 0,
          store_hours: 0,
        });
      },
      SYSTEMS,
    );
  });
});

describe('scouting pays (V-SCOUT-2, V-POST-5, V-SCOUT-4)', () => {
  it('brings scrap and shards home on arrival at the place profile, as expected values', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'tidepools');
        const scrap0 = part(ctx.sql, p.id, 'scrap');
        ctx.clock.t += 24 * HOUR;
        const res = await p.state();
        const valley = v.parse(ValleyViewSchema, res.body.valley);
        expect(valley.arrived).toBe(true);
        const seat = valley.seats[0]!;
        // The pile came home on arrival; the store is empty again.
        expect(seat.store).toMatchObject({ hours: 0, scrap: 0, shards: 0 });
        // 24 effective hours at the Tidepools (rich in scrap): rate x 2, fit if the creature's element is tide.
        const fit = seat.fit ? 1 + R.posts.fitBonus : 1;
        const expected = 24 * R.scouts.perHour.scrap * R.scouts.richMultiplier * fit;
        const got = part(ctx.sql, p.id, 'scrap') - scrap0;
        expect(got).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
        expect(got).toBeLessThanOrEqual(Math.ceil(expected) + 1);
        expect(seat.perDay.scrap).toBeCloseTo(24 * R.scouts.perHour.scrap * 2 * fit, 9);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('earns the same idle XP as a creature resting at the fire (V-POST-3), and mastery hours on top', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        const xp = (id: string): number =>
          ctx.sql
            .exec<{ level: number; exp: number }>(
              'SELECT level, exp FROM creatures WHERE id = ?',
              id,
            )
            .one().exp;
        const before = [xp(p.creatureIds[0] as string), xp(p.creatureIds[1] as string)];
        ctx.clock.t += 24 * HOUR;
        const res = await p.state();
        const after = [xp(p.creatureIds[0] as string), xp(p.creatureIds[1] as string)];
        expect(after[0]! - before[0]!).toBe(after[1]! - before[1]!);
        const valley = v.parse(ValleyViewSchema, res.body.valley);
        expect(valley.seats[0]?.mastery.hours).toBeCloseTo(24, 6);
        expect(valley.seats[0]?.mastery.step).toBe(0);
        const row = ctx.sql
          .exec<{ scout_hours: number }>(
            'SELECT scout_hours FROM valley_creatures WHERE creature_id = ?',
            p.creatureId,
          )
          .one();
        expect(row.scout_hours).toBeCloseTo(24, 6);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('stops picking up at three days: the pack is full, nothing is lost, and the scout keeps growing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        const scrap0 = part(ctx.sql, p.id, 'scrap');
        ctx.clock.t += 10 * 24 * HOUR;
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        const seat = valley.seats[0]!;
        expect(seat.store.wasFull).toBe(true);
        // Three days of effective hours were picked up, however long the player stayed away.
        const rate = seat.perDay.scrap / 24;
        const got = part(ctx.sql, p.id, 'scrap') - scrap0;
        expect(got).toBeLessThanOrEqual(
          Math.ceil(R.posts.storeHours * rate * (1 + R.posts.mastery[0]!.bonus)) + 1,
        );
        expect(got).toBeGreaterThan(R.posts.storeHours * rate * 0.9);
        // Mastery counts every away hour (the away steps still apply): well past Skilled.
        expect(seat.mastery.step).toBeGreaterThanOrEqual(1);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('collects mid-visit when the pack fills during one long visit, so an open client loses nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        const scrap0 = part(ctx.sql, p.id, 'scrap');
        // Looking every 25 minutes keeps it one visit; four days make the pack fill at least once.
        for (let i = 0; i < (4 * 24 * 60) / 25; i++) {
          ctx.clock.t += 25 * 60_000;
          await p.state();
        }
        expect(part(ctx.sql, p.id, 'scrap') - scrap0).toBeGreaterThan(
          R.posts.storeHours * (R.scouts.perHour.scrap * 2) - 1,
        );
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('settles twice at the same now without changing anything', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        ctx.clock.t += 30 * HOUR;
        await p.state();
        ctx.clock.t += 5 * HOUR;
        const a = await p.state();
        const dump = (): unknown => [
          ctx.sql.exec('SELECT * FROM valley_seats ORDER BY seat_id').toArray(),
          ctx.sql.exec('SELECT * FROM valley_creatures ORDER BY creature_id').toArray(),
          ctx.sql.exec('SELECT user_id, kind, amount FROM parts ORDER BY user_id, kind').toArray(),
          ctx.sql.exec('SELECT COUNT(*) AS n FROM creatures').one(),
          ctx.sql.exec('SELECT COUNT(*) AS n FROM pending_catches').one(),
          ctx.sql.exec('SELECT COUNT(*) AS n FROM ledger').one(),
        ];
        const afterFirst = dump();
        const b = await p.state();
        expect(dump()).toEqual(afterFirst);
        expect(b.body.valley.seats).toEqual(a.body.valley.seats);
      },
      SYSTEMS,
    );
  });

  it('splits like one long look: the same expected scrap whether the player looks once or often', async () => {
    const run = async (steps: number): Promise<number> => {
      let total = 0;
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await scouting(ctx, 1);
          const scrap0 = part(ctx.sql, p.id, 'scrap');
          for (let i = 0; i < steps; i++) {
            ctx.clock.t += (36 * HOUR) / steps;
            await p.state();
          }
          // One more look a visit later brings what is left home.
          ctx.clock.t += 31 * 60_000;
          await p.state();
          total = part(ctx.sql, p.id, 'scrap') - scrap0;
        },
        { ...SYSTEMS, scoutRng: NONE },
      );
      return total;
    };
    const once = await run(1);
    const often = await run(6);
    expect(Math.abs(once - often)).toBeLessThanOrEqual(2);
  });

  it("shows what makes each seat's pace and when it fills (V-RET-9)", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'ember-caves');
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        const seat = valley.seats[0]!;
        expect(seat.destination).toBe('ember-caves');
        expect(seat.store.capHours).toBe(R.posts.storeHours);
        expect(seat.store.fullInHours).toBe(R.posts.storeHours);
        // Ember Caves are rich in shards.
        const fit = seat.fit ? 1 + R.posts.fitBonus : 1;
        expect(seat.perDay.shards).toBeCloseTo(24 * R.scouts.perHour.shards * 2 * fit, 9);
        expect(valley.places.map((x) => x.id)).toEqual([
          'tidepools',
          'ember-caves',
          'verdant-hollow',
          'storm-ridge',
          'sunken-fen',
          'old-crossroads',
          'moonlit-reef',
          'festival-grounds',
        ]);
        expect(valley.special).not.toBeNull();
        expect(valley.places.filter((x) => x.special).length).toBeLessThanOrEqual(1);
      },
      SYSTEMS,
    );
  });

  it('marks a second scout at the same place, who finds creatures at half the chance (V-SCOUT-10)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'verdant-hollow');
        give(ctx, p.id, { bait: 500 });
        const second = (await buySeat(p)).body.seatId as string;
        await post(p, {
          seatId: second,
          creatureId: p.creatureIds[1],
          destination: 'verdant-hollow',
        });
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(valley.seats.map((s) => s.second)).toEqual([false, true]);
        const [a, b] = valley.seats;
        // Same place, same kit; fit may differ, so compare the part that does not.
        const fitA = a!.fit ? 1 + R.posts.fitBonus : 1;
        const fitB = b!.fit ? 1 + R.posts.fitBonus : 1;
        expect(b!.perDay.creatures / fitB).toBeCloseTo(
          (a!.perDay.creatures / fitA) * R.scouts.secondScoutCreatures,
          9,
        );
        expect(b!.perDay.scrap / fitB).toBeCloseTo(a!.perDay.scrap / fitA, 9);
      },
      SYSTEMS,
    );
  });
});

describe('kit (V-SCOUT-5, V-POST-11)', () => {
  it('buys a kit once with a keyed spend and sets it on a seat for free; the lure tilts creatures', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'verdant-hollow');
        give(ctx, p.id, { bait: R.kit.price * 2 });
        const acorns = bait(ctx.sql, p.id);
        const before = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(before.kit).toEqual({ owned: [], price: R.kit.price });
        const unowned = await p.api.call('POST', '/api/valley/kit', {
          action: 'set',
          seatId: p.seatId,
          kit: 'lure',
        });
        expect(unowned.status).toBe(409);
        expect(unowned.body).toEqual({ error: 'kit_not_owned' });
        const key = newKey('kit');
        const bought = await p.api.call('POST', '/api/valley/kit', {
          action: 'buy',
          kit: 'lure',
          idempotencyKey: key,
        });
        expect(bought.status).toBe(200);
        expect(bought.body).toMatchObject({ kit: 'lure', price: R.kit.price });
        expect(bait(ctx.sql, p.id)).toBe(acorns - R.kit.price);
        // A retry charges nothing; another key for the kit already owned is refused.
        expect(
          (
            await p.api.call('POST', '/api/valley/kit', {
              action: 'buy',
              kit: 'lure',
              idempotencyKey: key,
            })
          ).status,
        ).toBe(200);
        expect(bait(ctx.sql, p.id)).toBe(acorns - R.kit.price);
        const again = await p.api.call('POST', '/api/valley/kit', {
          action: 'buy',
          kit: 'lure',
          idempotencyKey: newKey('kit'),
        });
        expect(again.status).toBe(409);
        expect(again.body).toEqual({ error: 'kit_owned' });
        const plain = v.parse(ValleyViewSchema, (await p.state()).body.valley).seats[0]!;
        const set = await p.api.call('POST', '/api/valley/kit', {
          action: 'set',
          seatId: p.seatId,
          kit: 'lure',
        });
        expect(set.status).toBe(200);
        const lured = v.parse(ValleyViewSchema, set.body.valley).seats[0]!;
        expect(lured.kit).toBe('lure');
        expect(lured.perDay.creatures / plain.perDay.creatures).toBeCloseTo(
          R.kit.lure.creatures,
          9,
        );
        expect(lured.perDay.scrap).toBeCloseTo(plain.perDay.scrap, 9);
        // Taking it off is free as well.
        const off = await p.api.call('POST', '/api/valley/kit', {
          action: 'set',
          seatId: p.seatId,
          kit: null,
        });
        expect(v.parse(ValleyViewSchema, off.body.valley).seats[0]?.kit).toBeNull();
        expect(bait(ctx.sql, p.id)).toBe(acorns - R.kit.price);
      },
      SYSTEMS,
    );
  });

  it('refuses a kit without the Acorns and a kit of the Forge, and rejects odd bodies', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1);
        const body = (b: Record<string, unknown>) => p.api.call('POST', '/api/valley/kit', b);
        const poor = await body({ action: 'buy', kit: 'satchel', idempotencyKey: newKey('kit') });
        expect(poor.status).toBe(409);
        expect(poor.body).toEqual({ error: 'insufficient_funds' });
        expect(
          (await body({ action: 'buy', kit: 'tongs', idempotencyKey: newKey('kit') })).status,
        ).toBe(400);
        expect((await body({ action: 'sell', kit: 'lure' })).status).toBe(400);
        expect((await body({ action: 'buy', kit: 'lure' })).status).toBe(400);
        expect(count(ctx.sql, 'valley_kit')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('newcomers at the gate (V-SCOUT-3)', () => {
  it("lets the starter's first scout find something for sure: a new species joins the roster at once", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // The source never draws a find by chance, so only the sure find can arrive.
        const p = await scouting(ctx, 1, 'verdant-hollow', ['splashet', 'cindle', 'sproutle']);
        const before = count(ctx.sql, 'creatures');
        ctx.clock.t += 2 * HOUR;
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(count(ctx.sql, 'creatures')).toBe(before + 1);
        expect(valley.creatures).toHaveLength(before + 1);
        const lines = ctx.sql
          .exec<{ n: number }>(
            'SELECT COUNT(DISTINCT line) AS n FROM creatures WHERE user_id = ?',
            p.id,
          )
          .one().n;
        expect(lines).toBe(before + 1);
        expect(ctx.sql.exec('SELECT first_scout_done AS d FROM valley_players').one().d).toBe(1);
        // It is only once: another day brings nothing by the sure rule.
        ctx.clock.t += 24 * HOUR;
        await p.state();
        expect(count(ctx.sql, 'creatures')).toBe(before + 1);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('keeps a new species and leaves a duplicate at the gate, drawn live from the scout source', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'verdant-hollow', ['splashet', 'cindle', 'sproutle']);
        // A lure and the best place give the most creatures; three days of the pack.
        give(ctx, p.id, { bait: R.kit.price });
        await p.api.call('POST', '/api/valley/kit', {
          action: 'buy',
          kit: 'lure',
          idempotencyKey: newKey('kit'),
        });
        await p.api.call('POST', '/api/valley/kit', {
          action: 'set',
          seatId: p.seatId,
          kit: 'lure',
        });
        const before = count(ctx.sql, 'creatures');
        ctx.clock.t += 3 * 24 * HOUR;
        const res = await p.state();
        const newcomers = count(ctx.sql, 'creatures') - before;
        const waiting = count(ctx.sql, 'pending_catches');
        expect(newcomers + waiting).toBeGreaterThan(0);
        // Newcomers are on the fire already; duplicates wait with an answer time a day after they arrived.
        expect(res.body.valley.creatures).toHaveLength(before + newcomers);
        for (const row of ctx.sql
          .exec<{ created_at: number; auto_at: number | null; source: string }>(
            'SELECT created_at, auto_at, source FROM pending_catches',
          )
          .toArray()) {
          expect(row.auto_at).toBe(row.created_at + R.scouts.gateAutoHours * HOUR);
          expect(row.source).toBe('expedition');
        }
        const cards = res.body.pendingCatches ?? res.body.pending ?? [];
        for (const card of cards as { autoAt?: number }[]) expect(card.autoAt).toBeTypeOf('number');
      },
      { ...SYSTEMS, scoutRng: createSeededRng('gate-scouts') },
    );
  });

  it('answers a duplicate with Recommended by itself once its day is up, and leaves other cards alone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 3, ['splashet', 'cindle', 'sproutle']);
        await p.state();
        const choices = ctx.core.collection.choices;
        const day = 24 * HOUR;
        const auto = choices.addPending(
          p.id,
          { species: 'splashet', shiny: false },
          { kind: 'expedition', id: 'scout-seat' },
          undefined,
          ctx.clock.t + day,
        );
        const waits = choices.addPending(
          p.id,
          { species: 'cindle', shiny: false },
          { kind: 'expedition', id: 'old-trip' },
        );
        ctx.clock.t += day - HOUR;
        await p.state();
        expect(count(ctx.sql, 'pending_catches')).toBe(2);
        ctx.clock.t += 2 * HOUR;
        await p.state();
        const left = ctx.sql
          .exec<{ id: string }>('SELECT id FROM pending_catches')
          .toArray()
          .map((r) => r.id);
        expect(left).toEqual([waits.id]);
        expect(auto.id).not.toBe(waits.id);
        // Answered once: the auto answer is one `duplicate_choice`, and a repeat pass changes nothing.
        await p.state();
        expect(count(ctx.sql, 'pending_catches')).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('what comes home besides scrap and shards', () => {
  it('rolls the waiting gear, blueprints and pages when the store comes home', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'storm-ridge');
        ctx.sql.exec(
          'UPDATE valley_seats SET gear_finds = 3, blueprint_finds = 2, page_finds = 2 WHERE seat_id = ?',
          p.seatId,
        );
        const gear0 = count(ctx.sql, 'gear_items');
        const pages0 = count(ctx.sql, 'journal');
        ctx.clock.t += 2 * HOUR;
        await p.state();
        expect(count(ctx.sql, 'gear_items')).toBe(gear0 + 3);
        expect(count(ctx.sql, 'journal')).toBeGreaterThan(pages0);
        expect(count(ctx.sql, 'blueprints')).toBeGreaterThan(0);
        expect(seatRow(ctx.sql, p.seatId)).toMatchObject({
          gear_finds: 0,
          blueprint_finds: 0,
          page_finds: 0,
        });
        // Found gear starts at the scout's own level (3 here), never above.
        const levels = ctx.sql
          .exec<{ item_level: number }>('SELECT item_level FROM gear_items WHERE user_id = ?', p.id)
          .toArray();
        expect(levels.every((l) => l.item_level <= 3)).toBe(true);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('walks a scout back from the Festival Grounds when they are closed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await scouting(ctx, 1, 'tidepools');
        const seat = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        const festivalOpen = seat.places.find((x) => x.id === 'festival-grounds')?.open === true;
        // Put the scout at the Grounds by hand (the route refuses while they are closed).
        ctx.sql.exec(
          "UPDATE valley_seats SET destination_id = 'festival-grounds', prev_destination_id = 'tidepools' WHERE seat_id = ?",
          p.seatId,
        );
        ctx.clock.t += 5 * HOUR;
        const valley = v.parse(ValleyViewSchema, (await p.state()).body.valley);
        expect(valley.seats[0]?.destination).toBe(festivalOpen ? 'festival-grounds' : 'tidepools');
        if (!festivalOpen) {
          // It earned nothing while the place was closed.
          expect(valley.seats[0]?.mastery.hours).toBeCloseTo(0, 6);
        }
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });
});
