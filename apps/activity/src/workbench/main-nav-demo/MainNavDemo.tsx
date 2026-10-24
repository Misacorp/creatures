import './main-nav-demo.css';
import { useState } from 'preact/hooks';
import { Hud } from '../../Hud';
import { MainNav } from '../../MainNav';
import { navPlaces, type NavPlace } from '../../nav-places';
import { ALERT_TEXT, NO_ALERTS, type TabAlerts } from '../../tab-alerts';
import { useWide } from '../../ui/wide-layout';
import { DemoScreen } from './screens';

/**
 * The main navigation in a fixed-height frame like the Activity window in Discord (dev only, imported by its
 * workbench page alone): the real `Hud` on top, the real `MainNav` (a bottom dock on a phone, a rail on the
 * left on a wide window) and a screen. Home is a stand-in here (the Home page has its own workbench page). The dock sits in the frame instead of being fixed to the window, so a
 * preview iframe can show it. Creatures, Games and Expeditions are the real screens on fixture data.
 */

export const LAYOUTS = ['auto', 'phone', 'desktop'] as const;

/** What starts open on a phone: a group's sub-menu. */
export const MENUS = ['none', 'creatures', 'adventure'] as const;

/** A place a future feature might add to Home (a village map, a market), to show a group growing. */
const EXTRA_PLACE: NavPlace = {
  id: 'market',
  label: 'Market',
  glyph: 'anvil',
  group: 'creatures',
  pip: null,
};

/** A busy day: a job is ready, a trip is home, the show has events to enter and today's run is open. */
const BUSY: TabAlerts = {
  ...NO_ALERTS,
  workshop: ALERT_TEXT.jobReady,
  expeditions: ALERT_TEXT.tripHome,
  games: ALERT_TEXT.gamesEntries,
  dungeon: ALERT_TEXT.dungeonOpen,
  raid: ALERT_TEXT.raidPlace,
};

/** Today's places (with `pips`, the busy day's pips) and, with `extra`, one more place in Home. */
export function demoPlaces(pips: boolean, extra: boolean): NavPlace[] {
  const places = navPlaces(pips ? BUSY : NO_ALERTS);
  return extra ? [...places, { ...EXTRA_PLACE, pip: pips ? 'new stock' : null }] : places;
}

const NO_REF = { current: null };

export function MainNavDemo({
  place,
  menu,
  pips,
  extra,
  layout,
}: {
  place: string;
  /** The group whose sub-menu starts open on a phone ("none" for none). */
  menu: string;
  pips: boolean;
  extra: boolean;
  layout: string;
}) {
  const auto = useWide();
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  const places = demoPlaces(pips, extra);
  const [picked, setPicked] = useState(place);
  const current =
    picked === 'home' || places.some((p) => p.id === picked)
      ? picked
      : (places[0]?.id ?? 'collection');
  const label = current === 'home' ? 'Home' : (places.find((p) => p.id === current)?.label ?? '');
  const nav = (
    <MainNav
      places={places}
      current={current}
      wide={wide}
      onSelect={setPicked}
      openGroup={menu === 'none' ? undefined : menu}
      home
    />
  );
  const screen = (
    <div class="nd-screen">
      <DemoScreen place={current} label={label} wide={wide} />
    </div>
  );
  return (
    <div class={wide ? 'nd nd-wide' : 'nd nd-phone'}>
      <Hud
        title={label}
        balances={{ bait: 1240, essence: 36 }}
        helpRef={NO_REF}
        onHelp={() => undefined}
      />
      {wide ? (
        <div class="nd-body">
          {nav}
          {screen}
        </div>
      ) : (
        <>
          {screen}
          {nav}
        </>
      )}
    </div>
  );
}
