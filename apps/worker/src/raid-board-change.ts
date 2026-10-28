/**
 * What the live raid board pushes (`docs/design/raid-live-board.md`): not the view, only what a placement
 * changed. `Raid.place` and `Raid.unplace` describe their change as a `BoardChange` (data they already
 * hold: slots, creature ids, the row length when they had it); `boardPush` turns it into the small
 * message teammates get, reading only the placed creatures involved (by id) and, on a join or leave, the
 * actor's display name. The cell is built by the very code the raid view's row uses (`cellCreature`).
 *
 * A teammate sees the actor's creatures as `mine: false` with no creature id, exactly as the view shows
 * them, so one message is right for every listener.
 */
import { slotFor } from './raid-resolve';
import { loadCreaturesById } from './raid-teams';
import { cellCreature, type RowSlotView } from './raid-view';

/** One board cell after the change: the slot, and the creature in it (null: empty). */
export interface BoardCell {
  slot: number;
  creature: RowSlotView['creature'];
}

/** Someone joined or left the party's raid roster. */
export interface BoardMember {
  displayName: string;
  /** True: joined (the party is one bigger). False: left (one smaller). */
  joined: boolean;
}

/** The body of the `raid` live message (the socket adds `v` and `type`). */
export interface BoardPush {
  week: string;
  party: number;
  cells: BoardCell[];
  /**
   * The party's row length after the change, when it is known without a read (a placement knows it, a
   * leave computes it). A client whose board has another length reloads: every zone would move.
   */
  rowLength?: number;
  member?: BoardMember;
}

/** What a mutation knows about its own change, before anything is read for the push. */
export interface BoardChange {
  userId: string;
  week: string;
  party: number;
  /** Slots whose cell changed and the creature now in each (null: now empty). */
  slots: { slot: number; creatureId: string | null }[];
  rowLength?: number;
  /** Set when the actor joined (`true`) or left (`false`) the party with this change. */
  joined?: boolean;
}

/** Builds the message for a change. Reads the placed creatures by id and, when a name is needed, one player row. */
export function boardPush(sql: SqlStorage, change: BoardChange): BoardPush {
  const ids = change.slots.flatMap((s) => (s.creatureId === null ? [] : [s.creatureId]));
  const byId = new Map(
    loadCreaturesById(sql, change.userId, ids).map((c) => [c.id, slotFor(c, 'actor')] as const),
  );
  // The owner's name is needed only when a cell holds a creature or the roster changes.
  const owner =
    ids.length > 0 || change.joined !== undefined
      ? (sql
          .exec<{
            display_name: string;
          }>('SELECT display_name FROM players WHERE user_id = ?', change.userId)
          .toArray()[0]?.display_name ?? 'Unknown')
      : 'Unknown';
  const cells: BoardCell[] = change.slots.map(({ slot, creatureId }) => {
    const fight = creatureId === null ? undefined : byId.get(creatureId);
    return { slot, creature: fight === undefined ? null : cellCreature(fight, owner, false) };
  });
  return {
    week: change.week,
    party: change.party,
    cells,
    ...(change.rowLength === undefined ? {} : { rowLength: change.rowLength }),
    ...(change.joined === undefined
      ? {}
      : { member: { displayName: owner, joined: change.joined } }),
  };
}
