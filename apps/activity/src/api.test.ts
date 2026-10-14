import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSession,
  fetchRoom,
  jsonRequest,
  parseGameState,
  parseRoom,
  setLounger,
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
