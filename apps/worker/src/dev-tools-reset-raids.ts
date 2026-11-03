/**
 * The `reset-raids-dungeons` dev tool (staging only): wipes every raid and dungeon table of the whole guild, so a tangled dev-clock
 * history can be cleared. The tables are discovered from the schema by prefix (`raid_`, `dungeon_`) plus the few raid tables that
 * do not carry the prefix (`EXTRA_TABLES`), so a new table of either kind is cleared without a change here; a test pins the list
 * (`test/dev-tools-reset-raids.test.ts`) so a new table is a visible decision.
 *
 * Kept: creatures, talents, gear, balances, ledgers, the analytics log and the dev clock. The single-row `raid_ladder` goes back to
 * its first state (no rank yet) instead of losing its row. Raid posts queued for Discord (`discord_posts` keyed `raid:`) go too, so a
 * week created again can post again. The next request creates the week fresh (a v2 week at track slot 1 with `COMBAT_V2` on).
 */
import type { ToolCtx } from './dev-context';

/** Raid tables whose names do not start with `raid_`. */
export const EXTRA_TABLES: readonly string[] = ['jackpot_pity'];

const PREFIXES = ['raid_', 'dungeon_'] as const;

/** The tables this tool clears, sorted: those with a raid or dungeon prefix, and the extras. */
export function raidDungeonTables(sql: SqlStorage): string[] {
  const names = sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .toArray()
    .map((r) => r.name);
  return names
    .filter((n) => PREFIXES.some((p) => n.startsWith(p)) || EXTRA_TABLES.includes(n))
    .sort();
}

export function resetRaidsDungeons(ctx: ToolCtx): { deleted: Record<string, number> } {
  const sql = ctx.sql;
  const deleted: Record<string, number> = {};
  for (const table of raidDungeonTables(sql)) {
    if (table === 'raid_ladder') {
      // One row that code expects to exist: back to a server that has no rank yet.
      deleted[table] = sql
        .exec('UPDATE raid_ladder SET rank = NULL, best_rank = NULL RETURNING 1')
        .toArray().length;
      continue;
    }
    const quoted = `"${table.replaceAll('"', '""')}"`;
    deleted[table] = sql.exec(`DELETE FROM ${quoted} RETURNING 1`).toArray().length;
  }
  deleted['discord_posts'] = sql
    .exec("DELETE FROM discord_posts WHERE substr(key, 1, 5) = 'raid:' RETURNING 1")
    .toArray().length;
  ctx.raid.invalidateReadiness();
  return { deleted };
}
