import type { Trip } from './expedition-types';
import { recallKeeps, tripAction } from './trip-view';

/**
 * The one button of a trip that is out, shared by the big card, the sheet's row and the shelf's slot card:
 * Claim when it is home, Recall (with the hours of finds it keeps) while it is out, "Come home now" while a
 * push-on runs, and Decide when a push-on is on offer (the choice itself opens in a drill-in the caller
 * shows). `compact` shortens the words for a row or a card; the full words stay as the button's name for
 * assistive technology. `serverNow` is server time. The server decides every claim.
 */
export function TripActions({
  trip,
  serverNow,
  busy,
  onClaim,
  onDecide,
  compact = false,
}: {
  trip: Trip;
  serverNow: number;
  busy: boolean;
  onClaim: (trip: Trip) => void;
  onDecide: (trip: Trip) => void;
  compact?: boolean;
}) {
  const action = tripAction(trip, serverNow);
  if (action === 'decide') {
    return (
      <button
        type="button"
        class={compact ? 'primary trip-act' : 'primary'}
        disabled={busy}
        onClick={() => {
          onDecide(trip);
        }}
      >
        {compact ? 'Decide' : 'Choose: push on?'}
      </button>
    );
  }
  const keeps = recallKeeps(trip, serverNow);
  const full =
    action === 'claim'
      ? 'Claim'
      : action === 'early'
        ? 'Come home now (skips the push-on)'
        : `Recall (keeps ${String(keeps)} ${keeps === 1 ? 'hour' : 'hours'} of finds)`;
  const short = action === 'claim' ? 'Claim' : action === 'early' ? 'Come home' : 'Recall';
  const classes = [action === 'claim' ? 'primary' : '', compact ? 'trip-act' : '']
    .filter((c) => c !== '')
    .join(' ');
  return (
    <button
      type="button"
      class={classes}
      disabled={busy}
      aria-label={compact ? full : undefined}
      onClick={() => {
        onClaim(trip);
      }}
    >
      {compact ? short : full}
    </button>
  );
}
