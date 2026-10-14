/**
 * The raid roster: who is in this week's raid and which party they are in. There is no sign-up.
 * Everyone who has a creature and was active recently is in (the old sit-out table is no longer
 * read). Rosters of more
 * than `maxPartySize` players are split into balanced parties by a snake draft on team power.
 */
import { RULES } from '@creatures/game';
import { autoTeam, loadCreatures, rowLength, teamPower } from './raid-teams';

const DAY_MS = 86_400_000;

/**
 * Players who may be on the roster of `weekId` now, sorted by user id so the order never depends
 * on storage: they have a creature and were active in the last
 * `activeWindowDays`. Opt-outs are no longer honoured (the `raid_opt_outs` table is kept for now but
 * never read). Active means `players.last_seen_at` or a leet credit
 * in the ledger in that window.
 */
export function eligiblePlayerIds(sql: SqlStorage, now: number): string[] {
  const since = now - RULES.raid.activeWindowDays * DAY_MS;
  return sql
    .exec<{ user_id: string }>(
      `SELECT p.user_id FROM players p
       WHERE EXISTS (SELECT 1 FROM creatures c WHERE c.user_id = p.user_id)
         AND (p.last_seen_at >= ?
              OR EXISTS (SELECT 1 FROM ledger l
                         WHERE l.user_id = p.user_id AND l.source = 'leet' AND l.amount > 0
                           AND l.created_at >= ?))
       ORDER BY p.user_id`,
      since,
      since,
    )
    .toArray()
    .map((r) => r.user_id);
}

/** Parties needed for a roster: the smallest number of parties of at most `maxPartySize`. */
export function partyCountFor(players: number): number {
  return Math.ceil(players / RULES.raid.maxPartySize);
}

/**
 * Splits players into `parties` groups by a snake draft on team power: the strongest player goes to
 * party 1, the next to party 2, ... then the order reverses. Ties in power go to the smaller id.
 * Group sizes differ by at most one. Pure.
 */
export function snakeDraft(
  players: readonly { userId: string; power: number }[],
  parties: number,
): string[][] {
  if (!Number.isInteger(parties) || parties < 1) throw new RangeError('parties must be >= 1');
  const sorted = [...players].sort(
    (a, b) => b.power - a.power || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  const groups: string[][] = Array.from({ length: parties }, () => []);
  sorted.forEach((player, i) => {
    const round = Math.floor(i / parties);
    const offset = i % parties;
    const index = round % 2 === 0 ? offset : parties - 1 - offset;
    (groups[index] as string[]).push(player.userId);
  });
  return groups;
}

/** A player's team power for balancing: the power of their automatic team. */
export function playerPower(sql: SqlStorage, userId: string): number {
  return teamPower(autoTeam(loadCreatures(sql, userId)));
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

/** The party a player is in this week, or null. */
export function partyOf(sql: SqlStorage, weekId: string, userId: string): number | null {
  const row = sql
    .exec<{
      party: number;
    }>('SELECT party FROM raid_party_members WHERE week_id = ? AND user_id = ?', weekId, userId)
    .toArray()[0];
  return row?.party ?? null;
}

/** Creates the parties of a new week from its roster. */
export function createParties(
  sql: SqlStorage,
  weekId: string,
  userIds: readonly string[],
  at: number,
): void {
  if (userIds.length === 0) return;
  const groups = snakeDraft(
    userIds.map((userId) => ({ userId, power: playerPower(sql, userId) })),
    partyCountFor(userIds.length),
  );
  groups.forEach((members, i) => {
    const party = i + 1;
    sql.exec('INSERT INTO raid_parties (week_id, party) VALUES (?, ?)', weekId, party);
    for (const userId of members) {
      sql.exec(
        'INSERT INTO raid_party_members (week_id, user_id, party, joined_at) VALUES (?, ?, ?, ?)',
        weekId,
        userId,
        party,
        at,
      );
    }
  });
}

/**
 * Adds a player to the party with the fewest members (the lowest number on a tie). If every party
 * is full a new one is opened. Returns the party number.
 */
export function joinSmallestParty(
  sql: SqlStorage,
  weekId: string,
  userId: string,
  at: number,
): number {
  const parties = sql
    .exec<{ party: number; n: number }>(
      `SELECT p.party AS party,
              (SELECT COUNT(*) FROM raid_party_members m WHERE m.week_id = p.week_id AND m.party = p.party) AS n
       FROM raid_parties p WHERE p.week_id = ? ORDER BY n, p.party`,
      weekId,
    )
    .toArray();
  let party = parties[0]?.party;
  if (party === undefined || (parties[0]?.n ?? 0) >= RULES.raid.maxPartySize) {
    const highest = sql
      .exec<{ top: number | null }>(
        'SELECT MAX(party) AS top FROM raid_parties WHERE week_id = ?',
        weekId,
      )
      .one().top;
    party = (highest ?? 0) + 1;
    sql.exec('INSERT INTO raid_parties (week_id, party) VALUES (?, ?)', weekId, party);
  }
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
 * Takes a player out of their party (opting out): their placements go, and placements that no
 * longer fit the shorter row are dropped too.
 */
export function leaveParty(sql: SqlStorage, weekId: string, userId: string): void {
  const party = partyOf(sql, weekId, userId);
  if (party === null) return;
  sql.exec('DELETE FROM raid_party_members WHERE week_id = ? AND user_id = ?', weekId, userId);
  sql.exec('DELETE FROM raid_placements WHERE week_id = ? AND user_id = ?', weekId, userId);
  const left = partyMembers(sql, weekId, party).length;
  sql.exec(
    'DELETE FROM raid_placements WHERE week_id = ? AND party = ? AND slot >= ?',
    weekId,
    party,
    rowLength(left),
  );
}
