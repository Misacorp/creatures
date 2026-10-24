import type { RefObject } from 'preact';
import type { Balances } from './api';
import { CurrencyPile } from './CurrencyPile';

/** The "?" that opens How to play (the app owns the page; `helpRef` is where the focus returns when it closes). */
export function HelpButton({
  helpRef,
  onHelp,
}: {
  helpRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
}) {
  return (
    <button
      type="button"
      ref={helpRef}
      class="howto-open pix"
      aria-haspopup="dialog"
      aria-label="How to play"
      onClick={onHelp}
    >
      ?
    </button>
  );
}

/**
 * The HUD along the top of the game: the name of the place you are in (the page's one `h1`), the currencies
 * with their numbers, and "?". On a phone it stays at the top edge while the page scrolls; on a wide window
 * it runs across the top of the card, above the rail and the screen.
 */
export function Hud({
  title,
  balances,
  helpRef,
  onHelp,
}: {
  title: string;
  balances: Balances;
  helpRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
}) {
  return (
    <header class="hud">
      <h1 class="hud-title pix">{title}</h1>
      <div class="hud-tools">
        <CurrencyPile balances={balances} />
        <HelpButton helpRef={helpRef} onHelp={onHelp} />
      </div>
    </header>
  );
}
