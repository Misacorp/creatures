import { joinSmallestParty } from '../src/raid-roster';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { LiveHub } from '../src/live-hub';
import {
  CLOSE_REPLACED,
  FINALE_LIVE_PATH,
  FINALE_TICKET_PATH,
  LIVE_PATH,
  MAX_SOCKETS_PER_USER,
  TICKET_PATH,
} from '../src/live-socket';
import { LOUNGE_TOPIC, parseTopicTag, topicTag, type Topic } from '../src/live-topic';
import type { GuildCore } from '../src/guild-core';
import { createHandler } from '../src/index';
import { LOBBY_MS, evaluate, loadLive, roundStartsOf } from '../src/raid-live';
import type { LiveSnapshot } from '../src/raid-live-view';
import { eventTimes } from '../src/raid-schedule';
import wranglerText from '../wrangler.jsonc?raw';
import { ORIGIN, callHandler, runCore, tokenFor, type CoreContext } from './helpers';
import {
  HELSINKI,
  HOUR,
  MINUTE,
  W02,
  forcePool,
  membersOf,
  nextGuild,
  seedMember,
  seedPlayer,
  type Seeded,
} from './raid-helpers';

const FINALE = eventTimes(W02.id, HELSINKI).finale;
const BIG = 50_000_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(5);
  }
}

// --- Topics and the flag ---

describe('topics', () => {
  it('turn into socket tags and back, and a user tag is no topic', () => {
    const finale: Topic = { kind: 'finale', week: W02.id, party: 12 };
    expect(topicTag(LOUNGE_TOPIC)).toBe('t:lounge');
    expect(topicTag(finale)).toBe('t:finale:2027-W02:12');
    expect(parseTopicTag('t:lounge')).toEqual(LOUNGE_TOPIC);
    expect(parseTopicTag('t:finale:2027-W02:12')).toEqual(finale);
    for (const bad of [
      'u:123',
      't:finale:2027-W02:0',
      't:finale:x:1',
      't:finale:2027-W02:1:2',
      '',
    ]) {
      expect(parseTopicTag(bad)).toBeNull();
    }
  });
});

describe('the FINALE_LIVE flag: configuration', () => {
  function vars(): Record<string, Record<string, string> | undefined> {
    const json = wranglerText
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const config = JSON.parse(json) as {
      vars: Record<string, string>;
      env: Record<string, { vars: Record<string, string> }>;
    };
    return {
      local: config.vars,
      staging: config.env['staging']?.vars,
      production: config.env['production']?.vars,
    };
  }

  it('is on locally and on staging, and off in production until Misa has watched it on staging', () => {
    const v = vars();
    expect(v['local']?.['FINALE_LIVE']).toBe('on');
    expect(v['staging']?.['FINALE_LIVE']).toBe('on');
    expect(v['production']?.['FINALE_LIVE']).toBe('off');
  });

  it('tells the client through /api/config only when on, apart from the lounge flag', async () => {
    const handler = createHandler();
    const on = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect((await on.json<Record<string, unknown>>())['finaleLive']).toBe(true);
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const offEnv = { ...env, FINALE_LIVE: 'off' } as Env;
    const off = await handler.fetch?.(new Request(`${ORIGIN}/api/config`), offEnv, ctx);
    const body = (await off?.json()) as Record<string, unknown>;
    expect(Object.hasOwn(body, 'finaleLive')).toBe(false);
    expect(body['loungeLive']).toBe(true);
  });

  it('makes the Worker answer 404 on the finale socket route when off, without touching the lounge route', async () => {
    const handler = createHandler();
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const upgrade = (path: string, e: Env) =>
      handler.fetch?.(
        new Request(`${ORIGIN}${path}?ticket=x`, { headers: { Upgrade: 'websocket' } }),
        e,
        ctx,
      );
    const finaleOff = { ...env, FINALE_LIVE: 'off' } as Env;
    expect((await upgrade(FINALE_LIVE_PATH, finaleOff))?.status).toBe(404);
    // The lounge route is still there (a junk ticket is a 401, not a 404).
    expect((await upgrade(LIVE_PATH, finaleOff))?.status).toBe(401);
    const loungeOff = { ...env, LOUNGE_LIVE: 'off' } as Env;
    expect((await upgrade(LIVE_PATH, loungeOff))?.status).toBe(404);
    expect((await upgrade(FINALE_LIVE_PATH, loungeOff))?.status).toBe(401);
  });
});

// --- A finale at a fake clock, with real sockets ---

interface Live {
  ws: WebSocket;
  texts: string[];
  messages: Record<string, unknown>[];
  closed: { code: number } | null;
}

function listen(res: Response): Live {
  const ws = res.webSocket;
  if (ws === null) throw new Error('no websocket in the response');
  ws.accept();
  const live: Live = { ws, texts: [], messages: [], closed: null };
  ws.addEventListener('message', (event) => {
    const text = String(event.data);
    live.texts.push(text);
    if (text.startsWith('{')) live.messages.push(JSON.parse(text) as Record<string, unknown>);
  });
  ws.addEventListener('close', (event) => {
    live.closed = { code: event.code };
  });
  return live;
}

/** The finale snapshots a socket has been pushed, in order. */
const finales = (live: Live): LiveSnapshot[] =>
  live.messages.filter((m) => m['type'] === 'finale').map((m) => m['snapshot'] as LiveSnapshot);
const residents = (live: Live) => live.messages.filter((m) => m['type'] === 'resident');

interface Flags {
  lounge: boolean;
  finale: boolean;
  raid: boolean;
}

/**
 * Runs `fn` in a fresh guild: a core on a fake clock (a few hours before the finale of week 2027-W02, Friday
 * afternoon) wired to a live hub on the object's own state, so its sockets are real. The sockets' own
 * staleness uses the real clock; the game uses the fake one.
 */
function run<R>(
  fn: (ctx: CoreContext, hub: LiveHub) => Promise<R> | R,
  flags: Flags = { lounge: true, finale: true, raid: true },
): Promise<R> {
  const guildId = nextGuild();
  const holder: { core?: GuildCore; hub?: LiveHub } = {};
  return runCore(
    guildId,
    (ctx) => {
      ctx.clock.t = W02.friday - 2 * HOUR;
      holder.core = ctx.core;
      if (holder.hub === undefined) throw new Error('no hub');
      return fn(ctx, holder.hub);
    },
    (_clock, state) => {
      const core = (): GuildCore => {
        if (holder.core === undefined) throw new Error('no core yet');
        return holder.core;
      };
      holder.hub = new LiveHub({
        sockets: {
          ctx: state,
          enabled: flags,
          clientSecret: env.DISCORD_CLIENT_SECRET,
          guildId: () => guildId,
          now: Date.now,
        },
        // A resident for the lounge push: the test only needs to see where it goes.
        residentOf: (userId) => ({ userId, name: 'Someone', creature: null, spot: null }),
        snapshotFor: (userId, week, party) => core().finaleSnapshotFor(userId, week, party),
        nextChangeAt: (week, party) => core().finaleNextChangeAt(week, party),
      });
      return { live: holder.hub, raidPractice: true, raidRng: createSeededRng('raid-tests') };
    },
  );
}

/** Two seeded players, phases 1 and 2 resolved, the clock ten minutes before the finale. */
function toFinale(ctx: CoreContext): Seeded[] {
  const players = [1, 2].map((n) => seedMember(ctx, n, { level: 5 }));
  ctx.core.raid.currentWeek(HELSINKI);
  ctx.clock.t = W02.afterPhase2;
  ctx.core.raid.runDue(HELSINKI);
  forcePool(ctx.sql, BIG, BIG, 1);
  ctx.clock.t = FINALE - 10 * MINUTE;
  return membersOf(ctx.sql, 1).map((id) => players.find((p) => p.id === id) as Seeded);
}

const finaleTopic = (party = 1): Topic => ({ kind: 'finale', week: W02.id, party });

async function open(
  ctx: CoreContext,
  hub: LiveHub,
  userId: string,
  topic: Topic = finaleTopic(),
): Promise<Live> {
  const ticket = await hub.mintTicket(ctx.guildId, userId, topic);
  const path = topic.kind === 'lounge' ? LIVE_PATH : FINALE_LIVE_PATH;
  const res = await hub.upgrade(
    new Request(`${ORIGIN}${path}?ticket=${ticket}`, { headers: { Upgrade: 'websocket' } }),
  );
  expect(res.status).toBe(101);
  const live = listen(res);
  await until(() => live.messages.some((m) => m['type'] === 'hello'));
  return live;
}

const session = (ctx: CoreContext, p: Seeded): Promise<string> =>
  ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });

/** The start of round `r` (1-based) of party 1's stored real fight. */
function roundStart(ctx: CoreContext, r: number): number | undefined {
  const row = loadLive(ctx.sql, W02.id, 1, false);
  if (row === null) throw new Error('no stored fight');
  return roundStartsOf(row, evaluate(row, ctx.clock.t).result).starts[r - 1];
}
function fightEnd(ctx: CoreContext): number {
  const row = loadLive(ctx.sql, W02.id, 1, false);
  if (row === null) throw new Error('no stored fight');
  return roundStartsOf(row, evaluate(row, ctx.clock.t).result).endsAt;
}

const closeAll = (...lives: Live[]): void => {
  for (const l of lives) l.ws.close(1000);
};

describe('the finale ticket', () => {
  const body = { week: W02.id, party: 1 };

  it('does not exist with the flag off (404, and nothing is pushed or scheduled)', async () => {
    await run(
      async (ctx, hub) => {
        const [a] = toFinale(ctx) as [Seeded, Seeded];
        const secret = await session(ctx, a);
        const res = await ctx.request(secret, FINALE_TICKET_PATH, 'POST', body);
        expect(res.status).toBe(404);
        expect(hub.nextFinaleAt()).toBeNull();
        hub.tickFinale();
        hub.notifyFinale(a.id);
      },
      { lounge: true, finale: false, raid: true },
    );
  });

  it('is made for a member of the party, for this week, and nobody else', async () => {
    await run(async (ctx) => {
      const [a] = toFinale(ctx) as [Seeded, Seeded];
      const secret = await session(ctx, a);
      const ok = await ctx.request(secret, FINALE_TICKET_PATH, 'POST', body);
      expect(ok.status).toBe(200);
      expect(typeof (await ok.json<{ ticket: string }>()).ticket).toBe('string');
      // Another party of the week, or another week: refused.
      for (const wrong of [
        { week: W02.id, party: 2 },
        { week: '2027-W03', party: 1 },
      ]) {
        const res = await ctx.request(secret, FINALE_TICKET_PATH, 'POST', wrong);
        expect(res.status).toBe(403);
      }
      // A player who is in no party at all.
      const outsider = seedPlayer(ctx, 9, { level: 5 });
      const outsiderSecret = await session(ctx, outsider);
      const refused = await ctx.request(outsiderSecret, FINALE_TICKET_PATH, 'POST', body);
      expect(refused.status).toBe(403);
    });
  });

  it('validates its body: unknown keys, a string party and a bad week are refused', async () => {
    await run(async (ctx) => {
      const [a] = toFinale(ctx) as [Seeded, Seeded];
      const secret = await session(ctx, a);
      for (const bad of [
        { ...body, userId: '1' },
        { week: W02.id, party: '1' },
        { week: 'x', party: 1 },
        { week: W02.id },
        { week: W02.id, party: 0 },
        {},
      ]) {
        const res = await ctx.request(secret, FINALE_TICKET_PATH, 'POST', bad);
        expect(res.status).toBe(400);
      }
    });
  });

  it('needs a session (the route sits behind the normal auth)', async () => {
    const res = await callHandler(
      createHandler(),
      new Request(`${ORIGIN}${FINALE_TICKET_PATH}`, { method: 'POST', body: JSON.stringify(body) }),
    );
    expect(res.status).toBe(401);
  });

  it('opens a finale socket on the finale route only, and a lounge ticket opens the lounge route only', async () => {
    await run(async (ctx, hub) => {
      const [a] = toFinale(ctx) as [Seeded, Seeded];
      const secret = await session(ctx, a);
      const fromRoute = async (path: string, request: [string, unknown?]) => {
        const res = await ctx.request(secret, request[0], 'POST', request[1]);
        const { ticket } = await res.json<{ ticket: string }>();
        return hub.upgrade(
          new Request(`${ORIGIN}${path}?ticket=${ticket}`, { headers: { Upgrade: 'websocket' } }),
        );
      };
      expect((await fromRoute(LIVE_PATH, [FINALE_TICKET_PATH, body])).status).toBe(401);
      expect((await fromRoute(FINALE_LIVE_PATH, [TICKET_PATH])).status).toBe(401);
      const finale = await fromRoute(FINALE_LIVE_PATH, [FINALE_TICKET_PATH, body]);
      expect(finale.status).toBe(101);
      listen(finale).ws.close(1000);
      const lounge = await fromRoute(LIVE_PATH, [TICKET_PATH]);
      expect(lounge.status).toBe(101);
      listen(lounge).ws.close(1000);
    });
  });
});

describe('the finale push', () => {
  it('greets a new socket with its own snapshot, and never sends the seed', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      const liveA = await open(ctx, hub, a.id);
      const liveB = await open(ctx, hub, b.id);
      await until(() => finales(liveA).length >= 1 && finales(liveB).length >= 1);
      expect(finales(liveA)[0]).toMatchObject({ status: 'none', week: W02.id, party: 1 });
      // Each socket's snapshot is its own player's: the caller's opaque key in the fight.
      const seenA = finales(liveA).length;
      const seenB = finales(liveB).length;
      ctx.clock.t = FINALE + 1000;
      await ctx.core.alarm();
      await until(() => finales(liveA).length > seenA && finales(liveB).length > seenB);
      expect(finales(liveA).at(-1)).toMatchObject({ status: 'live', round: 1, you: 'm1' });
      expect(finales(liveB).at(-1)).toMatchObject({ status: 'live', round: 1, you: 'm2' });
      const seed = loadLive(ctx.sql, W02.id, 1, false)?.seed ?? '';
      expect(seed).not.toBe('');
      for (const text of [...liveA.texts, ...liveB.texts]) {
        expect(text).not.toContain(seed);
        expect(text).not.toContain('"seed"');
      }
      closeAll(liveA, liveB);
    });
  });

  it('wakes at each round start, pushes each socket its own snapshot once, and ends with the result', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      const liveA = await open(ctx, hub, a.id);
      const liveB = await open(ctx, hub, b.id);
      // With a socket open the alarm wakes at the lobby opening (a thing the sockets want to hear).
      await ctx.core.ensureAlarm();
      expect(await ctx.storage.getAlarm()).toBe(FINALE - LOBBY_MS);

      ctx.clock.t = FINALE - LOBBY_MS;
      await ctx.core.alarm();
      await until(() => finales(liveA).at(-1)?.status === 'lobby');
      expect(await ctx.storage.getAlarm()).toBe(FINALE);
      // The lobby shows only the caller's own abilities.
      const lobbyA = finales(liveA).at(-1);
      const lobbyB = finales(liveB).at(-1);
      expect(lobbyA?.status).toBe('lobby');
      if (lobbyA === undefined || lobbyB === undefined) throw new Error('no snapshot');
      if (lobbyA.status === 'none' || lobbyB.status === 'none') throw new Error('no lobby');
      expect(lobbyA.abilities.every((x) => x.alias === 'm1')).toBe(true);
      expect(lobbyB.abilities.every((x) => x.alias === 'm2')).toBe(true);

      // The lobby turns into the fight.
      ctx.clock.t = FINALE;
      await ctx.core.alarm();
      await until(() => finales(liveA).at(-1)?.status === 'live');
      expect(finales(liveB).at(-1)).toMatchObject({ status: 'live', round: 1, you: 'm2' });
      expect(await ctx.storage.getAlarm()).toBe(roundStart(ctx, 2));

      // The same moment again changes nothing and sends nothing.
      const before = finales(liveA).length;
      await ctx.core.alarm();
      await sleep(50);
      expect(finales(liveA)).toHaveLength(before);

      // Round 2, then round 3.
      for (const r of [2, 3]) {
        ctx.clock.t = roundStart(ctx, r) as number;
        await ctx.core.alarm();
        await until(() => finales(liveA).at(-1)?.round === r && finales(liveB).at(-1)?.round === r);
        expect(await ctx.storage.getAlarm()).toBe(roundStart(ctx, r + 1) ?? fightEnd(ctx));
      }

      // The end: the fight resolves and each player's socket gets the done snapshot with their loot.
      ctx.clock.t = fightEnd(ctx);
      await ctx.core.alarm();
      await until(
        () => finales(liveA).at(-1)?.status === 'done' && finales(liveB).at(-1)?.status === 'done',
      );
      const done = finales(liveA).at(-1);
      expect(done !== undefined && done.status !== 'none' && done.loot !== null).toBe(true);
      closeAll(liveA, liveB);
    });
  });

  it('does not wake the alarm for the finale when nobody has a finale socket open', async () => {
    await run(async (ctx, hub) => {
      toFinale(ctx);
      await ctx.core.ensureAlarm();
      // The finale event itself, as before.
      expect(await ctx.storage.getAlarm()).toBe(FINALE);
      expect(hub.nextFinaleAt()).toBeNull();
    });
  });

  it("sends a player's Fire to the party's other sockets and not back to the actor", async () => {
    await run(async (ctx, hub) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      const secretA = await session(ctx, a);
      const liveA = await open(ctx, hub, a.id);
      const liveA2 = await open(ctx, hub, a.id);
      const liveB = await open(ctx, hub, b.id);
      ctx.clock.t = FINALE;
      await ctx.core.alarm();
      await until(() => finales(liveB).at(-1)?.status === 'live');
      ctx.clock.t = (roundStart(ctx, 2) as number) + 1000;
      await ctx.core.alarm();
      await until(() => finales(liveB).at(-1)?.round === 2);
      const seenB = finales(liveB).length;
      const seenA = finales(liveA).length;
      const seenA2 = finales(liveA2).length;

      const res = await ctx.request(secretA, '/api/raid/live/action', 'POST', {
        key: 'm1:basic',
        action: 'fire',
      });
      expect(res.status).toBe(200);
      await until(() => finales(liveB).length === seenB + 1);
      const pushed = finales(liveB).at(-1);
      expect(pushed).toMatchObject({ you: 'm2', status: 'live', round: 2 });
      if (pushed === undefined || pushed.status === 'none') throw new Error('no fight');
      // The actor's ability shows as pressed in the other member's view.
      expect(pushed.abilities.find((x) => x.key === 'm1:basic')?.fireAtRound).toBe(3);
      await sleep(50);
      // Neither of the actor's own sockets heard anything (they got the HTTP answer).
      expect(finales(liveA)).toHaveLength(seenA);
      expect(finales(liveA2)).toHaveLength(seenA2);

      // A refused action pushes nothing.
      const refused = await ctx.request(secretA, '/api/raid/live/action', 'POST', {
        key: 'm1:basic',
        action: 'fire',
      });
      expect(refused.status).toBe(409);
      await sleep(50);
      expect(finales(liveB)).toHaveLength(seenB + 1);
      closeAll(liveA, liveA2, liveB);
    });
  });

  it('keeps the lounge and the finale apart: neither hears the other', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      const loungeB = await open(ctx, hub, b.id, LOUNGE_TOPIC);
      const finaleB = await open(ctx, hub, b.id);
      const finaleA = await open(ctx, hub, a.id);
      await until(() => finales(finaleB).length >= 1);
      const seen = finales(finaleB).length;

      // A lounge push (someone else changed their room entry) reaches the lounge socket only.
      hub.notify(a.id);
      await until(() => residents(loungeB).length === 1);
      await sleep(50);
      expect(residents(finaleB)).toHaveLength(0);
      expect(residents(finaleA)).toHaveLength(0);

      // A finale push reaches the finale sockets only.
      ctx.clock.t = FINALE;
      await ctx.core.alarm();
      await until(() => finales(finaleB).length > seen);
      await sleep(50);
      expect(finales(loungeB)).toHaveLength(0);
      closeAll(loungeB, finaleB, finaleA);
    });
  });

  it('holds a lounge socket and a finale socket per player at once, each kind capped at 3', async () => {
    await run(async (ctx, hub) => {
      const [a] = toFinale(ctx) as [Seeded, Seeded];
      const lounge: Live[] = [];
      const finale: Live[] = [];
      for (let i = 0; i < MAX_SOCKETS_PER_USER; i++) {
        lounge.push(await open(ctx, hub, a.id, LOUNGE_TOPIC));
        finale.push(await open(ctx, hub, a.id));
      }
      await sleep(30);
      expect([...lounge, ...finale].every((l) => l.closed === null)).toBe(true);
      // A fourth finale socket replaces the oldest finale socket, and no lounge socket.
      finale.push(await open(ctx, hub, a.id));
      await until(() => finale[0]?.closed !== null);
      expect(finale[0]?.closed?.code).toBe(CLOSE_REPLACED);
      expect(lounge.every((l) => l.closed === null)).toBe(true);
      closeAll(...lounge, ...finale);
    });
  });

  it('counts sockets as watching without a poll, and tells the rest of the party when one leaves', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      ctx.clock.t = FINALE - 2 * MINUTE;
      const liveA = await open(ctx, hub, a.id);
      const liveB = await open(ctx, hub, b.id);
      await until(() => finales(liveA).at(-1)?.watching.length === 2);
      expect([...(finales(liveA).at(-1)?.watching ?? [])].sort()).toEqual([a.name, b.name].sort());

      // B's socket closes: A hears of it with B gone from the list (a long time after B last polled).
      ctx.clock.t += 60_000;
      const serverB = ctx.state.getWebSockets(topicTag(finaleTopic())).filter((ws) => {
        const att: unknown = ws.deserializeAttachment();
        return (att as { userId: string }).userId === b.id;
      })[0];
      if (serverB === undefined) throw new Error('no server socket');
      const seen = finales(liveA).length;
      hub.webSocketClose(serverB, 1000);
      await until(() => finales(liveA).length > seen);
      expect(finales(liveA).at(-1)?.watching).toEqual([a.name]);
      closeAll(liveA, liveB);
    });
  });

  it('works for a practice fight the same way: lobby, start, rounds, end', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = toFinale(ctx) as [Seeded, Seeded];
      ctx.clock.t = W02.afterPhase2 + 5000;
      const liveA = await open(ctx, hub, a.id);
      const liveB = await open(ctx, hub, b.id);
      const secretA = await session(ctx, a);
      const started = await ctx.request(secretA, '/api/raid/practice', 'POST');
      expect(started.status).toBe(200);
      // The party's other member hears of the practice lobby at once.
      await until(() => finales(liveB).at(-1)?.practice === true);
      expect(finales(liveB).at(-1)?.status).toBe('lobby');

      // The alarm is armed for the practice start.
      await ctx.core.ensureAlarm();
      const startsAt = ctx.clock.t + 30_000;
      expect(await ctx.storage.getAlarm()).toBe(startsAt);
      ctx.clock.t = startsAt;
      await ctx.core.alarm();
      await until(() => finales(liveB).at(-1)?.status === 'live');
      expect(finales(liveB).at(-1)).toMatchObject({ practice: true, round: 1, you: 'm2' });
      const row = loadLive(ctx.sql, W02.id, 1, true);
      if (row === null) throw new Error('no practice row');
      const { starts, endsAt } = roundStartsOf(row, evaluate(row, ctx.clock.t).result);
      expect(await ctx.storage.getAlarm()).toBe(starts[1]);

      ctx.clock.t = starts[1] as number;
      await ctx.core.alarm();
      await until(() => finales(liveA).at(-1)?.round === 2);

      ctx.clock.t = endsAt;
      await ctx.core.alarm();
      await until(() => finales(liveA).at(-1)?.status === 'done');
      expect(finales(liveA).at(-1)).toMatchObject({ practice: true, status: 'done' });
      // Nothing is left to wake for.
      expect(hub.nextFinaleAt()).toBeNull();
      closeAll(liveA, liveB);
    });
  });
});

describe('the finale socket through the Worker', () => {
  it('opens with a ticket from the route and is greeted with the caller own snapshot', async () => {
    const handler = createHandler();
    const guildId = nextGuild();
    const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
    const joined = await runInDurableObject(stub, (instance, state) => {
      const sql = state.storage.sql;
      const seeded = [1, 2].map((n) => seedPlayer({ sql, clock: { t: Date.now() } }, n));
      const core = (instance as unknown as { core: GuildCore }).core;
      const first = seeded[0] as Seeded;
      const week = core.raid.currentWeek(HELSINKI).weekId;
      // The first player is in the week's raid. This test runs on the real clock, where joining may
      // already be closed (after Friday), so the membership is written directly.
      joinSmallestParty(sql, week, first.id, Date.now());
      const party = [1, 2, 3, 4].find((p) => core.raid.isPartyMember(first.id, week, p)) ?? 0;
      return { player: first, week, party };
    });
    expect(joined.party).toBeGreaterThan(0);
    const secret = await stub.createSession(
      guildId,
      { id: joined.player.id, displayName: joined.player.name },
      null,
    );
    const token = await tokenFor(guildId, secret);
    const ticketRes = await callHandler(
      handler,
      new Request(`${ORIGIN}${FINALE_TICKET_PATH}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ week: joined.week, party: joined.party }),
      }),
    );
    expect(ticketRes.status).toBe(200);
    const { ticket } = await ticketRes.json<{ ticket: string }>();
    const res = await callHandler(
      handler,
      new Request(`${ORIGIN}${FINALE_LIVE_PATH}?ticket=${ticket}`, {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(res.status).toBe(101);
    const live = listen(res);
    await until(() => finales(live).length === 1);
    expect(live.messages[0]).toMatchObject({ v: 1, type: 'hello' });
    expect(finales(live)[0]).toMatchObject({ week: joined.week, party: joined.party });
    // The same ticket does not open a second socket.
    const again = await callHandler(
      handler,
      new Request(`${ORIGIN}${FINALE_LIVE_PATH}?ticket=${ticket}`, {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(again.status).toBe(401);
    live.ws.close(1000);
  });
});
