import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { RULES, type Span } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../src/index';
import { loungeDay } from '../src/lounge-company';
import type { LiveHooks, Presence } from '../src/lounge-live';
import { LIVE_PATH, TICKET_PATH } from '../src/lounge-live';
import { ORIGIN, callHandler, runCore, tokenFor, type CoreContext } from './helpers';
import { nextGuild, seedPlayer } from './raid-helpers';

const { msPerXp, dailyCap } = RULES.experience.lounge;
const MIN = 60_000;
const TZ = 'Europe/Helsinki';

/** A live socket stand-in: whoever the test says is in the room. */
function fakeLive(presence: { now: Presence }): LiveHooks {
  return {
    enabled: () => true,
    mintTicket: () => Promise.resolve('unused'),
    notify: () => undefined,
    presence: () => presence.now,
  };
}

interface Seat {
  id: string;
  secret: string;
  creatureIds: string[];
}

async function seat(ctx: CoreContext, n: number, creatures = 2): Promise<Seat> {
  const s = seedPlayer(ctx, n, { creatures, level: 3 });
  const secret = await ctx.core.createSession(ctx.guildId, { id: s.id, displayName: s.name }, null);
  return { id: s.id, secret, creatureIds: s.creatureIds };
}

type State = { loungerId: string | null; loungeXp: Record<string, number> };

async function stateOf(ctx: CoreContext, who: Seat): Promise<State> {
  const res = await ctx.request(who.secret, '/api/state');
  expect(res.status).toBe(200);
  return res.json<State>();
}

function expOf(ctx: CoreContext, creatureId: string): { level: number; exp: number } {
  const row = ctx.sql
    .exec<{ level: number; exp: number }>(
      'SELECT level, exp FROM creatures WHERE id = ?',
      creatureId,
    )
    .toArray()[0];
  if (row === undefined) throw new Error('no creature');
  return row;
}

/** A total experience comparable across level-ups (level 3 to 4 needs 93). */
const totalExp = (e: { level: number; exp: number }): number => (e.level > 3 ? 93 : 0) + e.exp;

/** A game day's start after T0, so every test runs inside one game day. */
function dayStartAfter(t: number): number {
  const { start } = loungeDay(t, TZ);
  return start + 24 * 60 * MIN;
}

describe('lounging with company', () => {
  it('pays the lounger 1 XP per 2 minutes while another player is here, and nothing alone', async () => {
    const room = { now: new Map<string, Span[]>() };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const start = dayStartAfter(ctx.clock.t) + MIN;
        ctx.clock.t = start;
        const a = await seat(ctx, 1);
        const b = await seat(ctx, 2);
        const lounger = (await stateOf(ctx, a)).loungerId ?? '';
        const before = totalExp(expOf(ctx, lounger));

        // Alone for 20 minutes: nothing.
        room.now = new Map([[a.id, [{ from: start, to: start + 20 * MIN }]]]);
        ctx.clock.t = start + 20 * MIN;
        expect((await stateOf(ctx, a)).loungeXp).toEqual({});

        // Then b joins for 21 minutes: 10 XP, 1 minute carried.
        room.now = new Map([
          [a.id, [{ from: start, to: start + 41 * MIN }]],
          [b.id, [{ from: start + 20 * MIN, to: start + 41 * MIN }]],
        ]);
        ctx.clock.t = start + 41 * MIN;
        const after = await stateOf(ctx, a);
        expect(after.loungeXp).toEqual({ [lounger]: Math.floor((21 * MIN) / msPerXp) });
        expect(totalExp(expOf(ctx, lounger)) - before).toBe(10);

        // The same stretch is never paid twice; the carried minute counts on.
        expect((await stateOf(ctx, a)).loungeXp[lounger]).toBe(10);
        room.now = new Map([
          [a.id, [{ from: start, to: start + 42 * MIN }]],
          [b.id, [{ from: start + 20 * MIN, to: start + 42 * MIN }]],
        ]);
        ctx.clock.t = start + 42 * MIN;
        expect((await stateOf(ctx, a)).loungeXp[lounger]).toBe(11);
      },
      { live: fakeLive(room) },
    );
  });

  it('caps each creature at the daily cap; a swapped-in creature starts fresh from the swap', async () => {
    const room = { now: new Map<string, Span[]>() };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const start = dayStartAfter(ctx.clock.t) + MIN;
        ctx.clock.t = start;
        const a = await seat(ctx, 1);
        const b = await seat(ctx, 2);
        const first = (await stateOf(ctx, a)).loungerId ?? '';
        const second = a.creatureIds.find((id) => id !== first) ?? '';
        const both = (to: number) =>
          new Map([
            [a.id, [{ from: start, to }]],
            [b.id, [{ from: start, to }]],
          ]);

        // Five hours together (a request every 50 minutes keeps the session): the first lounger is
        // Rested at the cap, not paid for the rest.
        for (let m = 50; m <= 300; m += 50) {
          room.now = both(start + m * MIN);
          ctx.clock.t = start + m * MIN;
          await stateOf(ctx, a);
        }
        expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: dailyCap });

        // Swap: the request pays the old lounger first (it is Rested, so nothing), then the new one
        // earns only from the swap on.
        const swap = await ctx.request(a.secret, '/api/lounger', 'PUT', { creatureId: second });
        expect(swap.status).toBe(200);
        expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: dailyCap });
        room.now = both(start + 320 * MIN);
        ctx.clock.t = start + 320 * MIN;
        expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: dailyCap, [second]: 10 });

        // A Rested creature can still be chosen; it just earns nothing more today.
        expect(
          (await ctx.request(a.secret, '/api/lounger', 'PUT', { creatureId: first })).status,
        ).toBe(200);
        room.now = both(start + 340 * MIN);
        ctx.clock.t = start + 340 * MIN;
        expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: dailyCap, [second]: 10 });

        // The next game day it is fresh again.
        const nextDay = start - MIN + 24 * 60 * MIN;
        room.now = both(nextDay + 10 * MIN);
        ctx.clock.t = nextDay + 10 * MIN;
        // A new day needs a new session (sessions last 12 hours).
        a.secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: 'A' }, null);
        expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: 5 });
      },
      { live: fakeLive(room) },
    );
  });

  it('is not kept company by a player with no creature in the room, and pays no time from before the day', async () => {
    const room = { now: new Map<string, Span[]>() };
    await runCore(
      nextGuild(),
      async (ctx) => {
        const start = dayStartAfter(ctx.clock.t);
        ctx.clock.t = start + 30 * MIN;
        const a = await seat(ctx, 1);
        const empty = await seat(ctx, 2, 0);
        const b = await seat(ctx, 3);
        room.now = new Map([
          [a.id, [{ from: start - 60 * MIN, to: start + 30 * MIN }]],
          [empty.id, [{ from: start - 60 * MIN, to: start + 30 * MIN }]],
        ]);
        expect((await stateOf(ctx, a)).loungeXp).toEqual({});

        // With b there since an hour before the reset, only the 30 minutes of today count.
        room.now.set(b.id, [{ from: start - 60 * MIN, to: start + 30 * MIN }]);
        const lounger = (await stateOf(ctx, a)).loungerId ?? '';
        expect((await stateOf(ctx, a)).loungeXp).toEqual({ [lounger]: 15 });
      },
      { live: fakeLive(room) },
    );
  });
});

describe('lounging with company: the live socket', () => {
  const handler = createHandler();
  const stubOf = (guildId: string) => env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));

  it('settles when a socket leaves: the leaver and the one who stays are both credited up to then', async () => {
    const guildId = nextGuild();
    const stub = stubOf(guildId);
    const players = await runInDurableObject(stub, (_i, state) =>
      [1, 2].map((n) => {
        const s = seedPlayer({ sql: state.storage.sql, clock: { t: Date.now() } }, n, {
          creatures: 1,
        });
        state.storage.sql.exec(
          "INSERT INTO player_progress (user_id, starter_species) VALUES (?, 'splashet') ON CONFLICT(user_id) DO UPDATE SET starter_species = excluded.starter_species",
          s.id,
        );
        return s;
      }),
    );
    const sockets: WebSocket[] = [];
    for (const p of players) {
      const secret = await stub.createSession(guildId, { id: p.id, displayName: p.name }, null);
      const token = await tokenFor(guildId, secret);
      const t = await callHandler(
        handler,
        new Request(`${ORIGIN}${TICKET_PATH}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const { ticket } = await t.json<{ ticket: string }>();
      const res = await callHandler(
        handler,
        new Request(`${ORIGIN}${LIVE_PATH}?ticket=${ticket}`, {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(res.status).toBe(101);
      const ws = res.webSocket;
      if (ws === null) throw new Error('no socket');
      ws.accept();
      sockets.push(ws);
    }
    await new Promise((r) => setTimeout(r, 30));
    sockets[1]?.close(1000);
    const rows = async () =>
      runInDurableObject(stub, (_i, state) =>
        state.storage.sql
          .exec<{ user_id: string }>('SELECT user_id FROM lounge_company ORDER BY user_id')
          .toArray()
          .map((r) => r.user_id),
      );
    const end = Date.now() + 2000;
    while ((await rows()).length < 2 && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(await rows()).toEqual(players.map((p) => p.id).sort());
    sockets[0]?.close(1000);
  });
});
