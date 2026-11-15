import { describe, expect, it } from 'vitest';
import { resetDryRun, type DryRunReport } from '../../src/reset/dry-run';
import { wipedTables } from '../../src/reset/wipe-tables';
import { zonedDate } from '../../src/time';
import { ON, player } from '../dev-helpers';
import { runCore } from '../helpers';
import { meterStorage } from '../read-meter';
import { HELSINKI, nextGuild } from '../raid-helpers';
import { ANN, HOSTILE, seedWorld } from './world';

/** Rows of every table, by name, for a before-and-after comparison. */
function everyTable(sql: SqlStorage): Record<string, number> {
  const out: Record<string, number> = {};
  const names = sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .toArray();
  for (const { name } of names) {
    out[name] = sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name}"`).one().n;
  }
  return out;
}

describe('the reset-dry-run dev tool', () => {
  it('reports what a reset would do: settlers, feat holders, rows to delete, the DMs and the leet note', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        seedWorld(ctx);
        const p = await player(ctx, 9, { name: 'Zed', creatures: 3 });
        const res = await p.call('GET', '/api/dev/reset-dry-run');
        expect(res.status).toBe(200);
        const report = res.body as DryRunReport;
        // Four settlers (Ann, Bob, Cy and the caller; the bot is not one), 4 + 3 + 1 + 3 creatures.
        expect(report.settlers).toBe(4);
        expect(report.creatures).toBe(11);
        const holder = (feat: string) => report.feats.find((f) => f.feat === feat)?.holders;
        expect(report.feats.map((f) => f.feat)).toEqual([
          'Deepest dungeon depth',
          'First on the server',
          'Blueprints owned',
          'Creatures owned',
          'Highest level creature',
          'Total creature levels',
          'Best crafter',
          'Best explorer',
        ]);
        expect(holder('Deepest dungeon depth')).toEqual([
          { name: 'Ann', detail: 'Cleared depth 18' },
        ]);
        expect(holder('Blueprints owned')).toEqual([{ name: 'Ann', detail: '2 blueprints' }]);
        expect(holder('Highest level creature')).toEqual([
          { name: 'Bob', detail: 'Ember the Ashmole, level 31' },
        ]);
        expect(
          holder('First on the server')
            ?.map((h) => h.name)
            .sort(),
        ).toEqual(['Ann', 'Bob', 'Zed']);
        expect(holder('Best explorer')?.[0]?.name).toBe('Ann');
        // Rows the wipe would delete: every table that is not kept, and the creatures among them.
        expect(report.tables.map((t) => t.table)).toEqual(wipedTables(ctx.sql));
        expect(report.tables.find((t) => t.table === 'creatures')?.rows).toBe(12); // the bot's too
        expect(report.rowsToDelete).toBe(report.tables.reduce((n, t) => n + t.rows, 0));
        expect(report.tables.some((t) => t.table === 'guild_meta')).toBe(false);
        // The DMs: one per settler, all within the limit, a few previews.
        expect(report.dms).toMatchObject({ count: 4, limit: 2000, over: 0 });
        expect(report.dms.longest).toBeLessThanOrEqual(2000);
        expect(report.dms.previews).toHaveLength(3);
        const ann = report.dms.previews.find((d) => d.name === 'Ann');
        expect(ann?.content).toContain('**You were one of the first settlers.**');
        expect(ann?.content).toContain('Cleared depth 18');
        expect(ann?.content).not.toContain(HOSTILE);
        expect(report.leet).toContain(zonedDate(ctx.clock.t, HELSINKI));
        expect(report.leet).toContain('never touched');
        // No ids anywhere in the answer.
        expect(JSON.stringify(report)).not.toContain(ANN);
      },
      ON,
    );
  });

  it('writes nothing: no row is added or removed, no event is logged, no statement writes a row', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        seedWorld(ctx);
        const p = await player(ctx, 9);
        // A first call settles whatever the request itself touches (the session, the rate limit), so the second one is the measure.
        expect((await p.call('GET', '/api/dev/reset-dry-run')).status).toBe(200);
        const before = everyTable(ctx.sql);
        const events = ctx.sql
          .exec<{ n: number }>('SELECT COUNT(*) AS n FROM analytics_events')
          .one().n;
        const changes = ctx.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n;
        expect((await p.call('GET', '/api/dev/reset-dry-run')).status).toBe(200);
        // Only the request's own bookkeeping may differ: compare the game tables exactly.
        const after = everyTable(ctx.sql);
        for (const table of wipedTables(ctx.sql)) {
          if (table === 'rate_limits' || table === 'sessions') continue;
          expect(after[table], table).toBe(before[table]);
        }
        expect(
          ctx.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM analytics_events').one().n,
        ).toBe(events);
        expect(
          ctx.sql
            .exec<{ n: number }>(
              "SELECT COUNT(*) AS n FROM analytics_events WHERE kind = 'dev_action'",
            )
            .one().n,
        ).toBe(0);
        expect(changes).toBeGreaterThan(0);

        // The report itself, on the metered storage: reads rows, writes none, and the database does not change at all.
        const metered = meterStorage(ctx.storage);
        const totalBefore = ctx.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n;
        const { result, reads } = await metered.measure(() =>
          resetDryRun(metered.sql, { tz: HELSINKI, now: ctx.clock.t }),
        );
        expect(result.settlers).toBe(4);
        expect(reads.total).toBeGreaterThan(0);
        expect(reads.written).toBe(0);
        expect(ctx.sql.exec<{ n: number }>('SELECT total_changes() AS n').one().n).toBe(
          totalBefore,
        );
        expect(everyTable(ctx.sql)).toEqual(after);
      },
      ON,
    );
  });
});
