import { useEffect } from 'preact/hooks';
import { AppFrame } from '../../AppFrame';
import { RoomBand } from '../../AppHead';
import { BossCard } from '../../BossCard';
import { Hud } from '../../Hud';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { MainNav } from '../../MainNav';
import { PopoverHost } from '../../PopoverHost';
import { RaidTimeline } from '../../RaidTimeline';
import { DEFAULT_BOARD_SETTINGS } from '../../home/board';
import { HomePage } from '../../home/HomePage';
import { homeAlerts } from '../../home-view';
import { applyLook } from '../../looks';
import { navPlaces } from '../../nav-places';
import { useBar, useWide } from '../../ui/wide-layout';
import { ROOM_SELF_ID, SAMPLE_RAID, sampleResidents } from '../data';
import { creatureCardEntries } from '../entries/creature-card';
import { dungeonRunEntries } from '../entries/dungeon-run';
import { homePagesEntries } from '../entries/home-pages';
import { raidBoardEntries } from '../entries/raid-board';
import { slotEntries } from '../entries/slots';
import { homeInput } from '../home-sample';
import { DemoScreen } from '../main-nav-demo/screens';
import type { Entry } from '../types';

/**
 * The game's main screens in the game's real frame (dev only; imported by its workbench page alone): the real
 * `AppFrame` (the one `Game` draws) with the real `Hud`, the living room band on a wide window, the dock, bar or
 * rail and one screen on fixture data, inside a `main.card` like the app's. For screenshots under a look
 * (`scripts/screens.mjs`); open it bare (`workbench.html?frame=1&bare=1#c=GameScreens`) to see it as a window.
 */

export const SCREENS = [
  'home',
  'collection',
  'workshop',
  'journal',
  'expeditions',
  'dungeon',
  'raid',
  'games',
] as const;

export const DUNGEON_STATES = ['mid-run', 'setup'] as const;

const NO_REF = { current: null };
const NOTHING = () => undefined;
const RESIDENTS = sampleResidents(6, false);

/** One workbench page's own drawing of a component, on its defaults and the given props. */
function pageOf(entries: readonly Entry[], name: string, over: Record<string, string> = {}) {
  const entry = entries.find((e) => e.name === name);
  if (entry === undefined) return <p class="muted">No workbench page named {name}.</p>;
  return <>{entry.render({ ...entry.defaults, ...over })}</>;
}

/**
 * The Raid tab as `Raid` draws it for a player in a party, in its order (the week's timeline, the boss, the
 * roster), from the sample raid week. `Raid` itself loads its view from the server, so this is composed by hand.
 */
function RaidScreen({ forecast }: { forecast: ReturnType<typeof homeInput>['forecast'] }) {
  return (
    <>
      <RaidTimeline
        view={SAMPLE_RAID}
        serverNow={SAMPLE_RAID.serverNow}
        finale="before"
        owned={9}
        onAct={NOTHING}
        onReplay={NOTHING}
      />
      <BossCard view={SAMPLE_RAID} forecast={forecast} />
      {pageOf(raidBoardEntries, 'RaidBoard')}
    </>
  );
}

function Screen({
  place,
  wide,
  dungeon,
  forecast,
}: {
  place: string;
  wide: boolean;
  dungeon: string;
  forecast: ReturnType<typeof homeInput>['forecast'];
}) {
  switch (place) {
    case 'collection':
    case 'games':
    case 'expeditions':
      return <DemoScreen place={place} label="" wide={wide} />;
    case 'workshop':
      return pageOf(creatureCardEntries, 'Workshop');
    case 'journal':
      return pageOf(homePagesEntries, 'JournalPage');
    case 'dungeon':
      return dungeon === 'setup'
        ? pageOf(slotEntries, 'DungeonSetup')
        : pageOf(dungeonRunEntries, 'DungeonRun');
    case 'raid':
      return <RaidScreen forecast={forecast} />;
    default:
      return null;
  }
}

export function GameScreens({
  screen,
  look,
  dungeon,
}: {
  screen: string;
  look: string;
  dungeon: string;
}) {
  useEffect(() => {
    applyLook(look);
    return () => {
      applyLook('current');
    };
  }, [look]);
  const wide = useWide();
  const bar = useBar() && !wide;
  const input = homeInput('busy', true);
  const places = navPlaces(homeAlerts(input));
  const place = screen === 'home' ? 'home' : screen;
  const label =
    place === 'home' ? 'Home' : (places.find((p) => p.id === place)?.label ?? 'Creatures');
  const room: Parameters<typeof LivingRoom>[0] = {
    residents: RESIDENTS,
    selfId: ROOM_SELF_ID,
    instanceId: 'workbench',
    scene: sceneOf('day'),
    forecast: input.forecast,
    ownLoungeXp: 34,
  };
  const head = (
    <>
      <Hud
        title={label}
        balances={{ bait: 1240, essence: 36 }}
        helpRef={NO_REF}
        onHelp={NOTHING}
        onSettings={NOTHING}
      />
      {wide && <RoomBand room={room} />}
    </>
  );
  const nav = (
    <MainNav places={places} current={place} wide={wide} bar={bar} home onSelect={NOTHING} />
  );
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <main class="card">
        <AppFrame head={head} nav={nav}>
          {place === 'home' ? (
            <HomePage
              input={input}
              settings={DEFAULT_BOARD_SETTINGS}
              onGo={NOTHING}
              onHowTo={NOTHING}
              onDismissAway={NOTHING}
              {...(wide ? {} : { room: <RoomBand room={room} /> })}
            />
          ) : (
            <Screen place={place} wide={wide} dungeon={dungeon} forecast={input.forecast} />
          )}
        </AppFrame>
      </main>
    </PopoverHost>
  );
}
