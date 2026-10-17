import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { cardDomId, type PageFocus } from './creature-card-view';
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
import { CreaturePage, type CardActions } from './CreaturePage';
import type { CatchChoiceActions } from './DuplicateCard';
import { PENDING_CATCHES_ID, PendingCatches } from './PendingCatches';
import type { GearState } from './gear-types';
import { pageScrollY, scrollAndFocus, scrollPageTo } from './scroll-to';

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

/** The creature whose page is open and where it should land. */
interface OpenPage {
  id: string;
  focus: PageFocus;
}

/**
 * The Creatures tab: the waiting catches (when there are any), find and filter (from four creatures
 * up) and one small card per creature. Choosing a suggestion shows that card (clearing the chips if
 * they hid it), scrolls to it, moves focus to it and marks it for a few seconds.
 *
 * Tapping a card opens that creature's page in the list's place. The navigation is app state only (no
 * history entry, so the browser's or Discord's back gesture never leaves the Activity). The list stays
 * drawn but hidden while a page is open, so the search text, the chips and the card state are still there
 * on return; going back also restores the scroll position and focuses the card that was opened.
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
  const [page, setPage] = useState<OpenPage | null>(null);
  // How far the list was scrolled when the page opened, and the card to give the focus back to.
  const listScroll = useRef(0);
  const returnTo = useRef<string | null>(null);
  const wasOpen = useRef(false);
  // A creature that is gone (released, say) cannot have a page: show the list.
  const opened =
    page === null ? undefined : state.creatures.find((creature) => creature.id === page.id);
  const pageOpen = page !== null && opened !== undefined;

  useLayoutEffect(() => {
    if (pageOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    scrollPageTo(listScroll.current);
    const id = returnTo.current;
    const card = id === null ? null : document.getElementById(cardDomId(id));
    card?.focus({ preventScroll: true });
  }, [pageOpen]);

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

  function open(creature: Creature, focus: PageFocus): void {
    listScroll.current = pageScrollY();
    returnTo.current = creature.id;
    setPage({ id: creature.id, focus });
  }

  function back(): void {
    setPage(null);
  }

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
      {page !== null && opened !== undefined && (
        <CreaturePage
          key={opened.id}
          creature={opened}
          state={state}
          gear={gear}
          busy={busy}
          actions={actions}
          focus={page.focus}
          onBack={back}
          onAnswerCatch={() => {
            back();
            // The list is drawn again by the time this runs; the catches are at its top.
            setTimeout(() => {
              scrollAndFocus(document.getElementById(PENDING_CATCHES_ID));
            }, 0);
          }}
        />
      )}
      <div hidden={pageOpen}>
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
              onOpen={(focus) => {
                open(creature, focus);
              }}
            />
          ))}
        </ul>
      </div>
    </>
  );
}
