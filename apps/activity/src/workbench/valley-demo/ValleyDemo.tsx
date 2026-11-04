import { useState } from 'preact/hooks';
import { RoomBand } from '../../AppHead';
import { Hud } from '../../Hud';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { PopoverHost } from '../../PopoverHost';
import { AwayPaper } from '../../home/AwayPaper';
import type { Place } from '../../tabs';
import { ValleyFrame } from '../../valley/ValleyFrame';
import { isOpenPlace, PLACE_TAB, viewOf, type HomeAt } from '../../valley/valley-nav';
import { placeOf, type PlaceId } from '../../valley/valley-art';
import { ROOM_SELF_ID, sampleResidents } from '../data';
import { creatureCardEntries } from '../entries/creature-card';
import { AWAY_SAMPLE, HOME_NOW, homeInput } from '../home-sample';
import type { Entry } from '../types';

/**
 * The valley shell in the game's frame (dev only): the real HUD and `ValleyFrame` with the game's own tab-to-place
 * rules (`viewOf`), on fixture data. `start` is where it opens: the map, a place (a page of the game), or a place
 * that is not open yet; tapping around works as in the game, minus the loading.
 */
export const VALLEY_STARTS = ['valley', 'forge', 'paddock', 'house', 'school', 'bonfire'] as const;

const NOTHING = () => undefined;
const NO_REF = { current: null };
const RESIDENTS = sampleResidents(6, false);

function pageOf(entries: readonly Entry[], name: string) {
  const entry = entries.find((e) => e.name === name);
  if (entry === undefined) return <p class="muted">No workbench page named {name}.</p>;
  return <>{entry.render({ ...entry.defaults })}</>;
}

function titleOf(at: PlaceId | null): string {
  return at === null ? 'Valley' : placeOf(at).name;
}

export function ValleyDemo({ start, away }: { start: string; away: boolean }) {
  const first = VALLEY_STARTS.includes(start as (typeof VALLEY_STARTS)[number])
    ? (start as PlaceId | 'valley')
    : 'valley';
  const [tab, setTab] = useState<Place>(
    first !== 'valley' && isOpenPlace(first) ? PLACE_TAB[first] : 'home',
  );
  const [homeAt, setHomeAt] = useState<HomeAt>(
    first === 'house' || first === 'school' || first === 'bonfire' ? first : 'valley',
  );
  const [focus, setFocus] = useState<PlaceId | null>(null);
  const [gone, setGone] = useState(false);
  const input = homeInput('busy', false);
  const view = viewOf(tab, homeAt);
  const at = view.kind === 'valley' ? null : view.place;
  const open = (id: PlaceId): void => {
    if (isOpenPlace(id)) {
      setHomeAt(id === 'house' ? 'house' : 'valley');
      setTab(PLACE_TAB[id]);
    } else {
      setHomeAt(id);
      setTab('home');
    }
  };
  const room: Parameters<typeof LivingRoom>[0] = {
    residents: RESIDENTS,
    selfId: ROOM_SELF_ID,
    instanceId: 'workbench',
    scene: sceneOf('day'),
    forecast: input.forecast,
    ownLoungeXp: 34,
  };
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <div class="wb-valley">
        <main class="card">
          <Hud
            title={titleOf(at)}
            balances={{ bait: 1240, essence: 36 }}
            helpRef={NO_REF}
            onHelp={NOTHING}
            onSettings={NOTHING}
          />
          <ValleyFrame
            view={view}
            creatures={input.creatures}
            trayInput={{ trips: input.trips, jobs: input.jobs, now: HOME_NOW }}
            focus={focus}
            onOpen={open}
            onLeave={() => {
              setFocus(at);
              setHomeAt('valley');
              setTab('home');
            }}
            onBook={setTab}
            notices={null}
            away={
              away && !gone ? (
                <AwayPaper
                  away={AWAY_SAMPLE}
                  onDismiss={() => {
                    setGone(true);
                  }}
                />
              ) : null
            }
            settings={null}
            room={<RoomBand room={room} />}
          >
            {tab === 'workshop' ? pageOf(creatureCardEntries, 'Workshop') : null}
          </ValleyFrame>
        </main>
      </div>
    </PopoverHost>
  );
}
