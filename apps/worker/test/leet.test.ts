import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LeetSourceError,
  createHttpLeetSource,
  createLeetSourceFromEnv,
  createMockLeetSource,
  parseLeetPage,
  type LeetDaysPage,
  type LeetSource,
} from '../src/leet';
import { captureConsole } from './kit';

const GUILD = '123456789012345678';
const TZ = 'Europe/Helsinki';
const USER_1 = '234567890123456789';
const USER_2 = '345678901234567890';

const validPage = {
  guildId: GUILD,
  days: [
    {
      id: `${GUILD}:2026-10-09`,
      date: '2026-10-09',
      participants: [
        { userId: USER_1, leetAt: '2026-10-09T10:37:12.345Z', extra: 'ignored' },
        { userId: USER_2, leetAt: '2026-10-09T10:37:40.002Z' },
      ],
    },
    { id: `${GUILD}:2026-10-10`, date: '2026-10-10', participants: [] },
  ],
  nextCursor: 'eyJkIjoiMjAyNi0xMC0xMCJ9',
  hasMore: false,
  somethingNew: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('parseLeetPage', () => {
  it('accepts the documented shape and ignores extra upstream keys', () => {
    const page = parseLeetPage(GUILD, validPage);
    expect(page.days).toHaveLength(2);
    expect(page.days[0]?.participants).toEqual([
      { userId: USER_1, leetAt: '2026-10-09T10:37:12.345Z' },
      { userId: USER_2, leetAt: '2026-10-09T10:37:40.002Z' },
    ]);
    expect(page.nextCursor).toBe('eyJkIjoiMjAyNi0xMC0xMCJ9');
    expect(page.hasMore).toBe(false);
  });

  it('allows a null cursor', () => {
    expect(
      parseLeetPage(GUILD, { days: [], nextCursor: null, hasMore: false }).nextCursor,
    ).toBeNull();
  });

  it('counts a user once per day', () => {
    const page = parseLeetPage(GUILD, {
      days: [
        {
          id: `${GUILD}:2026-10-09`,
          date: '2026-10-09',
          participants: [
            { userId: USER_1, leetAt: 'a' },
            { userId: USER_1, leetAt: 'b' },
          ],
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    expect(page.days[0]?.participants).toEqual([{ userId: USER_1, leetAt: 'a' }]);
  });

  const day = (over: Record<string, unknown>) => ({
    days: [
      {
        id: `${GUILD}:2026-10-09`,
        date: '2026-10-09',
        participants: [{ userId: USER_1, leetAt: 'x' }],
        ...over,
      },
    ],
    nextCursor: null,
    hasMore: false,
  });

  it.each([
    ['not an object', 'nope'],
    ['missing days', { nextCursor: null, hasMore: false }],
    ['missing hasMore', { days: [], nextCursor: null }],
    ['bad day id', day({ id: 'abc:2026-10-09' })],
    ['id and date disagree', day({ id: `${GUILD}:2026-10-08` })],
    ['day of another guild', day({ id: `999999999999999999:2026-10-09` })],
    ['bad date format', day({ id: `${GUILD}:2026-1-9`, date: '2026-1-9' })],
    ['impossible date', day({ id: `${GUILD}:2026-02-30`, date: '2026-02-30' })],
    ['non-snowflake user', day({ participants: [{ userId: 'bob', leetAt: 'x' }] })],
    ['numeric user id', day({ participants: [{ userId: 234567890123456800, leetAt: 'x' }] })],
    ['too many days', { days: Array(101).fill(day({}).days[0]), nextCursor: null, hasMore: false }],
  ])('rejects %s', (_name, data) => {
    expect(() => parseLeetPage(GUILD, data)).toThrow(LeetSourceError);
  });
});

describe('createHttpLeetSource', () => {
  interface Call {
    url: string;
    headers: Headers;
  }

  function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        headers: new Headers(init?.headers),
      };
      calls.push(call);
      return Promise.resolve(respond(call));
    }) as typeof fetch;
    return { fn, calls };
  }

  const make = (f: typeof fetch, extra: { timeoutMs?: number; baseUrl?: string } = {}) =>
    createHttpLeetSource({
      baseUrl: extra.baseUrl ?? 'https://leet.test/',
      apiKey: 'test-key',
      fetch: f,
      ...(extra.timeoutMs === undefined ? {} : { timeoutMs: extra.timeoutMs }),
    });

  it('calls the contract URL with a bearer token and parses the page', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(validPage));
    const page = await make(fn).getDays(GUILD, { timezone: TZ, after: 'abc', limit: 50 });
    expect(page.days).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://leet.test/v1/guilds/${GUILD}/days?after=abc&limit=50`);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer test-key');
  });

  it('sends since only when there is no cursor', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(validPage));
    const source = make(fn);
    await source.getDays(GUILD, { timezone: TZ, since: '2026-10-03' });
    await source.getDays(GUILD, { timezone: TZ, after: 'abc', since: '2026-10-03' });
    expect(calls[0]?.url).toBe(`https://leet.test/v1/guilds/${GUILD}/days?since=2026-10-03`);
    expect(calls[1]?.url).toBe(`https://leet.test/v1/guilds/${GUILD}/days?after=abc`);
  });

  it('encodes cursors safely', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(validPage));
    await make(fn).getDays(GUILD, { timezone: TZ, after: 'a&b=c d' });
    expect(calls[0]?.url).toBe(`https://leet.test/v1/guilds/${GUILD}/days?after=a%26b%3Dc+d`);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'upstream'],
    [502, 'upstream'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const { fn } = fakeFetch(() => jsonResponse({ error: 'secret details' }, status));
    const err = await make(fn)
      .getDays(GUILD, { timezone: TZ })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeetSourceError);
    expect((err as LeetSourceError).kind).toBe(kind);
    expect((err as LeetSourceError).message).not.toContain('secret');
  });

  it('maps bad bodies to invalid_response', async () => {
    for (const respond of [
      () => new Response('not json', { status: 200 }),
      () => jsonResponse({ days: 'nope' }),
      () => jsonResponse({ ...validPage, days: [{ ...validPage.days[0], id: 'x' }] }),
    ]) {
      const { fn } = fakeFetch(respond);
      const err = await make(fn)
        .getDays(GUILD, { timezone: TZ })
        .catch((e: unknown) => e);
      expect((err as LeetSourceError).kind).toBe('invalid_response');
    }
  });

  it('maps network failures to network and never leaks the key', async () => {
    const fn = (() => Promise.reject(new Error('connect failed test-key'))) as typeof fetch;
    const err = await make(fn)
      .getDays(GUILD, { timezone: TZ })
      .catch((e: unknown) => e);
    expect((err as LeetSourceError).kind).toBe('network');
    expect((err as LeetSourceError).message).not.toContain('test-key');
  });

  it('times out', async () => {
    const fn = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      })) as typeof fetch;
    const err = await make(fn, { timeoutMs: 20 })
      .getDays(GUILD, { timezone: TZ })
      .catch((e: unknown) => e);
    expect((err as LeetSourceError).kind).toBe('timeout');
  });

  it('rejects a response from another guild', async () => {
    const { fn } = fakeFetch(() => jsonResponse(validPage));
    const err = await make(fn)
      .getDays('999999999999999999', { timezone: TZ })
      .catch((e: unknown) => e);
    expect((err as LeetSourceError).kind).toBe('invalid_response');
  });

  it('rejects bad guild ids before any request', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse(validPage));
    const err = await make(fn)
      .getDays('../x', { timezone: TZ })
      .catch((e: unknown) => e);
    expect((err as LeetSourceError).kind).toBe('invalid_request');
    expect(calls).toHaveLength(0);
  });

  it('builds requests the Workers runtime accepts (no unsupported redirect mode)', async () => {
    // Regression: `redirect: 'error'` throws in workerd before any request is sent.
    let built: Request | undefined;
    const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
      built = new Request(input, init);
      return Promise.resolve(jsonResponse(validPage));
    }) as typeof fetch;
    const page = await make(fn).getDays(GUILD, { timezone: TZ });
    expect(page.days).toHaveLength(2);
    expect(built?.redirect).toBe('manual');
  });

  it('never follows a redirect and reports it as an upstream error', async () => {
    const { fn } = fakeFetch(
      () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test/' } }),
    );
    const err: unknown = await make(fn)
      .getDays(GUILD, { timezone: TZ })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeetSourceError);
    expect((err as LeetSourceError).kind).toBe('upstream');
  });

  it('refuses non-https base URLs and empty keys', () => {
    const { fn } = fakeFetch(() => jsonResponse(validPage));
    expect(() => make(fn, { baseUrl: 'http://leet.test' })).toThrow();
    expect(() =>
      createHttpLeetSource({ baseUrl: 'https://leet.test', apiKey: '', fetch: fn }),
    ).toThrow();
  });
});

describe('createMockLeetSource', () => {
  // 2027-01-15 10:00 in Europe/Helsinki (UTC+2): before the 13:38 finalisation.
  const MORNING = Date.parse('2027-01-15T08:00:00Z');
  const players = [
    USER_1,
    USER_2,
    '456789012345678901',
    '567890123456789012',
    '678901234567890123',
  ];

  const make = (now: number, known: string[] = players, backfillDays = 7) =>
    createMockLeetSource({ now: () => now, knownPlayers: () => known, backfillDays });

  it('is deterministic', async () => {
    const a = await make(MORNING).getDays(GUILD, { timezone: TZ });
    const b = await make(MORNING).getDays(GUILD, { timezone: TZ });
    expect(a).toEqual(b);
  });

  it('starts backfillDays ago and stops at the last finalised date', async () => {
    const page = await make(MORNING).getDays(GUILD, { timezone: TZ });
    // Today (01-15) is not finalised before 13:38, so history ends on 01-14.
    expect(page.days.map((d) => d.date)).toEqual([
      '2027-01-08',
      '2027-01-09',
      '2027-01-10',
      '2027-01-11',
      '2027-01-12',
      '2027-01-13',
      '2027-01-14',
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.days[0]?.id).toBe(`${GUILD}:2027-01-08`);
    expect(page.nextCursor).not.toBeNull();
  });

  it('finalises a date exactly at 13:38 in the guild timezone (Europe/Helsinki)', async () => {
    // 13:37:59 EET = 11:37:59Z, 13:38:00 EET = 11:38:00Z.
    const before = await make(Date.parse('2027-01-15T11:37:59Z')).getDays(GUILD, {
      timezone: TZ,
      since: '2027-01-14',
    });
    const at = await make(Date.parse('2027-01-15T11:38:00Z')).getDays(GUILD, {
      timezone: TZ,
      since: '2027-01-14',
    });
    expect(before.days.map((d) => d.date)).toEqual(['2027-01-14']);
    expect(at.days.map((d) => d.date)).toEqual(['2027-01-14', '2027-01-15']);
  });

  it('finalises a date exactly at 13:38 New York time, in winter and summer', async () => {
    const NY = 'America/New_York';
    const dates = async (nowIso: string, since: string) =>
      (await make(Date.parse(nowIso)).getDays(GUILD, { timezone: NY, since })).days.map(
        (d) => d.date,
      );
    // Winter (EST, UTC-5): 13:38 is 18:38Z.
    expect(await dates('2027-01-15T18:37:59Z', '2027-01-14')).toEqual(['2027-01-14']);
    expect(await dates('2027-01-15T18:38:00Z', '2027-01-14')).toEqual(['2027-01-14', '2027-01-15']);
    // Summer (EDT, UTC-4): 13:38 is 17:38Z.
    expect(await dates('2027-07-01T17:37:59Z', '2027-07-01')).toEqual([]);
    expect(await dates('2027-07-01T17:38:00Z', '2027-07-01')).toEqual(['2027-07-01']);
  });

  it('places the mock leets at 13:37 New York time plus under a minute', async () => {
    const page = await make(MORNING).getDays(GUILD, {
      timezone: 'America/New_York',
      since: '2027-01-01',
      limit: 14,
    });
    let seen = 0;
    for (const day of page.days) {
      const base = Date.parse(`${day.date}T18:37:00Z`); // 13:37 EST
      for (const p of day.participants) {
        const offset = Date.parse(p.leetAt) - base;
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(60_000);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('starts the default backfill from the guild-local date', async () => {
    // 2027-01-16 02:00Z is still 2027-01-15 in New York (21:00 EST) but 2027-01-16 in Helsinki.
    const now = Date.parse('2027-01-16T02:00:00Z');
    const ny = await make(now).getDays(GUILD, { timezone: 'America/New_York' });
    const hel = await make(now).getDays(GUILD, { timezone: TZ });
    expect(ny.days[0]?.date).toBe('2027-01-08');
    expect(hel.days[0]?.date).toBe('2027-01-09');
  });

  it('rejects an invalid timezone', async () => {
    await expect(make(MORNING).getDays(GUILD, { timezone: 'Mars/Olympus' })).rejects.toMatchObject({
      kind: 'invalid_request',
    });
  });

  it('finalises in summer time too (UTC+3)', async () => {
    const before = await make(Date.parse('2026-07-01T10:37:59Z')).getDays(GUILD, {
      timezone: TZ,
      since: '2026-07-01',
    });
    const at = await make(Date.parse('2026-07-01T10:38:00Z')).getDays(GUILD, {
      timezone: TZ,
      since: '2026-07-01',
    });
    expect(before.days).toHaveLength(0);
    expect(at.days.map((d) => d.date)).toEqual(['2026-07-01']);
  });

  it('only lets known players take part, at 13:37 guild-local plus under a minute', async () => {
    const page = await make(MORNING).getDays(GUILD, {
      timezone: TZ,
      since: '2027-01-01',
      limit: 14,
    });
    for (const day of page.days) {
      const base = Date.parse(`${day.date}T11:37:00Z`);
      for (const p of day.participants) {
        expect(players).toContain(p.userId);
        const offset = Date.parse(p.leetAt) - base;
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(60_000);
      }
      const ids = day.participants.map((p) => p.userId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has roughly 60% participation, and a mix of busy and empty days', async () => {
    const many = Array.from({ length: 40 }, (_, i) => String(100000000000000000n + BigInt(i)));
    const page = await make(MORNING, many).getDays(GUILD, {
      timezone: TZ,
      since: '2027-01-01',
      limit: 14,
    });
    const total = page.days.reduce((n, d) => n + d.participants.length, 0);
    const rate = total / (many.length * page.days.length);
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(0.7);
  });

  it('depends on guild, date and player', async () => {
    const a = await make(MORNING).getDays(GUILD, { timezone: TZ });
    const b = await make(MORNING).getDays('999999999999999999', { timezone: TZ });
    expect(a.days.map((d) => d.participants.length)).not.toEqual(
      b.days.map((d) => d.participants.length),
    );
  });

  it('does not depend on the order of known players', async () => {
    const a = await make(MORNING, players).getDays(GUILD, { timezone: TZ });
    const b = await make(MORNING, [...players].reverse()).getDays(GUILD, { timezone: TZ });
    expect(a).toEqual(b);
  });

  it('returns days without participants when there are no players', async () => {
    const page = await make(MORNING, []).getDays(GUILD, { timezone: TZ });
    expect(page.days).toHaveLength(7);
    expect(page.days.every((d) => d.participants.length === 0)).toBe(true);
  });

  it('pages with an opaque base64url cursor and a limit', async () => {
    const source = make(MORNING);
    const first = await source.getDays(GUILD, { timezone: TZ, limit: 3 });
    expect(first.days.map((d) => d.date)).toEqual(['2027-01-08', '2027-01-09', '2027-01-10']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = await source.getDays(GUILD, {
      timezone: TZ,
      after: first.nextCursor ?? '',
      limit: 3,
    });
    expect(second.days.map((d) => d.date)).toEqual(['2027-01-11', '2027-01-12', '2027-01-13']);
    expect(second.hasMore).toBe(true);
    const third = await source.getDays(GUILD, {
      timezone: TZ,
      after: second.nextCursor ?? '',
      limit: 3,
    });
    expect(third.days.map((d) => d.date)).toEqual(['2027-01-14']);
    expect(third.hasMore).toBe(false);
    const empty = await source.getDays(GUILD, {
      timezone: TZ,
      after: third.nextCursor ?? '',
      limit: 3,
    });
    expect(empty.days).toEqual([]);
    expect(empty.hasMore).toBe(false);
    expect(empty.nextCursor).toBe(third.nextCursor);
  });

  it('paged and unpaged histories are identical', async () => {
    const source = make(MORNING);
    const all = await source.getDays(GUILD, { timezone: TZ });
    const days: LeetDaysPage['days'] = [];
    let after: string | undefined;
    for (;;) {
      const page = await source.getDays(
        GUILD,
        after === undefined ? { timezone: TZ, limit: 2 } : { timezone: TZ, after, limit: 2 },
      );
      days.push(...page.days);
      if (!page.hasMore) break;
      after = page.nextCursor ?? undefined;
    }
    expect(days).toEqual(all.days);
  });

  it('honours since, but after wins over since', async () => {
    const source = make(MORNING);
    const since = await source.getDays(GUILD, { timezone: TZ, since: '2027-01-12' });
    expect(since.days.map((d) => d.date)).toEqual(['2027-01-12', '2027-01-13', '2027-01-14']);
    const cursor = (await source.getDays(GUILD, { timezone: TZ, limit: 1 })).nextCursor ?? '';
    const both = await source.getDays(GUILD, {
      timezone: TZ,
      after: cursor,
      since: '2027-01-13',
      limit: 1,
    });
    expect(both.days.map((d) => d.date)).toEqual(['2027-01-09']);
  });

  it('rejects bad cursors, dates, limits and guild ids', async () => {
    const source = make(MORNING);
    const kind = (p: Promise<unknown>) =>
      p.catch((e: unknown) => (e instanceof LeetSourceError ? e.kind : 'other'));
    expect(await kind(source.getDays(GUILD, { timezone: TZ, after: '!!!' }))).toBe(
      'invalid_request',
    );
    expect(await kind(source.getDays(GUILD, { timezone: TZ, after: btoa('{"d":"nope"}') }))).toBe(
      'invalid_request',
    );
    expect(await kind(source.getDays(GUILD, { timezone: TZ, since: '2027-1-1' }))).toBe(
      'invalid_request',
    );
    expect(await kind(source.getDays(GUILD, { timezone: TZ, limit: 0 }))).toBe('invalid_request');
    expect(await kind(source.getDays(GUILD, { timezone: TZ, limit: 101 }))).toBe('invalid_request');
    expect(await kind(source.getDays('abc', { timezone: TZ }))).toBe('invalid_request');
  });

  it('produces pages that pass the real page schema', async () => {
    const page = await make(MORNING).getDays(GUILD, { timezone: TZ });
    expect(parseLeetPage(GUILD, page)).toEqual(page);
  });
});

describe('createLeetSourceFromEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const deps = {
    now: () => 0,
    knownPlayers: () => [],
    backfillDays: 7,
    fetch: (() => Promise.reject(new Error('unused'))) as typeof fetch,
  };

  it('builds the mock source for "mock"', () => {
    expect(createLeetSourceFromEnv({ LEET_SOURCE: 'mock' }, deps)).not.toBeNull();
  });

  it('builds the http source for "http" with URL and key', () => {
    const source: LeetSource | null = createLeetSourceFromEnv(
      { LEET_SOURCE: 'http', LEET_API_URL: 'https://leet.test', LEET_API_KEY: 'k' },
      deps,
    );
    expect(source).not.toBeNull();
  });

  it('fails closed with a warning and no secrets for anything else', () => {
    const warn = captureConsole('warn');
    for (const env of [
      {},
      { LEET_SOURCE: '' },
      { LEET_SOURCE: 'MOCK' },
      { LEET_SOURCE: 'prod' },
      { LEET_SOURCE: 'http' },
      { LEET_SOURCE: 'http', LEET_API_URL: 'https://leet.test' },
      { LEET_SOURCE: 'http', LEET_API_KEY: 'super-secret-key' },
      {
        LEET_SOURCE: 'http',
        LEET_API_URL: 'http://insecure.test',
        LEET_API_KEY: 'super-secret-key',
      },
    ]) {
      expect(createLeetSourceFromEnv(env, deps)).toBeNull();
    }
    expect(warn.calls).toHaveLength(8);
    expect(JSON.stringify(warn.calls)).not.toContain('super-secret-key');
  });
});
