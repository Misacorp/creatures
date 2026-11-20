/**
 * Entering a creature in an event, the one way both screens do it (the Games tab's picker and the Fairground's stalls, by a slot or
 * by a drag): the server refuses a creature that is in another event, so it leaves that one first; then the event's list is sent whole.
 * The server decides everything (closed entries, a team that does not fit); this only orders the requests.
 */
import type { setGamesEntry } from '../games-api';
import type { GamesNext, LineupEvent } from '../games-types';
import { entryOf, slotCount, slotsOf, withSlot } from '../games-view';

/** What entering asks of the server (`GamesApi.setEntry`). */
export type SetEntry = typeof setGamesEntry;

/** The refusals of a closed show and of a team that does not fit, in the game's words (the server's own, `GAMES_ERRORS`). */
export const ENTRIES_CLOSED = 'Entries are closed for this show.';
export const DOES_NOT_FIT = 'That team does not fit the event.';

/**
 * Puts `creatureId` in slot `slot` of `event` (or empties the slot with null), taking it out of the event it is in first, and answers
 * the server's view of the day after.
 */
export async function putEntry(
  setEntry: SetEntry,
  next: GamesNext,
  event: Pick<LineupEvent, 'id'>,
  slot: number,
  creatureId: string | null,
): Promise<GamesNext> {
  let entries = next.entries;
  const from = creatureId === null ? null : entryOf(next, creatureId);
  if (from !== null && from !== event.id && creatureId !== null) {
    // Moving: the server refuses a creature that is in another event, so it leaves that one first.
    const left = await setEntry(
      next.day,
      from,
      (entries[from] ?? []).filter((id) => id !== creatureId),
    );
    entries = left.entries;
  }
  const list = withSlot(entries[event.id] ?? [], slot, creatureId);
  return setEntry(next.day, event.id, list);
}

/**
 * What a creature dropped on a stall does: the slot it goes to (the first empty one), or why it is refused. A closed show refuses with
 * the closed-entries line; a stall with every slot filled (by others) refuses with the team line, as the server answers when a team
 * does not fit; a creature already at that stall does nothing.
 */
export type DropEntry =
  { kind: 'enter'; slot: number } | { kind: 'refuse'; message: string } | { kind: 'none' };

export function dropEntry(next: GamesNext, event: LineupEvent, creatureId: string): DropEntry {
  if (!next.open) return { kind: 'refuse', message: ENTRIES_CLOSED };
  const slots = slotsOf(next, event);
  if (slots.includes(creatureId)) return { kind: 'none' };
  const free = slots.indexOf(null);
  if (free === -1 || free >= slotCount(event)) return { kind: 'refuse', message: DOES_NOT_FIT };
  return { kind: 'enter', slot: free };
}
