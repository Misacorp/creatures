import { env, exports } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baitForDay } from '../src/economy';
import type { GuildCoreOptions } from '../src/guild-core';
import {
  LeetSourceError,
  createMockLeetSource,
  type LeetDay,
  type LeetDaysOptions,
  type LeetDaysPage,
  type LeetSource,
} from '../src/leet';
import { DEFAULT_GUILD_TIMEZONE, nextOccurrence } from '../src/time';
import { OTHER_USER_ID, ORIGIN, T0, USER_ID, expectApiHeaders, runCore, tokenFor } from './helpers';

const MINUTE = 60_000;
const HELSINKI = 'Europe/Helsinki';
const NEW_YORK = 'America/New_York';
const USER = { id: USER_ID, displayName: 'Misa' };
const OTHER = { id: OTHER_USER_ID, displayName: 'Other' };

let guildCounter = 0;
/** A fresh snowflake-shaped guild id per test, so Durable Object storage never overlaps. */
const nextGuild = () => String(720000000000000000n + BigInt(++guildCounter));

function day(guildId: string, date: string, userIds: string[]): LeetDay {
  return {
    id: `${guildId}:${date}`,
    date,
    participants: userIds.map((userId) => ({ userId, leetAt: `${date}T11:37:00.000Z` })),
  };
}

/** A scripted source that records calls. */
function scripted(
  pages: (opts: LeetDaysOptions, call: number) => Promise<LeetDaysPage> | LeetDaysPage,
) {
  const calls: { guildId: string; opts: LeetDaysOptions }[] = [];
  const source: LeetSource = {
    getDays(guildId, opts) {
      calls.push({ guildId, opts });
      return Promise.resolve(pages(opts, calls.length));
    },
  };
  return { source, calls };
}

const using = (source: LeetSource): GuildCoreOptions => ({ createLeetSource: () => source });

const baitRows = (sql: SqlStorage) =>
  sql
    .exec<{ user_id: string; amount: number; idempotency_key: string; meta: string }>(
      "SELECT user_id, amount, idempotency_key, meta FROM ledger WHERE source = 'leet' ORDER BY id",
    )
    .toArray();

const syncState = (sql: SqlStorage) =>
  sql
    .exec<{
      cursor: string | null;
      since_date: string;
      last_synced_at: number | null;
    }>('SELECT cursor, since_date, last_synced_at FROM leet_sync')
    .toArray();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncLeet', () => {
  it('credits Bait per participant using the economy rules, with day-keyed idempotency', async () => {
    const guild = nextGuild();
    const { source } = scripted(() => ({
      days: [
        day(guild, '2026-10-08', [USER_ID]),
        day(guild, '2026-10-09', [USER_ID, OTHER_USER_ID, '333333333333333330']),
        day(guild, '2026-10-10', []),
      ],
      nextCursor: 'c1',
      hasMore: false,
    }));
    await runCore(
      guild,
      async ({ core, sql }) => {
        expect(await core.syncLeet()).toEqual({ daysProcessed: 3, creditsApplied: 4 });
        expect(core.balances(USER_ID).bait).toBe(20 + 30);
        expect(core.balances(OTHER_USER_ID).bait).toBe(30);
        expect(core.balances('333333333333333330').bait).toBe(30);
        const mine = baitRows(sql).filter((r) => r.user_id === USER_ID);
        expect(mine.map((r) => [r.amount, r.idempotency_key])).toEqual([
          [20, `leet:${guild}:2026-10-08`],
          [30, `leet:${guild}:2026-10-09`],
        ]);
        expect(JSON.parse(mine[0]?.meta ?? '')).toEqual({
          date: '2026-10-08',
          participants: 1,
          points: 2,
        });
        expect(JSON.parse(mine[1]?.meta ?? '')).toEqual({
          date: '2026-10-09',
          participants: 3,
          points: 3,
        });
      },
      using(source),
    );
  });

  it('is idempotent: re-processing the same days credits nothing', async () => {
    const guild = nextGuild();
    const { source } = scripted(() => ({
      days: [day(guild, '2026-10-09', [USER_ID, OTHER_USER_ID])],
      nextCursor: 'same',
      hasMore: false,
    }));
    await runCore(
      guild,
      async ({ core, sql }) => {
        expect((await core.syncLeet()).creditsApplied).toBe(2);
        // The source replays the same day even though the cursor was stored (overlapping pulls).
        expect(await core.syncLeet()).toEqual({ daysProcessed: 1, creditsApplied: 0 });
        expect(core.balances(USER_ID).bait).toBe(20);
        expect(baitRows(sql)).toHaveLength(2);
      },
      using(source),
    );
  });

  it('caps a day at 8 points and counts each user once', async () => {
    const guild = nextGuild();
    const crowd = Array.from({ length: 12 }, (_, i) => String(400000000000000000n + BigInt(i)));
    const { source } = scripted(() => ({
      days: [day(guild, '2026-10-09', crowd)],
      nextCursor: 'c',
      hasMore: false,
    }));
    await runCore(
      guild,
      async ({ core }) => {
        await core.syncLeet();
        expect(core.balances(crowd[0] ?? '').bait).toBe(baitForDay(12));
        expect(core.balances(crowd[0] ?? '').bait).toBe(80);
      },
      using(source),
    );
  });

  it('credits users who have never opened the game, visible on first login', async () => {
    const guild = nextGuild();
    const { source } = scripted(() => ({
      days: [day(guild, '2026-10-09', [USER_ID])],
      nextCursor: 'c',
      hasMore: false,
    }));
    await runCore(
      guild,
      async ({ guildId, core, request, sql }) => {
        await core.syncLeet();
        expect(sql.exec('SELECT * FROM players').toArray()).toHaveLength(0);
        const secret = await core.createSession(guildId, USER);
        const res = await request(secret);
        expect((await res.json<{ balances: unknown }>()).balances).toEqual({
          bait: 20,
          essence: 0,
        });
      },
      using(source),
    );
  });

  it('starts from since = today minus 7 days (guild-local) and then follows the cursor', async () => {
    const guild = nextGuild();
    const { source, calls } = scripted((opts) =>
      opts.after === undefined
        ? { days: [day(guild, '2027-01-08', [USER_ID])], nextCursor: 'cur-1', hasMore: false }
        : { days: [], nextCursor: 'cur-1', hasMore: false },
    );
    await runCore(
      guild,
      async ({ core, sql }) => {
        await core.syncLeet();
        await core.syncLeet();
        // T0 is 2027-01-15 10:00 in Europe/Helsinki, and the timezone travels with every call.
        expect(calls[0]).toEqual({
          guildId: guild,
          opts: { timezone: HELSINKI, since: '2027-01-08', limit: 31 },
        });
        expect(calls[1]).toEqual({
          guildId: guild,
          opts: { timezone: HELSINKI, after: 'cur-1', limit: 31 },
        });
        expect(syncState(sql)).toEqual([
          { cursor: 'cur-1', since_date: '2027-01-08', last_synced_at: T0 },
        ]);
      },
      using(source),
    );
  });

  it('keeps since_date fixed after first use, even when the day changes', async () => {
    const guild = nextGuild();
    const { source } = scripted(() => ({ days: [], nextCursor: null, hasMore: false }));
    await runCore(
      guild,
      async ({ core, clock, sql }) => {
        await core.syncLeet();
        clock.t += 30 * 24 * 60 * MINUTE;
        await core.syncLeet();
        expect(syncState(sql)[0]?.since_date).toBe('2027-01-08');
        expect(syncState(sql)[0]?.cursor).toBeNull();
      },
      using(source),
    );
  });

  it('follows pages and stores the cursor with each page', async () => {
    const guild = nextGuild();
    const { source, calls } = scripted((_opts, n) => ({
      days: [day(guild, `2026-10-0${String(n)}`, [USER_ID])],
      nextCursor: `cur-${String(n)}`,
      hasMore: n < 3,
    }));
    await runCore(
      guild,
      async ({ core, sql }) => {
        expect(await core.syncLeet()).toEqual({ daysProcessed: 3, creditsApplied: 3 });
        expect(calls.map((c) => c.opts.after)).toEqual([undefined, 'cur-1', 'cur-2']);
        expect(syncState(sql)[0]?.cursor).toBe('cur-3');
        expect(core.balances(USER_ID).bait).toBe(60);
      },
      using(source),
    );
  });

  it('stops after 20 pages per run and resumes next run', async () => {
    const guild = nextGuild();
    let page = 0;
    const { source, calls } = scripted(() => {
      page++;
      return {
        days: [day(guild, `2026-09-${String(page).padStart(2, '0')}`, [USER_ID])],
        nextCursor: `cur-${String(page)}`,
        hasMore: true,
      };
    });
    await runCore(
      guild,
      async ({ core, sql }) => {
        expect((await core.syncLeet()).daysProcessed).toBe(20);
        expect(calls).toHaveLength(20);
        expect(syncState(sql)[0]?.cursor).toBe('cur-20');
        await core.syncLeet();
        expect(calls[20]?.opts.after).toBe('cur-20');
      },
      using(source),
    );
  });

  it('does not spin when the source claims more pages but the cursor does not move', async () => {
    const guild = nextGuild();
    const { source, calls } = scripted(() => ({
      days: [],
      nextCursor: 'stuck',
      hasMore: true,
    }));
    await runCore(
      guild,
      async ({ core }) => {
        await core.syncLeet();
        expect(calls).toHaveLength(2); // first page moves null -> stuck, second does not move
      },
      using(source),
    );
  });

  it('commits earlier pages and resumes from the stored cursor after a failure', async () => {
    const guild = nextGuild();
    let failNext = true;
    const { source, calls } = scripted((_opts, n) => {
      if (n === 1) {
        return { days: [day(guild, '2026-10-01', [USER_ID])], nextCursor: 'cur-1', hasMore: true };
      }
      if (failNext) {
        failNext = false;
        throw new LeetSourceError('upstream');
      }
      return { days: [day(guild, '2026-10-02', [USER_ID])], nextCursor: 'cur-2', hasMore: false };
    });
    await runCore(
      guild,
      async ({ core, sql }) => {
        await expect(core.syncLeet()).rejects.toBeInstanceOf(LeetSourceError);
        expect(core.balances(USER_ID).bait).toBe(20);
        expect(syncState(sql)[0]?.cursor).toBe('cur-1');
        expect(await core.syncLeet()).toEqual({ daysProcessed: 1, creditsApplied: 1 });
        expect(calls[2]?.opts.after).toBe('cur-1');
        expect(core.balances(USER_ID).bait).toBe(40);
      },
      using(source),
    );
  });

  it('rolls a page back entirely if a credit in it is invalid', async () => {
    const guild = nextGuild();
    const { source } = scripted(() => ({
      // The second day has a key longer than the ledger allows once built; the first day's
      // credits and the cursor must not be committed.
      days: [
        day(guild, '2026-10-01', [USER_ID]),
        { ...day(guild, '2026-10-02', [USER_ID]), id: 'x'.repeat(200) },
      ],
      nextCursor: 'cur',
      hasMore: false,
    }));
    await runCore(
      guild,
      async ({ core, sql }) => {
        await expect(core.syncLeet()).rejects.toThrow();
        expect(core.balances(USER_ID).bait).toBe(0);
        expect(baitRows(sql)).toHaveLength(0);
        expect(syncState(sql)[0]?.cursor).toBeNull();
      },
      using(source),
    );
  });

  it('runs concurrent syncs as one', async () => {
    const guild = nextGuild();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { source, calls } = scripted(async () => {
      await gate;
      return { days: [day(guild, '2026-10-09', [USER_ID])], nextCursor: 'c', hasMore: false };
    });
    await runCore(
      guild,
      async ({ core }) => {
        const a = core.syncLeet();
        const b = core.syncLeet();
        expect(a).toBe(b);
        release();
        expect(await a).toEqual({ daysProcessed: 1, creditsApplied: 1 });
        expect(calls).toHaveLength(1);
        // A later sync starts a new run.
        await core.syncLeet();
        expect(calls).toHaveLength(2);
      },
      using(source),
    );
  });

  it('does not hold a transaction while waiting for the source', async () => {
    const guild = nextGuild();
    const { source } = scripted(async () => {
      await Promise.resolve();
      return { days: [], nextCursor: null, hasMore: false };
    });
    await runCore(
      guild,
      async ({ core }) => {
        const pending = core.syncLeet();
        // Writing while the source call is outstanding works and is visible immediately.
        core.credit({
          userId: USER_ID,
          currency: 'bait',
          amount: 1,
          source: 'test',
          idempotencyKey: 'during-wait',
        });
        expect(core.balances(USER_ID).bait).toBe(1);
        await pending;
      },
      using(source),
    );
  });

  it('with the mock source, credits match the synthetic history and a second run adds nothing', async () => {
    const guild = nextGuild();
    await runCore(
      guild,
      async ({ guildId, core, clock, sql }) => {
        await core.createSession(guildId, USER);
        await core.createSession(guildId, OTHER);
        const mock = createMockLeetSource({
          now: () => clock.t,
          knownPlayers: () => [USER_ID, OTHER_USER_ID],
          backfillDays: 7,
        });
        const history = await mock.getDays(guild, { timezone: HELSINKI, since: '2027-01-08' });
        const expected = (userId: string) =>
          history.days
            .filter((d) => d.participants.some((p) => p.userId === userId))
            .reduce((sum, d) => sum + baitForDay(d.participants.length), 0);
        expect(expected(USER_ID) + expected(OTHER_USER_ID)).toBeGreaterThan(0);

        const first = await core.syncLeet();
        expect(first.daysProcessed).toBe(7);
        expect(core.balances(USER_ID).bait).toBe(expected(USER_ID));
        expect(core.balances(OTHER_USER_ID).bait).toBe(expected(OTHER_USER_ID));
        expect(await core.syncLeet()).toEqual({ daysProcessed: 0, creditsApplied: 0 });

        // Past 13:38 on the 15th, that day is finalised and gets credited once.
        clock.t = Date.parse('2027-01-15T11:38:00Z');
        expect((await core.syncLeet()).daysProcessed).toBe(1);
        expect(await core.syncLeet()).toEqual({ daysProcessed: 0, creditsApplied: 0 });
        expect(baitRows(sql).length).toBeGreaterThan(0);
      },
      (clock) => ({
        createLeetSource: (known) =>
          createMockLeetSource({ now: () => clock.t, knownPlayers: known, backfillDays: 7 }),
      }),
    );
  });
});

describe('fail closed', () => {
  it('does nothing without a leet source: no sync, no alarm', async () => {
    await runCore(
      nextGuild(),
      async ({ guildId, core, storage, sql }) => {
        expect(await core.syncLeet()).toEqual({ daysProcessed: 0, creditsApplied: 0 });
        await core.syncIfStale();
        await core.createSession(guildId, USER);
        await core.ensureAlarm();
        await core.alarm();
        expect(await storage.getAlarm()).toBeNull();
        expect(sql.exec('SELECT * FROM ledger').toArray()).toHaveLength(0);
      },
      { createLeetSource: () => null },
    );
  });

  it('uses the stored guild id for syncs and alarms, falling back to the option only before one is stored', async () => {
    const guild = nextGuild();
    const { source, calls } = scripted(() => ({ days: [], nextCursor: null, hasMore: false }));
    await runCore(
      guild,
      async ({ core, clock }) => {
        // Nothing stored yet: the fallback option is used.
        await core.syncLeet();
        expect(calls[0]?.guildId).toBe('999999999999999999');
        // Once stored, the stored id wins over the option.
        await core.createSession(guild, USER);
        await core.syncLeet();
        expect(calls[1]?.guildId).toBe(guild);
        clock.t = Date.parse('2027-01-15T11:40:00Z');
        await core.alarm();
        expect(calls[2]?.guildId).toBe(guild);
      },
      { ...using(source), guildId: () => '999999999999999999' },
    );
  });

  it('uses the stored guild id even when the Durable Object name is unavailable', async () => {
    const guild = nextGuild();
    const { source, calls } = scripted(() => ({ days: [], nextCursor: null, hasMore: false }));
    await runCore(
      guild,
      async ({ core, clock }) => {
        await core.createSession(guild, USER);
        clock.t = Date.parse('2027-01-15T11:40:00Z');
        await core.alarm();
        expect(calls.map((c) => c.guildId)).toEqual([guild]);
      },
      { ...using(source), guildId: () => undefined },
    );
  });

  it('skips the sync when the guild id is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source, calls } = scripted(() => ({ days: [], nextCursor: null, hasMore: false }));
    await runCore(
      nextGuild(),
      async ({ core }) => {
        expect(await core.syncLeet()).toEqual({ daysProcessed: 0, creditsApplied: 0 });
        expect(calls).toHaveLength(0);
        expect(warn).toHaveBeenCalled();
      },
      { ...using(source), guildId: () => undefined },
    );
  });
});

describe('GET /api/me sync trigger', () => {
  const emptySource = (guild: string, onCall?: () => void) =>
    scripted(() => {
      onCall?.();
      return { days: [day(guild, '2026-10-09', [USER_ID])], nextCursor: 'c', hasMore: false };
    });

  it('syncs when never synced and returns the new balance', async () => {
    const guild = nextGuild();
    const { source, calls } = emptySource(guild);
    await runCore(
      guild,
      async ({ guildId, core, request }) => {
        const secret = await core.createSession(guildId, USER);
        const res = await request(secret);
        expect(res.status).toBe(200);
        expect((await res.json<{ balances: unknown }>()).balances).toEqual({
          bait: 20,
          essence: 0,
        });
        expect(calls).toHaveLength(1);
      },
      using(source),
    );
  });

  it('syncs at most every 15 minutes', async () => {
    const guild = nextGuild();
    const { source, calls } = emptySource(guild);
    await runCore(
      guild,
      async ({ guildId, core, clock, request }) => {
        const secret = await core.createSession(guildId, USER);
        await request(secret);
        clock.t += 15 * MINUTE - 1;
        await request(secret);
        expect(calls).toHaveLength(1);
        clock.t += 1;
        await request(secret);
        expect(calls).toHaveLength(2);
      },
      using(source),
    );
  });

  it('still answers when the source fails, and backs off for a minute', async () => {
    const guild = nextGuild();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { source, calls } = scripted(() => {
      throw new LeetSourceError('upstream');
    });
    await runCore(
      guild,
      async ({ guildId, core, clock, request }) => {
        const secret = await core.createSession(guildId, USER);
        const res = await request(secret);
        expect(res.status).toBe(200);
        expect((await res.json<{ balances: unknown }>()).balances).toEqual({
          bait: 0,
          essence: 0,
        });
        expect((await request(secret)).status).toBe(200);
        expect(calls).toHaveLength(1);
        clock.t += MINUTE;
        expect((await request(secret)).status).toBe(200);
        expect(calls).toHaveLength(2);
        // Only the error kind is logged, never data.
        expect(error).toHaveBeenCalledWith('leet sync failed', 'upstream');
      },
      using(source),
    );
  });

  it('answers within the time budget when the source is slow', async () => {
    const guild = nextGuild();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { source, calls } = scripted(async () => {
      await gate;
      return { days: [day(guild, '2026-10-09', [USER_ID])], nextCursor: 'c', hasMore: false };
    });
    await runCore(
      guild,
      async ({ guildId, core, request }) => {
        const secret = await core.createSession(guildId, USER);
        const started = Date.now();
        const res = await request(secret);
        expect(Date.now() - started).toBeLessThan(2000);
        expect(res.status).toBe(200);
        expect((await res.json<{ balances: { bait: number } }>()).balances.bait).toBe(0);
        expect(calls).toHaveLength(1);
        // The sync finishes in the background and the next request sees the credit.
        release();
        await core.syncLeet();
        const again = await request(secret);
        expect((await again.json<{ balances: { bait: number } }>()).balances.bait).toBe(20);
      },
      { ...using(source), syncBudgetMs: 30 },
    );
  });
});

describe('daily alarm', () => {
  const quiet = (guild: string) =>
    scripted(() => ({
      days: [day(guild, '2026-10-09', [USER_ID])],
      nextCursor: 'c',
      hasMore: false,
    }));

  it('arms the alarm for the next 13:40 guild-local on session creation and on requests', async () => {
    const guild = nextGuild();
    const { source } = quiet(guild);
    await runCore(
      guild,
      async ({ guildId, core, storage, request, clock }) => {
        expect(await storage.getAlarm()).toBeNull();
        const secret = await core.createSession(guildId, USER);
        // T0 is 10:00 Europe/Helsinki on 2027-01-15 (UTC+2), so the alarm is today at 11:40Z.
        const expected = Date.parse('2027-01-15T11:40:00Z');
        expect(expected).toBe(nextOccurrence(T0, 13, 40, DEFAULT_GUILD_TIMEZONE));
        expect(await storage.getAlarm()).toBe(expected);

        // An existing alarm is left alone.
        clock.t += 30 * MINUTE;
        await request(secret);
        expect(await storage.getAlarm()).toBe(expected);

        // A cleared alarm is re-armed by the next authenticated request.
        await storage.deleteAlarm();
        await request(secret);
        expect(await storage.getAlarm()).toBe(expected);
      },
      using(source),
    );
  });

  it('runs the sync, then arms the next occurrence', async () => {
    const guild = nextGuild();
    const { source, calls } = quiet(guild);
    await runCore(
      guild,
      async ({ core, storage, clock }) => {
        clock.t = Date.parse('2027-01-15T11:40:00.200Z');
        await core.alarm();
        expect(calls).toHaveLength(1);
        expect(core.balances(USER_ID).bait).toBe(20);
        expect(await storage.getAlarm()).toBe(Date.parse('2027-01-16T11:40:00Z'));
      },
      using(source),
    );
  });

  it('does not fire twice when woken marginally early', async () => {
    const guild = nextGuild();
    const { source } = quiet(guild);
    await runCore(
      guild,
      async ({ core, storage, clock }) => {
        clock.t = Date.parse('2027-01-15T11:39:59.500Z');
        await core.alarm();
        expect(await storage.getAlarm()).toBe(Date.parse('2027-01-16T11:40:00Z'));
      },
      using(source),
    );
  });

  it('crosses the DST switch correctly', async () => {
    const guild = nextGuild();
    const { source } = quiet(guild);
    await runCore(
      guild,
      async ({ core, storage, clock }) => {
        // 2027 switch weeks (in the future of the real clock, so the test runtime never fires
        // these alarms for real). Saturday 2027-03-27 13:40 EET; the next one is Sunday
        // 13:40 EEST (10:40Z).
        clock.t = Date.parse('2027-03-27T11:40:00Z');
        await core.alarm();
        expect(await storage.getAlarm()).toBe(Date.parse('2027-03-28T10:40:00Z'));
        // Saturday 2027-10-30 13:40 EEST; the next one is Sunday 13:40 EET (11:40Z).
        clock.t = Date.parse('2027-10-30T10:40:00Z');
        await core.alarm();
        expect(await storage.getAlarm()).toBe(Date.parse('2027-10-31T11:40:00Z'));
      },
      using(source),
    );
  });

  it('logs failures without data and always re-arms', async () => {
    const guild = nextGuild();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { source } = scripted(() => {
      throw new Error('leaked secret 12345');
    });
    await runCore(
      guild,
      async ({ core, storage, clock }) => {
        clock.t = Date.parse('2027-01-15T11:40:00Z');
        await core.alarm();
        expect(await storage.getAlarm()).toBe(Date.parse('2027-01-16T11:40:00Z'));
        expect(error).toHaveBeenCalledWith('leet sync failed', 'Error');
        expect(JSON.stringify(error.mock.calls)).not.toContain('12345');
      },
      using(source),
    );
  });
});

describe('real Durable Object with the mock source', () => {
  const stubFor = (guildId: string) => env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));

  it('syncs on /api/me, arms an alarm and runs it', async () => {
    const guild = nextGuild();
    const stub = stubFor(guild);
    const secret = await stub.createSession(guild, USER);
    const token = await tokenFor(guild, secret);
    const call = (path: string) =>
      exports.default.fetch(
        new Request(`${ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` } }),
      );

    const me = await call('/api/me');
    expect(me.status).toBe(200);
    expectApiHeaders(me);
    const body = await me.json<{ balances: { bait: number; essence: number } }>();
    expect(Number.isInteger(body.balances.bait)).toBe(true);
    expect(body.balances.bait % 10).toBe(0);

    const ledger = await call('/api/ledger?limit=50');
    const entries = (await ledger.json<{ entries: { amount: number; source: string }[] }>())
      .entries;
    expect(entries.every((e) => e.source === 'leet' && e.amount > 0)).toBe(true);
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(body.balances.bait);

    await runInDurableObject(stub, async (_instance, state) => {
      const rows = state.storage.sql
        .exec<{ last_synced_at: number | null }>('SELECT last_synced_at FROM leet_sync')
        .toArray();
      expect(rows[0]?.last_synced_at).not.toBeNull();
      expect(await state.storage.getAlarm()).not.toBeNull();
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, async (_instance, state) => {
      const alarm = await state.storage.getAlarm();
      expect(alarm).not.toBeNull();
      expect(alarm ?? 0).toBeGreaterThan(Date.now());
    });
    // The alarm credited nothing twice.
    const after = await (await call('/api/me')).json<{ balances: { bait: number } }>();
    expect(after.balances.bait).toBe(body.balances.bait);
  });
});

describe('guild timezone', () => {
  const quiet = () => scripted(() => ({ days: [], nextCursor: null, hasMore: false }));

  /** Stores the guild with a timezone before the object resolves anything, like a settings change. */
  const bindWith = (sql: SqlStorage, guild: string, timezone: string) => {
    sql.exec('INSERT INTO guild_meta (id, guild_id, timezone) VALUES (1, ?, ?)', guild, timezone);
  };

  it('defaults to the default timezone when none is stored, and stores it on first bind', async () => {
    const guild = nextGuild();
    const { source } = quiet();
    await runCore(
      guild,
      async ({ guildId, core, sql }) => {
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);
        await core.createSession(guildId, USER);
        expect(sql.exec('SELECT timezone FROM guild_meta').toArray()).toEqual([
          { timezone: DEFAULT_GUILD_TIMEZONE },
        ]);
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);
      },
      using(source),
    );
  });

  it('arms the alarm at 13:40 New York time', async () => {
    const guild = nextGuild();
    const { source } = quiet();
    await runCore(
      guild,
      async ({ guildId, core, storage, sql }) => {
        bindWith(sql, guildId, NEW_YORK);
        await core.createSession(guildId, USER);
        // T0 is 2027-01-15 10:00Z = 05:00 EST, so the alarm is today 13:40 EST = 18:40Z.
        expect(await storage.getAlarm()).toBe(Date.parse('2027-01-15T18:40:00Z'));
        expect(await storage.getAlarm()).toBe(nextOccurrence(T0, 13, 40, NEW_YORK));
      },
      using(source),
    );
  });

  it('keeps 13:40 New York time across the US DST switches', async () => {
    const guild = nextGuild();
    const { source } = quiet();
    await runCore(
      guild,
      async ({ guildId, core, storage, clock, sql }) => {
        bindWith(sql, guildId, NEW_YORK);
        // 2027 switch weeks (in the future of the real clock, so the test runtime never fires
        // these alarms for real). US clocks go forward on Sunday 2027-03-14 at 02:00.
        // Saturday 13:40 EST (18:40Z); the next one is Sunday 13:40 EDT (17:40Z).
        clock.t = Date.parse('2027-03-13T18:40:00Z');
        await core.alarm();
        expect(await storage.getAlarm()).toBe(Date.parse('2027-03-14T17:40:00Z'));
        // US clocks go back on Sunday 2027-11-07 at 02:00.
        // Saturday 13:40 EDT (17:40Z); the next one is Sunday 13:40 EST (18:40Z).
        clock.t = Date.parse('2027-11-06T17:40:00Z');
        await core.alarm();
        expect(await storage.getAlarm()).toBe(Date.parse('2027-11-07T18:40:00Z'));
      },
      using(source),
    );
  });

  it('passes the stored timezone to the source and computes since_date in it', async () => {
    const guild = nextGuild();
    const { source, calls } = quiet();
    await runCore(
      guild,
      async ({ guildId, core, clock, sql }) => {
        bindWith(sql, guildId, NEW_YORK);
        // 2027-01-16 02:00Z is still 2027-01-15 in New York, so since is 01-15 minus 7 days.
        clock.t = Date.parse('2027-01-16T02:00:00Z');
        await core.syncLeet();
        expect(calls[0]?.opts).toEqual({ timezone: NEW_YORK, since: '2027-01-08', limit: 31 });
        expect(sql.exec('SELECT since_date FROM leet_sync').toArray()).toEqual([
          { since_date: '2027-01-08' },
        ]);
      },
      using(source),
    );
  });

  it('syncs the mock source in the guild timezone: days are finalised at 13:38 there', async () => {
    const guild = nextGuild();
    await runCore(
      guild,
      async ({ guildId, core, clock, sql }) => {
        bindWith(sql, guildId, NEW_YORK);
        await core.createSession(guildId, USER);
        // 2027-01-15 18:37:59Z is 13:37:59 EST: the 15th is not finalised yet.
        clock.t = Date.parse('2027-01-15T18:37:59Z');
        const first = await core.syncLeet();
        expect(first.daysProcessed).toBe(7); // 01-08 .. 01-14
        clock.t = Date.parse('2027-01-15T18:38:00Z');
        expect((await core.syncLeet()).daysProcessed).toBe(1); // 01-15
        expect(syncState(sql)[0]?.since_date).toBe('2027-01-08');
      },
      (clock) => ({
        createLeetSource: (known) =>
          createMockLeetSource({ now: () => clock.t, knownPlayers: known, backfillDays: 7 }),
      }),
    );
  });

  it('falls back to the default for an invalid stored value, warning without the value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const guild = nextGuild();
    const { source, calls } = quiet();
    await runCore(
      guild,
      async ({ guildId, core, storage, sql }) => {
        bindWith(sql, guildId, 'Mars/Olympus-Mons');
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);
        await core.syncLeet();
        expect(calls[0]?.opts.timezone).toBe(DEFAULT_GUILD_TIMEZONE);
        await core.ensureAlarm();
        expect(await storage.getAlarm()).toBe(nextOccurrence(T0, 13, 40, DEFAULT_GUILD_TIMEZONE));
        expect(warn).toHaveBeenCalled();
        expect(JSON.stringify(warn.mock.calls)).not.toContain('Mars');
      },
      using(source),
    );
  });

  it('caches the timezone until it changes, and setTimezone updates it and re-arms the alarm', async () => {
    const guild = nextGuild();
    const { source } = quiet();
    await runCore(
      guild,
      async ({ guildId, core, storage, sql }) => {
        await core.createSession(guildId, USER);
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);
        const helsinkiAlarm = await storage.getAlarm();
        expect(helsinkiAlarm).toBe(nextOccurrence(T0, 13, 40, DEFAULT_GUILD_TIMEZONE));

        // Cached: an out-of-band write is not seen until the cache is invalidated.
        sql.exec('UPDATE guild_meta SET timezone = ?', NEW_YORK);
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);

        expect(await core.setTimezone('Mars/Olympus-Mons')).toBe(false);
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);

        expect(await core.setTimezone('Asia/Tokyo')).toBe(true);
        expect(core.timezone()).toBe('Asia/Tokyo');
        expect(sql.exec('SELECT timezone FROM guild_meta').toArray()).toEqual([
          { timezone: 'Asia/Tokyo' },
        ]);
        expect(await storage.getAlarm()).toBe(nextOccurrence(T0, 13, 40, 'Asia/Tokyo'));
      },
      using(source),
    );
  });

  it('refuses setTimezone before the guild is bound', async () => {
    await runCore(
      nextGuild(),
      async ({ core }) => {
        expect(await core.setTimezone('Asia/Tokyo')).toBe(false);
        expect(core.timezone()).toBe(DEFAULT_GUILD_TIMEZONE);
      },
      { createLeetSource: () => null },
    );
  });
});
