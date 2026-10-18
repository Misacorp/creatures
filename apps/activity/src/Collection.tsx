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
import { EvolveDrawer } from './EvolveDrawer';
import { hasBranches } from './evolve-view';
import type { CatchChoiceActions } from './find-view';
import { PENDING_CATCHES_ID, PendingCatches } from './PendingCatches';
import type { GearState } from './gear-types';
import { creatureName } from './game';
import { pageScrollY, scrollAndFocus, scrollPageTo } from './scroll-to';
import { flipOver, type FlipProps, type FlipStep } from './ui/flip-logic';
import { FlipLive } from './ui/Flipper';

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
  /** The way a flip came (1: from the next one, -1: from the previous one); null when the page was opened from the list. */
  enter: FlipStep | null;
  /** After a flip with an arrow button, that button gets the focus back on the new page. */
  focusButton: FlipStep | null;
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
  // The creature whose evolve screen is up (a line that grows two ways asks which form first).
  const [evolvingId, setEvolvingId] = useState<string | null>(null);
  // How far the list was scrolled when the page opened, and the card to give the focus back to.
  const listScroll = useRef(0);
  const returnTo = useRef<string | null>(null);
  const wasOpen = useRef(false);
  // The page was flipped to other creatures: the list then scrolls to the one the page ended on.
  const flipped = useRef(false);
  // A creature that is gone (released, say) cannot have a page: show the list.
  const opened =
    page === null ? undefined : state.creatures.find((creature) => creature.id === page.id);
  const pageOpen = page !== null && opened !== undefined;
  const evolving =
    evolvingId === null
      ? undefined
      : state.creatures.find((creature) => creature.id === evolvingId);

  useLayoutEffect(() => {
    if (pageOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const id = returnTo.current;
    const card = id === null ? null : document.getElementById(cardDomId(id));
    if (flipped.current && card !== null) {
      // The page moved on to other creatures: show the card it ended on, not where the list was.
      flipped.current = false;
      scrollAndFocus(card, 'auto');
      return;
    }
    flipped.current = false;
    scrollPageTo(listScroll.current);
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
    flipped.current = false;
    setPage({ id: creature.id, focus, enter: null, focusButton: null });
  }

  function back(): void {
    setPage(null);
  }

  // A line with one form evolves at once; a line with two opens the screen that asks which.
  const cardActions: CardActions = {
    ...actions,
    onEvolve: (creature) => {
      if (hasBranches(creature)) setEvolvingId(creature.id);
      else actions.onEvolve(creature);
    },
  };

  const needy = needyIds(state.creatures, state);
  // A short roster has no finder, so no chip (kept from an earlier visit) may hide a card.
  const showFinder = state.creatures.length >= FINDER_MIN_CREATURES;
  const shown = showFinder ? applyFilters(state.creatures, filters, needy) : state.creatures;

  // The page flips through the creatures in the order of the list it came from (the chips and search
  // as they are now); a creature those hide, which can happen when the game changes under an open page,
  // flips through the whole roster instead.
  const order =
    opened !== undefined && shown.some((c) => c.id === opened.id) ? shown : state.creatures;
  const at = opened === undefined ? -1 : order.findIndex((c) => c.id === opened.id);
  const pageFlip: FlipProps | undefined =
    page === null
      ? undefined
      : flipOver({
          list: order,
          at,
          noun: 'creature',
          nameOf: creatureName,
          extra: { enter: page.enter, focusButton: page.focusButton },
          pick: (target, step, via) => {
            returnTo.current = target.id;
            flipped.current = true;
            setPage({
              id: target.id,
              focus: null,
              enter: step,
              focusButton: via === 'button' ? step : null,
            });
          },
        });

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
          actions={cardActions}
          focus={page.focus}
          flip={pageFlip}
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
      {pageFlip !== undefined && <FlipLive flip={pageFlip} />}
      {evolving !== undefined && (
        <EvolveDrawer
          open
          creature={evolving}
          busy={busy}
          onClose={() => {
            setEvolvingId(null);
          }}
          onEvolve={(creature, species) => {
            setEvolvingId(null);
            actions.onEvolve(creature, species);
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
              actions={cardActions}
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
