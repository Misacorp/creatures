import { countdownClasses, type CountdownView } from './countdown';

/**
 * The big countdown over the stage in the last 30 seconds before the fight starts: the number in the
 * pixel display face, then "FIGHT!". It sits on top of the stage but lets taps through (the player
 * can still set auto fire on their creatures), and it is hidden from assistive technology: the
 * screen reader hears a few spoken updates from the screen instead (see `spokenCountdown`). The
 * number's element is keyed by the second, so a new second starts its animation again; with
 * `prefers-reduced-motion` the stylesheet keeps only the static number and its colour.
 */
export function Countdown({ view }: { view: CountdownView }) {
  if (view === null) return null;
  return (
    <div class={`countdown ${countdownClasses(view)}`} aria-hidden="true">
      <span key={view.phase === 'fight' ? 'fight' : view.n} class="cd-text pix">
        {view.phase === 'fight' ? 'FIGHT!' : String(view.n)}
      </span>
    </div>
  );
}
