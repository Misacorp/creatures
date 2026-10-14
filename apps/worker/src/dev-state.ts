/**
 * Dev-only state of a guild's Durable Object (see `docs/design/dev-tools.md`): the dev clock offset and
 * the "force" flags the dev tools set for testing. Everything here exists only when the `DEV_TOOLS` var
 * is "on" (staging): `GuildCore` builds a `DevState` only then, and every reader goes through it, so with
 * the var off the table is never created and a row that is stored anyway is never read.
 *
 * It is a plain key/value table created on first use (`CREATE TABLE IF NOT EXISTS`) instead of a numbered
 * migration: production databases never get it, and no migration number is spent on a staging tool.
 *
 * Keys (values are short text):
 * - `clock_offset_ms`: the guild's dev clock offset, a non-negative integer in ms.
 * - `u:<user>:push_offer`: a push-on goal id the next end-of-trip offer of the user is forced to be.
 * - `u:<user>:push_outcome`: `success` or `fail`, forces the next push-on result of the user.
 * - `u:<user>:night` and `u:<user>:festival`: `on` or `off`, force the night and Festival gates of the
 *   user's expeditions (absent: the real clock and calendar decide).
 * - `g:modifiers:<day>`: JSON array of room modifier ids that replaces the day's rolled modifiers.
 * - `u:<user>:dungeon_reset:<day>:<currency>`: the sum of the day's dungeon credits that a
 *   `dungeon-reset` has already dealt with, so a second reset does not take them back again.
 */

/** The longest the dev clock may be moved ahead: ten years, so every sum stays a safe integer. */
export const MAX_CLOCK_OFFSET_MS = 10 * 365 * 86_400_000;

export const devKey = {
  clockOffset: 'clock_offset_ms',
  pushOffer: (userId: string): string => `u:${userId}:push_offer`,
  pushOutcome: (userId: string): string => `u:${userId}:push_outcome`,
  night: (userId: string): string => `u:${userId}:night`,
  festival: (userId: string): string => `u:${userId}:festival`,
  modifiers: (day: string): string => `g:modifiers:${day}`,
  dungeonReset: (userId: string, day: string, currency: string): string =>
    `u:${userId}:dungeon_reset:${day}:${currency}`,
} as const;

export class DevState {
  constructor(private readonly sql: SqlStorage) {
    sql.exec('CREATE TABLE IF NOT EXISTS dev_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  get(key: string): string | null {
    return (
      this.sql
        .exec<{ value: string }>('SELECT value FROM dev_state WHERE key = ?', key)
        .toArray()[0]?.value ?? null
    );
  }

  set(key: string, value: string): void {
    this.sql.exec(
      `INSERT INTO dev_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }

  delete(key: string): void {
    this.sql.exec('DELETE FROM dev_state WHERE key = ?', key);
  }

  /** Reads a flag and clears it, so it forces exactly one thing. */
  take(key: string): string | null {
    const value = this.get(key);
    if (value !== null) this.delete(key);
    return value;
  }

  /** The stored clock offset; anything that is not a valid offset counts as none. */
  readOffset(): number {
    const raw = this.get(devKey.clockOffset);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 && n <= MAX_CLOCK_OFFSET_MS ? n : 0;
  }

  writeOffset(ms: number): void {
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > MAX_CLOCK_OFFSET_MS) {
      throw new RangeError('dev clock offset out of range');
    }
    if (ms === 0) this.delete(devKey.clockOffset);
    else this.set(devKey.clockOffset, String(ms));
  }

  /** Forgets everything stored about one player (an account reset). */
  clearUser(userId: string): void {
    this.sql.exec(
      "DELETE FROM dev_state WHERE key LIKE ? ESCAPE '\\'",
      `u:${escapeLike(userId)}:%`,
    );
  }
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A read-only view of the force flags, handed to the game modules that honour them. */
export interface DevFlags {
  get(key: string): string | null;
  take(key: string): string | null;
}
