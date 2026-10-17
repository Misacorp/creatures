import type { Creature } from './api';
import { GlossaryTag } from './Glossary';
import { TalentChip } from './TalentChip';
import { Accordion } from './ui/Accordion';
import { bookRows, slotTitle, type BookRow } from './talent-view';

/** The words on a book button: "Use" when there is only one open slot, else which slot; "To slot 2" to move a slotted one. */
function moveLabel(row: BookRow, slot: number, openSlots: number, bait: number): string {
  const what =
    row.slot !== null
      ? `To slot ${String(slot)}`
      : openSlots === 1
        ? 'Use'
        : `Slot ${String(slot)}`;
  return `${what} \u00b7 ${String(bait)} Bait`;
}

/**
 * A creature's talents on its page: the signature talent of an epic (always on), then each slot with the
 * talent in it, or "opens at level N" while closed, and a Talent Book that lists every talent it has held,
 * golden or not. A book talent can be put into an open slot for Bait, at once; the talent that sat there
 * stays in the book. The book is an Accordion, closed until asked for. Its rows show what is in use (lit,
 * with a "Slot 1" mark, first), what is available (a compact "Use" button) and what cannot be used now.
 */
export function CreatureTalents({
  creature,
  bookSlotBait,
  bait,
  busy,
  onSlot,
  showLabel = true,
}: {
  creature: Creature;
  /** What slotting from the book costs (the server's number). */
  bookSlotBait: number;
  /** The player's Bait now. */
  bait: number;
  busy: boolean;
  onSlot: (creature: Creature, talentId: string, golden: boolean, slot: number) => void;
  /** Draw the "Talents" label above the slots (off where a heading already says it). */
  showLabel?: boolean;
}) {
  const { slots, signature, book } = creature.talents;
  const rows = bookRows(creature);
  const openSlots = slots.filter((s) => s.open).length;
  const afford = bait >= bookSlotBait;
  return (
    <div class="creature-talents">
      {showLabel && (
        <p class="label">
          <GlossaryTag entry="talent" look="text">
            Talents
          </GlossaryTag>
        </p>
      )}
      <ul class="talent-slots" aria-label="Talent slots">
        {signature !== null && (
          <li class="talent-slot signature">
            <span class="slot-name">Signature</span>
            <TalentChip talent={signature} />
          </li>
        )}
        {slots.map((slot) => (
          <li key={slot.slot} class={`talent-slot${slot.open ? '' : ' closed'}`}>
            <span class="slot-name">
              {slot.open ? `Slot ${String(slot.slot)}` : slotTitle(slot)}
            </span>
            {slot.open &&
              (slot.talent === null ? (
                <span class="muted">Empty</span>
              ) : (
                <TalentChip talent={slot.talent} />
              ))}
          </li>
        ))}
      </ul>
      {book.length > 0 && (
        <Accordion
          title="Talent Book"
          meta={String(book.length)}
          label={`Talent Book, ${String(book.length)} ${book.length === 1 ? 'talent' : 'talents'}`}
          name="talent-book"
          class="talent-book"
        >
          <p class="muted book-help">
            <GlossaryTag entry="talent-book" look="text">
              What is the Talent Book?
            </GlossaryTag>
          </p>
          <ul class="book-list">
            {rows.map((row) => {
              const { entry } = row;
              return (
                <li
                  key={`${entry.id}-${entry.golden ? 'g' : 'n'}`}
                  class={`book-entry ${row.state}`}
                >
                  <div class="book-talent">
                    <TalentChip talent={entry} about />
                  </div>
                  {row.slot !== null && (
                    <span class="book-slot-mark">
                      <span class="visually-hidden">In use, </span>
                      <span aria-hidden="true">{'\u2713'} </span>Slot {row.slot}
                    </span>
                  )}
                  {row.state === 'blocked' && <span class="muted small">No open slot</span>}
                  {row.moves.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      class="book-use"
                      disabled={busy || !afford}
                      aria-label={`Put ${entry.name} in slot ${String(slot)} for ${String(bookSlotBait)} Bait`}
                      onClick={() => {
                        onSlot(creature, entry.id, entry.golden, slot);
                      }}
                    >
                      {moveLabel(row, slot, openSlots, bookSlotBait)}
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
          {!afford && rows.some((r) => r.moves.length > 0) && (
            <p class="muted small">Not enough Bait: each swap costs {bookSlotBait}.</p>
          )}
        </Accordion>
      )}
    </div>
  );
}
