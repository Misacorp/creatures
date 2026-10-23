import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import type { TabAlerts } from './tab-alerts';
import { TABS, tabAfterKey, tabPalette, type Tab } from './tabs';

/**
 * The row of main tabs (Creatures, Workshop, Expeditions, Games, Dungeon, Raid). A tab that has something
 * waiting for the player carries a small square pip at its top right corner; the reason is also
 * in the tab's name for screen readers ("Expeditions, a trip is home"), and the pip itself is
 * decoration. Arrow keys, Home and End move focus between the tabs; Enter or Space opens the focused one.
 */
export function TabBar({
  current,
  alerts,
  onSelect,
}: {
  current: Tab;
  alerts: TabAlerts;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <div
      class="tabs"
      role="tablist"
      aria-label="Sections"
      onKeyDown={(event) => {
        // Arrow keys, Home and End move between the tabs; Enter or Space opens the focused one.
        const next = tabAfterKey(current, event.key);
        if (next === null) return;
        event.preventDefault();
        document.getElementById(`tab-${next}`)?.focus();
      }}
    >
      {TABS.map(({ id, label, glyph }) => {
        const reason = alerts[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={current === id}
            aria-controls={`panel-${id}`}
            tabIndex={current === id ? 0 : -1}
            class={current === id ? 'tab active' : 'tab'}
            onClick={() => {
              onSelect(id);
            }}
          >
            <Sprite
              sprite={glyphOrUnknown(glyph)}
              scale={2}
              class="tab-glyph"
              {...(tabPalette(current === id) === undefined
                ? {}
                : { palette: tabPalette(current === id) as Readonly<Record<string, string>> })}
            />
            <span class="tab-label">{label}</span>
            {reason !== null && (
              <>
                <span class="tab-pip" aria-hidden="true" />
                <span class="visually-hidden">, {reason}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
