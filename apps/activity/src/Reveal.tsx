import { revealSummary } from './live';
import type { RaidReveal } from './raid-api';

/**
 * The finale loot reveal: the outcome, the Essence and the jackpot roll. The roll plays a short
 * CSS-only animation (switched off for `prefers-reduced-motion`); the real text is in the page from
 * the start, so screen readers and reduced-motion users get the result at once.
 */
export function RevealCard({
  reveal,
  pity,
  busy,
  onDismiss,
}: {
  reveal: Pick<RaidReveal, 'cleared' | 'essence' | 'jackpot'>;
  /** The pity counter after the fight, when the server sent one. */
  pity: number | null;
  busy: boolean;
  onDismiss: () => void;
}) {
  const summary = revealSummary(reveal, pity);
  return (
    <section
      class={summary.jackpot.hit ? 'reveal-card jackpot' : 'reveal-card'}
      role="status"
      aria-labelledby="reveal-heading"
    >
      <h3 id="reveal-heading">
        Finale result{' '}
        <span class={summary.cleared ? 'badge good' : 'badge bad'}>
          {summary.cleared ? 'Cleared' : 'Not cleared'}
        </span>
      </h3>
      <p>{summary.outcome}</p>
      <p class="reveal-essence">{summary.essence}</p>
      <div class="reveal-roll">
        <p class="reveal-rolling" aria-hidden="true">
          Rolling for the jackpot...
        </p>
        <p class={summary.jackpot.hit ? 'reveal-result hit' : 'reveal-result'}>
          {summary.jackpot.text}
          {summary.jackpot.firstOnServer && <span class="badge first">First on server</span>}
        </p>
      </div>
      <p>
        <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
          Got it
        </button>
      </p>
    </section>
  );
}
