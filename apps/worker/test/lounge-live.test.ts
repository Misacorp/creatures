import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../src/index';
import {
  CLOSE_PROTOCOL,
  CLOSE_REPLACED,
  CLOSE_STALE,
  LIVE_PATH,
  MAX_SOCKETS_PER_GUILD,
  LoungeLive,
  MAX_SOCKETS_PER_USER,
  STALE_MS,
  TICKET_PATH,
} from '../src/lounge-live';
import { TICKET_MAX_PENDING, TICKET_TTL_MS, TicketBook, parseTicket } from '../src/lounge-ticket';
import type { GuildWorld } from '../src/guild-world';
import wranglerText from '../wrangler.jsonc?raw';
import { ORIGIN, callHandler, runCore, tokenFor } from './helpers';
import { nextGuild, seedPlayer } from './raid-helpers';

const handler = createHandler();

/** Config files are JSONC: drop the comment lines, which are the only non-JSON in `wrangler.jsonc`. */
function parseWrangler(): {
  vars: Record<string, string>;
  env: Record<string, { vars: Record<string, string> }>;
} {
  const json = wranglerText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(json) as ReturnType<typeof parseWrangler>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(5);
  }
}

interface Player {
  id: string;
  /** A bearer token for the Worker's routes. */
  token: string;
}

const stubOf = (guildId: string) => env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));

/** A player of the guild with creatures and a chosen starter, signed in. */
async function join(guildId: string, n: number): Promise<Player> {
  const stub = stubOf(guildId);
  const seeded = await runInDurableObject(stub, (_instance, state) => {
    const s = seedPlayer({ sql: state.storage.sql, clock: { t: Date.now() } }, n, { creatures: 2 });
    state.storage.sql.exec(
      `INSERT INTO player_progress (user_id, starter_species) VALUES (?, 'splashet')
       ON CONFLICT(user_id) DO UPDATE SET starter_species = excluded.starter_species`,
      s.id,
    );
    return s;
  });
  const secret = await stub.createSession(
    guildId,
    { id: seeded.id, displayName: seeded.name },
    null,
  );
  return { id: seeded.id, token: await tokenFor(guildId, secret) };
}

function api(player: Player, path: string, method = 'GET', body?: unknown): Promise<Response> {
  return callHandler(
    handler,
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { Authorization: `Bearer ${player.token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

async function ticketFor(player: Player): Promise<string> {
  const res = await api(player, TICKET_PATH, 'POST');
  expect(res.status).toBe(200);
  return (await res.json<{ ticket: string }>()).ticket;
}

function upgrade(ticket: string, extra = ''): Promise<Response> {
  return callHandler(
    handler,
    new Request(`${ORIGIN}${LIVE_PATH}?ticket=${ticket}${extra}`, {
      headers: { Upgrade: 'websocket' },
    }),
  );
}

interface Live {
  ws: WebSocket;
  messages: Record<string, unknown>[];
  texts: string[];
  closed: { code: number } | null;
}

/** The client end of an accepted upgrade response, recording what arrives. */
function listen(res: Response): Live {
  const ws = res.webSocket;
  if (ws === null) throw new Error('no websocket in the response');
  ws.accept();
  const live: Live = { ws, messages: [], texts: [], closed: null };
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

async function connect(player: Player): Promise<Live> {
  const res = await upgrade(await ticketFor(player));
  expect(res.status).toBe(101);
  const live = listen(res);
  await until(() => live.messages.some((m) => m['type'] === 'hello'));
  return live;
}

const residents = (live: Live) => live.messages.filter((m) => m['type'] === 'resident');

describe('the LOUNGE_LIVE flag: configuration', () => {
  it('is on locally and on staging, and off in production', () => {
    const config = parseWrangler();
    expect(config.vars['LOUNGE_LIVE']).toBe('on');
    expect(config.env['staging']?.vars['LOUNGE_LIVE']).toBe('on');
    expect(config.env['production']?.vars['LOUNGE_LIVE']).toBe('off');
  });

  it('tells the client through /api/config only when on', async () => {
    const on = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect((await on.json<Record<string, unknown>>())['loungeLive']).toBe(true);
    const offEnv = { ...env, LOUNGE_LIVE: 'off' } as Env;
    const off = await handler.fetch?.(new Request(`${ORIGIN}/api/config`), offEnv, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as never);
    expect(Object.hasOwn((await off?.json()) as object, 'loungeLive')).toBe(false);
  });

  it('makes the Worker answer 404 on the socket route when off', async () => {
    const offEnv = { ...env, LOUNGE_LIVE: 'off' } as Env;
    const res = await handler.fetch?.(
      new Request(`${ORIGIN}${LIVE_PATH}?ticket=x`, {
        headers: { Upgrade: 'websocket' },
      }),
      offEnv,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as never,
    );
    expect(res?.status).toBe(404);
  });

  it('makes the object answer 404 on the ticket and the socket route when off, and push nothing', async () => {
    const guildId = nextGuild();
    await join(guildId, 1);
    await runInDurableObject(stubOf(guildId), async (_instance, state) => {
      const off = new LoungeLive({
        ctx: state,
        enabled: false,
        clientSecret: 'test-only-client-secret',
        guildId: () => guildId,
        now: Date.now,
        residentOf: () => {
          throw new Error('must not be read');
        },
      });
      expect(off.enabled()).toBe(false);
      const res = await off.upgrade(
        new Request(`${ORIGIN}${LIVE_PATH}?ticket=x`, { headers: { Upgrade: 'websocket' } }),
      );
      expect(res.status).toBe(404);
      off.notify('1');
    });
    await runCore(guildId, async (ctx) => {
      const secret = await ctx.core.createSession(guildId, { id: '1', displayName: 'A' });
      const ticket = await ctx.request(secret, TICKET_PATH, 'POST');
      expect(ticket.status).toBe(404);
    });
  });
});

describe('auth', () => {
  it('needs a session to get a ticket', async () => {
    const res = await callHandler(
      handler,
      new Request(`${ORIGIN}${TICKET_PATH}`, { method: 'POST' }),
    );
    expect(res.status).toBe(401);
  });

  it('refuses an upgrade without a ticket, with a forged one or one that is not an upgrade', async () => {
    const guildId = nextGuild();
    const player = await join(guildId, 1);
    const ticket = await ticketFor(player);
    const none = await callHandler(
      handler,
      new Request(`${ORIGIN}${LIVE_PATH}`, { headers: { Upgrade: 'websocket' } }),
    );
    expect(none.status).toBe(401);
    // A valid shape with a broken MAC never reaches an object.
    const forged = await upgrade(`${ticket.slice(0, -1)}${ticket.endsWith('A') ? 'B' : 'A'}`);
    expect(forged.status).toBe(401);
    // A session token is not a ticket.
    const asSession = await upgrade(player.token);
    expect(asSession.status).toBe(401);
    // Extra query keys are refused.
    const extra = await upgrade(ticket, '&user=222222222222222222');
    expect(extra.status).toBe(401);
    // Not an upgrade.
    const plain = await callHandler(handler, new Request(`${ORIGIN}${LIVE_PATH}?ticket=${ticket}`));
    expect(plain.status).toBe(426);
    // The refused tries did not use the ticket up.
    expect((await upgrade(ticket)).status).toBe(101);
  });

  it('works once: a second use of the same ticket is refused', async () => {
    const guildId = nextGuild();
    const player = await join(guildId, 1);
    const ticket = await ticketFor(player);
    const first = await upgrade(ticket);
    expect(first.status).toBe(101);
    listen(first).ws.close(1000);
    expect((await upgrade(ticket)).status).toBe(401);
  });

  it('refuses a ticket of another guild (a valid MAC, the wrong object)', async () => {
    const a = nextGuild();
    const b = nextGuild();
    const playerA = await join(a, 1);
    await join(b, 2);
    const ticket = await ticketFor(playerA);
    // Re-address it: the guild id is part of the MAC, so changing it fails at the Worker.
    const moved = ticket.replace(`.${a}.`, `.${b}.`);
    expect((await upgrade(moved)).status).toBe(401);
  });
});

describe('tickets', () => {
  const secretOf = (ticket: string) => parseTicket(ticket)?.secret ?? '';

  it('expire after 30 s and work once', async () => {
    const clock = { t: 1000 };
    const book = new TicketBook('test-only-client-secret', () => clock.t);
    const guildId = nextGuild();
    const fresh = await book.mint(guildId, '1');
    const late = await book.mint(guildId, '2');
    expect(await book.redeem(secretOf(fresh))).toBe('1');
    expect(await book.redeem(secretOf(fresh))).toBeNull();
    clock.t += TICKET_TTL_MS;
    expect(await book.redeem(secretOf(late))).toBeNull();
  });

  it('are bounded: the oldest are dropped', async () => {
    const book = new TicketBook('test-only-client-secret', () => 1000);
    const guildId = nextGuild();
    const first = await book.mint(guildId, '1');
    for (let i = 0; i < TICKET_MAX_PENDING; i++) await book.mint(guildId, '2');
    expect(book.size()).toBe(TICKET_MAX_PENDING);
    expect(await book.redeem(secretOf(first))).toBeNull();
  });
});

describe('push', () => {
  it("sends one player's change to the guild's other sockets, never to another guild", async () => {
    const guildA = nextGuild();
    const guildB = nextGuild();
    const [a1, a2, a3] = await Promise.all([join(guildA, 1), join(guildA, 2), join(guildA, 3)]);
    const b1 = await join(guildB, 9);
    const liveA1 = await connect(a1);
    const liveA2 = await connect(a2);
    const liveA2second = await connect(a2);
    const liveB1 = await connect(b1);

    const res = await api(a3, '/api/lounge-spot', 'PUT', { spotId: 'couch-middle' });
    expect(res.status).toBe(200);

    await until(() => residents(liveA1).length === 1 && residents(liveA2).length === 1);
    const pushed = residents(liveA1)[0]?.['resident'] as Record<string, unknown>;
    expect(pushed['userId']).toBe(a3.id);
    expect((pushed['spot'] as Record<string, unknown>)['id']).toBe('couch-middle');
    expect((pushed['creature'] as Record<string, unknown>)['species']).toBeTypeOf('string');
    await until(() => residents(liveA2second).length === 1);
    // Nothing for the other guild.
    await sleep(50);
    expect(residents(liveB1)).toHaveLength(0);
    for (const l of [liveA1, liveA2, liveA2second, liveB1]) l.ws.close(1000);
  });

  it('does not send a change back to its own player, and sends nothing for a change of nothing', async () => {
    const guildId = nextGuild();
    const [p1, p2] = await Promise.all([join(guildId, 1), join(guildId, 2)]);
    const own = await connect(p1);
    const other = await connect(p2);
    expect((await api(p1, '/api/lounge-spot', 'PUT', { spotId: 'couch-left' })).status).toBe(200);
    await until(() => residents(other).length === 1);
    // The player's own socket stays quiet.
    expect(residents(own)).toHaveLength(0);
    // The same lounger again changes nothing: no second push.
    const mine = await (await api(p1, '/api/state')).json<{ loungerId: string }>();
    expect((await api(p1, '/api/lounger', 'PUT', { creatureId: mine.loungerId })).status).toBe(200);
    await sleep(50);
    expect(residents(other)).toHaveLength(1);
    // Reads sent as POST are not changes.
    expect((await api(p1, '/api/room', 'POST', { userIds: [p2.id] })).status).toBe(200);
    await sleep(50);
    expect(residents(other)).toHaveLength(1);
    own.ws.close(1000);
    other.ws.close(1000);
  });
});

describe('the socket', () => {
  it('answers a ping with a pong without involving the object, and sets the auto-response', async () => {
    const guildId = nextGuild();
    const player = await join(guildId, 1);
    const live = await connect(player);
    live.ws.send('ping');
    await until(() => live.texts.includes('pong'));
    const pair = await runInDurableObject(stubOf(guildId), (_i, state) => {
      const p = state.getWebSocketAutoResponse();
      return [p?.request, p?.response];
    });
    expect(pair).toEqual(['ping', 'pong']);
    live.ws.close(1000);
  });

  it('closes a socket that sends anything but a ping', async () => {
    const guildId = nextGuild();
    const player = await join(guildId, 1);
    const live = await connect(player);
    live.ws.send(JSON.stringify({ type: 'move', spotId: 'couch-middle' }));
    await until(() => live.closed !== null);
    expect(live.closed?.code).toBe(CLOSE_PROTOCOL);
  });

  it('keeps at most 3 sockets per player: the oldest is closed as replaced', async () => {
    const guildId = nextGuild();
    const player = await join(guildId, 1);
    const lives: Live[] = [];
    for (let i = 0; i <= MAX_SOCKETS_PER_USER; i++) lives.push(await connect(player));
    await until(() => lives[0]?.closed !== null);
    expect(lives[0]?.closed?.code).toBe(CLOSE_REPLACED);
    expect(lives.slice(1).every((l) => l.closed === null)).toBe(true);
    const open = await runInDurableObject(
      stubOf(guildId),
      (_i, state) => state.getWebSockets().length,
    );
    expect(open).toBe(MAX_SOCKETS_PER_USER);
    for (const l of lives) l.ws.close(1000);
  });

  it('refuses a socket over the guild cap with 503 (the client polls instead)', async () => {
    const guildId = nextGuild();
    await join(guildId, 1);
    const status = await runInDurableObject(stubOf(guildId), async (instance: GuildWorld) => {
      // Spread over players: each may hold 3.
      let n = 0;
      const open = async (): Promise<number> => {
        const user = String(800000000000000000n + BigInt(Math.floor(n / MAX_SOCKETS_PER_USER)));
        n++;
        const ticket = await instance.live.mintTicket(guildId, user);
        const res = await instance.live.upgrade(
          new Request(`${ORIGIN}${LIVE_PATH}?ticket=${ticket}`, {
            headers: { Upgrade: 'websocket' },
          }),
        );
        return res.status;
      };
      for (let i = 0; i < MAX_SOCKETS_PER_GUILD; i++) expect(await open()).toBe(101);
      return open();
    });
    expect(status).toBe(503);
  });

  it('closes stale sockets (no ping for too long) and forgets closed ones', async () => {
    const guildId = nextGuild();
    const [p1, p2] = await Promise.all([join(guildId, 1), join(guildId, 2)]);
    const stale = await connect(p1);
    const fresh = await connect(p2);
    const closedNow = await runInDurableObject(stubOf(guildId), (instance: GuildWorld) => {
      // From a clock that far ahead neither has pinged for too long.
      return instance.live.pruneStale(Date.now() + STALE_MS + 1);
    });
    expect(closedNow).toBe(2);
    await until(() => stale.closed !== null && fresh.closed !== null);
    expect(stale.closed?.code).toBe(CLOSE_STALE);
    const left = await runInDurableObject(
      stubOf(guildId),
      (_i, state) => state.getWebSockets().length,
    );
    expect(left).toBe(0);
  });

  it('does not close a live socket that is not stale', async () => {
    const guildId = nextGuild();
    const player = await join(guildId, 1);
    const live = await connect(player);
    const closedNow = await runInDurableObject(stubOf(guildId), (instance: GuildWorld) =>
      instance.live.pruneStale(Date.now()),
    );
    expect(closedNow).toBe(0);
    live.ws.close(1000);
    await until(() => live.closed !== null);
  });
});
