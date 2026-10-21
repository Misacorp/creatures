import type { Creature } from './api';
import type { Trip } from './expedition-types';
import { creatureName } from './game';
import { TripActions } from './TripActions';
import { CountBadge } from './ui/CountBadge';
import { TimerBar } from './ui/TimerBar';
import { lengthLabel, tripShortStatus, tripStatus } from './trip-view';

/** An explorer's name for a trip line ("Explorer" when the creature is not in the list). */
export function explorerLabel(creature: Creature | undefined): string {
  return creature === undefined ? 'Explorer' : creatureName(creature);
}

/** The length of a trip as a clock badge ("6 h"). */
export function LengthBadge({ trip }: { trip: Trip }) {
  return (
    <CountBadge
      icon={{ kind: 'glyph', id: 'clock' }}
      amount={lengthLabel(trip.duration)}
      label="Trip length"
    />
  );
}

/** The leg a bar times (a running push-on, else the trip itself) and the trip's status. */
export function legOf(trip: Trip, serverNow: number) {
  const status = tripStatus(trip, serverNow);
  const pushing = status.phase === 'pushing' && trip.pushOn !== null;
  return { leg: pushing && trip.pushOn !== null ? trip.pushOn : trip, pushing, status };
}

/**
 * One trip at a place, compact, for the place's sheet: the explorer's name and the trip's length, a status
 * line ("Back in 5 h", "Home!", "Push on?"), a thin timer bar and one button (Claim, Recall, Come home or
 * Decide; see `TripActions`). `serverNow` is server time, ticked by the caller.
 */
export function TripRow({
  trip,
  creature,
  serverNow,
  busy,
  onClaim,
  onDecide,
}: {
  trip: Trip;
  creature: Creature | undefined;
  serverNow: number;
  busy: boolean;
  onClaim: (trip: Trip) => void;
  onDecide: (trip: Trip) => void;
}) {
  const name = explorerLabel(creature);
  const { leg, pushing, status } = legOf(trip, serverNow);
  const done = Math.floor(status.fraction * 100);
  return (
    <li class={`trip-row pix-panel${status.phase === 'ready' ? ' home' : ''}`}>
      <div class="trip-row-main">
        <p class="trip-row-head">
          <b class="trip-row-name">{name}</b>
          <LengthBadge trip={trip} />
        </p>
        <TimerBar
          class="trip-row-bar"
          startedAt={leg.startedAt}
          endsAt={leg.endsAt}
          now={serverNow}
          ready={status.phase === 'ready'}
          tone={pushing ? 'spark' : undefined}
          label={`${name}'s ${pushing ? 'push-on' : 'trip'}: ${String(done)}% done`}
          state={tripShortStatus(trip, serverNow)}
        />
      </div>
      <TripActions
        trip={trip}
        serverNow={serverNow}
        busy={busy}
        onClaim={onClaim}
        onDecide={onDecide}
        compact
      />
    </li>
  );
}
