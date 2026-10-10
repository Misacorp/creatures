import { describe, expect, it } from 'vitest';
import type { GuildCore } from '../src/guild-core';
import { OTHER_USER_ID, T0, USER_ID, expectApiHeaders, runCore } from './helpers';

const USER = { id: USER_ID, displayName: 'Misa' };
const OTHER = { id: OTHER_USER_ID, displayName: 'Other' };

function credit(core: GuildCore, userId: string, n: number, extra: { amount?: number } = {}) {
  core.credit({
    userId,
    currency: 'bait',
    amount: extra.amount ?? 10 * n,
    source: 'leet',
    idempotencyKey: `leet:day-${String(n)}`,
    meta: { date: `2027-01-${String(n).padStart(2, '0')}`, participants: n, points: n },
  });
}

interface Entry {
  id: number;
  currency: string;
  amount: number;
  source: string;
  createdAt: number;
  meta: unknown;
}

describe('GET /api/me balances', () => {
  it('shows zero for missing rows and the stored balance otherwise', async () => {
    await runCore('730000000000000001', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      const empty = await (await request(secret)).json<{ balances: unknown }>();
      expect(empty.balances).toEqual({ bait: 0, essence: 0 });
      credit(core, USER_ID, 3);
      core.credit({
        userId: USER_ID,
        currency: 'essence',
        amount: 4,
        source: 'test',
        idempotencyKey: 'e:1',
      });
      const res = await (await request(secret)).json<{ balances: unknown }>();
      expect(res.balances).toEqual({ bait: 30, essence: 4 });
    });
  });
});

describe('GET /api/ledger', () => {
  it('returns the newest entries first with the documented fields', async () => {
    await runCore('730000000000000002', async ({ guildId, core, request, clock }) => {
      const secret = await core.createSession(guildId, USER);
      for (let n = 1; n <= 3; n++) {
        clock.t = T0 + n * 1000;
        credit(core, USER_ID, n);
      }
      const res = await request(secret, '/api/ledger');
      expect(res.status).toBe(200);
      expectApiHeaders(res);
      const { entries } = await res.json<{ entries: Entry[] }>();
      expect(entries.map((e) => e.amount)).toEqual([30, 20, 10]);
      expect(entries[0]).toEqual({
        id: expect.any(Number) as number,
        currency: 'bait',
        amount: 30,
        source: 'leet',
        createdAt: T0 + 3000,
        meta: { date: '2027-01-03', participants: 3, points: 3 },
      });
      expect(Object.keys(entries[0] ?? {}).sort()).toEqual(
        ['amount', 'createdAt', 'currency', 'id', 'meta', 'source'].sort(),
      );
    });
  });

  it('only shows the session user and never idempotency keys or results', async () => {
    await runCore('730000000000000003', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      await core.createSession(guildId, OTHER);
      credit(core, USER_ID, 1);
      credit(core, OTHER_USER_ID, 2);
      const text = await (await request(secret, '/api/ledger')).text();
      const { entries } = JSON.parse(text) as { entries: Entry[] };
      expect(entries).toHaveLength(1);
      expect(entries[0]?.amount).toBe(10);
      expect(text).not.toContain('leet:day');
      expect(text).not.toContain('idempotency');
    });
  });

  it('defaults to 20 entries and honours limit up to 50', async () => {
    await runCore('730000000000000004', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      for (let n = 1; n <= 60; n++) credit(core, USER_ID, n, { amount: n });
      const count = async (path: string) =>
        (await (await request(secret, path)).json<{ entries: Entry[] }>()).entries.length;
      expect(await count('/api/ledger')).toBe(20);
      expect(await count('/api/ledger?limit=1')).toBe(1);
      expect(await count('/api/ledger?limit=5')).toBe(5);
      expect(await count('/api/ledger?limit=50')).toBe(50);
    });
  });

  it('returns an empty list for a user with no entries', async () => {
    await runCore('730000000000000005', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      expect(await (await request(secret, '/api/ledger')).json()).toEqual({ entries: [] });
    });
  });

  it.each([
    '?limit=0',
    '?limit=51',
    '?limit=-1',
    '?limit=abc',
    '?limit=',
    '?limit=1.5',
    '?limit=1e1',
    '?limit=%2010',
    '?limit=0010',
    '?limit=5&limit=6',
    '?limit=5&offset=1',
    '?offset=1',
    '?foo',
    '?constructor=1',
    '?__proto__=1',
    '?Limit=5',
  ])('400s on invalid query %s', async (query) => {
    await runCore('730000000000000006', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      const res = await request(secret, `/api/ledger${query}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_query' });
      expectApiHeaders(res);
    });
  });

  it('405s on other methods and 401s without a valid session', async () => {
    await runCore('730000000000000007', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      const wrong = await request(secret, '/api/ledger', 'POST');
      expect(wrong.status).toBe(405);
      expect(wrong.headers.get('Allow')).toBe('GET');
      const none = await core.handle(new Request('https://creatures.test/api/ledger'));
      expect(none.status).toBe(401);
    });
  });

  it('is rate limited like other routes', async () => {
    await runCore('730000000000000008', async ({ guildId, core, request }) => {
      const secret = await core.createSession(guildId, USER);
      for (let i = 0; i < 30; i++) expect((await request(secret, '/api/ledger')).status).toBe(200);
      expect((await request(secret, '/api/ledger')).status).toBe(429);
    });
  });
});
