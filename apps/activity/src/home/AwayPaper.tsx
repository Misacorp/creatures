import type { AwaySummary } from '../api';
import { CountBadgeList } from '../ui/CountBadge';
import { PixelHeading } from '../ui/PixelHeading';
import { AWAY_TITLE, awayRows, awayWaitingLine } from './away-notice';

/**
 * The "While you were away" paper: a row per source (its name, then its count badges), what waits to be claimed
 * and "Got it". It is the Today board's first paper, and with the valley shell on (`VALLEY`) it shows over the
 * valley until the welcome-back Gazette replaces it (phase 4, step 4). Everything on it is the game's own wording.
 */
export function AwayPaper({
  away,
  onDismiss,
  busy = false,
  lean,
}: {
  away: AwaySummary;
  /** Clears the paper (`until` is its summary's last payout); without it the paper has no button. */
  onDismiss?: ((until: number) => void) | undefined;
  /** An action is running: the button waits. */
  busy?: boolean;
  /** The ref that gives the paper its lean on the board (through the CSS object model). */
  lean?: ((el: HTMLElement | null) => void) | undefined;
}) {
  return (
    <>
      <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
        {AWAY_TITLE}
      </PixelHeading>
      <div class="hb-paper hb-away" {...(lean === undefined ? {} : { ref: lean })}>
        <ul class="hb-away-rows" aria-label={AWAY_TITLE}>
          {awayRows(away).map((row) => (
            <li key={row.kind} class="hb-away-row" data-kind={row.kind}>
              <b class="hb-away-source">{row.name}</b>
              <CountBadgeList
                items={row.badges}
                label={`${row.name}, while you were away`}
                class="hb-away-badges"
              />
            </li>
          ))}
        </ul>
        {awayWaitingLine(away) !== null && <p class="hb-away-waiting">{awayWaitingLine(away)}</p>}
        {onDismiss !== undefined && (
          <button
            type="button"
            class="primary hb-away-ok"
            disabled={busy}
            onClick={() => {
              onDismiss(away.until);
            }}
          >
            Got it
          </button>
        )}
      </div>
    </>
  );
}
