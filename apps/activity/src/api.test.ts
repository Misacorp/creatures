import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSession,
  fetchConfig,
  fetchRoom,
  jsonRequest,
  parseGameState,
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
      gear: null,
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

  it('parses a worn item with its main stat', () => {
    const gear = {
      id: 'g1',
      baseId: 'bark-band',
      rarity: 'rare',
      level: 3,
      enchantId: 'steady-hand',
      primary: { stat: 'atk', bp: 850 },
    };
    const parsed = parseRoom({
      residents: [{ ...resident, creature: { ...resident.creature, gear } }],
    });
    expect(parsed[0]?.creature?.gear).toEqual(gear);
    const plain = parseRoom({
      residents: [
        { ...resident, creature: { ...resident.creature, gear: { ...gear, enchantId: null } } },
      ],
    });
    expect(plain[0]?.creature?.gear?.enchantId).toBeNull();
  });

  it('refuses a missing or malformed worn item', () => {
    const gear = {
      id: 'g1',
      baseId: 'bark-band',
      rarity: 'rare',
      level: 3,
      enchantId: null,
      primary: { stat: 'atk', bp: 850 },
    };
    const withGear = (g: unknown) => ({
      residents: [{ ...resident, creature: { ...resident.creature, gear: g } }],
    });
    const noGear: Partial<typeof resident.creature> = { ...resident.creature };
    delete noGear.gear;
    expect(() => parseRoom({ residents: [{ ...resident, creature: noGear }] })).toThrow();
    expect(() => parseRoom(withGear(undefined))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, rarity: 'mythic' }))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, level: 1.5 }))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, enchantId: 4 }))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, id: 7 }))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, primary: undefined }))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, primary: { stat: 'luck', bp: 1 } }))).toThrow();
    expect(() => parseRoom(withGear({ ...gear, primary: { stat: 'atk', bp: 0.5 } }))).toThrow();
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
});
