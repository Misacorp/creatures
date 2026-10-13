import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { serializeProps, type AnalyticsEvent } from '../src/analytics';
import { MAX_CATCH_UP_DAYS, canonicalDims } from '../src/analytics-rollup';
import { addDays, gameDay, zonedTimeToEpoch } from '../src/time';
import {
  OTHER_USER_ID,
  USER_ID,
  LATEST_SCHEMA_VERSION,
  runCore,
  type CoreContext,
} from './helpers';
import { HELSINKI, count, nextGuild, rows } from './raid-helpers';

const ALICE = 'a'.repeat(32);
const BOB = 'b'.repeat(32);
const DAY = '2027-01-14';

/** The instant a game day starts (13:37 in Helsinki). */
const startOf = (day: string): number =>
  zonedTimeToEpoch(day, RULES.daily.reset.hour, RULES.daily.reset.minute, HELSINKI);
const HOUR = 3_600_000;

let nextId = 0;
/** Writes an event the way the log does (same props sanitizer), at a chosen time and actor. */
function log(ctx: CoreContext, at: number, event: AnalyticsEvent, actor: string | null = ALICE) {
  ctx.sql.exec(
    'INSERT INTO analytics_events (id, at, kind, actor_hash, props_json) VALUES (?, ?, ?, ?, ?)',
    ++nextId + 1_000_000,
    at,
    event.kind,
    actor,
    serializeProps(event),
  );
}

interface Daily {
  day: string;
  metric: string;
  dims: Record<string, unknown>;
  value: number;
}

function daily(ctx: CoreContext, day?: string): Daily[] {
  return rows<{ day: string; metric: string; dims_json: string; value: number }>(
    ctx.sql,
    `SELECT day, metric, dims_json, value FROM analytics_daily
     ${day === undefined ? '' : `WHERE day = '${day}'`} ORDER BY day, metric, dims_json`,
  ).map((r) => ({
    day: r.day,
    metric: r.metric,
    dims: JSON.parse(r.dims_json) as Record<string, unknown>,
    value: r.value,
  }));
}

/** The value of a metric with exactly these dims (0 when absent). */
function value(list: Daily[], metric: string, dims: Record<string, unknown> = {}): number {
  const key = canonicalDims(dims);
  return list.find((r) => r.metric === metric && canonicalDims(r.dims) === key)?.value ?? 0;
}

const SEND: AnalyticsEvent = {
  kind: 'expedition_send',
  species: 'splashet',
  duration: 'short',
  destination: 'unknown-place',
  supplies: ['unknown-supply', 'unknown-supply'],
  bought: 1,
  cost: 12,
  rank: 2,
};

describe('analytics_daily: schema and values', () => {
  it('is created by migration 20', async () => {
    await runCore(nextGuild(), (ctx) => {
      expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(20);
      expect(
        rows(ctx.sql, "SELECT 1 FROM sqlite_master WHERE name = 'analytics_daily'"),
      ).toHaveLength(1);
      expect(() =>
        ctx.sql.exec(
          "INSERT INTO analytics_daily (day, metric, dims_json, value) VALUES ('d', 'm', '{}', -1)",
        ),
      ).toThrow();
    });
  });

  it('canonicalises dims and replaces anything that is not an id or an integer', () => {
    expect(canonicalDims({ b: 1, a: 'tide', c: true })).toBe('{"a":"tide","b":1,"c":1}');
    expect(canonicalDims({ a: 'Hello World', b: 'x'.repeat(80), c: 'a'.repeat(32) })).toBe(
      '{"a":"other","b":"other","c":"other"}',
    );
    expect(canonicalDims({ n: -4, f: 2.9 })).toBe('{"f":2,"n":0}');
  });
});

describe('rollDay', () => {
  it('counts players, sessions, features and flows of one game day', async () => {
    await runCore(nextGuild(), (ctx) => {
      const t = startOf(DAY) + HOUR;
      log(ctx, t, { kind: 'session_start', returning: false }, ALICE);
      log(ctx, t + 5, { kind: 'session_start', returning: true }, BOB);
      log(ctx, t + 10, { kind: 'session_start', returning: true }, BOB);
      log(ctx, t + 20, SEND, ALICE);
      log(ctx, t + 21, SEND, ALICE);
      log(
        ctx,
        t + 30,
        {
          kind: 'gear_drop',
          source: 'dungeon',
          gear: [{ base: 'unknown-base', rarity: 'rare' }],
          converted: 0,
          scrap: 7,
          shards: 3,
          glimmer: 1,
          blueprint: null,
          blueprintDuplicate: false,
          supplies: 2,
          parts: { scrap: 7, 'tide-shard': 3, glimmer: 1 },
        },
        BOB,
      );
      log(
        ctx,
        t + 31,
        {
          kind: 'job_start',
          job: 'craft',
          base: 'unknown-base',
          rarity: 'rare',
          species: 'splashet',
          hours: 8,
          skillLevel: 2,
          parts: { scrap: 18, 'tide-shard': 1 },
        },
        BOB,
      );
      log(
        ctx,
        t + 32,
        {
          kind: 'job_claim',
          job: 'supply',
          base: 'unknown-base',
          rarity: 'common',
          upgraded: false,
          enchant: null,
          xp: 5,
          skillLevel: 3,
          leveledUp: true,
          yield: 4,
        },
        BOB,
      );
      log(
        ctx,
        t + 40,
        {
          kind: 'phase_result',
          phase: 'finale',
          boss: 'unknown-boss',
          rank: 3,
          festival: false,
          partySize: 5,
          win: true,
          rounds: 8,
          topShareBp: 4000,
        },
        null,
      );
      log(
        ctx,
        t + 41,
        {
          kind: 'dungeon_run',
          depth: 4,
          attempt: 2,
          roomsCleared: 3,
          cleared: true,
          landmark: false,
          modifiers: [],
          team: [{ species: 'splashet', role: 'guard' }],
          gear: 1,
        },
        ALICE,
      );
      // The ledger counts too: Bait in from leet, Bait out for an expedition.
      ctx.core.credit({
        userId: USER_ID,
        currency: 'bait',
        amount: 100,
        source: 'leet',
        idempotencyKey: 'leet:1',
      });

      // The credit above was stamped at the clock's time: put the clock inside the day first.
      ctx.sql.exec('UPDATE ledger SET created_at = ?', t + 50);

      const written = ctx.core.rollup.rollDay(DAY, HELSINKI);
      const list = daily(ctx, DAY);
      expect(list).toHaveLength(written);

      expect(value(list, 'dau')).toBe(2);
      expect(value(list, 'sessions')).toBe(3);
      expect(value(list, 'new_players')).toBe(1);
      expect(value(list, 'events', { kind: 'expedition_send' })).toBe(2);
      expect(value(list, 'users', { feature: 'expeditions' })).toBe(1);
      expect(value(list, 'users', { feature: 'workshop' })).toBe(1);
      expect(value(list, 'rolled')).toBe(1);

      expect(value(list, 'expedition.send', { destination: 'unknown', length: 'short' })).toBe(2);
      expect(value(list, 'explorer.send_rank', { rank: 2 })).toBe(2);
      expect(value(list, 'expedition.supply_used', { supply: 'unknown' })).toBe(4);
      expect(value(list, 'workshop.job_start', { job: 'craft' })).toBe(1);
      expect(value(list, 'workshop.skill_level', { level: 3 })).toBe(1);
      expect(value(list, 'dungeon.run', { attempt: 2, cleared: 1 })).toBe(1);
      expect(value(list, 'dungeon.clear_depth', { depth: 4 })).toBe(1);
      expect(value(list, 'gear.drop', { source: 'dungeon', rarity: 'rare' })).toBe(1);
      expect(value(list, 'raid.phase', { phase: 'finale', rank: 3, festival: 0, win: 1 })).toBe(1);

      // Resource flow: ledger for Bait, events for parts and supplies.
      const flow = (currency: string, dir: string, label: string): number =>
        value(list, 'flow', { currency, dir, label });
      expect(flow('bait', 'source', 'leet')).toBe(100);
      expect(flow('scrap', 'source', 'dungeon')).toBe(7);
      expect(flow('tide-shard', 'source', 'dungeon')).toBe(3);
      expect(flow('glimmer', 'source', 'dungeon')).toBe(1);
      expect(flow('scrap', 'sink', 'workshop_craft')).toBe(18);
      expect(flow('tide-shard', 'sink', 'workshop_craft')).toBe(1);
      expect(flow('supplies', 'sink', 'expedition')).toBe(4);
      expect(flow('supplies', 'source', 'buy')).toBe(2);
      expect(flow('supplies', 'source', 'dungeon')).toBe(2);
      expect(flow('supplies', 'source', 'craft')).toBe(4);
    });
  });

  it('takes sinks and sources of Bait and Essence from the ledger by source label', async () => {
    await runCore(nextGuild(), (ctx) => {
      const t = startOf(DAY) + HOUR;
      ctx.core.credit({
        userId: USER_ID,
        currency: 'bait',
        amount: 100,
        source: 'leet',
        idempotencyKey: 'leet:1',
      });
      ctx.core.credit({
        userId: USER_ID,
        currency: 'essence',
        amount: 9,
        source: 'raid',
        idempotencyKey: 'raid:1',
      });
      const spent = ctx.core.spend({
        userId: USER_ID,
        currency: 'bait',
        amount: 30,
        purpose: 'training',
        idempotencyKey: 'train-0001',
        apply: () => 'ok',
      });
      expect(spent.status).toBe('ok');
      ctx.sql.exec('UPDATE ledger SET created_at = ?', t);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      const list = daily(ctx, DAY);
      const flow = (currency: string, dir: string, label: string): number =>
        value(list, 'flow', { currency, dir, label });
      expect(flow('bait', 'source', 'leet')).toBe(100);
      expect(flow('bait', 'sink', 'training')).toBe(30);
      expect(flow('bait', 'sink', 'leet')).toBe(0);
      expect(flow('essence', 'source', 'raid')).toBe(9);
    });
  });

  it('falls back to the totals for events written before the per-kind parts', async () => {
    await runCore(nextGuild(), (ctx) => {
      const t = startOf(DAY) + HOUR;
      ctx.sql.exec(
        'INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (?, ?, ?, ?)',
        t,
        'gear_dismantle',
        ALICE,
        JSON.stringify({
          base: 'x',
          rarity: 'epic',
          level: 0,
          scrap: 10,
          shards: 2,
          glimmer: 1,
          unequipped: false,
        }),
      );
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      const list = daily(ctx, DAY);
      expect(value(list, 'flow', { currency: 'scrap', dir: 'source', label: 'dismantle' })).toBe(
        10,
      );
      expect(
        value(list, 'flow', { currency: 'shard-any', dir: 'source', label: 'dismantle' }),
      ).toBe(2);
    });
  });

  it('uses the game day: 13:36 belongs to the day before, 13:37 starts the next', async () => {
    await runCore(nextGuild(), (ctx) => {
      const next = addDays(DAY, 1);
      log(ctx, startOf(next) - 1, SEND, ALICE);
      log(ctx, startOf(next), SEND, BOB);
      log(ctx, startOf(DAY), SEND, BOB);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      ctx.core.rollup.rollDay(next, HELSINKI);
      expect(value(daily(ctx, DAY), 'events', { kind: 'expedition_send' })).toBe(2);
      expect(value(daily(ctx, next), 'events', { kind: 'expedition_send' })).toBe(1);
      expect(value(daily(ctx, DAY), 'dau')).toBe(2);
      expect(value(daily(ctx, next), 'dau')).toBe(1);
    });
  });

  it('is idempotent: recomputing replaces the rows of the day and leaves other days alone', async () => {
    await runCore(nextGuild(), (ctx) => {
      log(ctx, startOf(DAY) + HOUR, SEND, ALICE);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      ctx.core.rollup.rollDay(addDays(DAY, 1), HELSINKI);
      const first = daily(ctx);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      expect(daily(ctx)).toEqual(first);
      // A late event shows up when the day is recomputed, without doubling anything.
      log(ctx, startOf(DAY) + 2 * HOUR, SEND, BOB);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      const again = daily(ctx, DAY);
      expect(value(again, 'expedition.send', { destination: 'unknown', length: 'short' })).toBe(2);
      expect(value(again, 'dau')).toBe(2);
      expect(value(again, 'rolled')).toBe(1);
      expect(daily(ctx, addDays(DAY, 1))).toEqual(first.filter((r) => r.day === addDays(DAY, 1)));
    });
  });

  it('never counts dev_action events', async () => {
    await runCore(nextGuild(), (ctx) => {
      const t = startOf(DAY) + HOUR;
      ctx.sql.exec(
        'INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (?, ?, ?, ?)',
        t,
        'dev_action',
        BOB,
        '{"action":"grant"}',
      );
      log(ctx, t, SEND, ALICE);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      const list = daily(ctx, DAY);
      expect(value(list, 'dau')).toBe(1);
      expect(list.some((r) => r.metric === 'events' && r.dims['kind'] === 'dev_action')).toBe(
        false,
      );
    });
  });

  it('reads the finale fights: roster size and how the abilities were fired', async () => {
    await runCore(nextGuild(), (ctx) => {
      const t = startOf(DAY) + HOUR;
      ctx.sql.exec(
        `INSERT INTO raid_live (week_id, party, practice, seed, input, members, abilities, started_at, round_ms, rounds)
         VALUES ('2027-W02', 1, 0, 'seed', '{}', ?, ?, ?, 1000, 12)`,
        JSON.stringify([
          { alias: 'p0', userId: USER_ID },
          { alias: 'p1', userId: OTHER_USER_ID },
        ]),
        JSON.stringify([
          { alias: 'p0', abilityId: 'a', mode: 'fired' },
          { alias: 'p1', abilityId: 'a', mode: 'default' },
          { alias: 'p1', abilityId: 'b', mode: 'default' },
          { alias: 'p0', abilityId: 'b', mode: 'held' },
        ]),
        t,
      );
      log(ctx, t + 10, { kind: 'live_join', stage: 'fight', practice: false }, ALICE);
      log(ctx, t + 11, { kind: 'live_join', stage: 'lobby', practice: false }, ALICE);
      log(ctx, t + 12, { kind: 'live_join', stage: 'fight', practice: true }, BOB);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      const list = daily(ctx, DAY);
      expect(value(list, 'raid.finale_fights', { practice: 0 })).toBe(1);
      expect(value(list, 'raid.finale_members', { practice: 0 })).toBe(2);
      expect(value(list, 'raid.finale_ability', { practice: 0, mode: 'fired' })).toBe(1);
      expect(value(list, 'raid.finale_ability', { practice: 0, mode: 'default' })).toBe(2);
      expect(value(list, 'raid.finale_ability', { practice: 0, mode: 'held' })).toBe(1);
      expect(value(list, 'raid.live_watchers')).toBe(1);
    });
  });

  it('stores counts only: no actor hash, user id or free text in any row', async () => {
    await runCore(nextGuild(), (ctx) => {
      const t = startOf(DAY) + HOUR;
      log(ctx, t, { kind: 'session_start', returning: false }, ALICE);
      log(ctx, t, SEND, BOB);
      ctx.core.rollup.rollDay(DAY, HELSINKI);
      const all = JSON.stringify(
        rows(ctx.sql, 'SELECT day, metric, dims_json, value FROM analytics_daily'),
      );
      expect(all).not.toContain(ALICE);
      expect(all).not.toContain(BOB);
      expect(all).not.toMatch(/[0-9a-f]{24,}/);
      for (const r of daily(ctx)) {
        expect(Number.isInteger(r.value) && r.value >= 0).toBe(true);
        for (const v of Object.values(r.dims)) {
          expect(typeof v === 'number' || /^[a-z0-9_.:-]{1,48}$/.test(String(v))).toBe(true);
        }
      }
    });
  });
});

describe('runDue', () => {
  it('rolls nothing for a guild with no events', async () => {
    await runCore(nextGuild(), (ctx) => {
      ctx.clock.t = startOf(DAY) + 3 * HOUR;
      expect(ctx.core.rollup.runDue()).toEqual([]);
      expect(count(ctx.sql, 'analytics_daily')).toBe(0);
    });
  });

  it('rolls yesterday (the last finished game day) once, and not the day still running', async () => {
    await runCore(nextGuild(), (ctx) => {
      log(ctx, startOf(DAY) + HOUR, SEND, ALICE);
      // Still inside the game day: nothing is finished.
      ctx.clock.t = startOf(DAY) + 5 * HOUR;
      expect(ctx.core.rollup.runDue()).toEqual([]);
      // Just after the next reset: the day is done.
      ctx.clock.t = startOf(addDays(DAY, 1)) + 3 * 60_000;
      expect(ctx.core.rollup.runDue()).toEqual([DAY]);
      expect(ctx.core.rollup.lastRolledDay()).toBe(DAY);
      expect(ctx.core.rollup.runDue()).toEqual([]);
      // The next day rolls the day after.
      log(ctx, startOf(addDays(DAY, 1)) + HOUR, SEND, BOB);
      ctx.clock.t = startOf(addDays(DAY, 2)) + 3 * 60_000;
      expect(ctx.core.rollup.runDue()).toEqual([addDays(DAY, 1)]);
    });
  });

  it('catches up on missed days, oldest first, and records quiet days too', async () => {
    await runCore(nextGuild(), (ctx) => {
      log(ctx, startOf(DAY) + HOUR, SEND, ALICE);
      ctx.clock.t = startOf(addDays(DAY, 3)) + HOUR;
      expect(ctx.core.rollup.runDue()).toEqual([DAY, addDays(DAY, 1), addDays(DAY, 2)]);
      expect(value(daily(ctx, addDays(DAY, 1)), 'rolled')).toBe(1);
      expect(value(daily(ctx, addDays(DAY, 1)), 'dau')).toBe(0);
      expect(value(daily(ctx, DAY), 'dau')).toBe(1);
    });
  });

  it('catches up at most 14 days', async () => {
    await runCore(nextGuild(), (ctx) => {
      log(ctx, startOf(DAY) + HOUR, SEND, ALICE);
      ctx.clock.t = startOf(addDays(DAY, 40)) + HOUR;
      const done = ctx.core.rollup.runDue();
      expect(done).toHaveLength(MAX_CATCH_UP_DAYS);
      expect(done.at(-1)).toBe(addDays(DAY, 39));
      expect(done[0]).toBe(addDays(DAY, 26));
      expect(gameDay(ctx.clock.t, HELSINKI, RULES.daily.reset)).toBe(addDays(DAY, 40));
    });
  });

  it('runs from the guild alarm, which is armed for just after the reset', async () => {
    const guild = nextGuild();
    await runCore(guild, async (ctx) => {
      await ctx.core.createSession(guild, { id: USER_ID, displayName: 'Rollup Rita' });
      // Now is the clock's 10:00 Helsinki on 2027-01-15, so the game day running is 2027-01-14.
      ctx.sql.exec('DELETE FROM analytics_events');
      log(ctx, ctx.clock.t - 2 * HOUR, SEND, ALICE);
      const alarm = await ctx.storage.getAlarm();
      expect(alarm).not.toBeNull();
      // The alarm is never later than the next reset plus three minutes.
      expect(alarm ?? 0).toBeLessThanOrEqual(startOf('2027-01-15') + 3 * 60_000);
      ctx.clock.t = startOf('2027-01-15') + 3 * 60_000;
      await ctx.core.alarm();
      expect(ctx.core.rollup.lastRolledDay()).toBe('2027-01-14');
      expect(value(daily(ctx, '2027-01-14'), 'dau')).toBe(1);
      // Re-armed for the next day (another schedule, such as a raid event, may come first).
      const next = await ctx.storage.getAlarm();
      expect(next ?? 0).toBeGreaterThan(ctx.clock.t);
      expect(next ?? Infinity).toBeLessThanOrEqual(startOf('2027-01-16') + 3 * 60_000);
    });
  });
});
