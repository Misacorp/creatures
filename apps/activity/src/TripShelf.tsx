import type { Creature } from './api';
import { CreatureIcon } from './CreatureIcon';
import type { Slots, Trip } from './expedition-types';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { TripActions } from './TripActions';
import { LengthBadge, explorerLabel, legOf } from './TripRow';
import { Bar } from './ui/Bar';
import { TimerBar } from './ui/TimerBar';
import { destinationName, slotsLine, tripShortStatus } from './trip-view';

/**
 * "Out exploring", under the desktop map: a card per expedition slot in a four column grid. The running
 * trips come first (face, name, place and length, timer bar, status and the button of `TripActions`), then a
 * "Free slot" card for each open slot nobody is out in, then one locked card that says what opens the next
 * slot (the same words as the slots strip). Tapping the body of a trip's card calls `onOpen` with its
 * place; the button on it acts without opening. `serverNow` is server time, ticked by the caller.
 */
export function TripShelf({
  trips,
  creatures,
  slots,
  serverNow,
  busy,
  onClaim,
  onDecide,
  onOpen,
}: {
  trips: readonly Trip[];
  creatures: readonly Creature[];
  slots: Slots;
  serverNow: number;
  busy: boolean;
  onClaim: (trip: Trip) => void;
  onDecide: (trip: Trip) => void;
  onOpen: (destinationId: string) => void;
}) {
  const line = slotsLine(slots);
  const free = Math.max(0, slots.total - trips.length);
  return (
    <section class="trip-shelf pix-panel" aria-label="Out exploring">
      <h3 class="trip-shelf-head">
        <span class="pix">Out exploring</span> <span class="muted">{line.use}</span>
      </h3>
      <ul class="trip-shelf-grid">
        {trips.map((trip) => {
          const creature = creatures.find((c) => c.id === trip.creatureId);
          const name = explorerLabel(creature);
          const place = destinationName(trip.destination);
          const { leg, pushing, status } = legOf(trip, serverNow);
          return (
            <li key={trip.id} class={`trip-slot${status.phase === 'ready' ? ' home' : ''}`}>
              <button
                type="button"
                class="trip-slot-open"
                aria-label={`${name} at ${place}: open`}
                onClick={() => {
                  onOpen(trip.destination);
                }}
              />
              <div class="trip-slot-head">
                {creature !== undefined && <CreatureIcon creature={creature} />}
                <p class="trip-slot-who">
                  <b class="trip-slot-name">{name}</b>
                  <span class="muted trip-slot-where">{place}</span>
                </p>
                <LengthBadge trip={trip} />
              </div>
              <TimerBar
                class="trip-row-bar"
                startedAt={leg.startedAt}
                endsAt={leg.endsAt}
                now={serverNow}
                ready={status.phase === 'ready'}
                tone={pushing ? 'spark' : undefined}
                label={`${name}'s ${pushing ? 'push-on' : 'trip'}: ${String(Math.floor(status.fraction * 100))}% done`}
                state={tripShortStatus(trip, serverNow)}
              />
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
        })}
        {Array.from({ length: free }, (_, i) => (
          <li key={`free-${String(i)}`} class="trip-slot free">
            <b class="trip-slot-name">Free slot</b>
            <span class="muted">Pick a place on the map</span>
          </li>
        ))}
        {line.next !== null && (
          <li class="trip-slot closed">
            <p class="trip-slot-lock">
              <Sprite sprite={glyphOrUnknown('lock')} scale={2} />
              <b class="trip-slot-name">Locked</b>
            </p>
            <span class="muted">{line.next}</span>
            <Bar
              class="trip-row-bar"
              value={line.progress?.value ?? 0}
              max={line.progress?.max ?? 1}
              label={line.next}
            />
          </li>
        )}
      </ul>
    </section>
  );
}
