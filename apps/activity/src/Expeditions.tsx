import { useEffect, useRef } from 'preact/hooks';
import type { ClaimResult, GameState } from './api';
import type { CatchChoiceActions } from './find-view';
import type { GearState } from './gear-types';
import { fetchDestinations, type SendRequest } from './expedition-api';
import type { Trip } from './expedition-types';
import { ExpeditionWorld } from './ExpeditionWorld';
import { WIDE_QUERY } from './ui/wide-layout';
import { useMediaQuery, useServerNow } from './hooks';
import { TripResult } from './TripResult';
import { tripResultView } from './trip-result-view';
import { needsOfferRefresh } from './trip-view';
import { useLoaded } from './use-loaded';
import type { Forecast } from './weather-types';

interface Props {
  state: GameState;
  /** Server clock minus local clock, in ms. */
  offset: number;
  busy: boolean;
  /** The valley sky (today's Boon and Omen), for what affects a trip; null when not loaded. */
  forecast?: Forecast | null;
  /** The guild's timezone (for the night window of the Moonlit Reef); null when it is not known. */
  timezone: string | null;
  /** What the last claim brought home, with the trip and the fresh state. */
  reveal: { result: ClaimResult; trip: Trip | undefined } | null;
  /** Answers the waiting duplicates the reveal shows. */
  catchActions: CatchChoiceActions;
  /** What each duplicate answered this session became (a card id to a sentence). */
  settled: Readonly<Record<string, string>>;
  /** Sends a trip; resolves true when it started. */
  onSend: (request: SendRequest) => Promise<boolean>;
  onPushOn: (trip: Trip, goalId: string) => void;
  onClaim: (trip: Trip) => void;
  /** Loads the state again (a trip that ended gets its choice rolled by the server then); true when it started. */
  onRefresh: () => boolean;
  onDismissReveal: () => void;
  /** Opens the Workshop tab, where supplies are crafted. */
  onOpenWorkshop?: () => void;
  /** The bag's fill (from the gear view); null until it has loaded. A full bag warns before a trip. */
  bag?: GearState['inventory'] | null;
}

export function Expeditions({
  state,
  offset,
  busy,
  timezone,
  forecast = null,
  reveal,
  catchActions,
  settled,
  onSend,
  onPushOn,
  onClaim,
  onRefresh,
  onDismissReveal,
  onOpenWorkshop,
  bag = null,
}: Props) {
  const active = state.expeditions.filter((e) => e.status === 'active');
  const serverNow = useServerNow(offset, active.length > 0);
  const destinations = useLoaded(
    fetchDestinations,
    [state.slots.tripsFinished, state.expeditions.length, active.length],
    5 * 60_000,
  );

  // When a trip ends, the server rolls its end-of-trip choice the next time it sends the state: ask once.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const trip of active) {
      if (needsOfferRefresh(trip, serverNow) && !asked.current.has(trip.id) && onRefresh()) {
        asked.current.add(trip.id);
      }
    }
  });

  const wide = useMediaQuery(WIDE_QUERY);
  const revealCreature =
    reveal?.trip === undefined
      ? undefined
      : state.creatures.find((c) => c.id === reveal.trip?.creatureId);
  const revealCard =
    reveal === null ? null : (
      <TripResult
        view={tripResultView({
          result: reveal.result,
          trip: reveal.trip,
          creature: revealCreature,
          pending: state.pending,
          creatures: state.creatures,
          settled,
        })}
        busy={busy}
        onClaim={(picks) => {
          if (picks.length === 0) {
            onDismissReveal();
            return;
          }
          void catchActions.chooseMany(picks).then((all) => {
            if (all) onDismissReveal();
          });
        }}
      />
    );

  return (
    <>
      {/* The wide screen has the reveal in its side panel; a phone shows it on top. */}
      {!wide && revealCard}
      <ExpeditionWorld
        trips={active}
        creatures={state.creatures}
        slots={state.slots}
        stock={state.supplies}
        bait={state.balances.bait}
        view={destinations.value}
        viewFailed={destinations.failed}
        onRetry={destinations.reload}
        timezone={timezone}
        forecast={forecast}
        serverNow={serverNow}
        busy={busy}
        wide={wide}
        reveal={revealCard}
        onSend={onSend}
        onClaim={onClaim}
        onPushOn={onPushOn}
        {...(onOpenWorkshop === undefined ? {} : { onOpenWorkshop })}
        bag={bag}
      />
    </>
  );
}
