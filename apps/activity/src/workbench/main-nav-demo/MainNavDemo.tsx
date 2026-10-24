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
 * left on a wide window) and a screen. The dock sits in the frame instead of being fixed to the window, so a
 * preview iframe can show it. Creatures, Games and Expeditions are the real screens on fixture data.
 */

export const LAYOUTS = ['auto', 'phone', 'desktop'] as const;

/** Places a future feature might add, to show the dock's More with more places than today's six. */
const EXTRA_PLACES: readonly NavPlace[] = [
  { id: 'market', label: 'Market', glyph: 'anvil', pip: null },
  { id: 'camp', label: 'Camp', glyph: 'door', pip: null },
  { id: 'garden', label: 'Garden', glyph: 'paw', pip: null },
  { id: 'harbour', label: 'Harbour', glyph: 'compass', pip: null },
];

/** A busy day: a job is ready, a trip is home, the show has events to enter and today's run is open. */
const BUSY: TabAlerts = {
  ...NO_ALERTS,
  workshop: ALERT_TEXT.jobReady,
  expeditions: ALERT_TEXT.tripHome,
  games: ALERT_TEXT.gamesEntries,
  dungeon: ALERT_TEXT.dungeonOpen,
  raid: ALERT_TEXT.raidPlace,
};

/** Today's places and then extra ones, `count` in all (3 to 10); with `pips`, the busy day's pips (and one on the last extra). */
export function demoPlaces(count: number, pips: boolean): NavPlace[] {
  const all = [...navPlaces(pips ? BUSY : NO_ALERTS), ...EXTRA_PLACES];
  const places = all.slice(0, Math.max(3, Math.min(all.length, Math.round(count))));
  const [last] = places.slice(-1);
  return pips && last !== undefined && last.id !== 'raid'
    ? [...places.slice(0, -1), { ...last, pip: 'new stock' }]
    : places;
}

const NO_REF = { current: null };

export function MainNavDemo({
  place,
  count,
  pips,
  layout,
}: {
  place: string;
  count: number;
  pips: boolean;
  layout: string;
}) {
  const auto = useWide();
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  const places = demoPlaces(count, pips);
  const [picked, setPicked] = useState(place);
  const current = places.some((p) => p.id === picked) ? picked : (places[0]?.id ?? 'collection');
  const label = places.find((p) => p.id === current)?.label ?? '';
  const nav = <MainNav places={places} current={current} wide={wide} onSelect={setPicked} />;
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
