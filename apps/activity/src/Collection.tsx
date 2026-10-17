import { useEffect, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { cardDomId } from './creature-card-view';
import {
  ELEMENT_OPTIONS,
  FINDER_MIN_CREATURES,
  NO_FILTERS,
  ROLE_OPTIONS,
  applyFilters,
  browserFilterStorage,
  loadFilters,
  matchesFilters,
  saveFilters,
  type Filters,
} from './creature-find';
import { needyIds } from './creature-needs';
import { CreatureCard } from './CreatureCard';
import { CreatureFinder } from './CreatureFinder';
import type { CardActions } from './CreatureSheet';
import type { CatchChoiceActions } from './DuplicateCard';
import { PENDING_CATCHES_ID, PendingCatches } from './PendingCatches';
import type { GearState } from './gear-types';
import { scrollAndFocus } from './scroll-to';

interface Props extends CardActions {
  state: GameState;
  /** The gear view; null until it has loaded. */
  gear: GearState | null;
  busy: boolean;
  /** Answers the waiting duplicates. */
  catchActions: CatchChoiceActions;
  /** Who is looking (the element and role chips are remembered per viewer); without it nothing is kept. */
  viewerId?: string;
}

/** How long a card the finder chose stays marked. */
const FOUND_MS = 4000;

/**
 * The Creatures tab: the waiting catches (when there are any), find and filter (from four creatures
 * up) and one small card per creature. Choosing a suggestion shows that card (clearing the chips if
 * they hid it), scrolls to it, moves focus to it and marks it for a few seconds.
 */
export function Collection({ state, gear, busy, catchActions, viewerId, ...actions }: Props) {
  const [filters, setFilters] = useState<Filters>(() =>
    viewerId === undefined
      ? NO_FILTERS
      : loadFilters(
          browserFilterStorage(),
          viewerId,
          ELEMENT_OPTIONS.map((e) => e.id),
          ROLE_OPTIONS.map((r) => r.id),
        ),
  );
  // The creature the finder chose, and a counter so choosing the same one twice scrolls twice.
  const [found, setFound] = useState<{ id: string; n: number } | null>(null);

  useEffect(() => {
    if (found === null) return undefined;
    scrollAndFocus(document.getElementById(cardDomId(found.id)));
    const timer = setTimeout(() => {
      setFound(null);
    }, FOUND_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [found]);

  if (state.creatures.length === 0) return <p class="muted">No creatures yet.</p>;

  const needy = needyIds(state.creatures, state);
  // A short roster has no finder, so no chip (kept from an earlier visit) may hide a card.
  const showFinder = state.creatures.length >= FINDER_MIN_CREATURES;
  const shown = showFinder ? applyFilters(state.creatures, filters, needy) : state.creatures;

  function changeFilters(next: Filters): void {
    setFilters(next);
    setFound(null);
    if (viewerId !== undefined) saveFilters(browserFilterStorage(), viewerId, next);
  }

  function pick(creature: Creature): void {
    // A creature the chips hide is shown by clearing them: the finder never leads nowhere.
    if (!matchesFilters(creature, filters, needy)) changeFilters(NO_FILTERS);
    setFound((current) => ({ id: creature.id, n: (current?.n ?? 0) + 1 }));
  }

  return (
    <>
      <PendingCatches
        cards={state.pending}
        creatures={state.creatures}
        busy={busy}
        actions={catchActions}
      />
      {showFinder && (
        <CreatureFinder
          creatures={state.creatures}
          needyCount={needy.size}
          filters={filters}
          shown={shown.length}
          onFilters={changeFilters}
          onPick={pick}
        />
      )}
      <ul class="cards creature-cards">
        {shown.map((creature) => (
          <CreatureCard
            key={creature.id}
            creature={creature}
            state={state}
            gear={gear}
            busy={busy}
            found={found?.id === creature.id}
            actions={actions}
            onAnswerCatch={() => {
              scrollAndFocus(document.getElementById(PENDING_CATCHES_ID));
            }}
          />
        ))}
      </ul>
    </>
  );
}
