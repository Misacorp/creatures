import { glowSprite } from '../proto/valley/valley-places';
import { Sprite } from '../sprites/Sprite';
import { NEW_VALLEY_TEXT, NEW_VALLEY_TITLE, type NewValleyLook } from './new-valley';

/** The valley's bonfire by day: the ring and the logs, no glow. It has gone quiet. */
function QuietBonfire({ scale }: { scale: number }) {
  return (
    <div class="new-valley-art" aria-hidden="true">
      <Sprite sprite={glowSprite('bonfire', 'day')} scale={scale} />
    </div>
  );
}

/**
 * The one-time card on the first open after the reset (docs/design/reset.md, section 5), in three looks:
 * `notice` is the level reset's card as it is (`.wipe-notice`, "Got it"); `scene` is the same card with the
 * quiet bonfire above the words; `welcome` fills the view before the starter choice, with one button.
 * `onDismiss` closes it (the server remembers, as it does for the level reset's card).
 */
export function NewValleyCard({
  look,
  busy = false,
  onDismiss,
}: {
  look: NewValleyLook;
  busy?: boolean;
  onDismiss: () => void;
}) {
  if (look === 'welcome') {
    return (
      <section class="new-valley-welcome" role="status" aria-labelledby="new-valley-title">
        <QuietBonfire scale={8} />
        <h2 id="new-valley-title">{NEW_VALLEY_TITLE}</h2>
        <p>{NEW_VALLEY_TEXT}</p>
        <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
          Pick a starter
        </button>
      </section>
    );
  }
  return (
    <section class="wipe-notice" role="status" aria-labelledby="new-valley-title">
      {look === 'scene' && <QuietBonfire scale={4} />}
      <h3 id="new-valley-title">{NEW_VALLEY_TITLE}</h3>
      <p>{NEW_VALLEY_TEXT}</p>
      <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
        Got it
      </button>
    </section>
  );
}
