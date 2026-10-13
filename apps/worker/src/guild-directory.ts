import { DurableObject } from 'cloudflare:workers';
import { SNOWFLAKE_RE } from './schemas';

/** The directory is one object: every caller addresses it by this fixed name. */
export const DIRECTORY_NAME = 'guild-directory';
/** `list` never returns more guilds than this, so one call stays bounded. */
const MAX_LISTED = 2000;
/** The directory stops adding new guilds beyond this (existing ones keep updating). */
const MAX_GUILDS = 5000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The only cross-guild index: which guilds exist, with the first and last day (UTC, 'YYYY-MM-DD')
 * a session was created in each. It stores nothing else about a guild, never a player or a name.
 * The ops report uses it to find the guild objects to ask for their rollups.
 *
 * Both methods are RPC methods for Worker code with the binding; the object has no HTTP surface
 * (`fetch` is not implemented). Writes come best-effort from `GuildWorld.createSession`.
 */
export class GuildDirectory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS guild_directory (
      guild_id TEXT PRIMARY KEY,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    )`);
  }

  /** Records that a session was created in `guildId` on `day`. Bad input is ignored. */
  note(guildId: string, day: string): void {
    if (!SNOWFLAKE_RE.test(guildId) || !DAY_RE.test(day)) return;
    const sql = this.ctx.storage.sql;
    const known = sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM guild_directory WHERE guild_id = ?', guildId)
      .one().n;
    if (known === 0) {
      const total = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM guild_directory').one().n;
      if (total >= MAX_GUILDS) return;
    }
    sql.exec(
      `INSERT INTO guild_directory (guild_id, first_seen, last_seen) VALUES (?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)`,
      guildId,
      day,
      day,
    );
  }

  /** The known guilds (ids), oldest first. */
  list(): string[] {
    return this.ctx.storage.sql
      .exec<{ guild_id: string }>(
        'SELECT guild_id FROM guild_directory ORDER BY first_seen, guild_id LIMIT ?',
        MAX_LISTED,
      )
      .toArray()
      .map((r) => r.guild_id);
  }
}
