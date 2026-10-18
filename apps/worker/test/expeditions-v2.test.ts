import {
  RULES,
  createSeededRng,
  expeditionContent,
  explorerRank,
  lengthRules,
  rankGift,
  seasonOf,
  tripMs,
  tripXp,
  weeklySpecial,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { grantRankGift } from '../src/gear-grants';
import { creditParts } from '../src/gear-store';
import { giveItem } from './gear-helpers';
import { weekIdFor, weekIndex } from '../src/raid-schedule';
import { zonedHour } from '../src/time';
import {
  LATEST_SCHEMA_VERSION,
  OTHER_USER_ID,
  T0,
  USER_ID,
  certainCatches,
  runCore,
  undoExpeditionsMigration,
  type CoreContext,
} from './helpers';

const HOUR = 3_600_000;
const HELSINKI = 'Europe/Helsinki';
const USER = { id: USER_ID, displayName: 'Misa' };
const OTHER = { id: OTHER_USER_ID, displayName: 'Other' };

let guildCounter = 0;
const nextGuild = () => String(750000000000000000n + BigInt(++guildCounter));
let keyCounter = 0;
const newKey = () => `v2key-${String(++keyCounter).padStart(8, '0')}-test`;

interface Json {
  status: number;
  body: Record<string, unknown>;
}

interface Player {
  id: string;
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  starterId: string;
}

async function join(
  ctx: CoreContext,
  user: { id: string; displayName: string },
  bait: number,
  species = 'splashet',
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
    if (ctx.clock.t - loggedInAt >= 30 * 60_000) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      loggedInAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  const chosen = await call('POST', '/api/starter', { species, idempotencyKey: newKey() });
  expect(chosen.status).toBe(200);
  const state = (await call('GET', '/api/state')).body as { creatures: { id: string }[] };
  const starter = state.creatures[0];
  if (starter === undefined) throw new Error('no starter');
  return { id: user.id, call, starterId: starter.id };
}

interface TripBody {
  id: string;
  creatureId: string;
  duration: string;
  destination: string;
  kit: string[];
  cost: number;
  startedAt: number;
  endsAt: number;
  readyAt: number;
  status: string;
  offer: { goals: { id: string; risk: string; extraHours: number; oddsBp: number }[] } | null;
  pushOn: { goalId: string; startedAt: number; endsAt: number; oddsBp: number } | null;
}

interface ResultBody {
  recalled: boolean;
  failed?: boolean;
  noCatch?: number;
  catches: { species: string; outcome: string }[];
  loot: {
    parts: Record<string, number>;
    gear: unknown[];
    blueprints: unknown[];
    supplies?: string[];
  };
  pushOn?: { goalId: string; risk: string; oddsBp: number; outcome: string };
  xp?: { gained: number; total: number; rank: number; rankBefore: number };
  familiarity?: { stars: number; starsBefore: number; trips: number };
  journal?: { entryId: string; set: string | null; setComplete: boolean }[];
  slotUnlocked?: { total: number };
  rankGifts?: {
    rank: number;
    bait: number;
    parts: Record<string, number>;
    supplies: string[];
  }[];
}

interface StateBody {
  balances: { bait: number; essence: number };
  expeditions: TripBody[];
  cancelled: { id: string; reason: string; creatureId: string }[];
  supplies: Record<string, number>;
  creatures: { id: string; away: boolean; explorer: { rank: number; xp: number; trips: number } }[];
  slots: {
    total: number;
    used: number;
    rankSum: number;
    tripsFinished: number;
    next: { kind: string; at: number } | null;
  };
}

const state = async (p: Player) => (await p.call('GET', '/api/state')).body as unknown as StateBody;

const tripOf = (res: Json): TripBody => {
  expect(res.status).toBe(200);
  return res.body['expedition'] as TripBody;
};
const resultOf = (res: Json): ResultBody => {
  expect(res.status).toBe(200);
  return res.body['result'] as ResultBody;
};

type Pick = { id: string; source: 'buy' | 'owned' };
/** The old way to send a supply: it is refused now (`supplies_not_for_sale`). */
const buy = (id: string): Pick => ({ id, source: 'buy' });
const owned = (id: string): Pick => ({ id, source: 'owned' });

function send(
  p: Player,
  creatureId: string,
  duration: 'short' | 'medium' | 'long' | 'day' = 'long',
  supplies: Pick[] = [],
  destination = 'tidepools',
  idempotencyKey = newKey(),
) {
  return p.call('POST', '/api/expeditions', {
    creatureId,
    destination,
    duration,
    supplies,
    idempotencyKey,
  });
}

const claim = (p: Player, id: string) => p.call('POST', `/api/expeditions/${id}/claim`, {});
const pushOn = (p: Player, id: string, goalId: string) =>
  p.call('POST', `/api/expeditions/${id}/push-on`, { goalId });

function rows<T>(sql: SqlStorage, query: string, ...args: (string | number)[]): T[] {
  return sql.exec<Record<string, SqlStorageValue>>(query, ...args).toArray() as unknown as T[];
}
const count = (sql: SqlStorage, table: string, where = '1 = 1'): number =>
  rows<{ n: number }>(sql, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0]?.n ?? 0;

/** Gives a creature the explorer XP of a rank. */
function setRank(sql: SqlStorage, userId: string, creatureId: string, rank: number): void {
  sql.exec(
    `INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 0)
     ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
    userId,
    creatureId,
    RULES.expeditions.rank.xpForRank[rank - 1] ?? 0,
  );
}

function stock(sql: SqlStorage, userId: string, id: string, amount: number): void {
  sql.exec(
    `INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, supply_id) DO UPDATE SET amount = excluded.amount`,
    userId,
    id,
    amount,
  );
}

function setStat(sql: SqlStorage, userId: string, stat: string, value: number): void {
  sql.exec(
    `INSERT INTO account_stats (user_id, stat, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, stat) DO UPDATE SET value = excluded.value`,
    userId,
    stat,
    value,
  );
}

/** A random source whose every draw is the same number (0 makes every chance succeed, 9999 fails them). */
function constantRng(value: { v: number }): Rng {
  return { nextU32: () => value.v };
}

/** A moment in the first Festival week and one in the first ordinary week at or after T0. */
function festivalAndOrdinary(tz: string): { festival: number; ordinary: number } {
  let t = T0;
  let festival: number | undefined;
  let ordinary: number | undefined;
  for (let i = 0; i < 20 && (festival === undefined || ordinary === undefined); i++) {
    const index = weekIndex(weekIdFor(t, tz));
    if (seasonOf(index).festival) festival ??= t;
    else ordinary ??= t;
    t += 7 * 24 * HOUR;
  }
  if (festival === undefined || ordinary === undefined) throw new Error('no such weeks');
  return { festival, ordinary };
}

describe('where a creature may go', () => {
  it('keeps the Old Crossroads for explorer rank 2 and the 24 hour trip for the rank that opens it', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      const locked = await send(p, p.starterId, 'long', [], 'old-crossroads');
      expect(locked.status).toBe(409);
      expect(locked.body).toEqual({ error: 'destination_closed', reason: 'rank' });
      const day = await send(p, p.starterId, 'day');
      expect(day.status).toBe(409);
      expect(day.body['error']).toBe('rank_too_low');
      setRank(ctx.sql, USER_ID, p.starterId, 2);
      expect(tripOf(await send(p, p.starterId, 'long', [], 'old-crossroads')).destination).toBe(
        'old-crossroads',
      );
      expect(count(ctx.sql, 'expeditions')).toBe(1);
    });
  });

  it('gives a 24 hour trip one more catch roll for a creature that wears the Crossroads Wanderer set, and no other length', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      setRank(ctx.sql, USER_ID, p.starterId, RULES.expeditions.lengths.day.minRank);
      const rollsOf = (id: string): number =>
        rows<{ rolls: number }>(ctx.sql, 'SELECT rolls FROM expeditions WHERE id = ?', id)[0]
          ?.rolls ?? 0;
      const wear = (baseId: string): void => {
        const id = giveItem(ctx.sql, USER_ID, baseId, { level: 12, now: ctx.clock.t, lines: [] });
        ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', p.starterId, id);
      };
      const sendDay = async (): Promise<string> => {
        const trip = tripOf(await send(p, p.starterId, 'day'));
        return trip.id;
      };
      const plain = rollsOf(await sendDay());
      expect(plain).toBe(RULES.expeditions.lengths.day.rolls);
      // Free the creature (a recall brings nothing home), then dress it in the set: two pieces change nothing.
      const free = async (id: string): Promise<void> => {
        expect((await claim(p, id)).status).toBe(200);
      };
      await free(rows<{ id: string }>(ctx.sql, 'SELECT id FROM expeditions')[0]?.id as string);
      wear('wanderers-hat');
      wear('wanderers-scarf');
      const two = await sendDay();
      expect(rollsOf(two)).toBe(plain);
      await free(two);
      // Three pieces: one more roll on a 24 hour trip.
      wear('wanderers-coin');
      const three = await sendDay();
      expect(rollsOf(three)).toBe(plain + 1);
      await free(three);
      // Only the 24 hour trip: a 12 hour one has the length's rolls.
      const long = tripOf(await send(p, p.starterId, 'long')).id;
      expect(rollsOf(long)).toBe(RULES.expeditions.lengths.long.rolls);
    });
  });

  it('opens the night place from 20:00 to 06:00 of the guild’s own clock, across daylight saving', async () => {
    const reef = expeditionContent.destinations.find((d) => d.access.night === true);
    if (reef === undefined) throw new Error('no night place');
    // [UTC instant, time zone, open?]. Helsinki is UTC+2 in winter and UTC+3 in summer (from 2027-03-28).
    const cases: [string, string, boolean][] = [
      ['2027-01-15T17:30:00Z', HELSINKI, false], // 19:30
      ['2027-01-15T18:30:00Z', HELSINKI, true], // 20:30
      ['2027-03-28T16:30:00Z', HELSINKI, false], // 19:30 (a fixed +2 would say 18:30)
      ['2027-03-28T17:30:00Z', HELSINKI, true], // 20:30 (a fixed +2 would say 19:30)
      ['2027-07-01T02:30:00Z', HELSINKI, true], // 05:30
      ['2027-07-01T03:30:00Z', HELSINKI, false], // 06:30
      ['2027-03-14T23:30:00Z', 'America/New_York', true], // 19:30 EDT? no: 19:30 EDT is 23:30Z, see below
    ];
    // New York springs forward on 2027-03-14: at 23:30Z it is 19:30 EDT (UTC-4): closed.
    cases[cases.length - 1] = ['2027-03-14T23:30:00Z', 'America/New_York', false];
    cases.push(['2027-03-15T00:30:00Z', 'America/New_York', true]); // 20:30 EDT
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      setRank(ctx.sql, USER_ID, p.starterId, reef.access.minRank);
      for (const [iso, tz, open] of cases) {
        ctx.clock.t = Date.parse(iso);
        const outcome = ctx.core.collection.startExpedition(
          USER_ID,
          {
            creatureId: p.starterId,
            destination: reef.id,
            duration: 'short',
            supplies: [],
            idempotencyKey: newKey(),
          },
          tz,
        );
        expect(outcome.ok, `${iso} ${tz}`).toBe(open);
        if (outcome.ok) {
          // Free the creature again: a recall right away brings nothing home.
          const done = ctx.core.collection.trips.claim(USER_ID, outcome.value.id);
          expect(done.ok).toBe(true);
        } else {
          expect(outcome).toMatchObject({
            status: 409,
            error: 'destination_closed',
            reason: 'night',
          });
        }
      }
    });
  });

  it('opens the Festival Grounds only in a Festival week', async () => {
    const { festival, ordinary } = festivalAndOrdinary(HELSINKI);
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      ctx.clock.t = ordinary;
      const closed = await send(p, p.starterId, 'short', [], 'festival-grounds');
      expect(closed.status).toBe(409);
      expect(closed.body).toEqual({ error: 'destination_closed', reason: 'festival' });
      ctx.clock.t = festival;
      expect(tripOf(await send(p, p.starterId, 'short', [], 'festival-grounds')).destination).toBe(
        'festival-grounds',
      );
    });
  });

  it('catches the Festival species at the Festival Grounds, in a Festival week', async () => {
    const { festival } = festivalAndOrdinary(HELSINKI);
    // The start of that raid week: step back an hour at a time while it is still the same week.
    let start = festival;
    while (weekIdFor(start - HOUR, HELSINKI) === weekIdFor(festival, HELSINKI)) start -= HOUR;
    const festivalSpecies = new Set(['lanternfin', 'hearthshell']);
    // Every roll brings a creature, so 50 short trips are 50 catches (the shipped chance is small).
    const restore = certainCatches(['short']);
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          ctx.clock.t = start + HOUR;
          const p = await join(ctx, USER, 0);
          const seen = new Set<string>();
          for (let i = 0; i < 50; i++) {
            const trip = tripOf(await send(p, p.starterId, 'short', [], 'festival-grounds'));
            ctx.clock.t = trip.endsAt;
            for (const c of resultOf(await claim(p, trip.id)).catches) seen.add(c.species);
          }
          expect([...seen].some((id) => festivalSpecies.has(id))).toBe(true);
        },
        { rng: createSeededRng('festival-catches') },
      );
    } finally {
      restore();
    }
  });

  it('shows the weekly special, the night flag and the familiarity at GET /api/destinations', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      const trip = tripOf(await send(p, p.starterId, 'short'));
      ctx.clock.t = trip.endsAt;
      await claim(p, trip.id);
      const res = await p.call('GET', '/api/destinations');
      expect(res.status).toBe(200);
      const body = res.body as unknown as {
        serverNow: number;
        special: { destination: string; twist: string; festival: boolean };
        festivalWeek: boolean;
        night: boolean;
        destinations: { id: string; closed: string[] }[];
        familiarity: { creatureId: string; destination: string; trips: number }[];
      };
      expect(body.serverNow).toBe(ctx.clock.t);
      expect(body.destinations.map((d) => d.id)).toEqual(
        expeditionContent.destinations.map((d) => d.id),
      );
      expect(body.familiarity).toMatchObject([
        { creatureId: p.starterId, destination: 'tidepools', trips: 1 },
      ]);
      const reef = body.destinations.find((d) => d.id === 'moonlit-reef');
      expect(reef?.closed.includes('night')).toBe(!body.night);
    });
  });

  it('turns the weekly special over at the raid week boundary (Monday 13:37), not at midnight', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      // Find the first instant of the next raid week: by the hour, then by the minute.
      let hour = T0;
      const week0 = weekIdFor(hour, HELSINKI);
      while (weekIdFor(hour, HELSINKI) === week0) hour += HOUR;
      let boundary = hour - HOUR;
      while (weekIdFor(boundary, HELSINKI) === week0) boundary += 60_000;
      expect(weekIdFor(boundary - 1, HELSINKI)).toBe(week0);
      // It is the 13:37 start, so the hours after midnight still belong to the old week.
      expect(zonedHour(boundary, HELSINKI)).toBe(13);
      const before = weeklySpecial(weekIndex(week0));
      const after = weeklySpecial(weekIndex(weekIdFor(boundary, HELSINKI)));
      const specialAt = async (t: number) => {
        ctx.clock.t = t;
        const res = await p.call('GET', '/api/destinations');
        return (res.body as unknown as { special: { destination: string; twist: string } }).special;
      };
      expect(await specialAt(boundary - 1)).toMatchObject({
        destination: before.destination,
        twist: before.twist.id,
      });
      expect(await specialAt(boundary)).toMatchObject({
        destination: after.destination,
        twist: after.twist.id,
      });
    });
  });
});

describe('supplies', () => {
  it('takes a supply from stock once, even with the same key retried, and charges nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 100);
      stock(ctx.sql, USER_ID, 'lure-basic', 2);
      const key = newKey();
      const first = tripOf(
        await send(p, p.starterId, 'long', [owned('lure-basic')], 'tidepools', key),
      );
      const again = tripOf(
        await send(p, p.starterId, 'long', [owned('lure-basic')], 'tidepools', key),
      );
      expect(again.id).toBe(first.id);
      expect(first.kit).toEqual(['lure-basic']);
      expect(first.cost).toBe(0);
      expect((await state(p)).supplies).toEqual({ 'lure-basic': 1 });
      expect(ctx.core.balances(USER_ID).bait).toBe(100);
      expect(count(ctx.sql, 'expeditions')).toBe(1);
      expect(count(ctx.sql, 'ledger', "source = 'expedition'")).toBe(0);
    });
  });

  it('no longer sells supplies: asking to buy one is refused with a clear error and writes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 1_000);
      // Even one the player has in stock: `buy` is not a way to send any more.
      stock(ctx.sql, USER_ID, 'lure-basic', 1);
      for (const supplies of [[buy('lure-basic')], [owned('lure-basic'), buy('map-scrap-basic')]]) {
        const res = await send(p, p.starterId, 'long', supplies);
        expect(res.status).toBe(400);
        expect(res.body['error']).toBe('supplies_not_for_sale');
      }
      expect(count(ctx.sql, 'expeditions')).toBe(0);
      expect(count(ctx.sql, 'ledger', "source = 'expedition'")).toBe(0);
      expect(ctx.core.balances(USER_ID).bait).toBe(1_000);
      expect((await state(p)).supplies).toEqual({ 'lure-basic': 1 });
      expect((await state(p)).creatures[0]?.away).toBe(false);
      // The refusal is not stored under the key: the same key may send a valid trip.
      const key = newKey();
      expect(
        (await send(p, p.starterId, 'long', [buy('lure-basic')], 'tidepools', key)).status,
      ).toBe(400);
      const ok = await send(p, p.starterId, 'long', [owned('lure-basic')], 'tidepools', key);
      expect(ok.status).toBe(200);
    });
  });

  it('sends a double tap (the same key, at once) as one trip that takes one supply', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 200);
      stock(ctx.sql, USER_ID, 'lure-basic', 3);
      const key = newKey();
      const both = await Promise.all([
        send(p, p.starterId, 'long', [owned('lure-basic')], 'tidepools', key),
        send(p, p.starterId, 'long', [owned('lure-basic')], 'tidepools', key),
      ]);
      expect(both.map((r) => r.status)).toEqual([200, 200]);
      expect(tripOf(both[0]).id).toBe(tripOf(both[1]).id);
      expect(count(ctx.sql, 'expeditions')).toBe(1);
      expect((await state(p)).supplies).toEqual({ 'lure-basic': 2 });
    });
  });

  it('sends two different requests for one creature at once: one trip takes its supply, the other is refused and takes none', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 200);
      stock(ctx.sql, USER_ID, 'lure-basic', 1);
      stock(ctx.sql, USER_ID, 'map-scrap-basic', 1);
      const both = await Promise.all([
        send(p, p.starterId, 'long', [owned('lure-basic')]),
        send(p, p.starterId, 'medium', [owned('map-scrap-basic')]),
      ]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(count(ctx.sql, 'expeditions')).toBe(1);
      const left = (await state(p)).supplies;
      expect(Object.values(left).reduce((n, x) => n + x, 0)).toBe(1);
    });
  });

  it('carries supplies from stock for nothing, and refuses ones that are not there', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      const missing = await send(p, p.starterId, 'long', [owned('lure-good')]);
      expect(missing.status).toBe(409);
      expect(missing.body['error']).toBe('supply_missing');
      stock(ctx.sql, USER_ID, 'lure-good', 2);
      const trip = tripOf(await send(p, p.starterId, 'long', [owned('lure-good')]));
      expect(trip.cost).toBe(0);
      expect((await state(p)).supplies).toEqual({ 'lure-good': 1 });
      expect(ctx.core.balances(USER_ID).bait).toBe(0);
    });
  });

  it('refuses two supplies of one kind, too many supplies and unknown ones, taking nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 1_000);
      for (const id of ['lure-basic', 'lure-good', 'map-scrap-basic', 'satchel-basic']) {
        stock(ctx.sql, USER_ID, id, 1);
      }
      const twoLures = await send(p, p.starterId, 'long', [
        owned('lure-basic'),
        owned('lure-good'),
      ]);
      expect(twoLures.status).toBe(400);
      const three = await send(p, p.starterId, 'long', [
        owned('lure-basic'),
        owned('map-scrap-basic'),
        owned('satchel-basic'),
      ]);
      expect(three.status).toBe(400);
      expect((await send(p, p.starterId, 'long', [owned('nope')])).status).toBe(400);
      expect(count(ctx.sql, 'expeditions')).toBe(0);
      expect(ctx.core.balances(USER_ID).bait).toBe(1_000);
      expect(Object.values((await state(p)).supplies).reduce((n, x) => n + x, 0)).toBe(4);
    });
  });
});

describe('ranks, XP and slots', () => {
  it('gives explorer XP for a finished trip, not for a recall, and raises the rank', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const first = tripOf(await send(p, p.starterId, 'long'));
        // A recall pays no XP.
        ctx.clock.t = first.startedAt + 6 * HOUR;
        expect(resultOf(await claim(p, first.id)).xp).toBeUndefined();
        expect((await state(p)).creatures[0]?.explorer.xp).toBe(0);
        // A finished trip does.
        const second = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = second.endsAt;
        const done = resultOf(await claim(p, second.id));
        expect(done.xp).toMatchObject({ gained: tripXp('long', 0), total: tripXp('long', 0) });
        expect(explorerRank(tripXp('long', 0))).toBe(done.xp?.rank);
        // Enough XP to the next rank raises it.
        const need = RULES.expeditions.rank.xpForRank[1] ?? 0;
        setRank(ctx.sql, USER_ID, p.starterId, 1);
        ctx.sql.exec('UPDATE explorer_progress SET xp = ?', need - 1);
        const third = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = third.endsAt;
        const up = resultOf(await claim(p, third.id));
        expect(up.xp?.rankBefore).toBe(1);
        expect(up.xp?.rank).toBe(2);
        expect((await state(p)).creatures[0]?.explorer.rank).toBe(2);
      },
      { rng: createSeededRng('xp'), tripRng: createSeededRng('xp-trip') },
    );
  });

  it('pays the one-time gift of a rank when the rank rises: Bait, parts and supplies, once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        setRank(ctx.sql, USER_ID, p.starterId, 1);
        ctx.sql.exec(
          'UPDATE explorer_progress SET xp = ?',
          (RULES.expeditions.rank.xpForRank[1] ?? 0) - 1,
        );
        const gift = rankGift(2);
        if (gift === null) throw new Error('no gift at rank 2');
        const trip = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = trip.endsAt;
        const baitBefore = ctx.core.balances(USER_ID).bait;
        const suppliesBefore = (await state(p)).supplies;
        const scrapBefore = rows<{ n: number }>(
          ctx.sql,
          "SELECT COALESCE(SUM(amount), 0) AS n FROM parts WHERE user_id = ? AND kind = 'scrap'",
          USER_ID,
        )[0]?.n;
        const result = resultOf(await claim(p, trip.id));
        expect(result.xp?.rank).toBe(2);
        expect(result.rankGifts).toEqual([
          { rank: 2, bait: gift.bait, parts: gift.parts, supplies: [...gift.supplies] },
        ]);
        // The Bait is in the ledger once, under the (creature, rank) key.
        const ledger = rows<{ amount: number; idempotency_key: string }>(
          ctx.sql,
          "SELECT amount, idempotency_key FROM ledger WHERE user_id = ? AND source = 'rank_gift'",
          USER_ID,
        );
        expect(ledger).toEqual([{ amount: gift.bait, idempotency_key: `rank:${p.starterId}:2` }]);
        const after = await state(p);
        for (const id of gift.supplies) {
          expect(after.supplies[id] ?? 0, id).toBe((suppliesBefore[id] ?? 0) + 1);
        }
        expect(after.balances.bait).toBeGreaterThanOrEqual(baitBefore + gift.bait);
        const scrapAfter = rows<{ n: number }>(
          ctx.sql,
          "SELECT COALESCE(SUM(amount), 0) AS n FROM parts WHERE user_id = ? AND kind = 'scrap'",
          USER_ID,
        )[0]?.n;
        expect(scrapAfter).toBe(
          (scrapBefore ?? 0) + (gift.parts.scrap ?? 0) + (result.loot.parts['scrap'] ?? 0),
        );
        // A repeat claim returns the stored result and pays nothing again.
        const bait = ctx.core.balances(USER_ID).bait;
        expect(resultOf(await claim(p, trip.id))).toEqual(result);
        expect(ctx.core.balances(USER_ID).bait).toBe(bait);
        expect(count(ctx.sql, 'ledger', "source = 'rank_gift'")).toBe(1);
        expect(count(ctx.sql, 'gear_grants', "source = 'rank_gift'")).toBe(1);
      },
      { rng: createSeededRng('gift'), tripRng: createSeededRng('gift-trip') },
    );
  });

  it('pays no gift for a trip that does not raise the rank, nor for a recall', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const first = tripOf(await send(p, p.starterId, 'short'));
        ctx.clock.t = first.endsAt;
        const done = resultOf(await claim(p, first.id));
        expect(done.xp?.rank).toBe(done.xp?.rankBefore);
        expect(done.rankGifts).toBeUndefined();
        const second = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = second.startedAt + HOUR;
        expect(resultOf(await claim(p, second.id)).rankGifts).toBeUndefined();
        expect(count(ctx.sql, 'ledger', "source = 'rank_gift'")).toBe(0);
        expect(count(ctx.sql, 'gear_grants', "source = 'rank_gift'")).toBe(0);
      },
      { rng: createSeededRng('nogift'), tripRng: createSeededRng('nogift-trip') },
    );
  });

  it('keys a rank gift by creature and rank, so asking again pays nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      const deps = { storage: ctx.storage, now: () => ctx.clock.t, rng: createSeededRng('unused') };
      const gift = rankGift(7);
      if (gift === null) throw new Error('no gift at rank 7');
      const one = grantRankGift(deps, USER_ID, p.starterId, 7, gift);
      const again = grantRankGift(deps, USER_ID, p.starterId, 7, gift);
      expect(one.fresh).toBe(true);
      expect(again.fresh).toBe(false);
      expect(again.view).toEqual(one.view);
      expect(ctx.core.balances(USER_ID).bait).toBe(gift.bait);
      // Another rank, or another creature, is a different gift.
      expect(grantRankGift(deps, USER_ID, p.starterId, 8, rankGift(8) ?? gift).fresh).toBe(true);
      expect(grantRankGift(deps, USER_ID, 'another-creature', 7, gift).fresh).toBe(true);
    });
  });

  it('shortens trips for a higher rank', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      setRank(ctx.sql, USER_ID, p.starterId, 5);
      const trip = tripOf(await send(p, p.starterId, 'long'));
      const full = lengthRules('long').ms;
      expect(trip.endsAt - trip.startedAt).toBeLessThan(full);
      expect(trip.endsAt - trip.startedAt).toBe(
        Math.floor((full * (10_000 - RULES.expeditions.rank.speedBpPerRank * 4)) / 10_000),
      );
    });
  });

  it('opens the second slot after the finished trips the rules name, and tells the client', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const need = RULES.expeditions.slots.secondAfterTrips;
        expect((await state(p)).slots).toMatchObject({
          total: 1,
          next: { kind: 'trips', at: need },
        });
        let unlocked: ResultBody['slotUnlocked'];
        for (let i = 0; i < need; i++) {
          const trip = tripOf(await send(p, p.starterId, 'short'));
          ctx.clock.t = trip.endsAt;
          const result = resultOf(await claim(p, trip.id));
          if (i < need - 1) expect(result.slotUnlocked).toBeUndefined();
          unlocked = result.slotUnlocked;
        }
        expect(unlocked).toEqual({ total: 2 });
        const after = await state(p);
        expect(after.slots.total).toBe(2);
        expect(after.slots.tripsFinished).toBe(need);
        expect(after.slots.next?.kind).toBe('rank_sum');
      },
      { rng: createSeededRng('slots'), tripRng: createSeededRng('slots-trip') },
    );
  });

  it('opens the third slot when the ranks of all creatures add up to its threshold', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      setStat(ctx.sql, USER_ID, 'trips_finished', RULES.expeditions.slots.secondAfterTrips);
      const threshold = RULES.expeditions.slots.thresholds[0] ?? 0;
      const top = RULES.expeditions.rank.xpForRank.length;
      // Creatures at the top rank, nine ranks above 1 each, until the sum reaches the threshold.
      const extra = Math.ceil(threshold / (top - 1));
      const ids = [p.starterId];
      const lines = ['cindle', 'sproutle', 'zipmouse', 'stormray', 'mossback'];
      for (let i = 1; i < extra; i++) {
        const id = `00000000-0000-4000-8000-0000000000${String(10 + i)}`;
        ctx.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
           VALUES (?, ?, ?, ?, 1, 'test', ?)`,
          id,
          USER_ID,
          lines[i - 1],
          lines[i - 1],
          T0 + i,
        );
        ids.push(id);
      }
      for (const id of ids.slice(0, extra - 1)) setRank(ctx.sql, USER_ID, id, top);
      const below = await state(p);
      expect(below.slots.total).toBe(2);
      expect(below.slots.rankSum).toBe((extra - 1) * (top - 1));
      setRank(ctx.sql, USER_ID, ids[extra - 1] as string, top);
      const reached = await state(p);
      expect(reached.slots.rankSum).toBeGreaterThanOrEqual(threshold);
      expect(reached.slots.total).toBe(3);
    });
  });
});

describe('the end-of-trip choice (push on)', () => {
  /** A trip with the best lure (a sure choice), ended, with the offer rolled by reading the state. */
  async function endedWithOffer(
    ctx: CoreContext,
    p: Player,
    rank: number,
    duration: 'medium' | 'long' = 'long',
  ): Promise<TripBody> {
    setRank(ctx.sql, USER_ID, p.starterId, rank);
    stock(ctx.sql, USER_ID, 'lure-great', 1);
    const trip = tripOf(await send(p, p.starterId, duration, [owned('lure-great')]));
    ctx.clock.t = trip.endsAt;
    const seen = (await state(p)).expeditions.find((e) => e.id === trip.id);
    if (seen === undefined) throw new Error('trip missing from the state');
    return seen;
  }

  it('offers a safe goal at rank 1, with the exact numbers, and rolls it once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 1);
        const goals = trip.offer?.goals ?? [];
        expect(goals.length).toBeGreaterThan(0);
        expect(goals.every((g) => g.risk === 'safe')).toBe(true);
        for (const g of goals) {
          const def = expeditionContent.goals.find((x) => x.id === g.id);
          expect(def?.minRank).toBeLessThanOrEqual(1);
          expect(g.oddsBp).toBe(def?.lengths.long?.oddsBp);
          expect(g.extraHours).toBe(def?.extraHours);
        }
        // Reading the state again does not roll again.
        const again = (await state(p)).expeditions.find((e) => e.id === trip.id);
        expect(again?.offer).toEqual(trip.offer);
        expect(count(ctx.sql, 'expedition_offers')).toBe(1);
      },
      { tripRng: createSeededRng('offer') },
    );
  });

  it('offers a risky goal too from rank 3', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 3);
        const risks = (trip.offer?.goals ?? []).map((g) => g.risk).sort();
        expect(risks).toEqual(['risky', 'safe']);
      },
      { tripRng: createSeededRng('offer-risky') },
    );
  });

  it('does not offer before the trip ends, and a choice before the end is refused', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await join(ctx, USER, 0);
      stock(ctx.sql, USER_ID, 'lure-great', 1);
      const trip = tripOf(await send(p, p.starterId, 'long', [owned('lure-great')]));
      ctx.clock.t = trip.endsAt - 1;
      expect((await state(p)).expeditions[0]?.offer).toBeNull();
      const early = await pushOn(p, trip.id, 'forage');
      expect(early.status).toBe(409);
      expect(early.body['error']).toBe('not_ready');
    });
  });

  it('runs a safe goal: the trip goes on from the end of the trip, and claiming after pays the reward', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 1);
        const goal = trip.offer?.goals[0];
        if (goal === undefined) throw new Error('no goal offered');
        const def = expeditionContent.goals.find((g) => g.id === goal.id);
        const chosen = tripOf(await pushOn(p, trip.id, goal.id));
        expect(chosen.pushOn).toEqual({
          goalId: goal.id,
          startedAt: trip.endsAt,
          endsAt: trip.endsAt + (def?.extraHours ?? 0) * HOUR,
          oddsBp: goal.oddsBp,
        });
        expect(chosen.readyAt).toBe(chosen.pushOn?.endsAt);
        // Choosing it again is fine, another one is refused.
        expect(tripOf(await pushOn(p, trip.id, goal.id)).pushOn?.goalId).toBe(goal.id);
        const other = (trip.offer?.goals ?? []).find((g) => g.id !== goal.id)?.id ?? 'linger';
        const second = await pushOn(p, trip.id, other);
        expect(second.status).toBe(409);
        expect(second.body['error']).toBe('already_chosen');
        // Coming home after the goal's time pays it.
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        const result = resultOf(await claim(p, trip.id));
        expect(result.pushOn).toMatchObject({ goalId: goal.id, risk: 'safe', outcome: 'worked' });
        expect((await state(p)).creatures[0]?.away).toBe(false);
        // A replayed claim is the stored result.
        expect(resultOf(await claim(p, trip.id))).toEqual(result);
      },
      { tripRng: createSeededRng('safe-goal'), rng: createSeededRng('safe-goal-rng') },
    );
  });

  it('counts a goal chosen late as already done: no time is lost when the player opens the app late', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 1);
        const goal = trip.offer?.goals[0];
        if (goal === undefined) throw new Error('no goal offered');
        ctx.clock.t = trip.endsAt + 24 * HOUR;
        const chosen = tripOf(await pushOn(p, trip.id, goal.id));
        expect((chosen.pushOn?.endsAt ?? Infinity) < ctx.clock.t).toBe(true);
        expect(resultOf(await claim(p, trip.id)).pushOn?.outcome).toBe('worked');
      },
      { tripRng: createSeededRng('late'), rng: createSeededRng('late-rng') },
    );
  });

  it('treats claiming before the goal’s time as coming home: the trip pays as usual, nothing more', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 1);
        const goal = trip.offer?.goals[0];
        if (goal === undefined) throw new Error('no goal offered');
        await pushOn(p, trip.id, goal.id);
        const result = resultOf(await claim(p, trip.id));
        expect(result.pushOn?.outcome).toBe('declined');
        expect(result.recalled).toBe(false);
        expect(result.catches.length).toBeGreaterThan(0);
      },
      { tripRng: createSeededRng('declined'), rng: createSeededRng('declined-rng') },
    );
  });

  it('lets the player ignore the choice and claim as usual', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 1);
        expect(trip.offer).not.toBeNull();
        const result = resultOf(await claim(p, trip.id));
        expect(result.pushOn).toBeUndefined();
        expect(result.recalled).toBe(false);
      },
      { tripRng: createSeededRng('ignore'), rng: createSeededRng('ignore-rng') },
    );
  });

  it('refuses a goal that was not offered, and one for a trip with no offer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 1);
        const res = await pushOn(p, trip.id, 'ancient-vault');
        expect(res.status).toBe(409);
        expect(res.body['error']).toBe('not_offered');
        // A trip nobody looked at when it ended has no offer.
        await claim(p, trip.id);
        const plain = tripOf(await send(p, p.starterId, 'short'));
        ctx.clock.t = plain.endsAt;
        const none = await pushOn(p, plain.id, 'forage');
        expect(none.status).toBe(409);
        expect(none.body['error']).toBe('no_offer');
        // Bad bodies and another player's trip.
        expect((await p.call('POST', `/api/expeditions/${plain.id}/push-on`, {})).status).toBe(400);
        const other = await join(ctx, OTHER, 0, 'cindle');
        expect((await pushOn(other, plain.id, 'forage')).status).toBe(404);
      },
      { tripRng: createSeededRng('refuse'), rng: createSeededRng('refuse-rng') },
    );
  });

  it('can fail a risky goal: the whole trip brings nothing home, and the creature is free', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        // Every draw is 0 while the offer is rolled: the offer happens, the first goals are picked.
        const trip = await endedWithOffer(ctx, p, 3);
        const risky = (trip.offer?.goals ?? []).find((g) => g.risk === 'risky');
        if (risky === undefined) throw new Error('no risky goal offered');
        expect(risky.oddsBp).toBeLessThan(10_000);
        const chosen = tripOf(await pushOn(p, trip.id, risky.id));
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        const bait = ctx.core.balances(USER_ID).bait;
        draw.v = 9_999; // the goal's chance fails
        const result = resultOf(await claim(p, trip.id));
        expect(result.failed).toBe(true);
        expect(result.catches).toEqual([]);
        expect(result.pushOn).toMatchObject({ goalId: risky.id, risk: 'risky', outcome: 'failed' });
        expect(result.xp).toBeUndefined();
        const after = await state(p);
        expect(after.creatures[0]?.away).toBe(false);
        expect(after.creatures[0]?.explorer.xp).toBe(RULES.expeditions.rank.xpForRank[2]);
        expect(count(ctx.sql, 'creatures')).toBe(1);
        expect(ctx.core.balances(USER_ID).bait).toBe(bait);
        const stats = (await p.call('GET', '/api/profile')).body as {
          stats: Record<string, number>;
        };
        expect(stats.stats['trips_failed']).toBe(1);
        expect(stats.stats['trips_finished']).toBe(0);
        // The stored result is the same on a replay, and nothing is rolled again.
        draw.v = 0;
        expect(resultOf(await claim(p, trip.id))).toEqual(result);
      },
      { tripRng: constantRng(draw), rng: createSeededRng('risky-rng') },
    );
  });

  it('pays a risky goal that works: its reward comes on top of the trip', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 3);
        const risky = (trip.offer?.goals ?? []).find((g) => g.risk === 'risky');
        if (risky === undefined) throw new Error('no risky goal offered');
        const chosen = tripOf(await pushOn(p, trip.id, risky.id));
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        const result = resultOf(await claim(p, trip.id)); // draws are 0: the chance succeeds
        expect(result.failed).toBeUndefined();
        expect(result.pushOn?.outcome).toBe('worked');
        const def = expeditionContent.goals.find((g) => g.id === risky.id);
        if (def?.reward.gear !== undefined) expect(result.loot.gear.length).toBeGreaterThan(0);
        if (def?.reward.blueprint === true)
          expect(result.loot.blueprints.length).toBeGreaterThan(0);
        expect(result.xp?.gained).toBeGreaterThan(0);
        const stats = (await p.call('GET', '/api/profile')).body as {
          stats: Record<string, number>;
        };
        expect(stats.stats['pushons_won']).toBe(1);
        expect(stats.stats['pushons_taken']).toBe(1);
      },
      { tripRng: constantRng(draw), rng: createSeededRng('risky-ok-rng') },
    );
  });

  it('rolls a push-on with the odds stored when the goal was chosen, not the current content', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const trip = await endedWithOffer(ctx, p, 3);
        const risky = (trip.offer?.goals ?? []).find((g) => g.risk === 'risky');
        if (risky === undefined) throw new Error('no risky goal offered');
        expect(risky.oddsBp).toBeGreaterThan(600);
        const chosen = tripOf(await pushOn(p, trip.id, risky.id));
        expect(chosen.pushOn?.oddsBp).toBe(risky.oddsBp);
        // The content now says something else than what was stored: the stored odds are 600 of 10000.
        ctx.sql.exec('UPDATE expeditions SET push_odds_bp = 600 WHERE id = ?', trip.id);
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        draw.v = 700; // works under the content's odds, fails under the stored ones
        const result = resultOf(await claim(p, trip.id));
        expect(result.failed).toBe(true);
        expect(result.pushOn).toMatchObject({ goalId: risky.id, oddsBp: 600, outcome: 'failed' });
      },
      { tripRng: constantRng(draw), rng: createSeededRng('stored-odds-rng') },
    );
  });

  it('still claims a push-on whose goal has left the content, from the stored odds', async () => {
    for (const [drawn, outcome] of [
      [0, 'worked'],
      [9_999, 'failed'],
    ] as const) {
      const draw = { v: drawn };
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await join(ctx, USER, 0);
          const trip = await endedWithOffer(ctx, p, 3);
          const risky = (trip.offer?.goals ?? []).find((g) => g.risk === 'risky');
          if (risky === undefined) throw new Error('no risky goal offered');
          const chosen = tripOf(await pushOn(p, trip.id, risky.id));
          ctx.sql.exec("UPDATE expeditions SET push_goal = 'vanished-goal' WHERE id = ?", trip.id);
          ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
          const claimed = await claim(p, trip.id);
          expect(claimed.status).toBe(200);
          const result = resultOf(claimed);
          expect(result.pushOn).toMatchObject({
            goalId: 'vanished-goal',
            risk: 'risky',
            oddsBp: risky.oddsBp,
            outcome,
          });
          expect(result.failed === true).toBe(outcome === 'failed');
          // Claiming again returns the stored result.
          expect(resultOf(await claim(p, trip.id))).toEqual(result);
        },
        { tripRng: constantRng(draw), rng: createSeededRng('vanished-rng') },
      );
    }
  });
});

describe('the journal', () => {
  it('never repeats a page and stops when the places’s own pages and the shared ones are found', async () => {
    const draw = { v: 0 }; // every journal chance succeeds, every pick is the first page left
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        const entries = expeditionContent.journal.entries;
        const reachable = entries.filter((e) => e.place === 'tidepools' || e.place === 'any');
        const finds: string[] = [];
        for (let i = 0; i < reachable.length + 6; i++) {
          const trip = tripOf(await send(p, p.starterId, 'short'));
          ctx.clock.t = trip.endsAt;
          for (const page of resultOf(await claim(p, trip.id)).journal ?? [])
            finds.push(page.entryId);
        }
        expect(new Set(finds).size).toBe(finds.length);
        expect(finds).toHaveLength(reachable.length);
        // The place's own pages come first, the shared ones after them.
        const own = entries.filter((e) => e.place === 'tidepools').length;
        expect(
          finds
            .slice(0, own)
            .every((id) => entries.find((e) => e.id === id)?.place === 'tidepools'),
        ).toBe(true);
        expect(count(ctx.sql, 'journal')).toBe(reachable.length);
        const profile = (await p.call('GET', '/api/profile')).body as {
          stats: Record<string, number>;
          journal: { found: unknown[]; total: number };
        };
        expect(profile.stats['journal_pages']).toBe(reachable.length);
        expect(profile.journal.found).toHaveLength(reachable.length);
        expect(profile.journal.total).toBe(entries.length);
      },
      { tripRng: constantRng(draw), rng: createSeededRng('journal-rng') },
    );
  });

  it('keeps the journal to the player who found the pages', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await join(ctx, USER, 0);
        const b = await join(ctx, OTHER, 0, 'cindle');
        const trip = tripOf(await send(a, a.starterId, 'short'));
        ctx.clock.t = trip.endsAt;
        await claim(a, trip.id);
        const profile = (await b.call('GET', '/api/profile')).body as {
          journal: { found: unknown[] };
        };
        expect(profile.journal.found).toEqual([]);
        expect(count(ctx.sql, 'journal', `user_id = '${OTHER_USER_ID}'`)).toBe(0);
      },
      { tripRng: constantRng(draw), rng: createSeededRng('journal-two-rng') },
    );
  });
});

describe('the profile', () => {
  it('counts what a player did, shows milestones and explorers, and is private to the player', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        for (let i = 0; i < 3; i++) {
          const trip = tripOf(await send(p, p.starterId, 'short'));
          ctx.clock.t = trip.endsAt;
          await claim(p, trip.id);
        }
        const res = await p.call('GET', '/api/profile');
        expect(res.status).toBe(200);
        const body = res.body as unknown as {
          stats: Record<string, number>;
          milestones: { id: string; reached: boolean }[];
          bonuses: Record<string, number>;
          explorers: { creatureId: string; trips: number }[];
          slots: { total: number };
        };
        expect(body.stats['trips_finished']).toBe(3);
        expect(body.stats['places_visited']).toBe(1);
        expect(body.stats['trip_hours']).toBe(3 * (lengthRules('short').ms / HOUR));
        expect(body.milestones.length).toBe(RULES.expeditions.milestones.length);
        expect(body.explorers.find((e) => e.creatureId === p.starterId)?.trips).toBe(3);
        expect(body.slots.total).toBe(2);
        const other = await join(ctx, OTHER, 0, 'cindle');
        const theirs = (await other.call('GET', '/api/profile')).body as {
          stats: Record<string, number>;
        };
        expect(theirs.stats['trips_finished']).toBe(0);
        expect((await p.call('POST', '/api/profile', {})).status).toBe(405);
      },
      { rng: createSeededRng('profile-rng'), tripRng: createSeededRng('profile-trip') },
    );
  });
});

describe('what a finished trip brings', () => {
  it('never turns a duplicate into Bait: it waits as a card, even for a fully fused creature', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        // The starter is fused five times already; every catch of its line is a duplicate.
        ctx.sql.exec('UPDATE creatures SET fusion_count = 5');
        ctx.sql.exec('UPDATE player_progress SET expeditions_claimed = 1');
        const trip = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = trip.endsAt;
        const result = resultOf(await claim(p, trip.id));
        for (const c of result.catches) expect(['new', 'duplicate']).toContain(c.outcome);
        // No Bait from duplicates (what the explorer's rank-up gift paid is the only Bait there is).
        expect(count(ctx.sql, 'ledger', "source = 'fusion'")).toBe(0);
        expect(
          count(ctx.sql, 'ledger', "currency = 'bait' AND amount > 0 AND source != 'rank_gift'"),
        ).toBe(0);
        const duplicates = result.catches.filter((c) => c.outcome === 'duplicate').length;
        expect(count(ctx.sql, 'pending_catches')).toBe(duplicates);
      },
      { rng: createSeededRng('convert-rng') },
    );
  });
});

const TRIP_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const TRIP_B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const TRIP_C = 'aaaaaaaa-0000-4000-8000-00000000000c';
const TRIP_O = 'aaaaaaaa-0000-4000-8000-00000000000d';
const TIE_1 = 'aaaaaaaa-0000-4000-8000-000000000011';
const TIE_2 = 'aaaaaaaa-0000-4000-8000-000000000012';
const OLD_KEPT = 'aaaaaaaa-0000-4000-8000-000000000021';

describe('migration 19 and the slot wipe', () => {
  /** Inserts a v1 trip (the shape before migration 19) for a player's creature. */
  function oldTrip(
    sql: SqlStorage,
    id: string,
    userId: string,
    creatureId: string,
    startedAt: number,
    cost: number,
  ): void {
    sql.exec(
      `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status)
       VALUES (?, ?, ?, 'long', 'good', 3, ?, ?, ?, 'active')`,
      id,
      userId,
      creatureId,
      cost,
      startedAt,
      startedAt + 12 * HOUR,
    );
    sql.exec('UPDATE creatures SET away_expedition_id = ? WHERE id = ?', id, creatureId);
  }

  it('keeps the oldest running trip of each player, cancels the rest with a refund and frees the creatures', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await join(ctx, USER, 0);
      const b = await join(ctx, OTHER, 0, 'cindle');
      const extra = ['sproutle', 'zipmouse'].map((line, i) => {
        const id = `00000000-0000-4000-8000-0000000000${String(30 + i)}`;
        ctx.sql.exec(
          `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
           VALUES (?, ?, ?, ?, 1, 'test', ?)`,
          id,
          USER_ID,
          line,
          line,
          T0 + i,
        );
        return id;
      });
      undoExpeditionsMigration(ctx.sql);
      expect(count(ctx.sql, 'expeditions')).toBe(0);
      // Three trips of one player (the order of starting differs from the order of the rows), one of another.
      oldTrip(ctx.sql, TRIP_B, USER_ID, extra[0] as string, T0 + 2_000, 75);
      oldTrip(ctx.sql, TRIP_A, USER_ID, a.starterId, T0 + 1_000, 50);
      oldTrip(ctx.sql, TRIP_C, USER_ID, extra[1] as string, T0 + 3_000, 25);
      oldTrip(ctx.sql, TRIP_O, OTHER_USER_ID, b.starterId, T0 + 500, 40);
      const baitBefore = ctx.core.balances(USER_ID).bait;
      ctx.core.migrate();
      expect(
        rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v,
      ).toBe(LATEST_SCHEMA_VERSION);
      const status = (id: string) =>
        rows<{ status: string; destination_id: string; cancel_reason: string | null }>(
          ctx.sql,
          'SELECT status, destination_id, cancel_reason FROM expeditions WHERE id = ?',
          id,
        )[0];
      // The oldest keeps running, mapped to the Old Crossroads; the others are cancelled.
      expect(status(TRIP_A)).toEqual({
        status: 'active',
        destination_id: 'old-crossroads',
        cancel_reason: null,
      });
      expect(status(TRIP_B)?.status).toBe('cancelled');
      expect(status(TRIP_B)?.cancel_reason).toBe('slot_wipe');
      expect(status(TRIP_C)?.status).toBe('cancelled');
      expect(status(TRIP_O)?.status).toBe('active');
      // The cancelled creatures are free, the kept ones are still away.
      const away = rows<{ id: string; away: string | null }>(
        ctx.sql,
        'SELECT id, away_expedition_id AS away FROM creatures ORDER BY id',
      );
      expect(away.find((c) => c.id === (extra[0] as string))?.away).toBeNull();
      expect(away.find((c) => c.id === (extra[1] as string))?.away).toBeNull();
      expect(away.find((c) => c.id === a.starterId)?.away).toBe(TRIP_A);
      // What the cancelled trips cost is given back, once.
      expect(ctx.core.balances(USER_ID).bait).toBe(baitBefore + 75 + 25);
      expect(count(ctx.sql, 'ledger', "source = 'refund'")).toBe(2);
      // The player sees them as cancelled with no reward, and has one slot in use.
      const seen = await state(a);
      expect(seen.cancelled.map((c) => c.id).sort()).toEqual([TRIP_B, TRIP_C]);
      expect(seen.cancelled.every((c) => c.reason === 'slot_wipe')).toBe(true);
      expect(seen.slots).toMatchObject({ total: 1, used: 1 });
      const mine = seen.expeditions.map((e) => e.id);
      expect(mine).toEqual([TRIP_A]);
      // A cancelled trip cannot be claimed.
      const claimed = await claim(a, TRIP_B);
      expect(claimed.status).toBe(409);
      expect(claimed.body['error']).toBe('cancelled');
      // Replaying the migration changes nothing more.
      ctx.core.migrate();
      expect(count(ctx.sql, 'ledger', "source = 'refund'")).toBe(2);
      expect(ctx.core.balances(USER_ID).bait).toBe(baitBefore + 100);
    });
  });

  it('is deterministic: trips that started at the same instant keep the earlier row', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const a = await join(ctx, USER, 0);
      const second = '00000000-0000-4000-8000-000000000040';
      ctx.sql.exec(
        `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
         VALUES (?, ?, 'cindle', 'cindle', 1, 'test', ?)`,
        second,
        USER_ID,
        T0 + 1,
      );
      undoExpeditionsMigration(ctx.sql);
      oldTrip(ctx.sql, TIE_1, USER_ID, a.starterId, T0, 0);
      oldTrip(ctx.sql, TIE_2, USER_ID, second, T0, 0);
      ctx.core.migrate();
      const kept = rows<{ id: string }>(
        ctx.sql,
        "SELECT id FROM expeditions WHERE status = 'active'",
      );
      expect(kept).toEqual([{ id: TIE_1 }]);
    });
  });

  it('leaves finished trips alone so they can still be claimed, and keeps the oldest running trip', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await join(ctx, USER, 0);
        const extra = ['sproutle', 'zipmouse'].map((line, i) => {
          const id = `00000000-0000-4000-8000-0000000000${String(50 + i)}`;
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at)
             VALUES (?, ?, ?, ?, 1, 'test', ?)`,
            id,
            USER_ID,
            line,
            line,
            T0 + i,
          );
          return id;
        });
        undoExpeditionsMigration(ctx.sql);
        // The migration reads the real clock: this trip ended hours ago, the other two are still out.
        const finishedAt = Date.now() - 20 * HOUR;
        oldTrip(ctx.sql, TRIP_A, USER_ID, a.starterId, finishedAt, 50);
        oldTrip(ctx.sql, TRIP_B, USER_ID, extra[0] as string, T0 + 1_000, 75);
        oldTrip(ctx.sql, TRIP_C, USER_ID, extra[1] as string, T0 + 2_000, 25);
        const baitBefore = ctx.core.balances(USER_ID).bait;
        ctx.core.migrate();
        const status = (id: string) =>
          rows<{ status: string }>(ctx.sql, 'SELECT status FROM expeditions WHERE id = ?', id)[0]
            ?.status;
        expect(status(TRIP_A)).toBe('active');
        expect(status(TRIP_B)).toBe('active');
        expect(status(TRIP_C)).toBe('cancelled');
        expect(ctx.core.balances(USER_ID).bait).toBe(baitBefore + 25);
        // The finished trip still pays out its catches.
        const result = resultOf(await claim(a, TRIP_A));
        expect(result.recalled).toBe(false);
        // The trip's three rolls each brought a creature or came up empty.
        expect(result.catches.length + (result.noCatch ?? 0)).toBe(3);
        // With it claimed, the one running trip fills the single slot.
        expect((await state(a)).slots).toMatchObject({ total: 1, used: 1 });
      },
      { rng: createSeededRng('finished'), tripRng: createSeededRng('finished-trip') },
    );
  });

  it('lets a kept trip be claimed afterwards like any other', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await join(ctx, USER, 0);
        undoExpeditionsMigration(ctx.sql);
        oldTrip(ctx.sql, OLD_KEPT, USER_ID, a.starterId, T0, 0);
        ctx.core.migrate();
        ctx.clock.t = T0 + 13 * HOUR;
        const result = resultOf(await claim(a, OLD_KEPT));
        expect(result.recalled).toBe(false);
        expect(result.catches.length + (result.noCatch ?? 0)).toBe(3);
        expect((await state(a)).creatures[0]?.away).toBe(false);
      },
      { rng: createSeededRng('kept'), tripRng: createSeededRng('kept-trip') },
    );
  });
});

describe('supplies from the Workshop', () => {
  async function crafter(ctx: CoreContext, level: number): Promise<Player> {
    const p = await join(ctx, USER, 0);
    const xp = RULES.gear.skill.xpForLevel[level - 1] ?? 0;
    ctx.sql.exec(
      `INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, ?)
       ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
      USER_ID,
      p.starterId,
      xp,
    );
    return p;
  }

  const startSupply = (p: Player, supplyId: string, key = newKey()) =>
    p.call('POST', '/api/workshop/jobs', {
      kind: 'supply',
      creatureId: p.starterId,
      supplyId,
      idempotencyKey: key,
    });

  const baitOf = (ctx: CoreContext): number => ctx.core.balances(USER_ID).bait;
  let giftCounter = 0;
  const giveBait = (ctx: CoreContext, amount: number): void => {
    ctx.core.credit({
      userId: USER_ID,
      currency: 'bait',
      amount,
      source: 'test',
      idempotencyKey: `lure-bait:${String(++giftCounter)}`,
    });
  };

  it('makes a basic supply at Crafting level 1: the parts are paid now and the supply comes when claimed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await crafter(ctx, 1);
      const def = expeditionContent.supplies.find((s) => s.id === 'map-scrap-basic');
      if (def === undefined) throw new Error('no map-scrap-basic');
      creditParts(ctx.sql, USER_ID, { scrap: 20 });
      const scrapBefore = rows<{ amount: number }>(
        ctx.sql,
        "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
        USER_ID,
      )[0]?.amount;
      const key = newKey();
      const started = await startSupply(p, 'map-scrap-basic', key);
      expect(started.status).toBe(200);
      const jobId = (started.body['result'] as { jobId: string }).jobId;
      // The same key is the same job, paid once.
      const retry = await startSupply(p, 'map-scrap-basic', key);
      expect((retry.body['result'] as { jobId: string }).jobId).toBe(jobId);
      const scrapAfter = rows<{ amount: number }>(
        ctx.sql,
        "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
        USER_ID,
      )[0]?.amount;
      expect((scrapBefore ?? 0) - (scrapAfter ?? 0)).toBe(def.blueprint.parts.scrap ?? 0);
      // Not ready: no supply yet.
      expect((await state(p)).supplies).toEqual({});
      ctx.clock.t += def.blueprint.hours * HOUR;
      const done = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
        idempotencyKey: newKey(),
      });
      expect(done.status).toBe(200);
      expect((await state(p)).supplies).toEqual({ 'map-scrap-basic': def.blueprint.yield });
      // A repeated claim adds nothing.
      await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: newKey() });
      expect((await state(p)).supplies).toEqual({ 'map-scrap-basic': def.blueprint.yield });
      // The creature gained Crafting XP.
      expect(
        rows<{ xp: number }>(
          ctx.sql,
          'SELECT xp FROM crafting_skill WHERE creature_id = ?',
          p.starterId,
        )[0]?.xp,
      ).toBeGreaterThan(RULES.gear.skill.xpForLevel[0] ?? 0);
      // The log says what the job cost and what it gave, so the daily rollup can count the flows.
      const logged = (kind: string): Record<string, unknown> =>
        JSON.parse(
          rows<{ props_json: string }>(
            ctx.sql,
            'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
            kind,
          )[0]?.props_json ?? '{}',
        ) as Record<string, unknown>;
      expect(logged('job_start')['parts']).toEqual(def.blueprint.parts);
      expect(logged('job_start')['bait']).toBeUndefined();
      expect(logged('job_claim')['yield']).toBe(def.blueprint.yield);
    });
  });

  it('makes a lure from Bait and scrap: both are paid now, once, and nothing is paid when either is short', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await crafter(ctx, 1);
      const def = expeditionContent.supplies.find((s) => s.id === 'lure-basic');
      if (def === undefined || def.blueprint.bait === undefined) throw new Error('no lure-basic');
      const bait = def.blueprint.bait;
      const scrapOf = (): number =>
        rows<{ amount: number }>(
          ctx.sql,
          "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
          USER_ID,
        )[0]?.amount ?? 0;
      // No Bait at all: refused, and the scrap is not taken.
      creditParts(ctx.sql, USER_ID, { scrap: 20 });
      const noBait = await startSupply(p, 'lure-basic');
      expect(noBait.status).toBe(409);
      expect(noBait.body['error']).toBe('insufficient_funds');
      expect(scrapOf()).toBe(20);
      expect(rows(ctx.sql, 'SELECT * FROM workshop_jobs')).toHaveLength(0);
      // Not enough Bait: the same.
      giveBait(ctx, bait - 1);
      expect((await startSupply(p, 'lure-basic')).status).toBe(409);
      expect(baitOf(ctx)).toBe(bait - 1);
      expect(scrapOf()).toBe(20);
      // Enough: Bait and scrap go, one job is made, and the same key does not pay twice.
      giveBait(ctx, 1 + 3 * bait);
      const key = newKey();
      const started = await startSupply(p, 'lure-basic', key);
      expect(started.status).toBe(200);
      const jobId = (started.body['result'] as { jobId: string }).jobId;
      expect(baitOf(ctx)).toBe(3 * bait);
      expect(scrapOf()).toBe(20 - (def.blueprint.parts.scrap ?? 0));
      const retry = await startSupply(p, 'lure-basic', key);
      expect((retry.body['result'] as { jobId: string }).jobId).toBe(jobId);
      expect(baitOf(ctx)).toBe(3 * bait);
      expect(scrapOf()).toBe(20 - (def.blueprint.parts.scrap ?? 0));
      expect(rows(ctx.sql, 'SELECT * FROM workshop_jobs')).toHaveLength(1);
      // The ledger has one lure debit, under the client's key.
      expect(
        rows<{ amount: number; source: string; idempotency_key: string }>(
          ctx.sql,
          "SELECT amount, source, idempotency_key FROM ledger WHERE source = 'lure'",
        ),
      ).toEqual([{ amount: -bait, source: 'lure', idempotency_key: key }]);
      // The log says what it cost, and the supply comes when the job is claimed.
      const logged = JSON.parse(
        rows<{ props_json: string }>(
          ctx.sql,
          "SELECT props_json FROM analytics_events WHERE kind = 'job_start' ORDER BY id",
        )[0]?.props_json ?? '{}',
      ) as Record<string, unknown>;
      expect(logged['bait']).toBe(bait);
      expect(logged['parts']).toEqual(def.blueprint.parts);
      ctx.clock.t += def.blueprint.hours * HOUR;
      const done = await p.call('POST', `/api/workshop/jobs/${jobId}/claim`, {
        idempotencyKey: newKey(),
      });
      expect(done.status).toBe(200);
      expect((await state(p)).supplies).toEqual({ 'lure-basic': def.blueprint.yield });
      // The Workshop's view of the job shows the Bait it cost.
      const view = (await p.call('GET', '/api/gear')).body as {
        jobs: { id: string; bait: number }[];
      };
      expect(view.jobs.find((j) => j.id === jobId)?.bait).toBe(bait);
    });
  });

  it('refuses a key that was used for another job, without taking any Bait', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await crafter(ctx, 1);
      creditParts(ctx.sql, USER_ID, { scrap: 20 });
      giveBait(ctx, 200);
      const key = newKey();
      expect((await startSupply(p, 'lure-basic', key)).status).toBe(200);
      const baitAfter = baitOf(ctx);
      // The same key for a different lure is a conflict, and costs nothing.
      const clash = await startSupply(p, 'lure-good', key);
      expect(clash.status).toBe(409);
      expect(clash.body['error']).toBe('key_conflict');
      expect(baitOf(ctx)).toBe(baitAfter);
    });
  });

  it('asks for the Crafting level of the tier, and for the parts', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await crafter(ctx, 1);
      creditParts(ctx.sql, USER_ID, { scrap: 100, 'tide-shard': 10 });
      const good = expeditionContent.supplies.find((s) => s.id === 'map-scrap-good');
      const low = await startSupply(p, 'map-scrap-good');
      expect(low.status).toBe(409);
      expect(low.body['error']).toBe('skill_too_low');
      // At the level it asks for it works; without the parts it does not.
      const level = good?.blueprint.craftingLevel ?? 3;
      ctx.sql.exec(
        'UPDATE crafting_skill SET xp = ? WHERE creature_id = ?',
        RULES.gear.skill.xpForLevel[level - 1] ?? 0,
        p.starterId,
      );
      ctx.sql.exec("DELETE FROM parts WHERE kind = 'tide-shard'");
      const poor = await startSupply(p, 'map-scrap-good');
      expect(poor.status).toBe(409);
      expect(poor.body['error']).toBe('insufficient_parts');
      // A lure of a higher tier asks for its Crafting level too, before any Bait is taken.
      giveBait(ctx, 500);
      const great = await startSupply(p, 'lure-great');
      expect(great.status).toBe(409);
      expect(great.body['error']).toBe('skill_too_low');
      expect(baitOf(ctx)).toBe(500);
      creditParts(ctx.sql, USER_ID, { 'tide-shard': 10 });
      expect((await startSupply(p, 'map-scrap-good')).status).toBe(200);
    });
  });

  it('refuses an unknown supply and keeps a creature on a trip out of the Workshop', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await crafter(ctx, 1);
      creditParts(ctx.sql, USER_ID, { scrap: 50 });
      expect((await startSupply(p, 'lure-platinum')).status).toBe(400);
      tripOf(await send(p, p.starterId, 'long'));
      const away = await startSupply(p, 'map-scrap-basic');
      expect(away.status).toBe(409);
      expect(away.body['error']).toBe('creature_away');
    });
  });
});

describe('the analytics of expeditions', () => {
  it('logs content ids and numbers only, never an id of a player or a name', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 500);
        setRank(ctx.sql, USER_ID, p.starterId, 3);
        stock(ctx.sql, USER_ID, 'lure-great', 3);
        stock(ctx.sql, USER_ID, 'map-scrap-basic', 3);
        const nick = await p.call('PATCH', `/api/creatures/${p.starterId}`, {
          nickname: 'Zorblax',
        });
        expect(nick.status).toBe(200);
        const trip = tripOf(
          await send(p, p.starterId, 'long', [owned('lure-great'), owned('map-scrap-basic')]),
        );
        ctx.clock.t = trip.endsAt;
        const seen = (await state(p)).expeditions[0];
        const risky = seen?.offer?.goals.find((g) => g.risk === 'risky');
        if (risky === undefined) throw new Error('no risky goal');
        const chosen = tripOf(await pushOn(p, trip.id, risky.id));
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        await claim(p, trip.id);
        const events = rows<{ kind: string; actor_hash: string | null; props_json: string }>(
          ctx.sql,
          'SELECT kind, actor_hash, props_json FROM analytics_events',
        );
        const kinds = new Set(events.map((e) => e.kind));
        for (const kind of [
          'expedition_send',
          'push_on_offer',
          'push_on_choose',
          'push_on_result',
          'expedition_claim',
        ]) {
          expect(kinds.has(kind), kind).toBe(true);
        }
        const text = events.map((e) => `${e.actor_hash ?? ''} ${e.props_json}`).join('\n');
        expect(text).not.toContain(USER_ID);
        expect(text).not.toContain('Zorblax');
        expect(text).not.toContain('Misa');
        expect(text).not.toContain(ctx.guildId);
        const send1 = events.find((e) => e.kind === 'expedition_send');
        expect(JSON.parse(send1?.props_json ?? '{}')).toMatchObject({
          destination: 'tidepools',
          duration: 'long',
          supplies: ['lure-great', 'map-scrap-basic'],
        });
        expect(JSON.parse(send1?.props_json ?? '{}')).not.toHaveProperty('bought');
        for (const e of events) expect(e.props_json.length).toBeLessThanOrEqual(1_536);
      },
      { tripRng: constantRng(draw), rng: createSeededRng('analytics-rng') },
    );
  });
});

describe('gear on trips', () => {
  /** Puts a worn item on a creature straight in the tables, with the lines given. */
  const wearOn = (
    ctx: CoreContext,
    creatureId: string,
    baseId: string,
    level: number,
    lines: [string, number][],
  ): void => {
    const id = giveItem(ctx.sql, USER_ID, baseId, { rarity: 'epic', level, lines });
    ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, id);
  };

  it('Quick feet shorten a trip that is sent, by their share', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0, 'cindle');
        ctx.sql.exec('UPDATE creatures SET level = 13 WHERE id = ?', p.starterId);
        const plain = tripOf(await send(p, p.starterId, 'long'));
        // The same creature again after the first trip is claimed, now wearing a Compass.
        ctx.clock.t = plain.endsAt;
        await claim(p, plain.id);
        wearOn(ctx, p.starterId, 'crossroads-compass', 13, [['quick-feet', 2]]);
        const rank = (await state(p)).creatures[0]?.explorer.rank ?? 1;
        const quick = tripOf(await send(p, p.starterId, 'long'));
        const length = (t: TripBody) => t.endsAt - t.startedAt;
        // The first trip took the plain time of its rank; Quick feet tier III is -4% of the next one.
        expect(length(plain)).toBe(tripMs('long', 1));
        expect(length(quick)).toBe(Math.floor((tripMs('long', rank) * (10_000 - 400)) / 10_000));
      },
      { tripRng: createSeededRng('quick-feet'), rng: createSeededRng('quick-feet-rng') },
    );
  });

  it('Trail XP raises the explorer XP a finished trip gives, as worn when it is claimed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0, 'cindle');
        ctx.sql.exec('UPDATE creatures SET level = 13 WHERE id = ?', p.starterId);
        const plain = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = plain.endsAt;
        const first = resultOf(await claim(p, plain.id));
        wearOn(ctx, p.starterId, 'crossroads-compass', 13, [['trail-xp', 2]]);
        const better = tripOf(await send(p, p.starterId, 'long'));
        ctx.clock.t = better.endsAt;
        const second = resultOf(await claim(p, better.id));
        // The compass's own base line (+5% at item level 13) and a tier III Trail XP (+12%).
        expect(second.xp?.gained).toBeGreaterThan(first.xp?.gained ?? 0);
        expect(second.xp?.gained).toBe(tripXp('long', 500 + 1200));
        expect(first.xp?.gained).toBe(tripXp('long', 0));
      },
      { tripRng: createSeededRng('trail-xp'), rng: createSeededRng('trail-xp-rng') },
    );
  });

  it('Keen nose brings back more parts on a finished trip', async () => {
    // Every roll brings a creature, so no empty roll adds its small find to the scrap being compared.
    const restore = certainCatches(['day']);
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await join(ctx, USER, 0, 'cindle');
          ctx.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', p.starterId);
          setRank(ctx.sql, USER_ID, p.starterId, 6);
          const scrap = RULES.expeditions.lengths.day.loot.scrap;
          const plain = tripOf(await send(p, p.starterId, 'day'));
          ctx.clock.t = plain.endsAt;
          const first = resultOf(await claim(p, plain.id));
          // Three items with tier IV Keen nose: +60%.
          wearOn(ctx, p.starterId, 'trail-cap', 15, [['keen-nose', 3]]);
          wearOn(ctx, p.starterId, 'patch-scarf', 15, [['keen-nose', 3]]);
          wearOn(ctx, p.starterId, 'trail-charm', 15, [['keen-nose', 3]]);
          const rich = tripOf(await send(p, p.starterId, 'day'));
          ctx.clock.t = rich.endsAt;
          const second = resultOf(await claim(p, rich.id));
          expect(first.loot.parts['scrap']).toBe(scrap);
          expect(second.loot.parts['scrap']).toBe(Math.floor((scrap * 16_000) / 10_000));
          expect(second.loot.parts['scrap'] ?? 0).toBeGreaterThan(scrap);
        },
        { tripRng: createSeededRng('keen-nose'), rng: createSeededRng('keen-nose-rng') },
      );
    } finally {
      restore();
    }
  });

  it('a gear find from a push-on is an item of the place’s element at twice the explorer rank, with where it came from', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        setRank(ctx.sql, USER_ID, p.starterId, 4);
        const trip = tripOf(await send(p, p.starterId, 'long', [], 'ember-caves'));
        ctx.clock.t = trip.endsAt;
        // The Shortcut (a rare gear find) is the offer, stored before the state would roll one.
        ctx.sql.exec(
          'INSERT INTO expedition_offers (expedition_id, user_id, goals_json, offered_at) VALUES (?, ?, ?, ?)',
          trip.id,
          USER_ID,
          JSON.stringify(['shortcut']),
          ctx.clock.t,
        );
        const chosen = tripOf(await pushOn(p, trip.id, 'shortcut'));
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        const result = resultOf(await claim(p, trip.id)); // draws are 0: the chance succeeds
        expect(result.pushOn?.outcome).toBe('worked');
        expect(result.loot.gear).toHaveLength(1);
        const items = rows<{
          tag: string;
          slot: string;
          item_level: number;
          rarity: string;
          source: string;
          origin_json: string;
        }>(ctx.sql, 'SELECT tag, slot, item_level, rarity, source, origin_json FROM gear_items');
        expect(items).toHaveLength(1);
        // Rank 4 explorer: item level 8; the Ember Caves: an Ember (or role) piece.
        expect(items[0]).toMatchObject({ item_level: 8, rarity: 'rare', source: 'expedition' });
        expect(['ember', 'guard', 'setter', 'payoff', 'support']).toContain(items[0]?.tag);
        const origin = JSON.parse(items[0]?.origin_json ?? '{}') as Record<string, unknown>;
        expect(origin).toMatchObject({ kind: 'trip', place: 'ember-caves' });
      },
      {
        tripRng: constantRng(draw),
        rng: createSeededRng('find-rng'),
        gearRng: createSeededRng('find'),
      },
    );
  });

  it('the Old Crossroads gives a Crossroads Compass', async () => {
    const draw = { v: 0 };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await join(ctx, USER, 0);
        setRank(ctx.sql, USER_ID, p.starterId, 4);
        const trip = tripOf(await send(p, p.starterId, 'long', [], 'old-crossroads'));
        ctx.clock.t = trip.endsAt;
        ctx.sql.exec(
          'INSERT INTO expedition_offers (expedition_id, user_id, goals_json, offered_at) VALUES (?, ?, ?, ?)',
          trip.id,
          USER_ID,
          JSON.stringify(['shortcut']),
          ctx.clock.t,
        );
        const chosen = tripOf(await pushOn(p, trip.id, 'shortcut'));
        ctx.clock.t = (chosen.pushOn?.endsAt ?? 0) + 1;
        await claim(p, trip.id);
        expect(
          rows<{ base_id: string }>(ctx.sql, 'SELECT base_id FROM gear_items').map(
            (r) => r.base_id,
          ),
        ).toEqual(['crossroads-compass']);
      },
      {
        tripRng: constantRng(draw),
        rng: createSeededRng('cross-rng'),
        gearRng: createSeededRng('cross'),
      },
    );
  });
});
