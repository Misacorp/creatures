/**
 * The reset's dry run (`docs/design/reset.md`): what a reset of this guild would do, from the guild's SQL as it stands. **It writes
 * nothing** (a test pins the row counts and the statements' `rowsWritten`). It is the staging dev tool `reset-dry-run`
 * (`GET /api/dev/reset-dry-run`, managers only, `DEV_TOOLS` on, 404 otherwise): the one thing of the reset that can be reached at all.
 *
 * It builds the record with a throwaway random key (the hashes are never shown, and the real key is a production secret), builds every DM
 * text, and counts the rows per table that the wipe would delete. It reads whole tables once per press of a button; that is fine on
 * staging and is why it is not reachable anywhere else.
 */
import { LEET_BACKFILL_DAYS } from '../leet';
import { goodbyeMessage } from './goodbye-dm';
import type { FeatCreature, Settler, SettlersRecord } from './record-schema';
import { buildSettlersRecord } from './settlers-record';
import { wipedRowCounts } from './wipe-tables';

export interface FeatHolder {
  name: string;
  detail: string;
}
export interface FeatReport {
  feat: string;
  holders: FeatHolder[];
}
export interface DryRunReport {
  settlers: number;
  creatures: number;
  feats: FeatReport[];
  tables: { table: string; rows: number }[];
  rowsToDelete: number;
  dms: {
    count: number;
    longest: number;
    limit: number;
    over: number;
    previews: { name: string; length: number; content: string }[];
  };
  /** Size of the record as JSON, in characters (the archive holds one row of up to 1.5 million). */
  recordChars: number;
  leet: string;
}

const PREVIEWS = 3;
export const DM_LIMIT = 2000;

const title = (c: FeatCreature): string =>
  c.nickname !== null && c.nickname.trim() !== ''
    ? `${c.nickname} the ${c.speciesName}`
    : c.speciesName;

/** The holders of the highest number: all of them on a tie, none when nobody has a score above zero. */
function leaders(
  settlers: readonly Settler[],
  score: (s: Settler) => number,
  detail: (s: Settler) => string,
): FeatHolder[] {
  const top = Math.max(0, ...settlers.map(score));
  if (top === 0) return [];
  return settlers.filter((s) => score(s) === top).map((s) => ({ name: s.name, detail: detail(s) }));
}

export function featReports(record: SettlersRecord): FeatReport[] {
  const s = record.settlers;
  return [
    {
      feat: 'Deepest dungeon depth',
      holders: leaders(
        s,
        (x) => x.feats.deepestDepth ?? 0,
        (x) => `Cleared depth ${String(x.feats.deepestDepth ?? 0)}`,
      ),
    },
    {
      feat: 'First on the server',
      // Holders of at least one line: the one with the most lines first.
      holders: s
        .filter((x) => x.feats.firsts.length > 0)
        .sort((a, b) => b.feats.firsts.length - a.feats.firsts.length)
        .map((x) => ({ name: x.name, detail: x.feats.firsts.join(', ') })),
    },
    {
      feat: 'Blueprints owned',
      holders: leaders(
        s,
        (x) => x.feats.blueprints,
        (x) => `${String(x.feats.blueprints)} blueprints`,
      ),
    },
    {
      feat: 'Creatures owned',
      holders: leaders(
        s,
        (x) => x.feats.creatures,
        (x) => `${String(x.feats.creatures)} creatures`,
      ),
    },
    {
      feat: 'Highest level creature',
      holders: leaders(
        s,
        (x) => x.feats.highestLevel?.level ?? 0,
        (x) =>
          `${x.feats.highestLevel === null ? '' : title(x.feats.highestLevel.creature)}, level ${String(x.feats.highestLevel?.level ?? 0)}`,
      ),
    },
    {
      feat: 'Total creature levels',
      holders: leaders(
        s,
        (x) => x.feats.totalLevels,
        (x) => `${String(x.feats.totalLevels)} levels in all`,
      ),
    },
    {
      feat: 'Best crafter',
      holders: leaders(
        s,
        (x) => x.feats.bestCrafter?.level ?? 0,
        (x) =>
          `Crafting ${String(x.feats.bestCrafter?.level ?? 0)}: ${x.feats.bestCrafter === null ? '' : title(x.feats.bestCrafter.creature)}`,
      ),
    },
    {
      feat: 'Best explorer',
      holders: leaders(
        s,
        (x) => x.feats.bestExplorer?.rank ?? 0,
        (x) =>
          `Explorer ${String(x.feats.bestExplorer?.rank ?? 0)}: ${x.feats.bestExplorer === null ? '' : title(x.feats.bestExplorer.creature)}`,
      ),
    },
  ];
}

/** Builds the report. Reads only. */
export async function resetDryRun(
  sql: SqlStorage,
  options: { tz: string; now: number },
): Promise<DryRunReport> {
  // A key made for this call only: the report never shows the hashes.
  const throwaway = crypto.randomUUID() + crypto.randomUUID();
  const record = await buildSettlersRecord(sql, { ...options, hmacKey: throwaway });
  const texts = record.settlers.map((settler) => ({
    name: settler.name,
    content: goodbyeMessage(settler).content,
  }));
  const tables = wipedRowCounts(sql);
  return {
    settlers: record.settlers.length,
    creatures: record.settlers.reduce((n, x) => n + x.creatures.length, 0),
    feats: featReports(record),
    tables,
    rowsToDelete: tables.reduce((n, t) => n + t.rows, 0),
    dms: {
      count: texts.length,
      longest: Math.max(0, ...texts.map((t) => t.content.length)),
      limit: DM_LIMIT,
      over: texts.filter((t) => t.content.length > DM_LIMIT).length,
      previews: texts
        .slice(0, PREVIEWS)
        .map((t) => ({ name: t.name, length: t.content.length, content: t.content })),
    },
    recordChars: JSON.stringify(record).length,
    leet: `The leet bot's ledger is never touched. After the wipe, payouts start from ${record.switchDay} (no ${String(LEET_BACKFILL_DAYS)}-day backfill), so no day is paid twice.`,
  };
}
