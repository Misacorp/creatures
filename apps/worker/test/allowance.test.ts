import { RULES, dailyAllowance } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { allowanceKey } from '../src/allowance';
import { addDays, gameDay, zonedTimeToEpoch } from '../src/time';
import { OTHER_USER_ID, USER_ID, runCore, type CoreContext } from './helpers';

const HELSINKI = 'Europe/Helsinki';
const NEW_YORK = 'America/New_York';
const USER = { id: USER_ID, displayName: 'Misa' };
const OTHER = { id: OTHER_USER_ID, displayName: 'Other' };
const RESET = RULES.daily.reset;

let guildCounter = 0;
/** A fresh snowflake-shaped guild id per test, so Durable Object storage never overlaps. */
const nextGuild = () => String(750000000000000000n + BigInt(++guildCounter));

/** Allowance tests turn the allowance on (the shared test helper leaves it off). */
const on = { dailyAllowance: true } as const;

interface MeBody {
  balances: { bait: number; essence: number };
  allowance: { day: string; amount: number } | null;
}

/** Opens the game as the user: a fresh session at the current clock, then GET /api/me. */
async function open(ctx: CoreContext, user = USER, path = '/api/me'): Promise<Response> {
  const secret = await ctx.core.createSession(ctx.guildId, user);
  return ctx.request(secret, path);
}

const allowanceRows = (sql: SqlStorage, userId = USER_ID) =>
  sql
    .exec<{ amount: number; idempotency_key: string; meta: string; source: string }>(
      "SELECT amount, idempotency_key, meta, source FROM ledger WHERE user_id = ? AND source = 'allowance' ORDER BY id",
      userId,
    )
    .toArray();

const eventCount = (sql: SqlStorage) =>
  sql
    .exec<{ n: number }>(
      "SELECT COUNT(*) AS n FROM analytics_events WHERE kind = 'daily_allowance'",
    )
    .one().n;

const at = (date: string, hour: number, minute: number, tz = HELSINKI): number =>
  zonedTimeToEpoch(date, hour, minute, tz);

describe('the daily Bait allowance', () => {
  it('pays on the first authenticated request, records it, and tells the player once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 15, 0);
        const first = await (await open(ctx)).json<MeBody>();
        expect(first.balances.bait).toBe(dailyAllowance());
        expect(first.allowance).toEqual({ day: '2026-10-20', amount: dailyAllowance() });

        const rows = allowanceRows(ctx.sql);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          amount: dailyAllowance(),
          idempotency_key: allowanceKey('2026-10-20'),
          source: 'allowance',
        });
        expect(JSON.parse(rows[0]?.meta ?? '')).toEqual({ day: '2026-10-20' });
        expect(eventCount(ctx.sql)).toBe(1);
        const props = ctx.sql
          .exec<{ props_json: string }>(
            "SELECT props_json FROM analytics_events WHERE kind = 'daily_allowance'",
          )
          .one().props_json;
        expect(JSON.parse(props)).toEqual({ amount: dailyAllowance() });

        // Later requests the same day pay nothing and say nothing.
        const again = await (await open(ctx)).json<MeBody>();
        expect(again.balances.bait).toBe(dailyAllowance());
        expect(again.allowance).toBeNull();
        expect(allowanceRows(ctx.sql)).toHaveLength(1);
        expect(eventCount(ctx.sql)).toBe(1);
      },
      on,
    );
  });

  it('is paid by any route, and /api/me still tells the player afterwards', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 15, 0);
        const secret = await ctx.core.createSession(ctx.guildId, USER);
        expect((await ctx.request(secret, '/api/ledger')).status).toBe(200);
        expect(allowanceRows(ctx.sql)).toHaveLength(1);
        const me = await (await ctx.request(secret, '/api/me')).json<MeBody>();
        expect(me.balances.bait).toBe(dailyAllowance());
        expect(me.allowance).toEqual({ day: '2026-10-20', amount: dailyAllowance() });
        const next = await (await ctx.request(secret, '/api/me')).json<MeBody>();
        expect(next.allowance).toBeNull();
      },
      on,
    );
  });

  it('never pays twice for parallel requests', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 15, 0);
        const secret = await ctx.core.createSession(ctx.guildId, USER);
        const answers = await Promise.all(
          Array.from({ length: 6 }, () => ctx.request(secret, '/api/me')),
        );
        const bodies = await Promise.all(answers.map((r) => r.json<MeBody>()));
        expect(ctx.core.balances(USER_ID).bait).toBe(dailyAllowance());
        expect(allowanceRows(ctx.sql)).toHaveLength(1);
        expect(eventCount(ctx.sql)).toBe(1);
        // Exactly one answer carries the notice.
        expect(bodies.filter((b) => b.allowance !== null)).toHaveLength(1);
      },
      on,
    );
  });

  it('never pays twice for retries, even when the object restarts with a cold cache', async () => {
    const guild = nextGuild();
    const clock = at('2026-10-20', 15, 0);
    await runCore(
      guild,
      async (ctx) => {
        ctx.clock.t = clock;
        await open(ctx);
      },
      on,
    );
    await runCore(
      guild,
      async (ctx) => {
        ctx.clock.t = clock + 60_000;
        const me = await (await open(ctx)).json<MeBody>();
        expect(me.balances.bait).toBe(dailyAllowance());
        expect(me.allowance).toBeNull();
        expect(allowanceRows(ctx.sql)).toHaveLength(1);
        expect(eventCount(ctx.sql)).toBe(1);
        // Asking the ledger directly with the same key is a replay too.
        expect(
          ctx.core.credit({
            userId: USER_ID,
            currency: 'bait',
            amount: dailyAllowance(),
            source: 'allowance',
            idempotencyKey: allowanceKey('2026-10-20'),
          }),
        ).toEqual({ applied: false });
      },
      on,
    );
  });

  it('pays each player separately, and a new player on their first day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 15, 0);
        await open(ctx, USER);
        await open(ctx, OTHER);
        expect(ctx.core.balances(USER_ID).bait).toBe(dailyAllowance());
        expect(ctx.core.balances(OTHER_USER_ID).bait).toBe(dailyAllowance());
        expect(allowanceRows(ctx.sql, OTHER_USER_ID)).toHaveLength(1);
        expect(eventCount(ctx.sql)).toBe(2);
      },
      on,
    );
  });

  it('pays again after the 13:37 reset, and not before it', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 13, 36) + 59_000;
        await open(ctx);
        // 13:36:59 belongs to the game day that started on the 19th.
        expect(allowanceRows(ctx.sql).map((r) => r.idempotency_key)).toEqual([
          allowanceKey('2026-10-19'),
        ]);
        ctx.clock.t = at('2026-10-20', 13, 37) - 1;
        await open(ctx);
        expect(allowanceRows(ctx.sql)).toHaveLength(1);

        ctx.clock.t = at('2026-10-20', 13, 37);
        const me = await (await open(ctx)).json<MeBody>();
        expect(me.allowance).toEqual({ day: '2026-10-20', amount: dailyAllowance() });
        expect(allowanceRows(ctx.sql).map((r) => r.idempotency_key)).toEqual([
          allowanceKey('2026-10-19'),
          allowanceKey('2026-10-20'),
        ]);
        expect(ctx.core.balances(USER_ID).bait).toBe(2 * dailyAllowance());

        // The rest of the day pays nothing more.
        ctx.clock.t = at('2026-10-21', 13, 36);
        await open(ctx);
        expect(allowanceRows(ctx.sql)).toHaveLength(2);
      },
      on,
    );
  });

  it('follows the guild timezone across a DST change (Helsinki, fall back on 2026-10-25)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Before the change 13:37 is 10:37Z (UTC+3); after it, 11:37Z (UTC+2).
        const lateReset = at('2026-10-26', 13, 37);
        expect(lateReset).toBe(Date.parse('2026-10-26T11:37:00Z'));
        // 10:37Z on the 26th is only 12:37 local now: still the game day of the 25th.
        ctx.clock.t = Date.parse('2026-10-26T10:37:00Z');
        expect(gameDay(ctx.clock.t, HELSINKI, RESET)).toBe('2026-10-25');
        await open(ctx);
        expect(allowanceRows(ctx.sql).map((r) => r.idempotency_key)).toEqual([
          allowanceKey('2026-10-25'),
        ]);
        ctx.clock.t = lateReset - 1;
        await open(ctx);
        expect(allowanceRows(ctx.sql)).toHaveLength(1);
        ctx.clock.t = lateReset;
        await open(ctx);
        expect(allowanceRows(ctx.sql).map((r) => r.idempotency_key)).toEqual([
          allowanceKey('2026-10-25'),
          allowanceKey('2026-10-26'),
        ]);
      },
      on,
    );
  });

  it('uses the guild timezone, not the server one (New York)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.sql.exec(
          'INSERT INTO guild_meta (id, guild_id, timezone) VALUES (1, ?, ?)',
          ctx.guildId,
          NEW_YORK,
        );
        // 2027-03-14 is the US spring-forward day. 13:37 EDT is 17:37Z; 13:36 EDT is still the 13th's day.
        ctx.clock.t = at('2027-03-14', 13, 36, NEW_YORK);
        await open(ctx);
        ctx.clock.t = at('2027-03-14', 13, 37, NEW_YORK);
        expect(ctx.clock.t).toBe(Date.parse('2027-03-14T17:37:00Z'));
        await open(ctx);
        expect(allowanceRows(ctx.sql).map((r) => r.idempotency_key)).toEqual([
          allowanceKey('2027-03-13'),
          allowanceKey('2027-03-14'),
        ]);
      },
      on,
    );
  });

  it('never pays a missed day later', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 15, 0);
        await open(ctx);
        // Away for three game days, then back.
        ctx.clock.t = at(addDays('2026-10-20', 4), 15, 0);
        const me = await (await open(ctx)).json<MeBody>();
        expect(me.allowance).toEqual({ day: '2026-10-24', amount: dailyAllowance() });
        expect(allowanceRows(ctx.sql).map((r) => r.idempotency_key)).toEqual([
          allowanceKey('2026-10-20'),
          allowanceKey('2026-10-24'),
        ]);
        expect(ctx.core.balances(USER_ID).bait).toBe(2 * dailyAllowance());
      },
      on,
    );
  });

  it('keeps the allowance and the leet bonus as separate ledger rows', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = at('2026-10-20', 15, 0);
        ctx.core.credit({
          userId: USER_ID,
          currency: 'bait',
          amount: 15,
          source: 'leet',
          idempotencyKey: `leet:${ctx.guildId}:2026-10-20`,
        });
        await open(ctx);
        const sources = ctx.sql
          .exec<{ source: string; amount: number }>('SELECT source, amount FROM ledger ORDER BY id')
          .toArray();
        expect(sources).toEqual([
          { source: 'leet', amount: 15 },
          { source: 'allowance', amount: dailyAllowance() },
        ]);
        expect(ctx.core.balances(USER_ID).bait).toBe(15 + dailyAllowance());
      },
      on,
    );
  });

  it('pays nothing when the allowance is switched off (tests only)', async () => {
    await runCore(nextGuild(), async (ctx) => {
      ctx.clock.t = at('2026-10-20', 15, 0);
      const me = await (await open(ctx)).json<MeBody>();
      expect(me.balances.bait).toBe(0);
      expect(me.allowance).toBeNull();
    });
  });
});
