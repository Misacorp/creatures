import './home-mockups.css';
import '../main-nav-demo/main-nav-demo.css';
import { Hud } from '../../Hud';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { MainNav } from '../../MainNav';
import { PopoverHost } from '../../PopoverHost';
import { homeAlerts } from '../../home-view';
import { navPlaces } from '../../nav-places';
import { useWide } from '../../ui/wide-layout';
import type { Forecast } from '../../weather-types';
import { ROOM_SELF_ID, sampleResidents } from '../data';
import { HomeBoard } from './HomeBoard';
import { HomeCards } from './HomeCards';
import { homeInput } from './home-data';

/**
 * The Home page design round in a frame like the Activity window (dev only; imported by its workbench page
 * alone): the real `Hud` on top (titled "Home"), the real `MainNav` (the dock on a phone with its middle button
 * labelled "Home", the rail on the left of a wide window) and the page: on a phone the living room first, then
 * the board or the cards; on a wide window the room is the band under the HUD, as in the game, and the board
 * or the cards sit beside the rail.
 */

export const VARIANTS = ['today board', 'place cards'] as const;
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

export function HomePage({
  variant,
  state,
  raid,
  layout,
}: {
  variant: string;
  state: string;
  raid: boolean;
  layout: string;
}) {
  const auto = useWide();
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  const input = homeInput(state, raid);
  const places = navPlaces(homeAlerts(input));
  const nav = (
    <MainNav
      places={places}
      current="home"
      wide={wide}
      onSelect={NOTHING}
      lounge={{ pip: null, label: 'Home', glyph: 'home', open: false, onOpen: NOTHING }}
    />
  );
  const page =
    variant === 'place cards' ? (
      <HomeCards input={input} onGo={NOTHING} />
    ) : (
      <HomeBoard input={input} onGo={NOTHING} />
    );
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <div class={wide ? 'nd hm nd-wide' : 'nd hm nd-phone'}>
        <Hud
          title="Home"
          balances={{ bait: 1240, essence: 36 }}
          helpRef={NO_REF}
          onHelp={NOTHING}
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
              <div class="hm-room">
                <Room forecast={input.forecast} />
              </div>
              {page}
            </div>
            {nav}
          </>
        )}
      </div>
    </PopoverHost>
  );
}
