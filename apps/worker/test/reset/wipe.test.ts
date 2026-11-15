import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { LeetDaysOptions, LeetSource } from '../../src/leet';
import { MIGRATIONS } from '../../src/migrations';
import type { ArchiveReceipt, SettlersRecord } from '../../src/reset/record-schema';
import { ArchiveStore } from '../../src/reset/settler-archive';
import { buildSettlersRecord } from '../../src/reset/settlers-record';
import { wipeGuild, WipeRefused, type WipeOptions } from '../../src/reset/wipe';
import { wipedRowCounts } from '../../src/reset/wipe-tables';
import { zonedDate } from '../../src/time';
import { runCore, type CoreContext } from '../helpers';
import { HELSINKI, nextGuild } from '../raid-helpers';
import { ANN, KEY, seedWorld } from './world';

/** Stores a record in an archive of its own (another object than the guild's) and answers the receipt. */
async function archive(record: SettlersRecord): Promise<ArchiveReceipt> {
  const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(`archive-host-${record.archiveKey}`));
  return await runInDurableObject(stub, (_i, state) =>
    new ArchiveStore(state.storage.sql, () => 1_800_000_000_000).put(record.archiveKey, record),
  );
}

const counts = (ctx: Pick<CoreContext, 'sql'>) =>
  Object.fromEntries(wipedRowCounts(ctx.sql).map((t) => [t.table, t.rows]));
const kept = (ctx: Pick<CoreContext, 'sql'>, table: string) =>
  ctx.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).one().n;

/** A staging-shaped world: players, creatures, balances, a session, analytics, a dev flag, a queued post, and the server's own setup. */
function populate(ctx: CoreContext): void {
  seedWorld(ctx);
  ctx.sql.exec('INSERT OR REPLACE INTO guild_meta (id, guild_id) VALUES (1, ?)', ctx.guildId);
  ctx.sql.exec(
    "INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES ('h', ?, 1, 1, 9)",
    ANN,
  );
  ctx.sql.exec(
    "INSERT INTO ledger (user_id, currency, amount, source, idempotency_key, created_at) VALUES (?, 'bait', 5, 'test', 'k', 1)",
    ANN,
  );
  ctx.sql.exec(
    "INSERT INTO analytics_daily (day, metric, dims_json, value) VALUES ('2027-01-01', 'm', '{}', 4)",
  );
  ctx.sql.exec("INSERT INTO db_reads (day, source, rows) VALUES ('2027-01-01', 'start', 12)");
  ctx.sql.exec(
    "INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (1, 'x', 'h', '{}')",
  );
  ctx.sql.exec(
    "INSERT OR REPLACE INTO leet_sync (id, cursor, since_date, source) VALUES (1, 'old', '2020-01-01', 'mock')",
  );
}

async function options(ctx: CoreContext): Promise<{ record: SettlersRecord; wipe: WipeOptions }> {
  const record = await buildSettlersRecord(ctx.sql, {
    tz: HELSINKI,
    now: ctx.clock.t,
    hmacKey: KEY,
  });
  const receipt = await archive(record);
  return {
    record,
    wipe: {
      archiveKey: record.archiveKey,
      receipt,
      switchDay: record.switchDay,
      leetSource: 'mock',
    },
  };
}

describe('the wipe', () => {
  it('deletes every game table, runs the migrations from zero and keeps only the server setup and the daily counts', async () => {
    // What a fresh guild looks like: the row counts of every table (some migrations seed rows) and the schema version.
    const fresh = await runCore(nextGuild(), (ctx) => ({
      counts: counts(ctx),
      versions: ctx.sql
        .exec<{ version: number }>('SELECT version FROM schema_version ORDER BY version')
        .toArray()
        .map((r) => r.version),
    }));
    await runCore(nextGuild(), async (ctx) => {
      populate(ctx);
      const before = counts(ctx);
      expect(before['creatures']).toBeGreaterThan(5);
      expect(before['sessions']).toBe(1);
      const { wipe } = await options(ctx);

      const result = wipeGuild(ctx.storage, wipe);
      expect(result.rowsDeleted).toBeGreaterThan(20);
      expect(result.tablesDeleted).toBeGreaterThan(50);

      // The object's own start (the same call a fresh object makes) puts back what its start-up passes create.
      ctx.core.migrate();
      // Every game table is empty or as fresh as a new guild's.
      // (the leet sync's one row is written by the wipe itself)
      expect(counts(ctx)).toEqual({ ...fresh.counts, leet_sync: 1 });
      expect(counts(ctx)['creatures']).toBe(0);
      expect(counts(ctx)['players']).toBe(0);
      expect(counts(ctx)['sessions']).toBe(0);
      expect(counts(ctx)['ledger']).toBe(0);
      // The migrations are at head, from zero.
      const versions = ctx.sql
        .exec<{ version: number }>('SELECT version FROM schema_version ORDER BY version')
        .toArray()
        .map((r) => r.version);
      expect(versions).toEqual(fresh.versions);
      expect(versions.at(-1)).toBe(MIGRATIONS.length);
      // The server's own setup and the hashed daily counts stay; the raw events (actor hashes) do not.
      expect(kept(ctx, 'guild_meta')).toBe(1);
      expect(
        ctx.sql.exec<{ guild_id: string }>('SELECT guild_id FROM guild_meta').one().guild_id,
      ).toBe(ctx.guildId);
      expect(kept(ctx, 'analytics_daily')).toBe(1);
      expect(kept(ctx, 'db_reads')).toBe(1);
      expect(kept(ctx, 'analytics_events')).toBe(0);
      // The index the maintenance migration puts on the kept table is back.
      expect(
        ctx.sql
          .exec("SELECT 1 FROM sqlite_master WHERE name = 'analytics_daily_metric_day'")
          .toArray(),
      ).toHaveLength(1);

      // Leet payouts start from the switch day, from the configured source kind.
      const sync = ctx.sql
        .exec<{
          since_date: string;
          cursor: string | null;
          source: string;
        }>('SELECT since_date, cursor, source FROM leet_sync WHERE id = 1')
        .one();
      expect(sync).toEqual({
        since_date: zonedDate(ctx.clock.t, HELSINKI),
        cursor: null,
        source: 'mock',
      });
    });
  });

  it('does not backfill the 7 days again: the first sync after the wipe asks from the switch day', async () => {
    const asked: LeetDaysOptions[] = [];
    const source: LeetSource = {
      getDays(_guild, opts) {
        asked.push(opts);
        return Promise.resolve({ days: [], nextCursor: null, hasMore: false });
      },
    };
    await runCore(
      nextGuild(),
      async (ctx) => {
        // A fresh guild backfills a week ...
        await ctx.core.syncLeet();
        expect(asked.at(-1)?.since).not.toBe(zonedDate(ctx.clock.t, HELSINKI));
        // ... a wiped one starts on the switch day.
        populate(ctx);
        const { wipe } = await options(ctx);
        wipeGuild(ctx.storage, wipe);
        ctx.core.migrate();
        await ctx.core.syncLeet();
        expect(asked.at(-1)).toMatchObject({ since: zonedDate(ctx.clock.t, HELSINKI) });
        expect(asked.at(-1)?.after).toBeUndefined();
      },
      { createLeetSource: () => source },
    );
  });

  it('refuses without proof that the record was archived, and changes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      populate(ctx);
      const { record, wipe } = await options(ctx);
      const before = counts(ctx);
      const refuse = (over: Partial<WipeOptions>, reason: string) => {
        let caught: unknown;
        try {
          wipeGuild(ctx.storage, { ...wipe, ...over });
        } catch (err) {
          caught = err;
        }
        expect(caught, reason).toBeInstanceOf(WipeRefused);
        expect((caught as WipeRefused).reason).toBe(reason);
        expect(counts(ctx), reason).toEqual(before);
      };
      refuse({ receipt: undefined }, 'no_receipt');
      refuse({ receipt: null }, 'no_receipt');
      refuse({ receipt: {} }, 'no_receipt');
      refuse({ receipt: { ...(wipe.receipt as object), extra: 1 } }, 'no_receipt');
      refuse({ receipt: { ...(wipe.receipt as object), digest: 'zz' } }, 'no_receipt');
      // A receipt for another server's record.
      refuse({ archiveKey: 'some-other-key' }, 'wrong_archive_key');
      refuse(
        { receipt: { ...(wipe.receipt as ArchiveReceipt), archiveKey: 'x' } },
        'wrong_archive_key',
      );
      refuse({ switchDay: 'yesterday' }, 'bad_switch_day');
      // A record taken before more play is stale: a new creature, then a new player.
      ctx.sql.exec(
        "INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at) VALUES ('late', ?, 'solmane', 'solmane', 1, 'expedition', 1)",
        ANN,
      );
      const stale = counts(ctx);
      let caught: unknown;
      try {
        wipeGuild(ctx.storage, wipe);
      } catch (err) {
        caught = err;
      }
      expect((caught as WipeRefused).reason).toBe('stale_receipt');
      expect(counts(ctx)).toEqual(stale);
      expect(record.settlers).toHaveLength(3);
      // The refusal left the guild as it was: the creatures are still there.
      expect(kept(ctx, 'creatures')).toBeGreaterThan(6);
    });
  });
});
