/**
 * Opt-in Discord DMs (docs/design/dm-notifications.md). A player turns on up to four kinds, per server,
 * all off by default: a trip home, a Workshop job done, the raid finale about to start, the Prize Stall
 * opening.
 *
 * Nothing hooks into sending a trip or claiming a job. A scan reads the tables the game already keeps
 * (trips, jobs, the raid week, the stall's day) for events that came due for opted-in players, notes
 * each in `dm_sent` so it is never told twice, and queues ONE message per player with a line per event.
 * An event only counts if it came due after the player turned its kind on (turning one on never floods
 * old events) and within the last 12 hours (an outage does not send stale pings). Delivery is in
 * `dm-queue.ts` and `guild-core.ts`.
 */
import { destinationDef } from '@creatures/game';
import { discordTime, escapeMarkdown, safeName, truncateMessage } from './discord-format';
import { enqueueDm } from './dm-queue';
import { stallWeek } from './games-stall';
import { eventTimes, weekIdFor } from './raid-schedule';
import { speciesOf } from './species';

export const DM_KINDS = ['trip', 'job', 'finale', 'stall'] as const;
export type DmKind = (typeof DM_KINDS)[number];
/** The kinds a request turns on (true) or off (false); a kind left out stays as it is. */
export type DmChanges = { [K in DmKind]?: boolean | undefined };

/** Which kinds a player has on, and whether Discord refused their DMs. */
export interface DmPrefs {
  kinds: Record<DmKind, boolean>;
  blocked: boolean;
}

/** An event older than this when the scan finds it is dropped, not told. */
export const STALE_MS = 12 * 60 * 60 * 1000;
/** The finale ping comes this long before the finale starts. */
export const FINALE_LEAD_MS = 10 * 60 * 1000;
/** `dm_sent` rows are kept this long. */
export const SENT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** Lines one DM carries; the rest are counted ("and 3 more"), so the message stays short. */
const MAX_LINES = 12;

export const FOOTER = 'Turn these off in the game: Settings, Discord DMs.';

/** The `dm_prefs` column holding when each kind was turned on. Fixed names: safe to put in SQL. */
const ON_AT: Record<DmKind, string> = {
  trip: 'trip_on_at',
  job: 'job_on_at',
  finale: 'finale_on_at',
  stall: 'stall_on_at',
};

// --- Preferences ---

export function readPrefs(sql: SqlStorage, userId: string): DmPrefs {
  const row = sql
    .exec<{
      trip_on_at: number | null;
      job_on_at: number | null;
      finale_on_at: number | null;
      stall_on_at: number | null;
      blocked_at: number | null;
    }>(
      'SELECT trip_on_at, job_on_at, finale_on_at, stall_on_at, blocked_at FROM dm_prefs WHERE user_id = ?',
      userId,
    )
    .toArray()[0];
  return {
    kinds: {
      trip: row?.trip_on_at != null,
      job: row?.job_on_at != null,
      finale: row?.finale_on_at != null,
      stall: row?.stall_on_at != null,
    },
    blocked: row?.blocked_at != null,
  };
}

/**
 * Turns kinds on or off. A kind that is on already keeps the time it was turned on. Any change clears
 * the block, so flipping a setting is how a player tries again after changing their Discord privacy
 * settings. Call inside a transaction. Returns the state before and after.
 */
export function setPrefs(
  sql: SqlStorage,
  userId: string,
  changes: DmChanges,
  now: number,
): { before: DmPrefs; after: DmPrefs } {
  const before = readPrefs(sql, userId);
  sql.exec('INSERT INTO dm_prefs (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING', userId);
  for (const kind of DM_KINDS) {
    const wanted = changes[kind];
    if (wanted === undefined) continue;
    const column = ON_AT[kind];
    if (wanted) {
      sql.exec(
        `UPDATE dm_prefs SET ${column} = COALESCE(${column}, ?) WHERE user_id = ?`,
        now,
        userId,
      );
    } else {
      sql.exec(`UPDATE dm_prefs SET ${column} = NULL WHERE user_id = ?`, userId);
    }
  }
  sql.exec('UPDATE dm_prefs SET blocked_at = NULL WHERE user_id = ?', userId);
  return { before, after: readPrefs(sql, userId) };
}

/** The cached DM channel of a player, or null. */
export function cachedChannel(sql: SqlStorage, userId: string): string | null {
  return (
    sql
      .exec<{ dm_channel_id: string | null }>(
        'SELECT dm_channel_id FROM dm_prefs WHERE user_id = ?',
        userId,
      )
      .toArray()[0]?.dm_channel_id ?? null
  );
}

export function storeChannel(sql: SqlStorage, userId: string, channelId: string | null): void {
  sql.exec('UPDATE dm_prefs SET dm_channel_id = ? WHERE user_id = ?', channelId, userId);
}

/** Records that Discord refused this player's DMs: nothing is queued for them until they change a setting. */
export function markBlocked(sql: SqlStorage, userId: string, now: number): void {
  sql.exec('UPDATE dm_prefs SET blocked_at = ? WHERE user_id = ?', now, userId);
}

export function isBlocked(sql: SqlStorage, userId: string): boolean {
  return readPrefs(sql, userId).blocked;
}

// --- Texts ---

const WELCOME_PHRASE: Record<DmKind, string> = {
  trip: 'a creature comes home from a trip',
  job: 'a Workshop job is done',
  finale: 'the raid finale is about to start',
  stall: 'the Prize Stall opens',
};

/** The DM sent when a player turns on their first kind: it also shows whether DMs reach them. */
export function welcomeText(kinds: Record<DmKind, boolean>): string {
  const phrases = DM_KINDS.filter((k) => kinds[k]).map((k) => WELCOME_PHRASE[k]);
  const last = phrases.pop();
  const list =
    last === undefined
      ? 'something happens'
      : phrases.length === 0
        ? last
        : `${phrases.join(', ')} or ${last}`;
  return truncateMessage(`👋 You'll get a DM here when ${list}.\n\n${FOOTER}`);
}

/** The verb of a finished job, by the kind of job. */
const JOB_DONE: Record<string, string> = {
  craft: 'finished crafting at the Workshop',
  supply: 'finished making supplies at the Workshop',
  dismantle: 'finished taking things apart at the Workshop',
  convert: 'finished reworking parts at the Workshop',
};

function creatureName(nickname: string | null, species: string | null): string {
  if (nickname !== null) return safeName(nickname);
  if (species === null) return 'A creature';
  try {
    return safeName(speciesOf(species).name);
  } catch {
    return 'A creature';
  }
}

// --- The scan ---

interface DueLine {
  userId: string;
  /** The `dm_sent` key: one per event. */
  key: string;
  line: string;
}

export interface ScanContext {
  /** The game clock. */
  now: number;
  tz: string;
  /** Puts a game-clock time on the real clock, for Discord timestamps (they differ only with the dev clock). */
  realAt: (gameMs: number) => number;
}

/** True while any player has this kind on and is not blocked. */
function anyoneOn(sql: SqlStorage, kind: DmKind): boolean {
  return (
    sql
      .exec(
        `SELECT 1 FROM dm_prefs WHERE blocked_at IS NULL AND ${ON_AT[kind]} IS NOT NULL LIMIT 1`,
      )
      .toArray().length > 0
  );
}

/** True while any player is opted in to anything and not blocked. */
export function anyoneOptedIn(sql: SqlStorage): boolean {
  return (
    sql
      .exec(
        `SELECT 1 FROM dm_prefs WHERE blocked_at IS NULL AND (trip_on_at IS NOT NULL
           OR job_on_at IS NOT NULL OR finale_on_at IS NOT NULL OR stall_on_at IS NOT NULL) LIMIT 1`,
      )
      .toArray().length > 0
  );
}

type TripRow = {
  id: string;
  user_id: string;
  destination_id: string;
  nickname: string | null;
  species: string | null;
};

function placeOf(destinationId: string): string {
  const name = destinationDef(destinationId)?.name;
  return name === undefined ? 'the trail' : escapeMarkdown(name);
}

function tripLines(sql: SqlStorage, ctx: ScanContext): DueLine[] {
  if (!anyoneOn(sql, 'trip')) return [];
  const floor = ctx.now - STALE_MS;
  const select = `SELECT e.id, e.user_id, e.destination_id, c.nickname, c.species
    FROM expeditions e
    JOIN dm_prefs p ON p.user_id = e.user_id
    LEFT JOIN creatures c ON c.id = e.creature_id`;
  const guard = 'p.blocked_at IS NULL AND p.trip_on_at IS NOT NULL';
  // A trip that has ended and waits for the player (the push-on choice, or just coming home).
  const ended = sql
    .exec<TripRow>(
      `${select} WHERE e.status = 'active' AND e.push_goal IS NULL
         AND e.ends_at <= ? AND e.ends_at >= ? AND e.ends_at >= p.trip_on_at AND ${guard}
       ORDER BY e.ends_at, e.id`,
      ctx.now,
      floor,
    )
    .toArray()
    .map((r) => ({
      userId: r.user_id,
      key: `trip:${r.id}:end`,
      line: `🧭 ${creatureName(r.nickname, r.species)} is home from ${placeOf(r.destination_id)}.`,
    }));
  // A chosen push-on that has run its course.
  const pushed = sql
    .exec<TripRow>(
      `${select} WHERE e.status = 'active' AND e.push_goal IS NOT NULL
         AND e.push_ends_at <= ? AND e.push_ends_at >= ? AND e.push_ends_at >= p.trip_on_at AND ${guard}
       ORDER BY e.push_ends_at, e.id`,
      ctx.now,
      floor,
    )
    .toArray()
    .map((r) => ({
      userId: r.user_id,
      key: `trip:${r.id}:push`,
      line: `🧭 ${creatureName(r.nickname, r.species)} is back from pushing on at ${placeOf(r.destination_id)}.`,
    }));
  return [...ended, ...pushed];
}

function jobLines(sql: SqlStorage, ctx: ScanContext): DueLine[] {
  if (!anyoneOn(sql, 'job')) return [];
  return sql
    .exec<{
      id: string;
      user_id: string;
      kind: string;
      nickname: string | null;
      species: string | null;
    }>(
      `SELECT j.id, j.user_id, j.kind, c.nickname, c.species
       FROM workshop_jobs j
       JOIN dm_prefs p ON p.user_id = j.user_id
       LEFT JOIN creatures c ON c.id = j.creature_id
       WHERE j.claimed_at IS NULL AND j.ends_at <= ? AND j.ends_at >= ? AND j.ends_at >= p.job_on_at
         AND p.blocked_at IS NULL AND p.job_on_at IS NOT NULL
       ORDER BY j.ends_at, j.id`,
      ctx.now,
      ctx.now - STALE_MS,
    )
    .toArray()
    .map((r) => ({
      userId: r.user_id,
      key: `job:${r.id}`,
      line: `🔨 ${creatureName(r.nickname, r.species)} ${JOB_DONE[r.kind] ?? 'finished a job at the Workshop'}.`,
    }));
}

/**
 * The week's finale ping time when this week's raid really has a finale coming: the week exists (it
 * starts with the Monday event) and its finale has not been fought. Null otherwise.
 */
function finalePing(
  sql: SqlStorage,
  now: number,
  tz: string,
): { weekId: string; at: number; start: number } | null {
  const weekId = weekIdFor(now, tz);
  const week = sql
    .exec<{ status: string }>('SELECT status FROM raid_weeks WHERE week_id = ?', weekId)
    .toArray()[0];
  if (week === undefined || week.status === 'finale') return null;
  const start = eventTimes(weekId, tz).finale;
  return { weekId, at: start - FINALE_LEAD_MS, start };
}

function finaleLines(sql: SqlStorage, ctx: ScanContext): DueLine[] {
  if (!anyoneOn(sql, 'finale')) return [];
  const ping = finalePing(sql, ctx.now, ctx.tz);
  // Due from ten minutes before the start, never after it.
  if (ping === null || ping.at > ctx.now || ctx.now >= ping.start || ping.at < ctx.now - STALE_MS)
    return [];
  // Only players who joined this week's raid (placed a creature) get the ping.
  return sql
    .exec<{ user_id: string }>(
      `SELECT user_id FROM dm_prefs
       WHERE blocked_at IS NULL AND finale_on_at IS NOT NULL AND finale_on_at <= ?
         AND user_id IN (SELECT user_id FROM raid_party_members WHERE week_id = ?)
       ORDER BY user_id`,
      ping.at,
      ping.weekId,
    )
    .toArray()
    .map((r) => ({
      userId: r.user_id,
      key: `finale:${ping.weekId}:${r.user_id}`,
      line: '⚔️ The raid finale starts in 10 minutes.',
    }));
}

function stallLines(sql: SqlStorage, ctx: ScanContext): DueLine[] {
  if (!anyoneOn(sql, 'stall')) return [];
  const stall = stallWeek(ctx.now, ctx.tz);
  if (stall.opensAt > ctx.now || ctx.now >= stall.closesAt || stall.opensAt < ctx.now - STALE_MS)
    return [];
  return sql
    .exec<{ user_id: string }>(
      `SELECT user_id FROM dm_prefs
       WHERE blocked_at IS NULL AND stall_on_at IS NOT NULL AND stall_on_at <= ? ORDER BY user_id`,
      stall.opensAt,
    )
    .toArray()
    .map((r) => ({
      userId: r.user_id,
      key: `stall:${stall.week}:${r.user_id}`,
      line: `🏅 The Prize Stall is open today. Spend your medal points before it closes ${discordTime(ctx.realAt(stall.closesAt))}.`,
    }));
}

/**
 * Finds the events that came due, notes them in `dm_sent`, and queues one DM per player with all their
 * new lines (a key that is in `dm_sent` already is left out, so a repeat scan queues nothing). Call
 * inside one transaction. Returns how many messages were queued.
 */
export function scanDm(sql: SqlStorage, ctx: ScanContext): number {
  if (!anyoneOptedIn(sql)) return 0;
  const due = [
    ...tripLines(sql, ctx),
    ...jobLines(sql, ctx),
    ...finaleLines(sql, ctx),
    ...stallLines(sql, ctx),
  ];
  const perPlayer = new Map<string, { keys: string[]; lines: string[] }>();
  for (const item of due) {
    const fresh =
      sql
        .exec(
          'INSERT INTO dm_sent (key, user_id, at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING RETURNING key',
          item.key,
          item.userId,
          ctx.now,
        )
        .toArray().length > 0;
    if (!fresh) continue;
    const entry = perPlayer.get(item.userId) ?? { keys: [], lines: [] };
    entry.keys.push(item.key);
    entry.lines.push(item.line);
    perPlayer.set(item.userId, entry);
  }
  let queued = 0;
  for (const [userId, { keys, lines }] of perPlayer) {
    const shown = lines.slice(0, MAX_LINES);
    if (lines.length > shown.length)
      shown.push(`…and ${String(lines.length - shown.length)} more.`);
    const content = truncateMessage(`${shown.join('\n')}\n\n${FOOTER}`);
    // Keyed by the first event: every event key is unique, so no two messages share one.
    if (enqueueDm(sql, { key: `dm:${keys[0] ?? ''}`, userId, content }, ctx.now)) queued += 1;
  }
  return queued;
}

// --- When the next one is due ---

/** The earliest of two optional times. */
const earlier = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.min(a, b);

/**
 * The earliest future time something is due for an opted-in player (a trip end or push end, a job end,
 * the finale ping, the Prize Stall opening), or null. The alarm wakes then. Cheap: the open trips and jobs
 * are found through partial indexes (`dm-migration.ts`).
 */
export function nextDmDueAt(sql: SqlStorage, now: number, tz: string): number | null {
  if (!anyoneOptedIn(sql)) return null;
  const min = (query: string): number | null =>
    sql.exec<{ at: number | null }>(query, now).one().at ?? null;
  let next: number | null = null;
  if (anyoneOn(sql, 'trip')) {
    next = earlier(
      next,
      min(`SELECT MIN(e.ends_at) AS at FROM expeditions e JOIN dm_prefs p ON p.user_id = e.user_id
           WHERE e.status = 'active' AND e.push_goal IS NULL AND e.ends_at > ?
             AND p.blocked_at IS NULL AND p.trip_on_at IS NOT NULL`),
    );
    next = earlier(
      next,
      min(`SELECT MIN(e.push_ends_at) AS at FROM expeditions e JOIN dm_prefs p ON p.user_id = e.user_id
           WHERE e.status = 'active' AND e.push_goal IS NOT NULL AND e.push_ends_at > ?
             AND p.blocked_at IS NULL AND p.trip_on_at IS NOT NULL`),
    );
  }
  if (anyoneOn(sql, 'job')) {
    next = earlier(
      next,
      min(`SELECT MIN(j.ends_at) AS at FROM workshop_jobs j JOIN dm_prefs p ON p.user_id = j.user_id
           WHERE j.claimed_at IS NULL AND j.ends_at > ?
             AND p.blocked_at IS NULL AND p.job_on_at IS NOT NULL`),
    );
  }
  if (anyoneOn(sql, 'finale')) {
    const ping = finalePing(sql, now, tz);
    if (ping !== null && ping.at > now) next = earlier(next, ping.at);
  }
  if (anyoneOn(sql, 'stall')) {
    let stall = stallWeek(now, tz);
    // Open now (already told about): the next opening is next week's.
    if (stall.opensAt <= now) stall = stallWeek(stall.closesAt, tz);
    if (stall.opensAt > now) next = earlier(next, stall.opensAt);
  }
  return next;
}

// --- Cleanup ---

/** Drops what is no longer needed: `dm_sent` rows after 30 days. (The outbox prunes itself in `dm-queue.ts`.) */
export function pruneSent(sql: SqlStorage, now: number): void {
  sql.exec('DELETE FROM dm_sent WHERE at < ?', now - SENT_KEEP_MS);
}
