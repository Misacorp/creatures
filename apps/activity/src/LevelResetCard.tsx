import type { LevelResetNotice } from './api';
import { levelResetLines } from './level-reset-notice';

/**
 * The one-time card after levels were halved and the Bait refunded. The server remembers the dismissal,
 * so it never comes back; until then it shows on every visit.
 */
export function LevelResetCard({
  notice,
  busy,
  onDismiss,
}: {
  notice: LevelResetNotice;
  busy: boolean;
  onDismiss: () => void;
}) {
  const [headline, ...more] = levelResetLines(notice);
  return (
    <section class="wipe-notice" role="status" aria-labelledby="level-reset-title">
      <h3 id="level-reset-title">Creatures grow differently now</h3>
      <p>{headline}</p>
      {more.length > 0 && (
        <ul class="muted">
          {more.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
        Got it
      </button>
    </section>
  );
}
