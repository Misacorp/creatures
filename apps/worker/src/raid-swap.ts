/**
 * Swap requests of a combat v2 raid weekend (R19; docs/design/combat/integration.md, section 4): a player asks another to swap two slots of
 * their party's board, so pairings across players can be arranged. The other player accepts or declines; an accepted request moves both
 * creatures in one transaction; open requests end at the next stage lock (`settleStageV2`). All of it is synchronous SQL inside the
 * caller's `atomically`; the asker and the answerer are always the verified session's player.
 *
 * What may be asked (two different slots of the asker's party; the asker never names a player, the owner of the other creature is asked):
 * - the asker's creature and another player's creature: they swap places (stored as the asker's slot, then the asked player's);
 * - another player's creature and an empty slot: that creature is asked to move into the empty slot (it frees the place the asker wants;
 *   stored as that creature's slot, then the empty one).
 * A creature of the asker's own and an empty slot is a plain placement (no one to ask), and two creatures of one other player or of two
 * other players are not a request either.
 */
import { GameError } from './outcome';
import { partyOf } from './raid-roster';

/** Most open requests one player may have at a time. */
export const MAX_OPEN_SWAPS = 6;

export type SwapRequestRow = {
  week_id: string;
  party: number;
  id: string;
  from_user: string;
  to_user: string;
  slot_a: number;
  slot_b: number;
  status: 'open' | 'accepted' | 'declined' | 'ended';
  created_at: number;
};

const COLUMNS = 'week_id, party, id, from_user, to_user, slot_a, slot_b, status, created_at';

/** Who stands in two slots of a party's board (a slot with nobody is absent). */
function occupants(
  sql: SqlStorage,
  weekId: string,
  party: number,
  slots: readonly number[],
): Map<number, { user_id: string; creature_id: string }> {
  const map = new Map<number, { user_id: string; creature_id: string }>();
  for (const row of sql
    .exec<{ slot: number; user_id: string; creature_id: string }>(
      `SELECT p.slot AS slot, p.user_id AS user_id, p.creature_id AS creature_id
       FROM raid_placements p JOIN creatures c ON c.id = p.creature_id AND c.user_id = p.user_id
       WHERE p.week_id = ? AND p.party = ? AND p.slot IN (${slots.map(() => '?').join(', ')})`,
      weekId,
      party,
      ...slots,
    )
    .toArray()) {
    map.set(row.slot, { user_id: row.user_id, creature_id: row.creature_id });
  }
  return map;
}

/**
 * Makes a request. `length` is the board's slot count (a slot beyond it is `invalid_slot`). Asking the same thing again returns the open
 * request that already exists. Throws a `GameError` for anything the rules refuse.
 */
export function askSwap(
  sql: SqlStorage,
  week: { weekId: string },
  userId: string,
  slotA: number,
  slotB: number,
  length: number,
  now: number,
): SwapRequestRow {
  const party = partyOf(sql, week.weekId, userId);
  if (party === null) throw new GameError(409, 'not_in_roster');
  if (slotA === slotB) throw new GameError(400, 'invalid_slot');
  for (const slot of [slotA, slotB]) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= length) {
      throw new GameError(400, 'invalid_slot');
    }
  }
  const stand = occupants(sql, week.weekId, party, [slotA, slotB]);
  const a = stand.get(slotA);
  const b = stand.get(slotB);
  const mineA = a?.user_id === userId;
  const mineB = b?.user_id === userId;
  // The request is stored in one shape, whichever order the asker named the slots in: a swap is (the asker's slot, the asked player's
  // slot), a move is (the asked player's creature's slot, the empty slot it is asked to move into).
  let toUser: string | undefined;
  let first = slotA;
  let second = slotB;
  if (mineA && b !== undefined && !mineB) {
    toUser = b.user_id;
  } else if (mineB && a !== undefined && !mineA) {
    toUser = a.user_id;
    [first, second] = [slotB, slotA];
  } else if (a !== undefined && !mineA && b === undefined) {
    toUser = a.user_id;
  } else if (b !== undefined && !mineB && a === undefined) {
    toUser = b.user_id;
    [first, second] = [slotB, slotA];
  }
  if (toUser === undefined) throw new GameError(409, 'invalid_swap');
  const open = sql
    .exec<SwapRequestRow>(
      `SELECT ${COLUMNS} FROM raid_swap_requests WHERE week_id = ? AND from_user = ? AND status = 'open'`,
      week.weekId,
      userId,
    )
    .toArray();
  const same = open.find(
    (r) => r.party === party && r.to_user === toUser && r.slot_a === first && r.slot_b === second,
  );
  if (same !== undefined) return same;
  if (open.length >= MAX_OPEN_SWAPS) throw new GameError(409, 'too_many_requests');
  const row: SwapRequestRow = {
    week_id: week.weekId,
    party,
    id: crypto.randomUUID(),
    from_user: userId,
    to_user: toUser,
    slot_a: first,
    slot_b: second,
    status: 'open',
    created_at: now,
  };
  sql.exec(
    `INSERT INTO raid_swap_requests (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.week_id,
    row.party,
    row.id,
    row.from_user,
    row.to_user,
    row.slot_a,
    row.slot_b,
    row.status,
    row.created_at,
  );
  return row;
}

/** An open request addressed to `userId` by its id (anything else, someone else's included, is `not_found`). */
function incomingOpen(sql: SqlStorage, weekId: string, userId: string, id: string): SwapRequestRow {
  const row = sql
    .exec<SwapRequestRow>(
      `SELECT ${COLUMNS} FROM raid_swap_requests WHERE week_id = ? AND to_user = ? AND id = ? AND status = 'open'`,
      weekId,
      userId,
      id,
    )
    .toArray()[0];
  if (row === undefined) throw new GameError(404, 'not_found');
  return row;
}

/**
 * Accepts a request addressed to the caller: both creatures are checked to be where they were (a request about a creature that moved or
 * fell is ended and null answers) and then moved in one step. Returns the request and the creatures that moved with their new slot.
 */
export function acceptSwap(
  sql: SqlStorage,
  week: { weekId: string },
  userId: string,
  id: string,
): {
  request: SwapRequestRow;
  moved: { creatureId: string; userId: string; slot: number }[];
} | null {
  const row = incomingOpen(sql, week.weekId, userId, id);
  const stand = occupants(sql, week.weekId, row.party, [row.slot_a, row.slot_b]);
  const a = stand.get(row.slot_a);
  const b = stand.get(row.slot_b);
  const asked = (x: { user_id: string } | undefined): boolean => x?.user_id === row.to_user;
  const askers = (x: { user_id: string } | undefined): boolean => x?.user_id === row.from_user;
  const swap = askers(a) && asked(b);
  const move = asked(a) && b === undefined;
  if (!swap && !move) {
    sql.exec(
      "UPDATE raid_swap_requests SET status = 'ended' WHERE week_id = ? AND party = ? AND id = ?",
      row.week_id,
      row.party,
      row.id,
    );
    // The request is ended and kept ended (the caller commits it): there is nothing to move.
    return null;
  }
  const moved: { creatureId: string; userId: string; slot: number }[] = [];
  // Delete first, insert after: the unique constraints never see two creatures in one slot.
  for (const x of [a, b]) {
    if (x !== undefined) {
      sql.exec(
        'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
        row.week_id,
        x.creature_id,
      );
    }
  }
  const put = (x: { user_id: string; creature_id: string }, slot: number): void => {
    sql.exec(
      'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, ?, ?, ?, ?)',
      row.week_id,
      row.party,
      slot,
      x.user_id,
      x.creature_id,
    );
    moved.push({ creatureId: x.creature_id, userId: x.user_id, slot });
  };
  if (a !== undefined) put(a, row.slot_b);
  if (b !== undefined) put(b, row.slot_a);
  sql.exec(
    "UPDATE raid_swap_requests SET status = 'accepted' WHERE week_id = ? AND party = ? AND id = ?",
    row.week_id,
    row.party,
    row.id,
  );
  // The creatures moved: requests about the slots they left or took no longer describe the board.
  sql.exec(
    `UPDATE raid_swap_requests SET status = 'ended'
     WHERE week_id = ? AND party = ? AND status = 'open' AND (slot_a IN (?, ?) OR slot_b IN (?, ?))`,
    row.week_id,
    row.party,
    row.slot_a,
    row.slot_b,
    row.slot_a,
    row.slot_b,
  );
  return { request: { ...row, status: 'accepted' }, moved };
}

/** Declines a request addressed to the caller. */
export function declineSwap(
  sql: SqlStorage,
  week: { weekId: string },
  userId: string,
  id: string,
): SwapRequestRow {
  const row = incomingOpen(sql, week.weekId, userId, id);
  sql.exec(
    "UPDATE raid_swap_requests SET status = 'declined' WHERE week_id = ? AND party = ? AND id = ?",
    row.week_id,
    row.party,
    row.id,
  );
  return { ...row, status: 'declined' };
}

/** The open requests of a week that involve the player: addressed to them (incoming) and made by them (outgoing). Two indexed lookups. */
export function openSwaps(
  sql: SqlStorage,
  weekId: string,
  userId: string,
): { incoming: SwapRequestRow[]; outgoing: SwapRequestRow[] } {
  const pick = (column: 'to_user' | 'from_user'): SwapRequestRow[] =>
    sql
      .exec<SwapRequestRow>(
        `SELECT ${COLUMNS} FROM raid_swap_requests WHERE week_id = ? AND ${column} = ? AND status = 'open' ORDER BY created_at, id`,
        weekId,
        userId,
      )
      .toArray();
  return { incoming: pick('to_user'), outgoing: pick('from_user') };
}
