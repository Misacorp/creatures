import type { Creature } from './api';
import { DuplicateCard, type CatchChoiceActions } from './DuplicateCard';
import { GlossaryTag } from './Glossary';
import type { PendingCatch } from './talent-types';
import { applyAllText } from './talent-view';

/**
 * The duplicates waiting for an answer, at the top of the Collection tab: one card each (oldest first) and
 * one button that applies Recommended to all of them. At most ten wait; a new one settles the oldest with
 * Recommended, so nothing waits for ever. Nothing is drawn when nothing waits.
 */
export function PendingCatches({
  cards,
  creatures,
  busy,
  actions,
}: {
  cards: readonly PendingCatch[];
  creatures: readonly Creature[];
  busy: boolean;
  actions: CatchChoiceActions;
}) {
  if (cards.length === 0) return null;
  return (
    <section class="pending-catches" aria-labelledby="pending-catches-heading">
      <h3 id="pending-catches-heading" class="pix">
        <GlossaryTag entry="duplicate-choice" look="text">
          Waiting catches
        </GlossaryTag>{' '}
        ({cards.length})
      </h3>
      <p class="muted">
        You caught these again. Teach the talent, fuse, or release each one. Recommended is marked.
      </p>
      {cards.length > 1 && (
        <p>
          <button type="button" disabled={busy} onClick={actions.chooseAll}>
            {applyAllText(cards.length)}
          </button>
        </p>
      )}
      <ul class="dup-list">
        {cards.map((card) => (
          <DuplicateCard
            key={card.id}
            card={card}
            creatures={creatures}
            busy={busy}
            actions={actions}
          />
        ))}
      </ul>
    </section>
  );
}
