/**
 * The loot reveal for the finale a player took part in: shown in the Raid read model until they mark
 * it as seen. Only the player's own reveal is ever read, and the data comes from the stored result.
 */
import { RULES } from '@creatures/game';
import type { StoredSummary } from './raid-resolve';

export interface RevealView {
  week: string;
  /** The caller's party in that finale: with `week`, the key of the after-action stats. */
  party: number;
  cleared: boolean;
  /** The Essence the finale paid the player (not counting a jackpot). */
  essence: number;
  jackpot: null | { essence: number; firstOnServer: boolean };
}

/**
 * The user's jackpot in a resolved finale, or null if they did not hit. `firstOnServer` is true when
 * that finale holds the server's first-jackpot record (everyone who hit in it shares the record).
 */
export function jackpotOf(
  sql: SqlStorage,
  userId: string,
  weekId: string,
  summary: Pick<StoredSummary, 'jackpot'>,
): RevealView['jackpot'] {
  if (!summary.jackpot.includes(userId)) return null;
  const first = sql
    .exec(
      "SELECT 1 FROM server_firsts WHERE kind = 'jackpot' AND species = 'jackpot' AND user_id = ? AND drop_id = ?",
      userId,
      `jackpot:${weekId}`,
    )
    .toArray();
  return { essence: RULES.raid.jackpotEssence, firstOnServer: first.length > 0 };
}

/** The finales (newest first) whose stored summary lists the user, with that summary. */
function finalesOf(
  sql: SqlStorage,
  userId: string,
  limit = Number.POSITIVE_INFINITY,
): { weekId: string; party: number; summary: StoredSummary }[] {
  const out: { weekId: string; party: number; summary: StoredSummary }[] = [];
  // The text match only narrows the rows; the parsed member list decides.
  const rows = sql
    .exec<{ week_id: string; party: number; summary: string }>(
      `SELECT week_id, party, summary FROM raid_results
       WHERE phase = 'finale' AND instr(summary, ?) > 0
       ORDER BY created_at DESC, rowid DESC`,
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
 * there is none.
 */
export function latestReveal(sql: SqlStorage, userId: string): RevealView | null {
  const latest = finalesOf(sql, userId, 1)[0];
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
    essence: summary.essence[userId] ?? 0,
    jackpot: jackpotOf(sql, userId, latest.weekId, summary),
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
