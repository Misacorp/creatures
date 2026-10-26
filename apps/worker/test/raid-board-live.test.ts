import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { GuildCore } from '../src/guild-core';
import { createHandler } from '../src/index';
import { LiveHub } from '../src/live-hub';
import {
  FINALE_LIVE_PATH,
  LIVE_PATH,
  RAID_LIVE_PATH,
  RAID_TICKET_PATH,
  type LiveHooks,
} from '../src/live-socket';
import { parseTopicTag, topicTag, type Topic } from '../src/live-topic';
import { boardPush } from '../src/raid-board-change';
import { buildRaidView } from '../src/raid-view';
import wranglerText from '../wrangler.jsonc?raw';
import { ORIGIN, callHandler, runCore, type CoreContext } from './helpers';
import { meterStorage } from './read-meter';
import { HELSINKI, HOUR, W02, joinRaid, nextGuild, seedPlayer, type Seeded } from './raid-helpers';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(5);
  }
}

// --- Topic and flag ---

describe('the raid board topic', () => {
  it('turns into a socket tag and back, apart from the finale topic of the same party', () => {
    const raid: Topic = { kind: 'raid', week: W02.id, party: 3 };
    expect(topicTag(raid)).toBe('t:raid:2027-W02:3');
    expect(parseTopicTag('t:raid:2027-W02:3')).toEqual(raid);
    expect(parseTopicTag('t:finale:2027-W02:3')).toEqual({ ...raid, kind: 'finale' });
    for (const bad of [
      't:raid:2027-W02:0',
      't:raid:x:1',
      't:raid:2027-W02:1:2',
      't:raidx:2027-W02:1',
    ]) {
      expect(parseTopicTag(bad)).toBeNull();
    }
  });
});

describe('the RAID_LIVE flag: configuration', () => {
  it('is on locally, on staging and in production', () => {
    const json = wranglerText
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const config = JSON.parse(json) as {
      vars: Record<string, string>;
      env: Record<string, { vars: Record<string, string> }>;
    };
    expect(config.vars['RAID_LIVE']).toBe('on');
    expect(config.env['staging']?.vars['RAID_LIVE']).toBe('on');
    expect(config.env['production']?.vars['RAID_LIVE']).toBe('on');
  });

  it('tells the client through /api/config only when on', async () => {
    const handler = createHandler();
    const on = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect((await on.json<Record<string, unknown>>())['raidLive']).toBe(true);
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const offEnv = { ...env, RAID_LIVE: 'off' } as Env;
    const off = await handler.fetch?.(new Request(`${ORIGIN}/api/config`), offEnv, ctx);
    const body = (await off?.json()) as Record<string, unknown>;
    expect(Object.hasOwn(body, 'raidLive')).toBe(false);
    expect(body['finaleLive']).toBe(true);
  });

  it('makes the Worker answer 404 on the board socket route when off, apart from the other routes', async () => {
    const handler = createHandler();
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const upgrade = (path: string, e: Env) =>
      handler.fetch?.(
        new Request(`${ORIGIN}${path}?ticket=x`, { headers: { Upgrade: 'websocket' } }),
        e,
        ctx,
      );
    const raidOff = { ...env, RAID_LIVE: 'off' } as Env;
    expect((await upgrade(RAID_LIVE_PATH, raidOff))?.status).toBe(404);
    // The other routes are still there (a junk ticket is a 401, not a 404).
    expect((await upgrade(LIVE_PATH, raidOff))?.status).toBe(401);
    expect((await upgrade(FINALE_LIVE_PATH, raidOff))?.status).toBe(401);
    expect((await upgrade(RAID_LIVE_PATH, env))?.status).toBe(401);
  });
});

// --- A raid week at a fake clock, with real sockets ---

interface Live {
  ws: WebSocket;
  messages: Record<string, unknown>[];
}

function listen(res: Response): Live {
  const ws = res.webSocket;
  if (ws === null) throw new Error('no websocket in the response');
  ws.accept();
  const live: Live = { ws, messages: [] };
  ws.addEventListener('message', (event) => {
    const text = String(event.data);
    if (text.startsWith('{')) live.messages.push(JSON.parse(text) as Record<string, unknown>);
  });
  return live;
}

const boards = (live: Live): Record<string, unknown>[] =>
  live.messages.filter((m) => m['type'] === 'raid');

interface Flags {
  lounge: boolean;
  finale: boolean;
  raid: boolean;
}

/**
 * Runs `fn` in a fresh guild: a core on a fake clock (Friday afternoon of week 2027-W02, before Phase 1:
 * joining is open) wired to a live hub on the object's own state, so its sockets are real. `wrap` can
 * replace the hooks the core sees (to break the push).
 */
function run<R>(
  fn: (ctx: CoreContext, hub: LiveHub) => Promise<R> | R,
  options: { flags?: Flags; wrap?: (hub: LiveHub) => LiveHooks } = {},
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
          enabled: options.flags ?? { lounge: true, finale: true, raid: true },
          clientSecret: env.DISCORD_CLIENT_SECRET,
          guildId: () => guildId,
          now: Date.now,
        },
        residentOf: (userId) => ({ userId, name: 'Someone', creature: null, spot: null }),
        snapshotFor: (userId, week, party) => core().finaleSnapshotFor(userId, week, party),
        nextChangeAt: (week, party) => core().finaleNextChangeAt(week, party),
      });
      return {
        live: options.wrap === undefined ? holder.hub : options.wrap(holder.hub),
        raidRng: createSeededRng('raid-tests'),
      };
    },
  );
}

const raidTopic = (party = 1): Topic => ({ kind: 'raid', week: W02.id, party });

async function open(
  ctx: CoreContext,
  hub: LiveHub,
  userId: string,
  topic: Topic = raidTopic(),
): Promise<Live> {
  const ticket = await hub.mintTicket(ctx.guildId, userId, topic);
  const path =
    topic.kind === 'lounge'
      ? LIVE_PATH
      : topic.kind === 'finale'
        ? FINALE_LIVE_PATH
        : RAID_LIVE_PATH;
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

const place = (ctx: CoreContext, p: Seeded, n: number, slot: number) => {
  const outcome = ctx.core.raid.place(p.id, HELSINKI, p.creatureIds[n] as string, slot);
  if (!outcome.ok) throw new Error(outcome.error);
};

/** Waits long enough for a push that is never going to come (the sockets deliver within a few ms). */
const settle = (): Promise<void> => sleep(60);

describe('the raid board ticket', () => {
  const body = { week: W02.id, party: 1 };

  it('does not exist with the flag off (404), and nothing is pushed', async () => {
    await run(
      async (ctx, hub) => {
        const a = seedPlayer(ctx, 1, { level: 5 });
        joinRaid(ctx, a, { creatures: 1 });
        const secret = await session(ctx, a);
        expect((await ctx.request(secret, RAID_TICKET_PATH, 'POST', body)).status).toBe(404);
        expect(hub.raidBoardListening(W02.id, 1, 'someone else')).toBe(false);
      },
      { flags: { lounge: true, finale: true, raid: false } },
    );
  });

  it('is made for a member of the party, and for a player who has not joined, the party they would join', async () => {
    await run(async (ctx) => {
      const a = seedPlayer(ctx, 1, { level: 5 });
      joinRaid(ctx, a, { creatures: 1 });
      const b = seedPlayer(ctx, 2, { level: 5 });
      const secretA = await session(ctx, a);
      const secretB = await session(ctx, b);
      for (const secret of [secretA, secretB]) {
        const ok = await ctx.request(secret, RAID_TICKET_PATH, 'POST', body);
        expect(ok.status).toBe(200);
        expect(typeof (await ok.json<{ ticket: string }>()).ticket).toBe('string');
      }
      // Another party or another week: refused, for the member and for the player who has not joined.
      for (const secret of [secretA, secretB]) {
        for (const wrong of [
          { week: W02.id, party: 2 },
          { week: '2027-W03', party: 1 },
        ]) {
          expect((await ctx.request(secret, RAID_TICKET_PATH, 'POST', wrong)).status).toBe(403);
        }
      }
    });
  });

  it('is refused to a player with no creature, and to a player once the finale has started; open to a newcomer until then', async () => {
    await run(async (ctx) => {
      const a = seedPlayer(ctx, 1, { level: 5 });
      joinRaid(ctx, a, { creatures: 1 });
      const none = seedPlayer(ctx, 2, { creatures: 0 });
      const late = seedPlayer(ctx, 3, { level: 5 });
      expect(
        (await ctx.request(await session(ctx, none), RAID_TICKET_PATH, 'POST', body)).status,
      ).toBe(403);
      // Phase 1 has resolved: a newcomer can still join, so they get the board they would join.
      ctx.clock.t = W02.afterPhase1 + HOUR;
      ctx.core.raid.runDue(HELSINKI);
      expect(
        (await ctx.request(await session(ctx, late), RAID_TICKET_PATH, 'POST', body)).status,
      ).toBe(200);
      // The finale has started: nobody joins any more, so a player who is not in sees no board.
      ctx.clock.t = W02.afterFinale + HOUR;
      ctx.core.raid.runDue(HELSINKI);
      expect(
        (await ctx.request(await session(ctx, late), RAID_TICKET_PATH, 'POST', body)).status,
      ).toBe(403);
      expect(
        (await ctx.request(await session(ctx, a), RAID_TICKET_PATH, 'POST', body)).status,
      ).toBe(200);
    });
  });

  it('validates its body and needs a session', async () => {
    await run(async (ctx) => {
      const a = seedPlayer(ctx, 1, { level: 5 });
      joinRaid(ctx, a, { creatures: 1 });
      const secret = await session(ctx, a);
      for (const bad of [
        { ...body, userId: '1' },
        { week: W02.id, party: '1' },
        { week: 'x', party: 1 },
        { week: W02.id },
        { week: W02.id, party: 0 },
        {},
      ]) {
        expect((await ctx.request(secret, RAID_TICKET_PATH, 'POST', bad)).status).toBe(400);
      }
    });
    const res = await callHandler(
      createHandler(),
      new Request(`${ORIGIN}${RAID_TICKET_PATH}`, { method: 'POST', body: JSON.stringify(body) }),
    );
    expect(res.status).toBe(401);
  });

  it('opens a board socket on the board route only', async () => {
    await run(async (ctx, hub) => {
      const a = seedPlayer(ctx, 1, { level: 5 });
      joinRaid(ctx, a, { creatures: 1 });
      const secret = await session(ctx, a);
      const ticket = async (): Promise<string> =>
        (
          await (
            await ctx.request(secret, RAID_TICKET_PATH, 'POST', body)
          ).json<{ ticket: string }>()
        ).ticket;
      const upgrade = (path: string, t: string) =>
        hub.upgrade(
          new Request(`${ORIGIN}${path}?ticket=${t}`, { headers: { Upgrade: 'websocket' } }),
        );
      expect((await upgrade(FINALE_LIVE_PATH, await ticket())).status).toBe(401);
      expect((await upgrade(LIVE_PATH, await ticket())).status).toBe(401);
      const ok = await upgrade(RAID_LIVE_PATH, await ticket());
      expect(ok.status).toBe(101);
      listen(ok).ws.close(1000);
    });
  });
});

describe('the raid board push', () => {
  it('sends teammates one compact message for a placement, and nobody else', async () => {
    await run(async (ctx, hub) => {
      const [a, b, c] = [1, 2, 3].map((n) => seedPlayer(ctx, n, { level: 5 })) as [
        Seeded,
        Seeded,
        Seeded,
      ];
      joinRaid(ctx, [b, c], { creatures: 1 });
      const liveB = await open(ctx, hub, b.id);
      const liveC = await open(ctx, hub, c.id);
      const otherParty = await open(ctx, hub, c.id, raidTopic(2));
      const loungeB = await open(ctx, hub, b.id, { kind: 'lounge' });
      const finaleB = await open(ctx, hub, b.id, { kind: 'finale', week: W02.id, party: 1 });
      // A joins by placing (an actor with their own board socket hears nothing of their own change).
      const liveA = await open(ctx, hub, a.id);
      place(ctx, a, 0, 5);
      await until(() => boards(liveB).length > 0);
      await settle();
      expect(boards(liveB)).toHaveLength(1);
      expect(boards(liveC)).toHaveLength(1);
      expect(boards(liveA)).toHaveLength(0);
      expect(boards(otherParty)).toHaveLength(0);
      for (const other of [loungeB, finaleB]) {
        expect(other.messages.some((m) => m['type'] === 'raid')).toBe(false);
      }
      const message = boards(liveB)[0] as Record<string, unknown>;
      const species = ctx.sql
        .exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', a.creatureIds[0])
        .one().species;
      expect(message).toMatchObject({
        v: 1,
        type: 'raid',
        week: W02.id,
        party: 1,
        cells: [{ slot: 5, creature: { ownerName: a.name, species, mine: false } }],
        member: { displayName: a.name, joined: true },
      });
      expect(typeof message['rowLength']).toBe('number');
      // Nothing that identifies the creature or the player leaves the server.
      expect(JSON.stringify(message)).not.toContain(a.id);
      expect(JSON.stringify(message)).not.toContain(a.creatureIds[0] as string);
    });
  });

  it("shows in a teammate's view exactly as the push says (the same cell code)", async () => {
    await run(async (ctx, hub) => {
      const [a, b] = [1, 2].map((n) => seedPlayer(ctx, n, { level: 5 })) as [Seeded, Seeded];
      joinRaid(ctx, b, { creatures: 1 });
      const liveB = await open(ctx, hub, b.id);
      place(ctx, a, 0, 7);
      await until(() => boards(liveB).length > 0);
      const message = boards(liveB)[0] as { cells: { slot: number; creature: unknown }[] };
      const view = buildRaidView(ctx.core.raid, ctx.sql, b.id, HELSINKI, ctx.clock.t);
      const cell = view.party?.row.find((r) => r.slot === 7);
      expect(message.cells).toEqual([{ slot: 7, creature: cell?.creature }]);
      expect(view.roster.some((r) => r.displayName === a.name)).toBe(true);
    });
  });

  it('sends both cells of a swap, and a move empties the old slot', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = [1, 2].map((n) => seedPlayer(ctx, n, { level: 5 })) as [Seeded, Seeded];
      joinRaid(ctx, b, { creatures: 1 });
      place(ctx, a, 0, 4);
      place(ctx, a, 1, 5);
      const liveB = await open(ctx, hub, b.id);
      place(ctx, a, 0, 5); // swap with their own creature in slot 5
      await until(() => boards(liveB).length > 0);
      let cells = (
        boards(liveB)[0] as { cells: { slot: number; creature: { name: string } | null }[] }
      ).cells;
      expect(cells.map((c) => c.slot).sort()).toEqual([4, 5]);
      expect(cells.every((c) => c.creature !== null)).toBe(true);
      expect(boards(liveB)[0]).not.toHaveProperty('member');
      place(ctx, a, 0, 8); // a plain move
      await until(() => boards(liveB).length > 1);
      cells = (boards(liveB)[1] as { cells: typeof cells }).cells;
      expect(cells.find((c) => c.slot === 5)?.creature).toBeNull();
      expect(cells.find((c) => c.slot === 8)?.creature).not.toBeNull();
    });
  });

  it('sends an unplace and, when it was the last creature, the leave', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = [1, 2].map((n) => seedPlayer(ctx, n, { level: 5 })) as [Seeded, Seeded];
      joinRaid(ctx, b, { creatures: 1 });
      place(ctx, a, 0, 4);
      place(ctx, a, 1, 5);
      const liveB = await open(ctx, hub, b.id);
      expect(ctx.core.raid.unplace(a.id, HELSINKI, a.creatureIds[0] as string).ok).toBe(true);
      await until(() => boards(liveB).length > 0);
      expect(boards(liveB)[0]).toMatchObject({ cells: [{ slot: 4, creature: null }] });
      expect(boards(liveB)[0]).not.toHaveProperty('member');
      // Taking out one that is not placed changes nothing and pushes nothing.
      expect(ctx.core.raid.unplace(a.id, HELSINKI, a.creatureIds[0] as string).ok).toBe(true);
      expect(ctx.core.raid.unplace(a.id, HELSINKI, a.creatureIds[1] as string).ok).toBe(true);
      await until(() => boards(liveB).length > 1);
      await settle();
      expect(boards(liveB)).toHaveLength(2);
      expect(boards(liveB)[1]).toMatchObject({
        cells: [{ slot: 5, creature: null }],
        member: { displayName: a.name, joined: false },
      });
      expect(typeof (boards(liveB)[1] as Record<string, unknown>)['rowLength']).toBe('number');
    });
  });

  it('pushes nothing for a refused or unchanged placement', async () => {
    await run(async (ctx, hub) => {
      const [a, b] = [1, 2].map((n) => seedPlayer(ctx, n, { level: 5 })) as [Seeded, Seeded];
      joinRaid(ctx, b, { creatures: 1 });
      place(ctx, a, 0, 4);
      const liveB = await open(ctx, hub, b.id);
      place(ctx, a, 0, 4); // already there
      expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[1] as string, 0).ok).toBe(false); // b is there
      expect(ctx.core.raid.place(a.id, HELSINKI, b.creatureIds[0] as string, 6).ok).toBe(false);
      await settle();
      expect(boards(liveB)).toHaveLength(0);
    });
  });

  it("reaches the teammate through the real route too, and not the actor's own sockets", async () => {
    await run(async (ctx, hub) => {
      const [a, b] = [1, 2].map((n) => seedPlayer(ctx, n, { level: 5 })) as [Seeded, Seeded];
      joinRaid(ctx, b, { creatures: 1 });
      const liveA = await open(ctx, hub, a.id);
      const liveB = await open(ctx, hub, b.id);
      const res = await ctx.request(await session(ctx, a), '/api/raid/placement', 'PUT', {
        creatureId: a.creatureIds[0],
        slot: 3,
      });
      expect(res.status).toBe(200);
      await until(() => boards(liveB).length > 0);
      await settle();
      expect(boards(liveB)).toHaveLength(1);
      expect(boards(liveA)).toHaveLength(0);
    });
  });

  it('never breaks the placement when the push fails', async () => {
    const wrap = (hub: LiveHub): LiveHooks =>
      new Proxy(hub, {
        get(target, prop) {
          if (prop === 'raidBoardListening') return () => true;
          if (prop === 'notifyRaidBoard') {
            return () => {
              throw new TypeError('socket gone');
            };
          }
          const value = Reflect.get(target, prop) as unknown;
          return typeof value === 'function'
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value;
        },
      });
    await run(
      (ctx) => {
        const a = seedPlayer(ctx, 1, { level: 5 });
        expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 2).ok).toBe(true);
        const view = buildRaidView(ctx.core.raid, ctx.sql, a.id, HELSINKI, ctx.clock.t);
        expect(view.party?.row.find((r) => r.slot === 2)?.creature?.mine).toBe(true);
      },
      { wrap },
    );
  });

  it('does nothing when the flag is off', async () => {
    await run(
      (ctx, hub) => {
        const [a, b] = [1, 2].map((n) => seedPlayer(ctx, n, { level: 5 })) as [Seeded, Seeded];
        joinRaid(ctx, b, { creatures: 1 });
        place(ctx, a, 0, 4);
        expect(hub.raidBoardListening(W02.id, 1, a.id)).toBe(false);
      },
      { flags: { lounge: true, finale: true, raid: false } },
    );
  });
});

// --- Cost ---

describe('the raid board push: database reads', () => {
  it('builds nothing and reads nothing for a placement when nobody listens, and only a few rows when someone does', async () => {
    const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(nextGuild()));
    await runInDurableObject(stub, async (_instance, state) => {
      const metered = meterStorage(state.storage);
      const clock = { t: W02.friday - 2 * HOUR };
      const sent: string[] = [];
      let listening = false;
      const hooks = {
        enabled: () => true,
        mintTicket: () => Promise.resolve(''),
        notify: () => undefined,
        notifyLoungeXp: () => undefined,
        notifyFinale: () => undefined,
        tickFinale: () => undefined,
        finaleWatchers: () => new Set<string>(),
        nextFinaleAt: () => null,
        raidBoardListening: () => listening,
        notifyRaidBoard: (_actor: string, push: unknown) => {
          sent.push(JSON.stringify(push));
        },
      } satisfies LiveHooks;
      const core = new GuildCore(metered.storage, () => clock.t, {
        guildId: () => 'x',
        live: hooks,
        raidRng: createSeededRng('raid-tests'),
        dailyAllowance: false,
        weather: false,
      });
      const ctx = { sql: state.storage.sql, clock } as Pick<CoreContext, 'sql' | 'clock'>;
      // A full party of players with three creatures each, so the guild is not tiny.
      const players = Array.from({ length: 12 }, (_, i) => seedPlayer(ctx, i + 1, { level: 5 }));
      for (const p of players.slice(1)) {
        for (const [slot, id] of p.creatureIds.entries()) {
          expect(core.raid.place(p.id, HELSINKI, id, (players.indexOf(p) - 1) * 3 + slot).ok).toBe(
            true,
          );
        }
      }
      const actor = players[0] as Seeded;

      // The actor joins first (not measured), then moves one creature twice: once with nobody listening
      // (the placement's own reads, no push built) and once with a listener (the same plus the push).
      expect(core.raid.place(actor.id, HELSINKI, actor.creatureIds[0] as string, 34).ok).toBe(true);
      const quiet = await metered.measure(() =>
        core.raid.place(actor.id, HELSINKI, actor.creatureIds[0] as string, 35),
      );
      expect(quiet.result.ok).toBe(true);
      expect(sent).toHaveLength(0);
      listening = true;
      const move = await metered.measure(() =>
        core.raid.place(actor.id, HELSINKI, actor.creatureIds[0] as string, 34),
      );
      expect(move.result.ok).toBe(true);
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0] as string)).toMatchObject({
        cells: [{ slot: 35, creature: null }, { slot: 34 }],
      });

      // The push itself, measured on its own: placed creatures by id, the actor's name, no scans.
      const push = await metered.measure(() =>
        boardPush(metered.sql, {
          userId: actor.id,
          week: W02.id,
          party: 1,
          slots: [
            { slot: 34, creatureId: actor.creatureIds[1] as string },
            { slot: 35, creatureId: actor.creatureIds[0] as string },
          ],
          rowLength: 36,
          joined: true,
        }),
      );
      expect(push.reads.total, JSON.stringify(push.reads.top)).toBeLessThanOrEqual(15);
      // Listening costs only the push: the placement itself reads the same with or without a listener.
      expect(move.reads.total - quiet.reads.total).toBeLessThanOrEqual(15);

      // A leave (the last creature off the board) also works out the party's row length once.
      const before = sent.length;
      const leave = await metered.measure(() =>
        core.raid.unplace(actor.id, HELSINKI, actor.creatureIds[0] as string),
      );
      expect(leave.result.ok).toBe(true);
      expect(sent).toHaveLength(before + 1);
      const left = JSON.parse(sent[before] as string) as Record<string, unknown>;
      expect(left).toMatchObject({ member: { joined: false } });
      expect(typeof left['rowLength']).toBe('number');
    });
  });
});
