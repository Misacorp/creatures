import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { awardDay } from '../src/games-award';
import type { LeetSource } from '../src/leet';
import {
  AWAY_AFTER_MS,
  AWAY_KEEP_MS,
  awayItems,
  awaySummary,
  pruneAway,
  recordAway,
  type AwaySummary,
} from '../src/while-away';
import { runCore, type CoreContext } from './helpers';
import {
  DAY,
  HELSINKI,
  HOUR,
  W02,
  forcePool,
  membersOf,
  raidLedger,
  rows,
  runRaid,
  seedPlayer,
  nextGuild,
} from './raid-helpers';

/**
 * While you were away (decisions.md, 2026-10-26): payouts record for a player who has not been seen for
 * `AWAY_AFTER_MS`, the state carries the summary, and the player dismisses it.
 */

const SUNDAY = W02.afterFinale;

const sums = (sql: SqlStorage, userId: string) =>
  rows<{
    kind: string;
    bait: number;
    essence: number;
    items: number;
    creatures: number;
    medals: number;
    xp: number;
  }>(
    sql,
    'SELECT kind, bait, essence, items, creatures, medals, xp FROM away_rewards WHERE user_id = ? ORDER BY kind',
    userId,
  );

const player = (ctx: CoreContext, n: number, lastSeenAgo: number) =>
  seedPlayer(ctx, n, { lastSeenAt: ctx.clock.t - lastSeenAgo, creatures: 2, level: 8 });

describe('recording a payout', () => {
  it('records only for a player last seen longer ago than the threshold', async () => {
    await runCore(nextGuild(), (ctx) => {
      const away = player(ctx, 1, AWAY_AFTER_MS + 1);
      const edge = player(ctx, 2, AWAY_AFTER_MS);
      const here = player(ctx, 3, HOUR);
      for (const p of [away, edge, here]) {
        recordAway(ctx.sql, p.id, 'leet', { bait: 15 }, ctx.clock.t);
      }
      recordAway(ctx.sql, 'not-a-player', 'leet', { bait: 15 }, ctx.clock.t);
      expect(sums(ctx.sql, away.id)).toHaveLength(1);
      expect(sums(ctx.sql, edge.id)).toEqual([]);
      expect(sums(ctx.sql, here.id)).toEqual([]);
      expect(sums(ctx.sql, 'not-a-player')).toEqual([]);
    });
  });

  it('sums several payouts of a source, keeps sources apart and skips empty ones', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1, 3 * DAY);
      recordAway(ctx.sql, p.id, 'leet', { bait: 15 }, ctx.clock.t);
      recordAway(ctx.sql, p.id, 'leet', { bait: 17 }, ctx.clock.t + 5);
      recordAway(ctx.sql, p.id, 'raid', { essence: 30, xp: 20 }, ctx.clock.t + 6);
      recordAway(ctx.sql, p.id, 'raid', { items: 1, creatures: 1 }, ctx.clock.t + 7);
      recordAway(ctx.sql, p.id, 'games', {}, ctx.clock.t + 8);
      expect(sums(ctx.sql, p.id)).toEqual([
        { kind: 'leet', bait: 32, essence: 0, items: 0, creatures: 0, medals: 0, xp: 0 },
        { kind: 'raid', bait: 0, essence: 30, items: 1, creatures: 1, medals: 0, xp: 20 },
      ]);
      const times = rows<{ first_at: number; last_at: number }>(
        ctx.sql,
        "SELECT first_at, last_at FROM away_rewards WHERE kind = 'leet'",
      )[0];
      expect(times).toEqual({ first_at: ctx.clock.t, last_at: ctx.clock.t + 5 });
    });
  });

  it('counts the gear pieces and blueprints of a grant, not its parts', () => {
    expect(awayItems({ gear: [1], blueprints: [] })).toBe(1);
    expect(awayItems({ gear: [], blueprints: [1, 2] })).toBe(2);
    expect(awayItems({ gear: [], blueprints: [] })).toBe(0);
  });
});

describe('the hooked payouts', () => {
  it('records the daily leet Bait of an away player and not of a present one', async () => {
    const guild = nextGuild();
    const source: LeetSource = {
      getDays: (_guildId, opts) => {
        void opts;
        return Promise.resolve({
          days: [
            {
              id: `${guild}:2026-10-08`,
              date: '2026-10-08',
              participants: [
                { userId: '800000000000000001', leetAt: '2026-10-08T11:37:00.000Z' },
                { userId: '800000000000000002', leetAt: '2026-10-08T11:37:00.000Z' },
              ],
            },
            {
              id: `${guild}:2026-10-09`,
              date: '2026-10-09',
              participants: [{ userId: '800000000000000001', leetAt: '2026-10-09T11:37:00.000Z' }],
            },
          ],
          nextCursor: 'c',
          hasMore: false,
        });
      },
    };
    await runCore(
      guild,
      async (ctx) => {
        for (const [id, ago] of [
          ['800000000000000001', 2 * DAY],
          ['800000000000000002', HOUR],
        ] as const) {
          ctx.sql.exec(
            'INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
            id,
            'P',
            ctx.clock.t - 9 * DAY,
            ctx.clock.t - ago,
          );
        }
        await ctx.core.syncLeet();
        const away = sums(ctx.sql, '800000000000000001');
        expect(away).toHaveLength(1);
        expect(away[0]?.kind).toBe('leet');
        const paid = ctx.core.balances('800000000000000001').bait;
        expect(away[0]?.bait).toBe(paid);
        expect(paid).toBeGreaterThan(0);
        expect(sums(ctx.sql, '800000000000000002')).toEqual([]);
        expect(ctx.core.balances('800000000000000002').bait).toBeGreaterThan(0);
        // Syncing again pays nothing twice, so records nothing twice.
        await ctx.core.syncLeet();
        expect(sums(ctx.sql, '800000000000000001')[0]?.bait).toBe(paid);
      },
      { createLeetSource: () => source },
    );
  });

  it("records the raid's Essence, experience and finale gear of away members only", async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 5 }, (_, i) => seedPlayer(ctx, i + 1, { level: 15 }));
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      const members = membersOf(ctx.sql);
      expect(members).toHaveLength(5);
      // One member played on Saturday night, the others were last seen when the week opened.
      const present = players[0]?.id as string;
      ctx.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', SUNDAY - HOUR, present);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);

      const ledger = raidLedger(ctx.sql);
      expect(ledger.length).toBeGreaterThan(0);
      expect(sums(ctx.sql, present)).toEqual([]);
      for (const p of players.slice(1)) {
        const [row, ...extra] = sums(ctx.sql, p.id);
        expect(extra).toEqual([]);
        expect(row?.kind).toBe('raid');
        const essence = ledger.filter((l) => l.user_id === p.id).reduce((n, l) => n + l.amount, 0);
        expect(row?.essence).toBe(essence);
        expect(essence).toBeGreaterThan(0);
        // The experience of the stages their creatures fought, and the finale's gear piece or blueprint.
        expect(row?.xp).toBeGreaterThan(0);
        expect(row?.items).toBe(1);
      }
    });
  });

  it('records the Valley Games medals and experience once, for away players only', async () => {
    await runCore(nextGuild(), (ctx) => {
      const away = player(ctx, 1, 3 * DAY);
      const here = player(ctx, 2, HOUR);
      ctx.sql.exec(
        'INSERT INTO games_days (day, lineup_json, created_at, locked_at, show_at, ends_at) VALUES (?, ?, 1, 1, 1, 1)',
        '2027-01-12',
        JSON.stringify(['melon-run', 'pepper-panic']),
      );
      const place = (event: string, who: typeof away, place: number, medal: string | null) =>
        ctx.sql.exec(
          `INSERT INTO games_placings (day, event_id, user_id, creature_ids, place, medal, score, bot)
           VALUES ('2027-01-12', ?, ?, ?, ?, ?, 10, 0)`,
          event,
          who.id,
          JSON.stringify([who.creatureIds[0]]),
          place,
          medal,
        );
      place('melon-run', away, 1, 'gold');
      place('pepper-panic', away, 4, null);
      place('melon-run', here, 2, 'silver');
      const deps = {
        storage: ctx.storage,
        now: () => ctx.clock.t,
        rng: createSeededRng('away-games'),
        gearRng: createSeededRng('away-games-gear'),
        timezone: () => HELSINKI,
      };
      expect(awardDay(deps, '2027-01-12')).toBe(true);
      expect(awardDay(deps, '2027-01-12')).toBe(false);
      const xp = rows<{ xp: number }>(
        ctx.sql,
        "SELECT SUM(xp) AS xp FROM games_placings WHERE user_id = ? AND day = '2027-01-12'",
        away.id,
      )[0]?.xp;
      expect(sums(ctx.sql, away.id)).toEqual([
        { kind: 'games', bait: 0, essence: 0, items: 0, creatures: 0, medals: 1, xp: xp ?? -1 },
      ]);
      expect(xp).toBeGreaterThan(0);
      expect(sums(ctx.sql, here.id)).toEqual([]);
    });
  });
});

describe('the summary and the dismiss route', () => {
  /** An away player with a recorded payout, back with a new session. */
  async function comeBack(ctx: CoreContext) {
    const p = player(ctx, 1, 0);
    const first = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
    expect(first).toBeTruthy();
    ctx.clock.t += 3 * DAY;
    recordAway(ctx.sql, p.id, 'leet', { bait: 15 }, ctx.clock.t);
    recordAway(ctx.sql, p.id, 'raid', { essence: 40, items: 1 }, ctx.clock.t + 1000);
    // The player opens the game: last_seen_at moves, the record stays.
    const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
    return { p, secret };
  }

  const stateOf = async (ctx: CoreContext, secret: string) =>
    (await ctx.request(secret, '/api/state')).json<{ awayRewards: AwaySummary | null }>();

  it('shows null when nothing was recorded', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = player(ctx, 1, 0);
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      expect((await stateOf(ctx, secret)).awayRewards).toBeNull();
    });
  });

  it('carries the sums by source and the trips and jobs waiting to be claimed', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const { p, secret } = await comeBack(ctx);
      const [creature] = p.creatureIds as [string, string];
      const trip = (id: string, endsAt: number, status = 'active') =>
        ctx.sql.exec(
          `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status)
           VALUES (?, ?, ?, 'short', 'basic', 1, 0, ?, ?, ?)`,
          id,
          p.id,
          creature,
          endsAt - HOUR,
          endsAt,
          status,
        );
      trip('t-home', ctx.clock.t - HOUR);
      trip('t-out', ctx.clock.t + HOUR);
      trip('t-old', ctx.clock.t - 2 * HOUR, 'claimed');
      const job = (id: string, endsAt: number, claimedAt: number | null) =>
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at, claimed_at)
           VALUES (?, ?, ?, 'craft', '{}', ?, ?, ?)`,
          id,
          p.id,
          id === 'j-done' ? creature : (p.creatureIds[1] as string),
          endsAt - HOUR,
          endsAt,
          claimedAt,
        );
      job('j-done', ctx.clock.t - HOUR, null);
      job('j-claimed', ctx.clock.t - HOUR, ctx.clock.t - 1);
      const { awayRewards } = await stateOf(ctx, secret);
      expect(awayRewards).toEqual({
        sources: [
          { kind: 'leet', bait: 15, essence: 0, items: 0, creatures: 0, medals: 0, xp: 0 },
          { kind: 'raid', bait: 0, essence: 40, items: 1, creatures: 0, medals: 0, xp: 0 },
        ],
        since: ctx.clock.t,
        until: ctx.clock.t + 1000,
        tripsWaiting: 1,
        jobsWaiting: 1,
      });
    });
  });

  it('dismisses what was shown: strict body, the session decides who, repeats change nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const { p, secret } = await comeBack(ctx);
      const other = player(ctx, 2, 3 * DAY);
      recordAway(ctx.sql, other.id, 'leet', { bait: 15 }, ctx.clock.t);
      const shown = (await stateOf(ctx, secret)).awayRewards;
      const until = shown?.until ?? 0;

      expect((await ctx.request(secret, '/api/away/dismiss', 'POST', {})).status).toBe(400);
      expect(
        (await ctx.request(secret, '/api/away/dismiss', 'POST', { until, userId: other.id }))
          .status,
      ).toBe(400);
      expect((await ctx.request(secret, '/api/away/dismiss', 'POST', { until: -1 })).status).toBe(
        400,
      );
      expect((await ctx.request('nope', '/api/away/dismiss', 'POST', { until })).status).toBe(401);
      expect(sums(ctx.sql, p.id)).toHaveLength(2);

      // A payout that landed after the card was drawn is not cleared unseen.
      // (a payout while they were away again: they are marked unseen for the test)
      ctx.sql.exec('UPDATE players SET last_seen_at = 0 WHERE user_id = ?', p.id);
      recordAway(ctx.sql, p.id, 'games', { medals: 1 }, until + 5000);
      const ok = await ctx.request(secret, '/api/away/dismiss', 'POST', { until });
      expect(ok.status).toBe(200);
      const after = await ok.json<{ state: { awayRewards: AwaySummary | null } }>();
      expect(after.state.awayRewards?.sources.map((s) => s.kind)).toEqual(['games']);
      // Another player's rows are untouched.
      expect(sums(ctx.sql, other.id)).toHaveLength(1);

      const again = await ctx.request(secret, '/api/away/dismiss', 'POST', { until: until + 6000 });
      expect(again.status).toBe(200);
      expect((await again.json<{ state: { awayRewards: unknown } }>()).state.awayRewards).toBe(
        null,
      );
      expect(
        (await ctx.request(secret, '/api/away/dismiss', 'POST', { until: until + 6000 })).status,
      ).toBe(200);
    });
  });

  it('reads the summary through the primary key', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1, 3 * DAY);
      recordAway(ctx.sql, p.id, 'leet', { bait: 15 }, ctx.clock.t);
      const plan = rows<{ detail: string }>(
        ctx.sql,
        'EXPLAIN QUERY PLAN SELECT kind FROM away_rewards WHERE user_id = ? ORDER BY kind',
        p.id,
      );
      expect(plan.map((r) => r.detail).join(' ')).toContain('(user_id=?)');
      expect(awaySummary(ctx.sql, 'nobody', ctx.clock.t)).toBeNull();
    });
  });
});

describe('pruning', () => {
  it('drops rows whose last payout is older than the keep time, in the daily cleanup', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const old = player(ctx, 1, 200 * DAY);
      const fresh = player(ctx, 2, 5 * DAY);
      recordAway(ctx.sql, old.id, 'leet', { bait: 15 }, ctx.clock.t - AWAY_KEEP_MS - DAY);
      recordAway(ctx.sql, fresh.id, 'leet', { bait: 15 }, ctx.clock.t - DAY);
      pruneAway(ctx.sql, ctx.clock.t);
      expect(sums(ctx.sql, old.id)).toEqual([]);
      expect(sums(ctx.sql, fresh.id)).toHaveLength(1);

      // The alarm's cleanup runs it too.
      recordAway(ctx.sql, old.id, 'leet', { bait: 15 }, ctx.clock.t - AWAY_KEEP_MS - DAY);
      await ctx.core.alarm();
      expect(sums(ctx.sql, old.id)).toEqual([]);
    });
  });
});
