/**
 * Combat v2 stage rewards held until the replay ends (Misa, 2026-11-17: "pay stage rewards when the replay ends, no new timer").
 *
 * A stage 1 or 2 resolves at its time (`settleStageV2`), but what it pays players (Essence, creature experience, threshold scrap, the kill
 * bonus gear, the away summary lines, the valley trial tick) lands when its playing window ends, so the result does not leak while it
 * plays. At resolve the facts of the payout (who fought, the contributions, the thresholds crossed, the kill) are stored in
 * `raid_stage_pay` with `due_at` = the window's end; `settleDueStagePay` pays every row that is due, each in its own transaction that also
 * deletes the row (the done marker). The guild alarm already wakes at that moment for the Discord post; `nextStagePayAt` puts it in the
 * alarm's candidates even when posting is off, and every request settles what is due first (`RaidModule.settleDueLive`).
 *
 * The amounts come from the same `payStage` as before, using the stored facts; gear is rolled with the server's live randomness at payout.
 */
import { RULES } from '@creatures/game';
import { payStage, type ResolveDeps, type StoredSummary } from './raid-resolve';

/** The back-off of a payout that fails: 60 s doubling with each failure, never more than 6 h. */
const PAY_RETRY_BASE_MS = 60_000;
const PAY_RETRY_MAX_MS = 6 * 60 * 60_000;

/** What `payStage` needs about a stage, kept until it pays. */
export interface StagePayPayload {
  stage: 1 | 2;
  memberIds: string[];
  aliases: string[];
  cleared: boolean;
  contribution: Record<string, number>;
  fighters: { id: string; ownerAlias: string | null }[];
  bossId: string;
  crossed: ('phase1' | 'phase2')[];
  kill: boolean;
}

/** Stores the payout a stage 1 or 2 owes, due when its replay ends. Call it in the transaction that stores the result. */
export function deferStagePay(
  sql: SqlStorage,
  weekId: string,
  party: number,
  dueAt: number,
  payload: StagePayPayload,
): void {
  sql.exec(
    'INSERT OR IGNORE INTO raid_stage_pay (week_id, party, phase, due_at, payload) VALUES (?, ?, ?, ?, ?)',
    weekId,
    party,
    `stage${String(payload.stage)}`,
    dueAt,
    JSON.stringify(payload),
  );
}

/** The end of the window of a stage that plays as it happens (when its payout falls due). */
export const stagePayDueAt = (createdAt: number, windowRounds: number): number =>
  createdAt + windowRounds * RULES.raid.v2.liveRoundMs;

/** The earliest moment a held payout falls due (the alarm wakes for it), or null when none is held. One index read. */
export function nextStagePayAt(sql: SqlStorage): number | null {
  const row = sql
    .exec<{ due_at: number }>('SELECT due_at FROM raid_stage_pay ORDER BY due_at LIMIT 1')
    .toArray()[0];
  return row?.due_at ?? null;
}

/**
 * Pays every held stage payout that is due at `deps.now()`. Returns how many were paid. Each pays in one transaction with the row's delete,
 * so a retry, two callers or an alarm and a request together pay once. Reads nothing but an empty index range when nothing is due.
 */
export function settleDueStagePay(deps: ResolveDeps): number {
  const sql = deps.storage.sql;
  const now = deps.now();
  const due = sql
    .exec<{ week_id: string; party: number; phase: string }>(
      'SELECT week_id, party, phase FROM raid_stage_pay WHERE due_at <= ? ORDER BY due_at, week_id, party, phase LIMIT 50',
      now,
    )
    .toArray();
  let paid = 0;
  for (const d of due) {
    try {
      if (payOne(deps, d.week_id, d.party, d.phase)) paid++;
    } catch (err) {
      // The transaction rolled everything back and the row stays, so a later fix still pays it; it waits out a back-off first.
      console.error('stage payout failed', err instanceof Error ? err.name : 'unknown');
      sql.exec(
        'UPDATE raid_stage_pay SET attempts = attempts + 1, due_at = ? + MIN(? * (1 << MIN(attempts, 20)), ?) WHERE week_id = ? AND party = ? AND phase = ?',
        now,
        PAY_RETRY_BASE_MS,
        PAY_RETRY_MAX_MS,
        d.week_id,
        d.party,
        d.phase,
      );
    }
  }
  return paid;
}

function payOne(deps: ResolveDeps, weekId: string, party: number, phase: string): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const row = sql
      .exec<{ payload: string }>(
        'SELECT payload FROM raid_stage_pay WHERE week_id = ? AND party = ? AND phase = ?',
        weekId,
        party,
        phase,
      )
      .toArray()[0];
    if (row === undefined) return false;
    const p = JSON.parse(row.payload) as StagePayPayload;
    // `payStage` reads the week's rank and Festival flag now, not at resolve: a v2 week's rank is set before stage 1 and nothing writes it
    // afterwards (only the v1 phase-1 redeclare and the dev tools do), so the kill bonus is the same at payout as at resolve.
    const { essence } = payStage(
      deps,
      { weekId },
      party,
      p.stage === 1 ? 'phase1' : 'phase2',
      { memberIds: p.memberIds, aliases: p.aliases },
      {
        cleared: p.cleared,
        contribution: (alias) => p.contribution[alias] ?? 0,
        fighters: p.fighters,
        bossId: p.bossId,
        v2: { crossed: p.crossed, kill: p.kill },
      },
    );
    // The stored summary shows what was paid (it is read only once the window has ended).
    const stored = sql
      .exec<{ summary: string }>(
        'SELECT summary FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
        weekId,
        party,
        phase,
      )
      .toArray()[0];
    if (stored !== undefined) {
      const summary = JSON.parse(stored.summary) as StoredSummary;
      sql.exec(
        'UPDATE raid_results SET summary = ? WHERE week_id = ? AND party = ? AND phase = ?',
        JSON.stringify({ ...summary, essence }),
        weekId,
        party,
        phase,
      );
    }
    sql.exec(
      'DELETE FROM raid_stage_pay WHERE week_id = ? AND party = ? AND phase = ?',
      weekId,
      party,
      phase,
    );
    return true;
  });
}
