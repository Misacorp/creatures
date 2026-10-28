/**
 * The loot reveal for the finale a player took part in: shown in the Raid read model until they mark
 * it as seen. Only the player's own reveal is ever read, and the data comes from the stored result.
 */
import { jackpotEssenceFor } from '@creatures/game';
import { readFestivalGrant, type FestivalGrantView } from './raid-festival';
import { payoutWeek, rankChangeOf, type RankChangeView } from './raid-ladder';
import type { StoredSummary } from './raid-resolve';

export interface RevealView {
  week: string;
  /** The caller's party in that finale: with `week`, the key of the after-action stats. */
  party: number;
  cleared: boolean;
  /**
   * The Essence the finale paid the player in all: the stage payout plus the jackpot Essence, if the
   * hidden roll hit. The roll and the pity counter never leave the server.
   */
  essence: number;
  /** What the finale did to the server's rank; null until the ladder has moved, and for old weeks. */
  rankChange: RankChangeView | null;
  /** The Festival creature the caller got for this finale, or null. */
  festivalGrant: FestivalGrantView | null;
}

/**
 * The Essence the user got in a resolved finale, as one figure for display: the stage payout plus the
 * jackpot Essence when the (hidden) jackpot roll hit. Whether it hit is not exposed: players only see
 * the total.
 */
export function totalEssenceOf(
  sql: SqlStorage,
  userId: string,
  weekId: string,
  summary: Pick<StoredSummary, 'essence' | 'jackpot'>,
): number {
  const base = summary.essence[userId] ?? 0;
  if (!summary.jackpot.includes(userId)) return base;
  return base + jackpotEssenceFor(payoutWeek(sql, weekId));
}

/** The finales (newest first) whose stored summary lists the user, with that summary. */
function finalesOf(
  sql: SqlStorage,
  userId: string,
  limit = Number.POSITIVE_INFINITY,
  sinceWeek = '',
): { weekId: string; party: number; summary: StoredSummary }[] {
  const out: { weekId: string; party: number; summary: StoredSummary }[] = [];
  // The text match only narrows the rows; the parsed member list decides.
  const rows = sql
    .exec<{ week_id: string; party: number; summary: string }>(
      `SELECT week_id, party, summary FROM raid_results
       WHERE week_id >= ? AND phase = 'finale' AND instr(summary, ?) > 0
       ORDER BY created_at DESC, rowid DESC`,
      sinceWeek,
      `"userId":"${userId}"`,
    )
    .toArray();
  for (const r of rows) {
    const summary = JSON.parse(r.summary) as StoredSummary;
    if (summary.members.some((m) => m.userId === userId)) {
      out.push({ weekId: r.week_id, party: r.party, summary });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * The reveal for the latest finale the user took part in, unless they have marked it seen. Null if
 * there is none. Only finales of `sinceWeek` or later count: the week before the current one is the
 * oldest whose fight details are kept (`old-data.ts`), and the reveal links to them.
 */
export function latestReveal(
  sql: SqlStorage,
  userId: string,
  sinceWeek: string,
): RevealView | null {
  const latest = finalesOf(sql, userId, 1, sinceWeek)[0];
  if (latest === undefined) return null;
  const seen = sql
    .exec('SELECT 1 FROM raid_reveal_seen WHERE user_id = ? AND week_id = ?', userId, latest.weekId)
    .toArray();
  if (seen.length > 0) return null;
  const { summary } = latest;
  return {
    week: latest.weekId,
    party: latest.party,
    cleared: summary.cleared,
    essence: totalEssenceOf(sql, userId, latest.weekId, summary),
    rankChange: rankChangeOf(sql, latest.weekId),
    festivalGrant: readFestivalGrant(sql, latest.weekId, userId),
  };
}

/**
 * Marks a finale's reveal as seen. Idempotent. Returns false (writing nothing) if the user did not
 * take part in that week's finale, so the table can only hold rows for real participation.
 */
export function markRevealSeen(
  sql: SqlStorage,
  userId: string,
  weekId: string,
  now: number,
): boolean {
  if (!finalesOf(sql, userId).some((f) => f.weekId === weekId)) return false;
  sql.exec(
    'INSERT OR IGNORE INTO raid_reveal_seen (user_id, week_id, seen_at) VALUES (?, ?, ?)',
    userId,
    weekId,
    now,
  );
  return true;
}
