import { dispatch, errorResponse, json, type Routes } from './http';
import { TokenBucketLimiter } from './ratelimit';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
  generateSessionSecret,
  hashSecret,
  parseAuthorization,
} from './session';

/** Per-user session cap: older sessions are dropped so storage stays bounded. */
const MAX_SESSIONS_PER_USER = 10;
/** Per-player API rate limit: burst of 30, refilling one request per second. */
const RATE_CAPACITY = 30;
const RATE_REFILL_PER_SECOND = 1;
const RATE_MAX_KEYS = 1000;

/** Versioned schema migrations; index 0 is version 1. Never edit a released migration. */
const MIGRATIONS: readonly ((sql: SqlStorage) => void)[] = [
  (sql) => {
    sql.exec(`CREATE TABLE players (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES players(user_id),
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX sessions_user_id ON sessions(user_id)');
  },
];

export interface SessionUser {
  id: string;
  displayName: string;
}

interface RequestContext {
  user: SessionUser;
  guildId: string;
}

const routes: Routes<RequestContext> = {
  '/api/me': {
    GET: (_request, { user, guildId }) => json({ user, guildId }),
  },
};

/**
 * All game logic of a guild's Durable Object, kept free of the runtime class so tests can drive it
 * with a fake clock. The Durable Object class is a thin wrapper around this.
 */
export class GuildCore {
  private readonly limiter: TokenBucketLimiter;

  constructor(
    private readonly storage: Pick<DurableObjectStorage, 'sql' | 'transactionSync'>,
    private readonly now: () => number,
  ) {
    this.limiter = new TokenBucketLimiter({
      capacity: RATE_CAPACITY,
      refillPerSecond: RATE_REFILL_PER_SECOND,
      now,
      maxKeys: RATE_MAX_KEYS,
    });
  }

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  /** Brings the schema up to date. Call inside `blockConcurrencyWhile`. */
  migrate(): void {
    this.sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = this.sql
      .exec<{ version: number | null }>('SELECT MAX(version) AS version FROM schema_version')
      .one();
    const current = row.version ?? 0;
    for (let version = current + 1; version <= MIGRATIONS.length; version++) {
      const migration = MIGRATIONS[version - 1];
      if (migration === undefined) throw new Error(`missing migration ${String(version)}`);
      this.storage.transactionSync(() => {
        migration(this.sql);
        this.sql.exec('INSERT INTO schema_version (version) VALUES (?)', version);
      });
    }
  }

  /** Upserts the player and creates a session. Returns the secret half of the token. */
  async createSession(user: SessionUser): Promise<string> {
    const secret = generateSessionSecret();
    const tokenHash = await hashSecret(secret);
    const t = this.now();
    this.storage.transactionSync(() => {
      this.sql.exec(
        'DELETE FROM sessions WHERE expires_at <= ? OR last_used_at <= ?',
        t,
        t - SESSION_IDLE_MS,
      );
      this.sql.exec(
        `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`,
        user.id,
        user.displayName,
        t,
        t,
      );
      this.sql.exec(
        'INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        tokenHash,
        user.id,
        t,
        t,
        t + SESSION_ABSOLUTE_MS,
      );
      this.sql.exec(
        `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
           SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
         )`,
        user.id,
        user.id,
        MAX_SESSIONS_PER_USER,
      );
    });
    return secret;
  }

  /** Returns the session's user, or null if the secret is unknown or the session expired. */
  async verifySession(secret: string): Promise<SessionUser | null> {
    const tokenHash = await hashSecret(secret);
    const t = this.now();
    const rows = this.sql
      .exec<{
        user_id: string;
        display_name: string;
        last_used_at: number;
        expires_at: number;
      }>(
        `SELECT s.user_id, p.display_name, s.last_used_at, s.expires_at
         FROM sessions s JOIN players p ON p.user_id = s.user_id WHERE s.token_hash = ?`,
        tokenHash,
      )
      .toArray();
    const row = rows[0];
    if (row === undefined) return null;
    if (t >= row.expires_at || t - row.last_used_at >= SESSION_IDLE_MS) {
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      return null;
    }
    if (t - row.last_used_at >= SESSION_TOUCH_INTERVAL_MS) {
      this.storage.transactionSync(() => {
        this.sql.exec('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?', t, tokenHash);
        this.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', t, row.user_id);
      });
    }
    return { id: row.user_id, displayName: row.display_name };
  }

  /** Handles an authenticated API request forwarded by the Worker. */
  async handle(request: Request): Promise<Response> {
    const token = parseAuthorization(request.headers.get('Authorization'));
    if (token === null) return errorResponse('invalid_session', 401);
    const user = await this.verifySession(token.secret);
    if (user === null) return errorResponse('invalid_session', 401);

    const limit = this.limiter.take(user.id);
    if (!limit.allowed) {
      return errorResponse('rate_limited', 429, {
        'Retry-After': String(limit.retryAfterSeconds),
      });
    }
    return dispatch(routes, request, new URL(request.url).pathname, {
      user,
      guildId: token.guildId,
    });
  }
}
