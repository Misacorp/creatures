import { useState } from 'preact/hooks';
import type { Creature } from './api';
import type { CancelledTrip } from './expedition-types';
import {
  WIPE_NOTICE_TEXT,
  browserStorage,
  cancelledLine,
  markSeen,
  seenIds,
  unseenCancelled,
} from './wipe-notice';

/**
 * The one-time notice after expeditions got bigger (everyone starts with one slot; trips in slots 2 and
 * 3 were called home and their Bait given back). It lists who was called home and goes away for good
 * once dismissed; where the browser's storage is blocked it goes away for this visit and may come back
 * next time, which is harmless.
 */
export function WipeNotice({
  cancelled,
  creatures,
}: {
  cancelled: readonly CancelledTrip[];
  creatures: readonly Creature[];
}) {
  const [unseen, setUnseen] = useState(() => unseenCancelled(cancelled, seenIds(browserStorage())));
  const [closed, setClosed] = useState(false);
  if (closed || unseen.length === 0) return null;
  return (
    <section class="wipe-notice" role="status" aria-labelledby="wipe-notice-title">
      <h3 id="wipe-notice-title">A note about your trips</h3>
      <p>{WIPE_NOTICE_TEXT}</p>
      <ul class="muted">
        {unseen.map((trip) => (
          <li key={trip.id}>{cancelledLine(trip, creatures)}</li>
        ))}
      </ul>
      <button
        type="button"
        class="primary"
        onClick={() => {
          markSeen(browserStorage(), unseen);
          setClosed(true);
          setUnseen([]);
        }}
      >
        Got it
      </button>
    </section>
  );
}
