import { glowSprite } from '../proto/valley/valley-places';
import { Sprite } from '../sprites/Sprite';
import { NEW_VALLEY_TEXT, NEW_VALLEY_TITLE } from './new-valley';

/**
 * The one-time card on the first open after the reset (docs/design/reset.md, section 5): the level reset's card
 * (`.wipe-notice`, "Got it") with the valley's bonfire by day above the words, no glow: it has gone quiet (look B,
 * Misa, 2026-11-15). `onDismiss` closes it (the server remembers, as it does for the level reset's card).
 */
export function NewValleyCard({
  busy = false,
  onDismiss,
}: {
  busy?: boolean;
  onDismiss: () => void;
}) {
  return (
    <section class="wipe-notice" role="status" aria-labelledby="new-valley-title">
      <div class="new-valley-art" aria-hidden="true">
        <Sprite sprite={glowSprite('bonfire', 'day')} scale={4} />
      </div>
      <h3 id="new-valley-title">{NEW_VALLEY_TITLE}</h3>
      <p>{NEW_VALLEY_TEXT}</p>
      <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
        Got it
      </button>
    </section>
  );
}
