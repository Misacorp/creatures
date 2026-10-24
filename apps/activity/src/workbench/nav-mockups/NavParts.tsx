import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { tabPalette, type Tab } from '../../tabs';
import type { TabAlerts } from '../../tab-alerts';
import { MOCK_BAIT, MOCK_ESSENCE, tabGlyph } from './nav-data';

/** A tab's picture (the glyph of `tabs.ts`), dark when it sits on the gold of an active button. */
export function NavIcon({ tab, active, scale }: { tab: Tab; active: boolean; scale: number }) {
  const palette = tabPalette(active);
  return (
    <Sprite
      sprite={glyphOrUnknown(tabGlyph(tab))}
      scale={scale}
      class="nm-icon"
      {...(palette === undefined ? {} : { palette })}
    />
  );
}

/** The alert pip of today's tab bar (`.tab-pip`), with the reason for screen readers. */
export function NavPip({ alerts, tab }: { alerts: TabAlerts; tab: Tab }) {
  const reason = alerts[tab];
  if (reason === null) return null;
  return (
    <>
      <span class="tab-pip" aria-hidden="true" />
      <span class="visually-hidden">, {reason}</span>
    </>
  );
}

/** One currency in the HUD: its picture and the number (the real pile shows only the picture). */
function Chip({ glyph, amount, label }: { glyph: string; amount: number; label: string }) {
  return (
    <li class="nm-chip" aria-label={`${String(amount)} ${label}`}>
      <Sprite sprite={glyphOrUnknown(glyph)} scale={2} />
      <span class="pix">{amount.toLocaleString('en')}</span>
    </li>
  );
}

/** The HUD's currencies and the "?" that opens How to play. */
export function HudTools() {
  return (
    <div class="nm-tools">
      <ul class="nm-chips" aria-label="Currencies">
        <Chip glyph="bait" amount={MOCK_BAIT} label="Bait" />
        <Chip glyph="gem" amount={MOCK_ESSENCE} label="Essence" />
      </ul>
      <button type="button" class="nm-help" aria-label="How to play">
        ?
      </button>
    </div>
  );
}
