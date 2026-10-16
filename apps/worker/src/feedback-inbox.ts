import { DurableObject } from 'cloudflare:workers';

/** The inbox is one object: every caller addresses it by this fixed name. */
export const FEEDBACK_INBOX_NAME = 'feedback-inbox';

export type FeedbackKind = 'bug' | 'idea' | 'other';
/** What a screenshot is: `none` (no file), `pending` (being copied), `stored`, or `failed`. */
export type ShotState = 'none' | 'pending' | 'stored' | 'failed';
export type ShotType = 'image/png' | 'image/jpeg' | 'image/webp';

const KINDS: readonly string[] = ['bug', 'idea', 'other'];
const SHOT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const PER_REPORTER_PER_DAY = 3;
export const PER_GUILD_PER_DAY = 20;
export const MAX_UNEXPORTED = 200;
/** `pending` lists at most this many reports. */
export const PENDING_BATCH = 20;
/** A report is listed for export only once its screenshot copy has had time to finish. */
export const EXPORT_DELAY_MS = 2 * MINUTE_MS;
/** A screenshot still `pending` after this long counts as `failed` (the copy was lost). */
export const SHOT_PENDING_TIMEOUT_MS = 10 * MINUTE_MS;
export const RETENTION_MS = 180 * DAY_MS;
/** Screenshots are stored in chunks of this size (a SQLite row in a Durable Object holds up to 2 MB). */
export const CHUNK_BYTES = 1024 * 1024;
export const MAX_SHOT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_UNITS = 6000;

export type SubmitInput = {
  kind: FeedbackKind;
  text: string;
  guildId: string;
  reporterHash: string;
  version: string;
  branch: string | null;
  shot: 'none' | 'pending';
  /** UTC epoch milliseconds. */
  now: number;
};

export type SubmitResult =
  { ok: true; id: number } | { ok: false; reason: 'reporter_limit' | 'guild_limit' | 'inbox_full' };

/** A report as the routes need it. `guildId` is for computing the alias only and never leaves the Worker. */
export type StoredReport = {
  id: number;
  kind: FeedbackKind;
  text: string;
  createdAt: number;
  guildId: string;
  version: string;
  branch: string | null;
  shot: ShotState;
  issue: number | null;
};

export type ExportResult = 'ok' | 'conflict' | 'not_found';

type ReportRow = {
  id: number;
  created_at: number;
  kind: string;
  text: string;
  guild_id: string;
  version: string;
  branch: string | null;
  shot: string;
  issue: number | null;
};

const REPORT_COLUMNS = 'id, created_at, kind, text, guild_id, version, branch, shot, issue';

function toReport(row: ReportRow, now: number): StoredReport {
  let shot = row.shot as ShotState;
  if (shot === 'pending' && now - row.created_at > SHOT_PENDING_TIMEOUT_MS) shot = 'failed';
  return {
    id: row.id,
    kind: row.kind as FeedbackKind,
    text: row.text,
    createdAt: row.created_at,
    guildId: row.guild_id,
    version: row.version,
    branch: row.branch,
    shot,
    issue: row.issue,
  };
}

/**
 * The feedback inbox (`docs/design/feedback.md`): reports players sent with `/feedback`, and their
 * screenshots, for the export workflow and the triage agents. It holds nothing from the game and has no
 * HTTP surface: only RPC methods for Worker code with the binding (`fetch` is not implemented).
 *
 * Privacy: the guild id and the keyed reporter hash stay in here (limits and the public alias only);
 * no user id, name or avatar is ever stored. Reports and screenshots are deleted 180 days after they
 * were sent (pruned on every submit).
 */
export class FeedbackInbox extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS feedback_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'other')),
      text TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reporter_hash TEXT NOT NULL,
      version TEXT NOT NULL,
      branch TEXT,
      shot TEXT NOT NULL CHECK (shot IN ('none', 'pending', 'stored', 'failed')),
      shot_type TEXT,
      shot_bytes INTEGER,
      issue INTEGER,
      exported_at INTEGER
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS feedback_shots (
      report_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (report_id, seq)
    )`);
    sql.exec(
      'CREATE INDEX IF NOT EXISTS feedback_reports_reporter ON feedback_reports (reporter_hash, created_at)',
    );
    sql.exec(
      'CREATE INDEX IF NOT EXISTS feedback_reports_guild ON feedback_reports (guild_id, created_at)',
    );
    sql.exec(
      'CREATE INDEX IF NOT EXISTS feedback_reports_open ON feedback_reports (exported_at, created_at)',
    );
  }

  /**
   * Stores a report, or says which limit it hit (nothing is stored then). The limits are checked and
   * the row is written without an await in between, so concurrent submits cannot pass them together.
   */
  submit(input: SubmitInput): SubmitResult {
    if (
      !KINDS.includes(input.kind) ||
      (input.shot !== 'none' && input.shot !== 'pending') ||
      input.text.length === 0 ||
      input.text.length > MAX_TEXT_UNITS ||
      !Number.isSafeInteger(input.now)
    ) {
      throw new Error('invalid_feedback');
    }
    const sql = this.ctx.storage.sql;
    const count = (query: string, ...bindings: (string | number)[]): number =>
      sql.exec<{ n: number }>(query, ...bindings).one().n;

    // Retention: cheap, and the inbox is small.
    const cutoff = input.now - RETENTION_MS;
    sql.exec(
      'DELETE FROM feedback_shots WHERE report_id IN (SELECT id FROM feedback_reports WHERE created_at < ?)',
      cutoff,
    );
    sql.exec('DELETE FROM feedback_reports WHERE created_at < ?', cutoff);

    const since = input.now - DAY_MS;
    if (
      count(
        'SELECT COUNT(*) AS n FROM feedback_reports WHERE reporter_hash = ? AND created_at > ?',
        input.reporterHash,
        since,
      ) >= PER_REPORTER_PER_DAY
    ) {
      return { ok: false, reason: 'reporter_limit' };
    }
    if (
      count(
        'SELECT COUNT(*) AS n FROM feedback_reports WHERE guild_id = ? AND created_at > ?',
        input.guildId,
        since,
      ) >= PER_GUILD_PER_DAY
    ) {
      return { ok: false, reason: 'guild_limit' };
    }
    if (
      count('SELECT COUNT(*) AS n FROM feedback_reports WHERE exported_at IS NULL') >=
      MAX_UNEXPORTED
    ) {
      return { ok: false, reason: 'inbox_full' };
    }

    const row = sql
      .exec<{ id: number }>(
        `INSERT INTO feedback_reports
           (created_at, kind, text, guild_id, reporter_hash, version, branch, shot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        input.now,
        input.kind,
        input.text,
        input.guildId,
        input.reporterHash,
        input.version.slice(0, 100),
        input.branch,
        input.shot,
      )
      .one();
    return { ok: true, id: row.id };
  }

  /**
   * Saves the screenshot of a report whose copy is `pending`. False (and nothing saved) when the report
   * is unknown, is not waiting for a screenshot, or the file is not an allowed type or is too big.
   */
  storeShot(id: number, type: ShotType, bytes: Uint8Array): boolean {
    if (!SHOT_TYPES.includes(type) || bytes.byteLength === 0 || bytes.byteLength > MAX_SHOT_BYTES) {
      return false;
    }
    const sql = this.ctx.storage.sql;
    return this.ctx.storage.transactionSync(() => {
      const waiting = sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM feedback_reports WHERE id = ? AND shot = 'pending'",
          id,
        )
        .one().n;
      if (waiting === 0) return false;
      sql.exec('DELETE FROM feedback_shots WHERE report_id = ?', id);
      let seq = 0;
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
        const chunk = bytes.slice(offset, offset + CHUNK_BYTES);
        sql.exec(
          'INSERT INTO feedback_shots (report_id, seq, data) VALUES (?, ?, ?)',
          id,
          seq,
          chunk.buffer,
        );
        seq += 1;
      }
      sql.exec(
        "UPDATE feedback_reports SET shot = 'stored', shot_type = ?, shot_bytes = ? WHERE id = ?",
        type,
        bytes.byteLength,
        id,
      );
      return true;
    });
  }

  /** The screenshot could not be copied. Only a `pending` screenshot changes. */
  failShot(id: number): void {
    this.ctx.storage.sql.exec(
      "UPDATE feedback_reports SET shot = 'failed' WHERE id = ? AND shot = 'pending'",
      id,
    );
  }

  /**
   * Up to 20 reports not yet exported and at least 2 minutes old, oldest first. A report whose
   * screenshot is still being copied (`pending`, under 10 minutes old) waits for the next call; one
   * whose copy was lost for 10 minutes is listed as `failed`.
   */
  pending(now: number): StoredReport[] {
    return this.ctx.storage.sql
      .exec<ReportRow>(
        `SELECT ${REPORT_COLUMNS} FROM feedback_reports
         WHERE exported_at IS NULL AND created_at <= ?1
           AND (shot != 'pending' OR created_at < ?2)
         ORDER BY created_at ASC, id ASC LIMIT ?3`,
        now - EXPORT_DELAY_MS,
        now - SHOT_PENDING_TIMEOUT_MS,
        PENDING_BATCH,
      )
      .toArray()
      .map((row) => toReport(row, now));
  }

  /** Records the GitHub issue of a report. Repeating it with the same issue is fine; another one conflicts. */
  markExported(id: number, issue: number, now: number): ExportResult {
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<{ issue: number | null }>('SELECT issue FROM feedback_reports WHERE id = ?', id)
      .toArray()[0];
    if (row === undefined) return 'not_found';
    if (row.issue !== null) return row.issue === issue ? 'ok' : 'conflict';
    sql.exec('UPDATE feedback_reports SET issue = ?, exported_at = ? WHERE id = ?', issue, now, id);
    return 'ok';
  }

  /** One report, or null. */
  report(id: number, now: number): StoredReport | null {
    const row = this.ctx.storage.sql
      .exec<ReportRow>(`SELECT ${REPORT_COLUMNS} FROM feedback_reports WHERE id = ?`, id)
      .toArray()[0];
    return row === undefined ? null : toReport(row, now);
  }

  /** The stored screenshot of a report (type and bytes), or null when there is none. */
  shot(id: number): { type: ShotType; bytes: Uint8Array } | null {
    const sql = this.ctx.storage.sql;
    const head = sql
      .exec<{ shot_type: string | null; shot_bytes: number | null }>(
        "SELECT shot_type, shot_bytes FROM feedback_reports WHERE id = ? AND shot = 'stored'",
        id,
      )
      .toArray()[0];
    if (
      head === undefined ||
      head.shot_type === null ||
      head.shot_bytes === null ||
      !SHOT_TYPES.includes(head.shot_type)
    ) {
      return null;
    }
    const bytes = new Uint8Array(head.shot_bytes);
    let offset = 0;
    for (const chunk of sql.exec<{ data: ArrayBuffer }>(
      'SELECT data FROM feedback_shots WHERE report_id = ? ORDER BY seq',
      id,
    )) {
      const part = new Uint8Array(chunk.data);
      if (offset + part.byteLength > bytes.byteLength) return null;
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    if (offset !== bytes.byteLength) return null;
    return { type: head.shot_type as ShotType, bytes };
  }
}
