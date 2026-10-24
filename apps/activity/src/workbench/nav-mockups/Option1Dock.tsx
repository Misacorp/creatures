import { useState } from 'preact/hooks';
import type { Tab } from '../../tabs';
import { WideLayout } from '../../ui/WideLayout';
import { MOCK_ALERTS, NAV_TABS, tabLabel } from './nav-data';
import { HudTools, NavIcon, NavPip } from './NavParts';
import { NavPanel, NavScreen, ownsPanel } from './NavScreens';

/**
 * Option 1, "Dock and rail": the six places become icon buttons of a game's own dock. On a phone the dock
 * sits at the bottom, in thumb reach, and a slim HUD on top names the screen and shows the currencies with
 * their numbers. On a wide window the dock turns into a rail on the left (icons with their words, there is
 * room), the HUD runs along the top and the screen is a main area with a side panel.
 */

function DockButton({
  id,
  current,
  wide,
  onPick,
}: {
  id: Tab;
  current: Tab;
  wide: boolean;
  onPick: (id: Tab) => void;
}) {
  const active = id === current;
  return (
    <button
      type="button"
      class={active ? 'nm-dock-btn active' : 'nm-dock-btn'}
      aria-label={tabLabel(id)}
      aria-current={active ? 'page' : undefined}
      onClick={() => {
        onPick(id);
      }}
    >
      <NavIcon tab={id} active={active} scale={wide ? 3 : 4} />
      {wide && <span class="nm-dock-word">{tabLabel(id)}</span>}
      <NavPip alerts={MOCK_ALERTS} tab={id} />
    </button>
  );
}

function Dock({
  current,
  wide,
  onPick,
}: {
  current: Tab;
  wide: boolean;
  onPick: (id: Tab) => void;
}) {
  return (
    <nav class="nm-dock" aria-label="Sections">
      {NAV_TABS.map((t) => (
        <DockButton key={t.id} id={t.id} current={current} wide={wide} onPick={onPick} />
      ))}
    </nav>
  );
}

export function Option1Dock({ wide, start }: { wide: boolean; start: Tab }) {
  const [tab, setTab] = useState<Tab>(start);
  const hud = (
    <header class="nm-hud">
      <h1 class="nm-hud-title pix">{tabLabel(tab)}</h1>
      <HudTools />
    </header>
  );
  if (wide) {
    return (
      <div class="nm nm-wide nm-o1">
        <Dock current={tab} wide onPick={setTab} />
        <div class="nm-col">
          {hud}
          <div class="nm-scroll">
            {ownsPanel(tab) ? (
              <NavScreen tab={tab} wide />
            ) : (
              <WideLayout wide main={<NavScreen tab={tab} wide />} panel={<NavPanel tab={tab} />} />
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="nm nm-phone nm-o1">
      {hud}
      <div class="nm-scroll">
        <NavScreen tab={tab} wide={false} />
      </div>
      <Dock current={tab} wide={false} onPick={setTab} />
    </div>
  );
}
