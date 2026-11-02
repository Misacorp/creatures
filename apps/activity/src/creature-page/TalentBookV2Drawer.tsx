import type { Creature } from '../api';
import { talentViewOf, type BookTalentV2, type CreatureV2 } from '../combat-v2-view';
import { TalentChip } from '../TalentChip';
import { Drawer } from '../ui/Drawer';

export interface TalentBookV2DrawerProps {
  open: boolean;
  onClose: () => void;
  creature: Creature;
  v2: CreatureV2;
  /** The talent slot that was tapped: a talent put in goes into this one. */
  slot: number;
  /** The player's Bait now. */
  bait: number;
  busy: boolean;
  /** Learns a talent of the line's book for Bait (once per creature). */
  onLearn: (creature: Creature, talentId: string) => void;
  /** Puts a learned talent into a slot (free), or (`null`) takes it out of its slot. */
  onSlot: (creature: Creature, talentId: string, slot: number | null) => void;
  returnFocusTo?: HTMLElement | null | undefined;
}

/** Where a book talent stands against the tapped slot. */
type Where = 'here' | 'learned' | 'elsewhere' | 'new';

const ORDER: Readonly<Record<Where, number>> = { here: 0, learned: 1, elsewhere: 2, new: 3 };

function whereOf(entry: BookTalentV2, tapped: number): Where {
  if (!entry.learned) return 'new';
  if (entry.slot === null) return 'learned';
  return entry.slot === tapped ? 'here' : 'elsewhere';
}

/**
 * The line's Talent Book under combat v2 (R20), in a Drawer, for the slot that was tapped. The book is the
 * line's whole pool in its own order. A talent this creature has learned is free to swap: in this slot it is lit
 * with a "Slot N" mark and "Take out"; learned and in no slot it has "Use"; in another slot it has "Move here". One it
 * has not learned has "Learn" with its Bait price (once per creature; learning does not slot it). When the Bait
 * is short the Learn buttons are off and one plain line says so. Golden talents shimmer gold. Every word about a
 * talent is the server's, drawn as text with its keywords as chips.
 */
export function TalentBookV2Drawer({
  open,
  onClose,
  creature,
  v2,
  slot,
  bait,
  busy,
  onLearn,
  onSlot,
  returnFocusTo,
}: TalentBookV2DrawerProps) {
  const { book, learnBait } = v2.talentsV2;
  // This slot's talent first, then the learned ones, then those in another slot, then the ones to learn; the
  // line's own order inside each group (the sort is stable).
  const rows = book
    .map((entry) => ({ entry, where: whereOf(entry, slot) }))
    .sort((a, b) => ORDER[a.where] - ORDER[b.where]);
  const afford = bait >= learnBait;
  const anyNew = rows.some((r) => r.where === 'new');
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
          {rows.map(({ entry, where }) => (
            <li key={entry.id} class={`book-entry ${where === 'here' ? 'in-use' : 'available'}`}>
              <div class="book-talent">
                <TalentChip talent={talentViewOf(entry)} />
              </div>
              {entry.slot !== null && (
                <span class="book-slot-mark">
                  <span class="visually-hidden">
                    {where === 'here' ? 'In use, ' : 'Already in '}
                  </span>
                  {where === 'here' && <span aria-hidden="true">{'✓'} </span>}Slot {entry.slot}
                </span>
              )}
              {where === 'new' && (
                <button
                  type="button"
                  class="book-use"
                  disabled={busy || !afford}
                  aria-label={`Learn ${entry.name} for ${String(learnBait)} Bait`}
                  onClick={() => {
                    onLearn(creature, entry.id);
                  }}
                >
                  Learn{' · '}
                  {learnBait} Bait
                </button>
              )}
              {where === 'learned' && (
                <button
                  type="button"
                  class="book-use"
                  disabled={busy}
                  aria-label={`Put ${entry.name} in slot ${String(slot)}`}
                  onClick={() => {
                    onSlot(creature, entry.id, slot);
                  }}
                >
                  Use
                </button>
              )}
              {where === 'elsewhere' && (
                <button
                  type="button"
                  class="book-use"
                  disabled={busy}
                  aria-label={`Move ${entry.name} to slot ${String(slot)}`}
                  onClick={() => {
                    onSlot(creature, entry.id, slot);
                  }}
                >
                  Move here
                </button>
              )}
              {where === 'here' && (
                <button
                  type="button"
                  class="book-use"
                  disabled={busy}
                  aria-label={`Take ${entry.name} out of slot ${String(slot)}`}
                  onClick={() => {
                    onSlot(creature, entry.id, null);
                  }}
                >
                  Take out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!afford && anyNew && <p class="muted small book-short">Not enough Bait.</p>}
    </Drawer>
  );
}
