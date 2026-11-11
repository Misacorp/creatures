import type { RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Balances, LeetSyncStatus, LedgerEntry } from './api';
import { CurrencyPile } from './CurrencyPile';
import { GEAR_SPRITE } from './sprites/data/hud-sprites';
import { Sprite } from './sprites/Sprite';
import { instantPress } from './ui/instant-press';

/** The cog that opens Settings (How to play is inside Settings, so the HUD keeps one button). */
export function SettingsButton({ onSettings }: { onSettings: () => void }) {
  return (
    <button type="button" class="hud-gear" aria-label="Settings" {...instantPress(onSettings)}>
      <Sprite sprite={GEAR_SPRITE} scale={2} />
    </button>
  );
}

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
 * The valley's way back (`Hud`'s `back`): a "‹" before the place's name, spoken as `label` ("Back to the valley").
 * The focus moves to it when the place opens (the button that opened the place is gone, so Escape and Tab would
 * otherwise start from nothing); a ring shows only when the keyboard is in use (`:focus-visible`).
 */
function BackButton({
  label,
  onBack,
  token,
}: {
  label: string;
  onBack: () => void;
  token: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // A layout effect, not a passive one: the focus is on the button in the same commit that shows the place, so an
  // Escape pressed the moment the page appears (or a script that waits for its title) never finds it elsewhere.
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [token]);
  return (
    <button
      ref={ref}
      type="button"
      class="hud-back pix"
      aria-label={label}
      onClick={onBack}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onBack();
      }}
    >
      <span aria-hidden="true">‹</span>
    </button>
  );
}

/**
 * The HUD along the top of the game: the name of the place you are in (the page's one `h1`), the currencies
 * with their numbers, and one button: the cog (Settings, which also opens How to play) when `onSettings` is given,
 * else "?". On a phone it stays at the top edge while the page scrolls; on a wide window
 * it runs across the top of the card, above the rail and the screen. With `back` (the valley's places) a "‹" way
 * back comes before the name; the name stays the page's one `h1`.
 */
export function Hud({
  title,
  balances,
  leetSync,
  loadLedger,
  helpRef,
  onHelp,
  onSettings,
  back,
  float = false,
}: {
  title: string;
  balances: Balances;
  /** The leet sync status (the currency popover warns when it is failing). */
  leetSync?: LeetSyncStatus | null;
  /** Fetches the ledger for the popover's income list (default: the player's own). */
  loadLedger?: () => Promise<LedgerEntry[]>;
  helpRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
  /** Opens the Settings page; with it the cog replaces "?" (How to play is inside Settings). */
  onSettings?: () => void;
  /** The valley's way back: its spoken name ("Back to the valley") and what it does. The focus moves to it when `title` changes. */
  back?: { label: string; onBack: () => void };
  /** The bar gives up its row and floats over the screen (the valley's map fills the window): the purse and the cog sit in the top-right corner, the title is still the page's `h1` but unseen. */
  float?: boolean;
}) {
  return (
    <header class={float ? 'hud hud-float' : 'hud'}>
      {back !== undefined && <BackButton label={back.label} onBack={back.onBack} token={title} />}
      <h1 class={float ? 'hud-title pix visually-hidden' : 'hud-title pix'}>{title}</h1>
      <div class="hud-tools">
        <CurrencyPile
          balances={balances}
          {...(leetSync === undefined ? {} : { leetSync })}
          {...(loadLedger === undefined ? {} : { loadLedger })}
        />
        {onSettings === undefined ? (
          <HelpButton helpRef={helpRef} onHelp={onHelp} />
        ) : (
          <SettingsButton onSettings={onSettings} />
        )}
      </div>
    </header>
  );
}
