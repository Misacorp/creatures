import type { Creature } from './api';
import { GlossaryTag } from './Glossary';
import { TalentChip } from './TalentChip';
import { bookActions, slotTitle } from './talent-view';

/**
 * A creature's talents on its card: the signature talent of an epic (always on), then each slot with the
 * talent in it, or "opens at level N" while closed, and a Talent Book that lists every talent it has held,
 * golden or not. A book talent can be put into an open slot for Bait, at once; the talent that sat there
 * stays in the book. Lean: the book is closed until asked for.
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
  const actions = bookActions(creature);
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
        <details class="talent-book">
          <summary>
            <GlossaryTag entry="talent-book" look="text">
              Talent Book
            </GlossaryTag>{' '}
            ({book.length})
          </summary>
          <ul class="book-list">
            {book.map((entry, index) => {
              const moves = actions.filter((a) => a.entry === index);
              return (
                <li key={`${entry.id}-${entry.golden ? 'g' : 'n'}`} class="book-entry">
                  <TalentChip talent={entry} about />
                  <span class="muted">
                    {entry.slot === null ? 'In the book only' : `In slot ${String(entry.slot)}`}
                  </span>
                  {moves.map((move) => (
                    <button
                      key={move.slot}
                      type="button"
                      disabled={busy || !afford}
                      aria-label={`Put ${entry.name} in slot ${String(move.slot)} for ${String(bookSlotBait)} Bait`}
                      onClick={() => {
                        onSlot(creature, entry.id, entry.golden, move.slot);
                      }}
                    >
                      Slot {move.slot} ({bookSlotBait} Bait)
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
          {!afford && actions.length > 0 && (
            <p class="muted">Putting a talent in a slot costs {bookSlotBait} Bait.</p>
          )}
        </details>
      )}
    </div>
  );
}
