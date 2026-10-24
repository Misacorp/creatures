import './home-demo.css';
import '../main-nav-demo/main-nav-demo.css';
import { Hud } from '../../Hud';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { MainNav } from '../../MainNav';
import { PopoverHost } from '../../PopoverHost';
import type { BoardSettings } from '../../home/board';
import { HomePage } from '../../home/HomePage';
import { homeAlerts } from '../../home-view';
import { navPlaces } from '../../nav-places';
import { useWide } from '../../ui/wide-layout';
import type { Forecast } from '../../weather-types';
import { ROOM_SELF_ID, sampleResidents } from '../data';
import { homeInput } from '../home-sample';
import type { PinTeasers } from '../../home/BoardPins';

/**
 * The Home page in a frame like the Activity window (dev only; imported by its workbench page alone): the real
 * `Hud` on top (titled "Home"), the real `MainNav` (the dock on a phone with Home as the middle button, the rail
 * on a wide window) and the real `HomePage` on fixture data with a fixed clock (Saturday 10:00 in Helsinki). On a
 * phone the living room is drawn at the top of the page; on a wide window it is the band under the HUD, as in the
 * game, and the board sits beside the rail.
 */

export const LAYOUTS = ['auto', 'phone', 'desktop'] as const;

const NO_REF = { current: null };
const NOTHING = () => undefined;
const RESIDENTS = sampleResidents(6, false);

function Room({ forecast }: { forecast: Forecast | null }) {
  return (
    <LivingRoom
      residents={RESIDENTS}
      selfId={ROOM_SELF_ID}
      instanceId="workbench"
      scene={sceneOf('day')}
      forecast={forecast}
      ownLoungeXp={34}
    />
  );
}

export function HomeDemo({
  state,
  raid,
  teasers,
  settings,
  layout,
}: {
  state: string;
  raid: boolean;
  /** The pins' teasers (null: the profile has not loaded, the pins show only their names). */
  teasers: PinTeasers;
  settings: BoardSettings;
  layout: string;
}) {
  const auto = useWide();
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  const input = homeInput(state, raid);
  const nav = (
    <MainNav
      places={navPlaces(homeAlerts(input))}
      current="home"
      wide={wide}
      onSelect={NOTHING}
      home
    />
  );
  const page = (
    <HomePage
      input={input}
      settings={settings}
      onGo={NOTHING}
      teasers={teasers}
      onOpenPage={NOTHING}
    />
  );
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <div class={wide ? 'nd hm nd-wide' : 'nd hm nd-phone'}>
        <Hud
          title="Home"
          balances={{ bait: 1240, essence: 36 }}
          helpRef={NO_REF}
          onHelp={NOTHING}
          onSettings={NOTHING}
        />
        {wide ? (
          <>
            <div class="hm-band">
              <Room forecast={input.forecast} />
            </div>
            <div class="nd-body">
              {nav}
              <div class="nd-screen">{page}</div>
            </div>
          </>
        ) : (
          <>
            <div class="nd-screen hm-screen">
              <HomePage
                input={input}
                settings={settings}
                onGo={NOTHING}
                teasers={teasers}
                onOpenPage={NOTHING}
                room={<Room forecast={input.forecast} />}
              />
            </div>
            {nav}
          </>
        )}
      </div>
    </PopoverHost>
  );
}
