import { afterEach, describe, expect, it, vi } from 'vitest';
import evolveFixture from './fixtures/branches-evolve.json';
import evolveOtherFixture from './fixtures/branches-evolve-other.json';
import branchRequests from './fixtures/branches-request-bodies.json';
import {
  createSession,
  evolveCreature,
  fetchConfig,
  fetchFinaleTicket,
  fetchLedger,
  fetchRoom,
  finaleSocketUrl,
  loungeSocketUrl,
  parseLiveMessage,
  jsonRequest,
  parseGameState,
  parseAllowance,
  parseLoungeSpot,
  parseRoom,
  setLounger,
  setLoungeSpot,
} from './api';

describe('jsonRequest', () => {
  it('sends the body as JSON with one content type', () => {
    expect(jsonRequest('POST', { a: 1, b: ['x'] })).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1,"b":["x"]}',
    });
  });

  it('keeps the method the route wants', () => {
    expect(jsonRequest('PUT', {}).method).toBe('PUT');
    expect(jsonRequest('PATCH', { nickname: 'Bo' }).method).toBe('PATCH');
    expect(jsonRequest('DELETE', { creatureId: 'c1' }).body).toBe('{"creatureId":"c1"}');
  });

  it('encodes a null body as the JSON null, like the old helpers did', () => {
    expect(jsonRequest('POST', null).body).toBe('null');
  });
});

describe('the living room answers', () => {
  const resident = {
    userId: '1',
    name: 'Misa',
    creature: {
      id: 'c1',
      species: 'splashet',
      shiny: false,
      level: 12,
      nickname: null,
      quirk: null,
      craftingLevel: 3,
      explorerRank: 2,
      firstOnServer: false,
      gear: [],
    },
  };

  it('parses the residents, with a creature or without one', () => {
    const parsed = parseRoom({
      residents: [resident, { ...resident, userId: '2', creature: null }],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.creature).toBeNull();
    expect(parseRoom({ residents: [] })).toEqual([]);
  });

  it('parses the "First on server" flag and rejects an answer without it', () => {
    const flagged = parseRoom({
      residents: [{ ...resident, creature: { ...resident.creature, firstOnServer: true } }],
    });
    expect(flagged[0]?.creature?.firstOnServer).toBe(true);
    const without: Partial<typeof resident.creature> = { ...resident.creature };
    delete without.firstOnServer;
    expect(() => parseRoom({ residents: [{ ...resident, creature: without }] })).toThrow();
  });

  it('parses the worn items with the text of their lines', () => {
    const gear = {
      id: 'g1',
      baseId: 'kelp-cap',
      slot: 'hat',
      rarity: 'rare',
      itemLevel: 7,
      lines: ['Attack +2%', 'Tide Hunter +7%'],
    };
    const parsed = parseRoom({
      residents: [{ ...resident, creature: { ...resident.creature, gear: [gear] } }],
    });
    expect(parsed[0]?.creature?.gear).toEqual([gear]);
    const plain = parseRoom({
      residents: [{ ...resident, creature: { ...resident.creature, gear: [] } }],
    });
    expect(plain[0]?.creature?.gear).toEqual([]);
  });

  it('refuses a missing or malformed worn item', () => {
    const gear = {
      id: 'g1',
      baseId: 'kelp-cap',
      slot: 'hat',
      rarity: 'rare',
      itemLevel: 7,
      lines: ['Attack +2%'],
    };
    const withGear = (g: unknown) => ({
      residents: [{ ...resident, creature: { ...resident.creature, gear: g } }],
    });
    const noGear: Partial<typeof resident.creature> = { ...resident.creature };
    delete noGear.gear;
    expect(() => parseRoom({ residents: [{ ...resident, creature: noGear }] })).toThrow();
    expect(() => parseRoom(withGear(undefined))).toThrow();
    expect(() => parseRoom(withGear(null))).toThrow();
    expect(() => parseRoom(withGear([{ ...gear, rarity: 'mythic' }]))).toThrow();
    expect(() => parseRoom(withGear([{ ...gear, slot: 'boots' }]))).toThrow();
    expect(() => parseRoom(withGear([{ ...gear, itemLevel: 1.5 }]))).toThrow();
    expect(() => parseRoom(withGear([{ ...gear, id: 7 }]))).toThrow();
    expect(() => parseRoom(withGear([{ ...gear, lines: undefined }]))).toThrow();
    expect(() => parseRoom(withGear([{ ...gear, lines: [4] }]))).toThrow();
  });

  it('refuses a shape that is wrong', () => {
    expect(() => parseRoom(null)).toThrow();
    expect(() => parseRoom({})).toThrow();
    expect(() => parseRoom({ residents: [{ ...resident, name: 3 }] })).toThrow();
    expect(() => parseRoom({ residents: [{ ...resident, creature: undefined }] })).toThrow();
    expect(() =>
      parseRoom({ residents: [{ ...resident, creature: { ...resident.creature, level: 1.5 } }] }),
    ).toThrow();
    expect(() =>
      parseRoom({
        residents: [{ ...resident, creature: { ...resident.creature, craftingLevel: '3' } }],
      }),
    ).toThrow();
  });
});

describe('loungerId in the state', () => {
  const base = {
    serverNow: 5,
    balances: { bait: 1, essence: 0 },
    starterChosen: true,
    creatures: [],
    expeditions: [],
    cancelled: [],
    slots: { total: 3, used: 0, rankSum: 0, tripsFinished: 0, next: null },
    supplies: {},
    trainingMedianLevel: null,
    serverFirsts: [],
    pending: [],
    bookSlotBait: 10,
  };

  it('is a creature id or null', () => {
    expect(parseGameState({ ...base, loungerId: 'c1' }).loungerId).toBe('c1');
    expect(parseGameState({ ...base, loungerId: null }).loungerId).toBeNull();
  });

  it('is required and must be text or null', () => {
    expect(() => parseGameState(base)).toThrow();
    expect(() => parseGameState({ ...base, loungerId: 7 })).toThrow();
  });
});

describe('the chosen lounge spot', () => {
  it('is null, or an id of the room with the time it was chosen', () => {
    expect(parseLoungeSpot(null)).toBeNull();
    expect(parseLoungeSpot({ id: 'couch-left', at: 1234 })).toEqual({ id: 'couch-left', at: 1234 });
  });

  it('counts a missing field as no choice (an older answer)', () => {
    expect(parseLoungeSpot(undefined)).toBeNull();
  });

  it('treats an id the room art does not have as no choice, instead of failing', () => {
    expect(parseLoungeSpot({ id: 'a-spot-that-was-removed', at: 5 })).toBeNull();
  });

  it('refuses a wrong shape', () => {
    expect(() => parseLoungeSpot('couch-left')).toThrow();
    expect(() => parseLoungeSpot({ id: 'couch-left' })).toThrow();
    expect(() => parseLoungeSpot({ id: 7, at: 5 })).toThrow();
    expect(() => parseLoungeSpot({ id: 'couch-left', at: 1.5 })).toThrow();
    expect(() => parseLoungeSpot({ id: 'couch-left', at: '5' })).toThrow();
  });

  const base = {
    serverNow: 5,
    balances: { bait: 1, essence: 0 },
    starterChosen: true,
    creatures: [],
    expeditions: [],
    cancelled: [],
    slots: { total: 3, used: 0, rankSum: 0, tripsFinished: 0, next: null },
    supplies: {},
    trainingMedianLevel: null,
    serverFirsts: [],
    pending: [],
    bookSlotBait: 10,
    loungerId: null,
  };

  it('is read from the state, and a stale id does not break the state', () => {
    const spot = { id: 'fire-pouf', at: 99 };
    expect(parseGameState({ ...base, loungeSpot: spot }).loungeSpot).toEqual(spot);
    expect(parseGameState({ ...base, loungeSpot: null }).loungeSpot).toBeNull();
    expect(parseGameState(base).loungeSpot).toBeNull();
    expect(parseGameState({ ...base, loungeSpot: { id: 'gone', at: 1 } }).loungeSpot).toBeNull();
    expect(() => parseGameState({ ...base, loungeSpot: { id: 'fire-pouf' } })).toThrow();
  });

  it('reads the attention block of the state: absent is unknown, a wrong shape throws', () => {
    const attention = { dungeon: true, raid: false, recheckAt: 1_700_000_000_000 };
    expect(parseGameState({ ...base, attention }).attention).toEqual(attention);
    expect(
      parseGameState({ ...base, attention: { dungeon: false, raid: true, recheckAt: null } })
        .attention,
    ).toEqual({ dungeon: false, raid: true, recheckAt: null });
    expect(
      parseGameState({ ...base, attention: { dungeon: false, raid: true } }).attention,
    ).toEqual({ dungeon: false, raid: true, recheckAt: null });
    expect(parseGameState(base).attention).toBeNull();
    expect(parseGameState({ ...base, attention: null }).attention).toBeNull();
    expect(() => parseGameState({ ...base, attention: 'yes' })).toThrow();
    expect(() =>
      parseGameState({ ...base, attention: { dungeon: 1, raid: false, recheckAt: null } }),
    ).toThrow();
    expect(() =>
      parseGameState({ ...base, attention: { dungeon: true, raid: false, recheckAt: 1.5 } }),
    ).toThrow();
    expect(() =>
      parseGameState({ ...base, attention: { dungeon: true, raid: false, recheckAt: '5' } }),
    ).toThrow();
  });

  it('is read from each resident of the room', () => {
    const resident = { userId: '1', name: 'Misa', creature: null };
    const parsed = parseRoom({
      residents: [
        { ...resident, spot: { id: 'couch-left', at: 7 } },
        { ...resident, userId: '2', spot: null },
        { ...resident, userId: '3' },
        { ...resident, userId: '4', spot: { id: 'gone', at: 7 } },
      ],
    });
    expect(parsed.map((r) => r.spot)).toEqual([{ id: 'couch-left', at: 7 }, null, null, null]);
    expect(() => parseRoom({ residents: [{ ...resident, spot: 'couch-left' }] })).toThrow();
  });
});

describe('the lounger and room requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Signs in against a stub, so the authed requests have a token to send. */
  async function signIn(): Promise<void> {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({
          sessionToken: 't',
          accessToken: 'a',
          guildId: 'g',
          user: { id: '1', displayName: 'Misa' },
        }),
      ),
    );
    await createSession('code', 'instance');
  }

  it('PUTs { creatureId } and returns the new lounger', async () => {
    await signIn();
    const sent: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
      sent.push({ path, init });
      return Promise.resolve(Response.json({ loungerId: 'c9' }));
    });
    expect(await setLounger('c9')).toBe('c9');
    expect(sent[sent.length - 1]?.path).toBe('/api/lounger');
    expect(sent[sent.length - 1]?.init.method).toBe('PUT');
    expect(sent[sent.length - 1]?.init.body).toBe('{"creatureId":"c9"}');
  });

  it('PUTs { spotId } to /api/lounge-spot and returns the stored choice', async () => {
    await signIn();
    const sent: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
      sent.push({ path, init });
      return Promise.resolve(Response.json({ spot: { id: 'couch-left', at: 42 } }));
    });
    expect(await setLoungeSpot('couch-left')).toEqual({ id: 'couch-left', at: 42 });
    const last = sent[sent.length - 1];
    expect(last?.path).toBe('/api/lounge-spot');
    expect(last?.init.method).toBe('PUT');
    expect(last?.init.body).toBe('{"spotId":"couch-left"}');
  });

  it('clears the choice with null and accepts a null answer', async () => {
    await signIn();
    const sent: { init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (_path: string, init: RequestInit) => {
      sent.push({ init });
      return Promise.resolve(Response.json({ spot: null }));
    });
    expect(await setLoungeSpot(null)).toBeNull();
    expect(sent[sent.length - 1]?.init.body).toBe('{"spotId":null}');
  });

  it('refuses a lounge spot answer without the spot', async () => {
    await signIn();
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({})));
    await expect(setLoungeSpot('couch-left')).rejects.toThrow();
  });

  it('POSTs { userIds } to /api/room and checks the answer', async () => {
    await signIn();
    const sent: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
      sent.push({ path, init });
      return Promise.resolve(Response.json({ residents: [] }));
    });
    expect(await fetchRoom(['1', '2'])).toEqual([]);
    expect(sent[sent.length - 1]?.path).toBe('/api/room');
    expect(sent[sent.length - 1]?.init.body).toBe('{"userIds":["1","2"]}');
  });
});

describe('the evolve request (real server output: fixtures/branches-*)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function signIn(): Promise<void> {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({
          sessionToken: 't',
          accessToken: 'a',
          guildId: 'g',
          user: { id: '1', displayName: 'Misa' },
        }),
      ),
    );
    await createSession('code', 'instance');
  }

  function answer(body: unknown): { path: string; init: RequestInit }[] {
    const sent: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
      sent.push({ path, init });
      return Promise.resolve(Response.json(body));
    });
    return sent;
  }

  it('POSTs the form and the key to the creature, in the body the server accepted', async () => {
    await signIn();
    const sent = answer(evolveFixture);
    const request = branchRequests['branches-evolve'];
    const id = request.path.split('/')[3] ?? '';
    const done = await evolveCreature(id, request.body.species, request.body.idempotencyKey);
    expect(done.species).toBe('sunfawn');
    expect(done.unequipped).toBe(0);
    expect(done.state.creatures.some((c) => c.species === 'sunfawn')).toBe(true);
    const last = sent[sent.length - 1];
    expect(last?.path).toBe(request.path);
    expect(last?.init.method).toBe(request.method);
    expect(JSON.parse((last?.init.body ?? '') as string)).toEqual(request.body);
  });

  it('reads the other form, and the count of items that came off (none from an older server)', async () => {
    await signIn();
    answer(evolveOtherFixture);
    expect((await evolveCreature('c', 'thornbuck', 'k')).species).toBe('thornbuck');
    answer({ ...evolveOtherFixture, unequipped: undefined });
    expect((await evolveCreature('c', 'thornbuck', 'k')).unequipped).toBe(0);
    answer({ ...evolveOtherFixture, unequipped: 2 });
    expect((await evolveCreature('c', 'thornbuck', 'k')).unequipped).toBe(2);
  });

  it('refuses an answer of the wrong shape', async () => {
    await signIn();
    answer({ ...evolveFixture, species: 7 });
    await expect(evolveCreature('c', 'sunfawn', 'k')).rejects.toThrow();
    answer({ species: 'sunfawn', state: evolveFixture.state });
    await expect(evolveCreature('c', 'sunfawn', 'k')).rejects.toThrow();
  });
});

describe('the public config', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const base = { discordClientId: '1', environment: 'staging', version: 'abc', leetSource: 'http' };

  it('reads the deployed branch', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, branch: 'feature/x' })));
    expect((await fetchConfig()).branch).toBe('feature/x');
  });

  it('reads a missing or odd branch as null', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(base)));
    expect((await fetchConfig()).branch).toBeNull();
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, branch: 7 })));
    expect((await fetchConfig()).branch).toBeNull();
  });

  it('reads the live socket flag: only an explicit true counts', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, loungeLive: true })));
    expect((await fetchConfig()).loungeLive).toBe(true);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(base)));
    expect((await fetchConfig()).loungeLive).toBe(false);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, loungeLive: 'on' })));
    expect((await fetchConfig()).loungeLive).toBe(false);
  });
});

describe('the finale live flag', () => {
  it('reads finaleLive: only an explicit true counts, apart from the lounge flag', async () => {
    const base = {
      discordClientId: '1',
      environment: 'local',
      version: 'dev',
      leetSource: 'mock',
    };
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, finaleLive: true })));
    const on = await fetchConfig();
    expect(on.finaleLive).toBe(true);
    expect(on.loungeLive).toBe(false);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(base)));
    expect((await fetchConfig()).finaleLive).toBe(false);
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...base, finaleLive: 'on' })));
    expect((await fetchConfig()).finaleLive).toBe(false);
  });
});

describe('the finale live socket messages', () => {
  const snapshot = { status: 'none', serverNow: 9 };

  it('reads a finale push and hands the snapshot on for its own check', () => {
    expect(parseLiveMessage(JSON.stringify({ v: 1, type: 'finale', snapshot }))).toEqual({
      type: 'finale',
      snapshot,
    });
  });

  it('allows a big snapshot (up to 1 MB, where hello and resident stop at 64 KB)', () => {
    const big = { ...snapshot, events: 'x'.repeat(200_000) };
    expect(
      parseLiveMessage(JSON.stringify({ v: 1, type: 'finale', snapshot: big })),
    ).not.toBeNull();
    const huge = { ...snapshot, events: 'x'.repeat(1_100_000) };
    expect(parseLiveMessage(JSON.stringify({ v: 1, type: 'finale', snapshot: huge }))).toBeNull();
  });

  it.each([
    JSON.stringify({ v: 1, type: 'finale' }),
    JSON.stringify({ v: 1, type: 'finale', snapshot: 'x' }),
    JSON.stringify({ v: 1, type: 'finale', snapshot: [] }),
    JSON.stringify({ v: 2, type: 'finale', snapshot: {} }),
  ])('ignores %#', (text) => {
    expect(parseLiveMessage(text)).toBeNull();
  });

  it('builds the finale address and asks for a ticket naming the party', async () => {
    expect(finaleSocketUrl('t', { protocol: 'https:', host: 'x.discordsays.com' })).toBe(
      'wss://x.discordsays.com/api/finale/live?ticket=t',
    );
    let seen: { url: string; body: unknown } | null = null;
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(init.body as string) };
      return Promise.resolve(Response.json({ ticket: 'abc' }));
    });
    expect(await fetchFinaleTicket('2027-W02', 3)).toBe('abc');
    expect(seen).toEqual({ url: '/api/finale/ticket', body: { week: '2027-W02', party: 3 } });
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ nope: 1 })));
    await expect(fetchFinaleTicket('2027-W02', 3)).rejects.toThrow();
  });
});

describe('the lounge live socket messages', () => {
  const resident = {
    userId: '1',
    name: 'Misa',
    creature: null,
    spot: { id: 'couch-middle', at: 5 },
  };

  it('reads hello and a resident', () => {
    expect(parseLiveMessage(JSON.stringify({ v: 1, type: 'hello', serverNow: 7 }))).toEqual({
      type: 'hello',
      serverNow: 7,
    });
    const message = parseLiveMessage(JSON.stringify({ v: 1, type: 'resident', resident }));
    expect(message).toEqual({ type: 'resident', resident });
  });

  it('reads a lounge-xp push of exactly its shape', () => {
    const push = { creatureId: 'c1', paid: 35, level: 5, exp: 12, waiting: false };
    expect(parseLiveMessage(JSON.stringify({ v: 1, type: 'lounge-xp', ...push }))).toEqual({
      type: 'lounge-xp',
      ...push,
    });
  });

  const xp = {
    v: 1,
    type: 'lounge-xp',
    creatureId: 'c1',
    paid: 35,
    level: 5,
    exp: 12,
    waiting: false,
  };
  it.each([
    { ...xp, extra: 1 },
    { ...xp, creatureId: 7 },
    { ...xp, creatureId: '' },
    { ...xp, paid: -1 },
    { ...xp, paid: 1.5 },
    { ...xp, level: 0 },
    { ...xp, exp: '3' },
    { ...xp, waiting: 0 },
    { ...xp, creatureId: 'x'.repeat(65) },
    Object.fromEntries(Object.entries(xp).filter(([k]) => k !== 'exp')),
  ])('rejects a lounge-xp push of another shape (%#)', (data) => {
    expect(parseLiveMessage(JSON.stringify(data))).toBeNull();
  });

  it.each([
    'not json',
    '[]',
    JSON.stringify({ v: 2, type: 'hello', serverNow: 7 }),
    JSON.stringify({ v: 1, type: 'hello', serverNow: 'x' }),
    JSON.stringify({ v: 1, type: 'other' }),
    JSON.stringify({ v: 1, type: 'resident', resident: { userId: 1 } }),
    JSON.stringify({ v: 1, type: 'resident' }),
    `{"v":1,"type":"hello","serverNow":1,"pad":"${'x'.repeat(70_000)}"}`,
  ])('ignores %#', (text) => {
    expect(parseLiveMessage(text)).toBeNull();
  });

  it('builds a relative wss address on the page host, with the ticket escaped', () => {
    expect(loungeSocketUrl('l1.a b', { protocol: 'https:', host: '1.discordsays.com' })).toBe(
      'wss://1.discordsays.com/api/lounge/live?ticket=l1.a%20b',
    );
    expect(loungeSocketUrl('t', { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/api/lounge/live?ticket=t',
    );
  });
});

describe('the daily allowance of /api/me', () => {
  it('parses a well-formed allowance', () => {
    expect(parseAllowance({ day: '2026-10-20', amount: 25 })).toEqual({
      day: '2026-10-20',
      amount: 25,
    });
  });

  it('is null when there is nothing new or the shape is wrong', () => {
    for (const bad of [
      null,
      undefined,
      'x',
      [],
      {},
      { day: '2026-10-20' },
      { day: '2026-10-20', amount: 0 },
      { day: '2026-10-20', amount: -5 },
      { day: '2026-10-20', amount: 2.5 },
      { day: '2026-10-20', amount: '25' },
      { day: 'yesterday', amount: 25 },
    ]) {
      expect(parseAllowance(bad)).toBeNull();
    }
  });
});

describe('the ledger request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the server for Bait credits only when told to, so spends never crowd out income', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve(Response.json({ entries: [] }));
    });
    await fetchLedger(10, true);
    await fetchLedger(20);
    expect(urls[0]).toContain('/api/ledger?limit=10&credits=bait');
    expect(urls[1]).toContain('/api/ledger?limit=20');
    expect(urls[1]).not.toContain('credits');
  });
});
