import type { Creature } from '../api';
import { TalentChip } from '../TalentChip';
import { bookRows } from '../talent-view';
import { Drawer } from '../ui/Drawer';

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

/** Where a book talent stands against the tapped slot. */
type Where = 'here' | 'free' | 'elsewhere';

const ORDER: Readonly<Record<Where, number>> = { here: 0, free: 1, elsewhere: 2 };

/** Where a book talent that sits in slot `inSlot` (null: in none) stands against the tapped slot. */
function whereOf(inSlot: number | null, tapped: number): Where {
  if (inSlot === null) return 'free';
  return inSlot === tapped ? 'here' : 'elsewhere';
}

/**
 * The Talent Book in a Drawer, for the slot that was tapped. Slots are equivalent, so a talent is either
 * in this slot (lit, with a "Slot N" mark and no button), free (a "Use · 10 Bait" button that puts it into
 * this slot) or already in another slot (greyed out with that slot's mark and no button: it is not moved
 * from here). When the Bait is short the free rows' buttons are off and one plain line says so. Every word
 * about a talent is the server's, drawn as text.
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
  const rows = bookRows(creature)
    .map((row) => ({
      row,
      where: whereOf(row.slot, slot),
    }))
    // This slot's own talent first, then the free ones, then those that sit in another slot.
    .sort((a, b) => ORDER[a.where] - ORDER[b.where]);
  const afford = bait >= bookSlotBait;
  const anyFree = rows.some((r) => r.where === 'free');
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
          {rows.map(({ row, where }) => {
            const { entry } = row;
            return (
              <li
                key={`${entry.id}-${entry.golden ? 'g' : 'n'}`}
                class={`book-entry ${where === 'here' ? 'in-use' : where === 'elsewhere' ? 'elsewhere' : 'available'}`}
              >
                <div class="book-talent">
                  <TalentChip talent={entry} about />
                </div>
                {row.slot !== null && (
                  <span class="book-slot-mark">
                    <span class="visually-hidden">
                      {where === 'here' ? 'In use, ' : 'Already in '}
                    </span>
                    {where === 'here' && <span aria-hidden="true">{'✓'} </span>}Slot {row.slot}
                  </span>
                )}
                {where === 'free' && (
                  <button
                    type="button"
                    class="book-use"
                    disabled={busy || !afford}
                    aria-label={`Put ${entry.name} in slot ${String(slot)} for ${String(bookSlotBait)} Bait`}
                    onClick={() => {
                      onSlot(creature, entry.id, entry.golden, slot);
                    }}
                  >
                    Use{' · '}
                    {bookSlotBait} Bait
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!afford && anyFree && <p class="muted small book-short">Not enough Bait.</p>}
    </Drawer>
  );
}
