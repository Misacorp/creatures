import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { FindCard } from './FindCard';
import { firstPick, pendingFind, type CatchChoiceActions, type CatchPick } from './find-view';
import { GlossaryTag } from './Glossary';
import type { PendingCatch } from './talent-types';

/** The id of the section, so a creature card's "Answer a waiting catch" can take the player there. */
export const PENDING_CATCHES_ID = 'pending-catches';

/**
 * The duplicates waiting for an answer, at the top of the Collection tab: the same cards as the trip
 * result (oldest first), each with its choice as radio rows and Recommended picked at first, and one
 * full-width Confirm for all of them. At most ten wait; a new one settles the oldest with Recommended, so
 * nothing waits for ever. Nothing is drawn when nothing waits.
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
  const [picked, setPicked] = useState<Record<string, string>>({});
  if (cards.length === 0) return null;
  const finds = cards.map((card) => pendingFind(card, creatures));
  const pickOf = (key: string, options: Parameters<typeof firstPick>[0]): string | null =>
    picked[key] ?? firstPick(options);
  return (
    <section
      id={PENDING_CATCHES_ID}
      class="pending-catches"
      tabIndex={-1}
      aria-labelledby="pending-catches-heading"
    >
      <h3 id="pending-catches-heading" class="pix">
        <GlossaryTag entry="duplicate-choice" look="text">
          Waiting catches
        </GlossaryTag>{' '}
        ({cards.length})
      </h3>
      <ul class="dup-list">
        {finds.map((find) => (
          <FindCard
            key={find.key}
            find={find}
            picked={find.choice === null ? null : pickOf(find.key, find.choice.options)}
            disabled={busy}
            onPick={(key) => {
              setPicked({ ...picked, [find.key]: key });
            }}
          />
        ))}
      </ul>
      <p class="pending-confirm">
        <button
          type="button"
          class="primary"
          disabled={busy}
          onClick={() => {
            const picks: CatchPick[] = finds.flatMap((find) => {
              const choice = find.choice;
              if (choice === null) return [];
              const option = choice.options.find((o) => o.key === pickOf(find.key, choice.options));
              return option === undefined ? [] : [{ card: choice.card, request: option.request }];
            });
            void actions.chooseMany(picks).then(() => {
              setPicked({});
            });
          }}
        >
          Confirm
        </button>
      </p>
    </section>
  );
}
