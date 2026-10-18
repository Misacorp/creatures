/**
 * Teammates helping an away player. A party member is away when they have not opened the game since
 * the raid week began (`players.last_seen_at` is before the week's start; leet credits are not
 * "opening the game"). While they are away, the others in their party may move their joining
 * creatures to free slots and swap one for another creature they own. The first such move pins the
 * away player's whole team (the auto-placed creatures at their current slots) as real placements,
 * recorded as placed by the teammate; from then on their team is exactly their placements. A creature
 * the owner placed themselves is never touched. Once the owner opens the game they are no longer
 * away and the teammates' placements just stay until they change them. Reads and writes SQL; call it
 * inside a transaction.
 */
import { RULES } from '@creatures/game';
import { GameError } from './outcome';
import { buildPartyBoard } from './raid-resolve';
import { partyMembers } from './raid-roster';
import { rowLength } from './raid-teams';

/** Who of `userIds` is away: last seen before `weekStart` (UTC epoch ms, from the week's schedule). */
export function awayMembers(
  sql: SqlStorage,
  userIds: readonly string[],
  weekStart: number,
): Set<string> {
  const away = new Set<string>();
  for (const userId of userIds) {
    const seen = sql
      .exec<{
        last_seen_at: number;
      }>('SELECT last_seen_at FROM players WHERE user_id = ?', userId)
      .toArray()[0]?.last_seen_at;
    if (seen !== undefined && seen < weekStart) away.add(userId);
  }
  return away;
}

/** The week and party an assist happens in. `weekStart` comes from `eventTimes(weekId, tz)`. */
export interface AssistWeek {
  weekId: string;
  party: number;
  weekStart: number;
}

type OwnRow = { slot: number; creature_id: string; placed_by: string | null };

/**
 * `callerId` moves or swaps the creature `creatureId` of another party member into `slot`. The
 * creature's owner is read from the creature itself, never from the request. Throws a `GameError`:
 * `not_in_party`, `not_away`, `invalid_slot`, `slot_taken` (another member's placed creature; their auto creature makes room), `not_movable` (the owner placed it
 * themselves) or `board_full`. Rejections change nothing (the caller's transaction rolls back).
 */
export function placeForTeammate(
  sql: SqlStorage,
  week: AssistWeek,
  callerId: string,
  ownerId: string,
  creatureId: string,
  slot: number,
): void {
  const members = partyMembers(sql, week.weekId, week.party);
  if (!members.includes(ownerId)) throw new GameError(409, 'not_in_party');
  if (!awayMembers(sql, [ownerId], week.weekStart).has(ownerId)) {
    throw new GameError(409, 'not_away');
  }
  const length = rowLength(members.length);
  if (!Number.isInteger(slot) || slot < 0 || slot >= length) {
    throw new GameError(400, 'invalid_slot');
  }
  const board = buildPartyBoard(sql, week.weekId, week.party, members);
  const ownerAlias = board.aliases[members.indexOf(ownerId)] as string;
  const target = board.cells[slot];
  // Nothing to do: the creature already stands there (no pin either).
  if (target?.slot?.id === creatureId) return;
  // Someone else's auto creature makes room (it reflows to a free slot); a creature another member
  // placed stays put. A creature the owner placed themselves is theirs to move, not ours.
  const there = target?.slot ?? null;
  if (there !== null && there.ownerId !== null) {
    if (there.ownerId !== ownerAlias && target?.origin !== 'auto') {
      throw new GameError(409, 'slot_taken');
    }
    if (there.ownerId === ownerAlias && target?.origin === 'placed' && target.placedBy === null) {
      throw new GameError(409, 'not_movable');
    }
  }
  const ownRows = (): OwnRow[] =>
    sql
      .exec<OwnRow>(
        'SELECT slot, creature_id, placed_by FROM raid_placements WHERE week_id = ? AND party = ? AND user_id = ? ORDER BY rowid',
        week.weekId,
        week.party,
        ownerId,
      )
      .toArray();
  if (ownRows().some((r) => r.creature_id === creatureId && r.placed_by === null)) {
    throw new GameError(409, 'not_movable');
  }

  // Pin the owner's auto creatures at the slots the fight would give them.
  board.cells.forEach((cell, at) => {
    if (cell.origin !== 'auto' || cell.slot?.ownerId !== ownerAlias) return;
    insert(sql, week, at, ownerId, cell.slot.id, callerId);
  });

  const rows = ownRows();
  const mine = rows.find((r) => r.creature_id === creatureId);
  const occupant = rows.find((r) => r.slot === slot);
  if (mine === undefined && occupant === undefined && rows.length >= RULES.raid.teamSize) {
    throw new GameError(409, 'board_full');
  }
  // Delete first, insert after: the unique constraints never see two creatures in one slot.
  if (mine !== undefined) remove(sql, week.weekId, creatureId);
  if (occupant !== undefined) remove(sql, week.weekId, occupant.creature_id);
  insert(sql, week, slot, ownerId, creatureId, callerId);
  // Moving onto a joining creature that was already placed swaps places; a swap-in just replaces it.
  if (occupant !== undefined && mine !== undefined) {
    insert(sql, week, mine.slot, ownerId, occupant.creature_id, callerId);
  }
}

function remove(sql: SqlStorage, weekId: string, creatureId: string): void {
  sql.exec('DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?', weekId, creatureId);
}

function insert(
  sql: SqlStorage,
  week: AssistWeek,
  slot: number,
  ownerId: string,
  creatureId: string,
  placedBy: string,
): void {
  sql.exec(
    'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id, placed_by) VALUES (?, ?, ?, ?, ?, ?)',
    week.weekId,
    week.party,
    slot,
    ownerId,
    creatureId,
    placedBy,
  );
}
