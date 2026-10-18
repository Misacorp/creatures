/**
 * The lounge message: one message per guild in the announcement channel, edited in place, that shows
 * who is playing, with a button that launches the game (so launching posts no "Game invitation").
 *
 * This file is the storage (synchronous SQL in the guild's Durable Object) and the text. The Discord
 * calls are in `lounge-discord.ts`; the check that ties them together is in `guild-core.ts`. Display
 * names are escaped before they are put in the text. Logs carry error kinds only.
 */
import { safeName } from './discord-format';

/** What an Activity instance id may look like (Discord's look like `i-123...-gc-...`). */
const INSTANCE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
/** The most instances tracked at once; the oldest are dropped. */
export const MAX_TRACKED_INSTANCES = 10;
/** The wait after a session starts before the message is looked at (lets joins settle). */
export const LOUNGE_DEBOUNCE_MS = 15_000;
/** The time between checks while any instance is tracked. */
export const LOUNGE_TICK_MS = 60_000;
/** How long message work stops after Discord says we may not post. */
export const LOUNGE_BLOCK_MS = 30 * 60 * 1000;
/** Failed syncs in a row before the check gives up until the next session. */
export const LOUNGE_MAX_FAILURES = 5;
/** Names shown before "and N more". */
export const MAX_LOUNGE_NAMES = 8;
/** The button's custom id, answered by the interactions endpoint. */
export const LOUNGE_BUTTON_ID = 'lounge:play';

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_USERS_PER_INSTANCE = 100;

export function isInstanceId(id: string): boolean {
  return INSTANCE_ID_RE.test(id);
}

export function loungeMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE lounge_instances (
    instance_id TEXT PRIMARY KEY,
    user_ids TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    checked_at INTEGER NOT NULL
  )`);
  // One row. `content` is the last rendered text with its button label (to skip no-op edits);
  // `next_check_at` is NULL when no check is scheduled; `check_buried` is set when a session has started
  // since the last sync; `blocked_until` pauses message work after a 403.
  sql.exec(`CREATE TABLE lounge_message (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    channel_id TEXT,
    message_id TEXT,
    content TEXT,
    last_visit_user_id TEXT,
    last_visit_at INTEGER,
    next_check_at INTEGER,
    blocked_until INTEGER,
    failures INTEGER NOT NULL DEFAULT 0,
    check_buried INTEGER NOT NULL DEFAULT 0
  )`);
  sql.exec('INSERT INTO lounge_message (id) VALUES (1)');
}

export interface LoungeState {
  channelId: string | null;
  messageId: string | null;
  content: string | null;
  lastVisitUserId: string | null;
  lastVisitAt: number | null;
  nextCheckAt: number | null;
  blockedUntil: number | null;
  failures: number;
  checkBuried: boolean;
}

export function readLounge(sql: SqlStorage): LoungeState {
  const r = sql
    .exec<{
      channel_id: string | null;
      message_id: string | null;
      content: string | null;
      last_visit_user_id: string | null;
      last_visit_at: number | null;
      next_check_at: number | null;
      blocked_until: number | null;
      failures: number;
      check_buried: number;
    }>('SELECT * FROM lounge_message WHERE id = 1')
    .one();
  return {
    channelId: r.channel_id,
    messageId: r.message_id,
    content: r.content,
    lastVisitUserId: r.last_visit_user_id,
    lastVisitAt: r.last_visit_at,
    nextCheckAt: r.next_check_at,
    blockedUntil: r.blocked_until,
    failures: r.failures,
    checkBuried: r.check_buried === 1,
  };
}

export function setNextCheck(sql: SqlStorage, at: number | null): void {
  sql.exec('UPDATE lounge_message SET next_check_at = ? WHERE id = 1', at);
}

/** Never earlier than a check that is already scheduled sooner. */
function scheduleCheck(sql: SqlStorage, at: number): void {
  sql.exec(
    'UPDATE lounge_message SET next_check_at = MIN(COALESCE(next_check_at, ?), ?) WHERE id = 1',
    at,
    at,
  );
}

/**
 * Notes that `userId` started a session in the verified instance: tracks the instance (adding the
 * user), makes them the last visitor and schedules a check. A new instance also asks for the "buried"
 * test. False (nothing stored) if the id has an odd shape.
 */
export function recordInstance(
  sql: SqlStorage,
  instanceId: string,
  userId: string,
  now: number,
): boolean {
  if (!isInstanceId(instanceId) || !SNOWFLAKE.test(userId)) return false;
  const existing = sql
    .exec<{ user_ids: string }>(
      'SELECT user_ids FROM lounge_instances WHERE instance_id = ?',
      instanceId,
    )
    .toArray()[0];
  if (existing === undefined) {
    sql.exec(
      'INSERT INTO lounge_instances (instance_id, user_ids, first_seen_at, checked_at) VALUES (?, ?, ?, ?)',
      instanceId,
      JSON.stringify([userId]),
      now,
      now,
    );
    sql.exec(
      `DELETE FROM lounge_instances WHERE instance_id NOT IN (
         SELECT instance_id FROM lounge_instances ORDER BY first_seen_at DESC, rowid DESC LIMIT ?
       )`,
      MAX_TRACKED_INSTANCES,
    );
    sql.exec('UPDATE lounge_message SET check_buried = 1 WHERE id = 1');
  } else {
    const users = parseUsers(existing.user_ids);
    if (!users.includes(userId)) {
      sql.exec(
        'UPDATE lounge_instances SET user_ids = ? WHERE instance_id = ?',
        JSON.stringify([...users, userId].slice(-MAX_USERS_PER_INSTANCE)),
        instanceId,
      );
    }
  }
  sql.exec(
    'UPDATE lounge_message SET last_visit_user_id = ?, last_visit_at = ? WHERE id = 1',
    userId,
    now,
  );
  scheduleCheck(sql, now + LOUNGE_DEBOUNCE_MS);
  return true;
}

function parseUsers(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && SNOWFLAKE.test(x))
      : [];
  } catch {
    return [];
  }
}

export interface TrackedInstance {
  id: string;
  users: string[];
}

export function trackedInstances(sql: SqlStorage): TrackedInstance[] {
  return sql
    .exec<{ instance_id: string; user_ids: string }>(
      'SELECT instance_id, user_ids FROM lounge_instances ORDER BY first_seen_at, rowid',
    )
    .toArray()
    .map((r) => ({ id: r.instance_id, users: parseUsers(r.user_ids) }));
}

export function storeInstanceUsers(
  sql: SqlStorage,
  instanceId: string,
  users: readonly string[],
  now: number,
): void {
  const clean = users.filter((u) => SNOWFLAKE.test(u)).slice(0, MAX_USERS_PER_INSTANCE);
  sql.exec(
    'UPDATE lounge_instances SET user_ids = ?, checked_at = ? WHERE instance_id = ?',
    JSON.stringify(clean),
    now,
    instanceId,
  );
}

export function deleteInstance(sql: SqlStorage, instanceId: string): void {
  sql.exec('DELETE FROM lounge_instances WHERE instance_id = ?', instanceId);
}

/** Display names of the given players; ids with no player row are left out of the map. */
export function playerNames(sql: SqlStorage, ids: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const id of ids) {
    const row = sql
      .exec<{ display_name: string }>('SELECT display_name FROM players WHERE user_id = ?', id)
      .toArray()[0];
    if (row !== undefined) names.set(id, row.display_name);
  }
  return names;
}

// --- The text ---

export interface LoungeView {
  /** Display names of the players present that are known. */
  names: readonly string[];
  /** Players present whose names are not known: counted, never named. */
  unknown: number;
  /** The last visitor (name null if unknown) and when, for the quiet message. */
  lastVisit: { name: string | null; at: number } | null;
}

export interface RenderedLounge {
  content: string;
  label: string;
}

const byName = (a: string, b: string): number => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
};

export function renderLounge(view: LoungeView): RenderedLounge {
  const total = view.names.length + view.unknown;
  if (total === 0) {
    const visit = view.lastVisit;
    const seconds = visit === null ? '' : String(Math.floor(visit.at / 1000));
    const last =
      visit === null
        ? ''
        : ` Last visit: ${visit.name === null ? '' : `${safeName(visit.name)}, `}<t:${seconds}:t>.`;
    return { content: `🌙 **Leet Creatures**\nThe lounge is quiet.${last}`, label: 'Play' };
  }
  const shown = [...view.names]
    .sort(byName)
    .slice(0, MAX_LOUNGE_NAMES)
    .map((n) => safeName(n));
  const more = total - shown.length;
  const list =
    shown.length === 0 ? '' : `: ${shown.join(', ')}${more > 0 ? ` and ${String(more)} more` : ''}`;
  return { content: `🔥 **Leet Creatures**\n${String(total)} in the lounge${list}`, label: 'Join' };
}

/** What is stored to tell whether the message changed (the button label is part of it). */
export function renderedSignature(r: RenderedLounge): string {
  return `${r.label}\n${r.content}`;
}

export function loungeComponents(label: string) {
  return [{ type: 1, components: [{ type: 2, style: 1, label, custom_id: LOUNGE_BUTTON_ID }] }];
}

// --- State changes after a sync ---

export function storeMessage(
  sql: SqlStorage,
  channelId: string,
  messageId: string,
  signature: string,
): void {
  sql.exec(
    'UPDATE lounge_message SET channel_id = ?, message_id = ?, content = ?, failures = 0, check_buried = 0 WHERE id = 1',
    channelId,
    messageId,
    signature,
  );
}

export function storeSignature(sql: SqlStorage, signature: string): void {
  sql.exec(
    'UPDATE lounge_message SET content = ?, failures = 0, check_buried = 0 WHERE id = 1',
    signature,
  );
}

export function clearMessage(sql: SqlStorage): void {
  sql.exec(
    'UPDATE lounge_message SET channel_id = NULL, message_id = NULL, content = NULL WHERE id = 1',
  );
}

export function clearBuriedFlag(sql: SqlStorage): void {
  sql.exec('UPDATE lounge_message SET check_buried = 0 WHERE id = 1');
}

export function blockMessages(sql: SqlStorage, until: number): void {
  sql.exec('UPDATE lounge_message SET blocked_until = ?, failures = 0 WHERE id = 1', until);
}

export function setFailures(sql: SqlStorage, failures: number): void {
  sql.exec('UPDATE lounge_message SET failures = ? WHERE id = 1', failures);
}

export function setLastVisit(sql: SqlStorage, userId: string | null, at: number | null): void {
  sql.exec(
    'UPDATE lounge_message SET last_visit_user_id = ?, last_visit_at = ? WHERE id = 1',
    userId,
    at,
  );
}
