import type { Creature } from '../../api';
import { TalentChip } from '../../TalentChip';
import { bookRows } from '../../talent-view';
import { Drawer } from '../../ui/Drawer';

export interface TalentBookDrawerProps {
  open: boolean;
  onClose: () => void;
  creature: Creature;
  /** The talent slot that was tapped: every button puts a talent into this one. */
  slot: number;
  /** What slotting from the book costs (the server's number). */
  bookSlotBait: number;
  /** The player's Bait now. */
  bait: number;
  busy: boolean;
  onSlot: (creature: Creature, talentId: string, golden: boolean, slot: number) => void;
  returnFocusTo?: HTMLElement | null;
}

/**
 * The Talent Book in a Drawer, for the slot that was tapped. Rows: what is in use (lit, with a "Slot N"
 * mark; the one in this slot has no button), what can go into this slot ("Use · 10 Bait", or "To slot 2 ·
 * 10 Bait" for one that sits in another slot) and, when the Bait is short, the same rows muted with their
 * buttons off and one plain line. Every word about a talent is the server's, drawn as text.
 */
export function TalentBookDrawer({
  open,
  onClose,
  creature,
  slot,
  bookSlotBait,
  bait,
  busy,
  onSlot,
  returnFocusTo,
}: TalentBookDrawerProps) {
  const rows = bookRows(creature);
  const afford = bait >= bookSlotBait;
  const anyMove = rows.some((r) => r.moves.includes(slot) && r.slot !== slot);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Talent Book"
      meta={`Slot ${String(slot)}`}
      class="book-drawer"
      {...(returnFocusTo === undefined ? {} : { returnFocusTo })}
    >
      {rows.length === 0 ? (
        <p class="muted ip-none">The book is empty.</p>
      ) : (
        <ul class="book-list">
          {rows.map((row) => {
            const { entry } = row;
            const here = row.slot === slot;
            const canMove = row.moves.includes(slot) && !here;
            const muted = canMove && !afford;
            return (
              <li
                key={`${entry.id}-${entry.golden ? 'g' : 'n'}`}
                class={`book-entry ${row.state}${muted ? ' unusable' : ''}`}
              >
                <div class="book-talent">
                  <TalentChip talent={entry} about />
                </div>
                {row.slot !== null && (
                  <span class="book-slot-mark">
                    <span class="visually-hidden">In use, </span>
                    <span aria-hidden="true">{'✓'} </span>Slot {row.slot}
                  </span>
                )}
                {canMove && (
                  <button
                    type="button"
                    class="book-use"
                    disabled={busy || !afford}
                    aria-label={`Put ${entry.name} in slot ${String(slot)} for ${String(bookSlotBait)} Bait`}
                    onClick={() => {
                      onSlot(creature, entry.id, entry.golden, slot);
                    }}
                  >
                    {row.slot === null ? 'Use' : `To slot ${String(slot)}`}
                    {' · '}
                    {bookSlotBait} Bait
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!afford && anyMove && <p class="muted small book-short">Not enough Bait.</p>}
    </Drawer>
  );
}
