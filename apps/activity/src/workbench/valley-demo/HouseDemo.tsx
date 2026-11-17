/**
 * The valley's House with housing on, for the workbench: the real HUD and valley frame with the House place drawn as the game draws it
 * (the player's house is the canvas, `housing/HousePlace` with `canvas`), its reads answered from samples (`house-demo.ts`). Housing
 * off shows the House as it is in production (a scene with Journal and Stats under it).
 */
import { useMemo, useState } from 'preact/hooks';
import { Hud } from '../../Hud';
import { PopoverHost } from '../../PopoverHost';
import { homeAlerts } from '../../home-view';
import { HouseHost } from '../../housing/HouseHost';
import { ValleyFrame } from '../../valley/ValleyFrame';
import { Keepsakes } from '../../valley/Keepsakes';
import type { Balances } from '../../api';
import type { PlaceId } from '../../valley/valley-art';
import { viewOf } from '../../valley/valley-nav';
import type { Place } from '../../tabs';
import { HOME_NOW, homeInput } from '../home-sample';
import { HouseApiContext } from '../../housing/house-api-context';
import { housePhaseOf, isPage, sampleHouseApi } from './house-demo';
import { SAMPLE_STATE } from '../../creature-card-sample';

const PURSE: Balances = { bait: 1240, essence: 36 };
const NOTHING = (): void => undefined;
const NO_REF = { current: null };

export function HouseDemo({ house }: { house: string }) {
  const on = house !== 'off';
  const api = useMemo(() => sampleHouseApi(house), [house]);
  const [tab, setTab] = useState<Place>('home');
  const [focus, setFocus] = useState<PlaceId | null>(null);
  const input = homeInput('busy', false);
  const view = viewOf(tab, 'house');
  const leave = (): void => {
    setFocus('house');
    setTab('home');
  };
  if (on && isPage(house)) {
    // The House as a page, as the Collection group's tab shows it (`VALLEY` off).
    return (
      <HouseApiContext.Provider value={api}>
        <PopoverHost onOpenHowTo={NOTHING}>
          <div class="wb-valley">
            <main class="card">
              <Hud
                title="House"
                balances={PURSE}
                helpRef={NO_REF}
                onHelp={NOTHING}
                onSettings={NOTHING}
              />
              <HouseHost creatures={SAMPLE_STATE.creatures} now={HOME_NOW} />
            </main>
          </div>
        </PopoverHost>
      </HouseApiContext.Provider>
    );
  }
  const book = view.kind === 'place' ? view.book : null;
  return (
    <HouseApiContext.Provider value={api}>
      <PopoverHost onOpenHowTo={NOTHING}>
        <div class="wb-valley">
          <main class="card">
            <Hud
              title={book === null ? 'House' : book === 'house' ? 'Your house' : 'Journal'}
              balances={PURSE}
              helpRef={NO_REF}
              onHelp={NOTHING}
              onSettings={NOTHING}
              back={{ label: 'Back to the valley', onBack: leave }}
            />
            <ValleyFrame
              view={view}
              creatures={input.creatures}
              trayInput={{ trips: input.trips, jobs: input.jobs, now: HOME_NOW }}
              alerts={homeAlerts(input)}
              placeInput={input}
              castExtra={{ dungeonTeam: null, dungeonPhase: 'none', waiting: [] }}
              housing={on}
              focus={focus}
              onOpen={NOTHING}
              onLeave={leave}
              onBook={setTab}
              notices={null}
              away={null}
              settings={null}
            >
              {on && (
                <HouseHost
                  phase={housePhaseOf(house)}
                  creatures={SAMPLE_STATE.creatures}
                  now={HOME_NOW}
                  canvas={{
                    book: (page) => <p class="muted">The {page} opens from the game.</p>,
                    keepsakes: <Keepsakes visit={null} />,
                  }}
                />
              )}
            </ValleyFrame>
          </main>
        </div>
      </PopoverHost>
    </HouseApiContext.Provider>
  );
}
