import type { Creature } from './api';
import { CreatureIcon } from './CreatureIcon';
import type { Trip } from './expedition-types';
import { explorerLabel } from './TripRow';
import { destinationName, tripShortStatus, tripStatus } from './trip-view';

/**
 * The "out now" strip at the bottom of the phone's map: a small chip per trip with the explorer's face, name
 * and short status ("Back in 5 h", "Home!", "Push on?"). Tapping a chip calls `onOpen` with the place, whose
 * sheet then lists the trip. A chip of a trip that is home or waits for a choice has a gold edge. Nothing is
 * drawn when no trip is out. `serverNow` is server time, ticked by the caller.
 */
export function OutStrip({
  trips,
  creatures,
  serverNow,
  onOpen,
}: {
  trips: readonly Trip[];
  creatures: readonly Creature[];
  serverNow: number;
  onOpen: (destinationId: string) => void;
}) {
  if (trips.length === 0) return null;
  return (
    <ul class="out-strip pix-panel" aria-label="Out now">
      {trips.map((trip) => {
        const creature = creatures.find((c) => c.id === trip.creatureId);
        const name = explorerLabel(creature);
        const status = tripStatus(trip, serverNow);
        const text = tripShortStatus(trip, serverNow);
        const attention = status.phase === 'ready' || status.phase === 'choice';
        return (
          <li key={trip.id}>
            <button
              type="button"
              class={`out-chip${attention ? ' attention' : ''}`}
              aria-label={`${name} at ${destinationName(trip.destination)}: ${text}`}
              onClick={() => {
                onOpen(trip.destination);
              }}
            >
              {creature !== undefined && <CreatureIcon creature={creature} />}
              <span class="out-chip-text">
                <b class="out-chip-name">{name}</b>
                <span class="out-chip-status">{text}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
