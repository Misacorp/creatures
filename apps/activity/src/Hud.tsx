import type { RefObject } from 'preact';
import type { Balances, LeetSyncStatus, LedgerEntry } from './api';
import { CurrencyPile } from './CurrencyPile';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';

/** The cog that opens Settings (How to play is inside Settings, so the HUD keeps one button). */
export function SettingsButton({ onSettings }: { onSettings: () => void }) {
  return (
    <button type="button" class="hud-gear" aria-label="Settings" onClick={onSettings}>
      <Sprite sprite={glyphOrUnknown('gear')} scale={3} />
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
 * The HUD along the top of the game: the name of the place you are in (the page's one `h1`), the currencies
 * with their numbers, and one button: the cog (Settings, which also opens How to play) when `onSettings` is given,
 * else "?". On a phone it stays at the top edge while the page scrolls; on a wide window
 * it runs across the top of the card, above the rail and the screen.
 */
export function Hud({
  title,
  balances,
  leetSync,
  loadLedger,
  helpRef,
  onHelp,
  onSettings,
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
}) {
  return (
    <header class="hud">
      <h1 class="hud-title pix">{title}</h1>
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
