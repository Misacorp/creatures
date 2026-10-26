/**
 * The raid roster: who is in this week's raid and which party they are in. There is no sign-up and
 * no auto-join: a player joins by placing their first creature on the board (`Raid.place`), and
 * leaves again by removing all of them before Phase 1. Only joined players count (boss scaling, loot,
 * Essence, finale abilities, party size).
 *
 * The "active roster" (`eligiblePlayerIds`: a creature and activity in the last 14 days) is who the
 * board has room for: it sizes the row (`partyRowLength`) and the number of parties, and it is who
 * the Raid tab and the Home notice nudge (`needsPlacement`). Being on it puts nobody in the raid.
 */
import { RULES } from '@creatures/game';
import { rowLength } from './raid-teams';
import { DAY_MS } from './time';

const ELIGIBLE_SQL = `SELECT p.user_id FROM players p
       WHERE EXISTS (SELECT 1 FROM creatures c WHERE c.user_id = p.user_id)
         AND (p.last_seen_at >= ?
              OR EXISTS (SELECT 1 FROM ledger l
                         WHERE l.user_id = p.user_id AND l.source = 'leet' AND l.amount > 0
                           AND l.created_at >= ?))
       ORDER BY p.user_id`;

/**
 * Players who count as active at `now`, sorted by user id so the order never depends on storage:
 * they have a creature and were active in the last `activeWindowDays`. Active means
 * `players.last_seen_at` or a leet credit in the ledger in that window.
 */
export function eligiblePlayerIds(sql: SqlStorage, now: number): string[] {
  const since = now - RULES.raid.activeWindowDays * DAY_MS;
  return sql
    .exec<{ user_id: string }>(ELIGIBLE_SQL, since, since)
    .toArray()
    .map((r) => r.user_id);
}

/** Parties needed for a roster: the smallest number of parties of at most `maxPartySize`. */
export function partyCountFor(players: number): number {
  return Math.ceil(players / RULES.raid.maxPartySize);
}

/**
 * Whether a player may still join the week's raid (by placing their first creature): at any time until
 * the finale starts (the week's status becomes 'finale' in the same step that starts the live fights).
 * Parties made after Phase 1 fight from the next phase they are in; the boss pools already fixed stay.
 */
export function joiningOpen(status: string): boolean {
  return status !== 'finale';
}

/** The members of a party, in join order. */
export function partyMembers(sql: SqlStorage, weekId: string, party: number): string[] {
  return sql
    .exec<{ user_id: string }>(
      'SELECT user_id FROM raid_party_members WHERE week_id = ? AND party = ? ORDER BY joined_at, rowid',
      weekId,
      party,
    )
    .toArray()
    .map((r) => r.user_id);
}

/** The party a player is in this week, or null (they have not joined: they placed nothing). */
export function partyOf(sql: SqlStorage, weekId: string, userId: string): number | null {
  const row = sql
    .exec<{
      party: number;
    }>('SELECT party FROM raid_party_members WHERE week_id = ? AND user_id = ?', weekId, userId)
    .toArray()[0];
  return row?.party ?? null;
}

/**
 * How many players the week's board has to make room for: the active roster as it stood when the
 * week opened (`activeWindowDays` before the week's creation), so the number never moves with the
 * clock and a player who goes quiet in the middle of the week does not shrink the board. It only grows,
 * when somebody new becomes active. Never below the players who joined.
 */
export function activeRosterSize(sql: SqlStorage, weekId: string): number {
  const created = sql
    .exec<{
      created_at: number;
    }>('SELECT created_at FROM raid_weeks WHERE week_id = ?', weekId)
    .toArray()[0]?.created_at;
  if (created === undefined) return 0;
  const since = created - RULES.raid.activeWindowDays * DAY_MS;
  const active = sql.exec(ELIGIBLE_SQL, since, since).toArray().length;
  const joined = sql
    .exec<{ n: number }>('SELECT COUNT(*) AS n FROM raid_party_members WHERE week_id = ?', weekId)
    .one().n;
  return Math.max(active, joined);
}

/** The parties the week has room for: the stored ones, and as many as the active roster needs. */
function partyTotal(sql: SqlStorage, weekId: string, roster: number): number {
  const top = sql
    .exec<{
      top: number | null;
    }>('SELECT MAX(party) AS top FROM raid_parties WHERE week_id = ?', weekId)
    .one().top;
  return Math.max(top ?? 0, partyCountFor(roster));
}

/**
 * The party a player joins by placing their first creature: the one with the fewest joined players
 * (the lowest number on a tie), among the parties that exist and the ones the active roster needs
 * that have not been created yet (they count as empty). A full party (15 joined) is skipped; if all
 * are full a new one is next. Read only; `exists` is false for a party `joinSmallestParty` would
 * still create. A player who has not joined sees the board of this party.
 */
export function partyToJoin(sql: SqlStorage, weekId: string): { party: number; exists: boolean } {
  const stored = new Map<number, number>(
    sql
      .exec<{ party: number; n: number }>(
        `SELECT p.party AS party,
                (SELECT COUNT(*) FROM raid_party_members m WHERE m.week_id = p.week_id AND m.party = p.party) AS n
         FROM raid_parties p WHERE p.week_id = ? ORDER BY p.party`,
        weekId,
      )
      .toArray()
      .map((r) => [r.party, r.n]),
  );
  const total = partyTotal(sql, weekId, activeRosterSize(sql, weekId));
  const counts = new Map(stored);
  for (let party = 1; party <= total; party++) if (!counts.has(party)) counts.set(party, 0);
  let best: number | undefined;
  for (const [party, n] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (n >= RULES.raid.maxPartySize) continue;
    if (best === undefined || n < (counts.get(best) ?? 0)) best = party;
  }
  const party = best ?? Math.max(0, ...counts.keys()) + 1;
  return { party, exists: stored.has(party) };
}

/**
 * Slots in a party's shared row. It has room for three creatures of every player the week's board is
 * made for: the joined players or the party's share of the active roster, whichever is more (at most
 * `maxPartySize` players), with the guest row size as the floor for fewer than `guestsBelowPlayers`
 * players. Never shorter than the highest slot in use, so no placement is ever cut off.
 */
export function partyRowLength(sql: SqlStorage, weekId: string, party: number): number {
  const joined = partyMembers(sql, weekId, party).length;
  const roster = activeRosterSize(sql, weekId);
  const share = Math.ceil(roster / Math.max(1, partyTotal(sql, weekId, roster)));
  const players = Math.min(RULES.raid.maxPartySize, Math.max(joined, share));
  const top = sql
    .exec<{
      top: number | null;
    }>(
      'SELECT MAX(slot) AS top FROM raid_placements WHERE week_id = ? AND party = ?',
      weekId,
      party,
    )
    .one().top;
  return Math.max(rowLength(players), (top ?? -1) + 1);
}

/**
 * Puts a player in the party `partyToJoin` names (created if it does not exist yet). Returns the
 * party number. The caller checks that joining is still open.
 */
export function joinSmallestParty(
  sql: SqlStorage,
  weekId: string,
  userId: string,
  at: number,
): number {
  const { party, exists } = partyToJoin(sql, weekId);
  if (!exists) sql.exec('INSERT INTO raid_parties (week_id, party) VALUES (?, ?)', weekId, party);
  sql.exec(
    'INSERT INTO raid_party_members (week_id, user_id, party, joined_at) VALUES (?, ?, ?, ?)',
    weekId,
    userId,
    party,
    at,
  );
  return party;
}

/**
 * Takes a player out of their party (they removed their last creature before Phase 1). Their
 * placements go too.
 */
export function leaveParty(sql: SqlStorage, weekId: string, userId: string): void {
  sql.exec('DELETE FROM raid_party_members WHERE week_id = ? AND user_id = ?', weekId, userId);
  sql.exec('DELETE FROM raid_placements WHERE week_id = ? AND user_id = ?', weekId, userId);
}
