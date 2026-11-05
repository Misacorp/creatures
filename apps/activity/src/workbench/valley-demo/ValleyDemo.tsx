import { useState } from 'preact/hooks';
import { Hud } from '../../Hud';
import { PopoverHost, useCreatureViewer } from '../../PopoverHost';
import { WelcomeBack } from '../../valley/gazette/WelcomeBack';
import type { Balances } from '../../api';
import { homeAlerts } from '../../home-view';
import type { Place } from '../../tabs';
import { ValleyFrame } from '../../valley/ValleyFrame';
import type { CastExtra } from '../../valley/place-cast';
import { isOpenPlace, PLACE_TAB, viewOf, type HomeAt } from '../../valley/valley-nav';
import { placeOf, type PlaceId } from '../../valley/valley-art';
import { sampleGearItem } from '../gear-sample';
import { creatureCardEntries } from '../entries/creature-card';
import { AWAY_SAMPLE, HOME_NOW, HOME_TZ, homeInput } from '../home-sample';
import type { Entry } from '../types';

/**
 * The valley shell in the game's frame (dev only): the real HUD and `ValleyFrame` with the game's own tab-to-place
 * rules (`viewOf`), on fixture data. `start` is where it opens: the map, a place (a page of the game), or a place
 * that is not open yet; tapping around works as in the game, minus the loading.
 */
export const VALLEY_STARTS = [
  'valley',
  'forge',
  'paddock',
  'house',
  'cave',
  'arena',
  'fair',
  'school',
  'bonfire',
] as const;

const NOTHING = () => undefined;
const PURSE: Balances = { bait: 1240, essence: 36 };
const NO_REF = { current: null };
const WAITING = [
  { id: 'w1', species: 'cindle', shiny: false },
  { id: 'w2', species: 'lanternfin', shiny: false },
  { id: 'w3', species: 'pyrelynx', shiny: false },
];

function pageOf(entries: readonly Entry[], name: string) {
  const entry = entries.find((e) => e.name === name);
  if (entry === undefined) return <p class="muted">No workbench page named {name}.</p>;
  return <>{entry.render({ ...entry.defaults })}</>;
}

function titleOf(at: PlaceId | null): string {
  return at === null ? 'Valley' : placeOf(at).name;
}

/** The days the demo can show: what the places say on a busy day, a crowded one, with nothing waiting, and with nothing going on. */
export const VALLEY_DAYS = ['busy', 'crowded', 'nothing waiting', 'nothing going on'] as const;

/** Registers what "View" does, as the game does (here: the paddock's page). */
function DemoViewer({ onView }: { onView: () => void }) {
  useCreatureViewer(onView);
  return null;
}

export function ValleyDemo({ start, away, day }: { start: string; away: boolean; day: string }) {
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
  // The purse while the welcome-back numbers count up.
  const [purse, setPurse] = useState<Balances | null>(null);
  const base = homeInput(day, true);
  // What the scenes draw: the fixture creatures, standing where today's state puts them (a dungeon row, a raid party).
  const party = base.creatures.slice(0, 3).map((c) => c.id);
  const input = {
    ...base,
    raid:
      base.raid === null
        ? null
        : {
            ...base.raid,
            scene: {
              boss: { id: 'old-bogback', name: 'Old Bogback' },
              party: day === 'nothing going on' ? [] : party,
            },
          },
  };
  const castExtra: CastExtra = {
    dungeonTeam: day === 'nothing going on' ? null : base.creatures.slice(3, 6).map((c) => c.id),
    waiting: WAITING.slice(0, base.pending),
  };
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
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <DemoViewer
        onView={() => {
          open('paddock');
        }}
      />
      <div class="wb-valley">
        <main class="card">
          <Hud
            title={titleOf(at)}
            balances={purse ?? PURSE}
            helpRef={NO_REF}
            onHelp={NOTHING}
            onSettings={NOTHING}
          />
          <ValleyFrame
            view={view}
            creatures={input.creatures}
            trayInput={{ trips: input.trips, jobs: input.jobs, now: HOME_NOW }}
            alerts={homeAlerts(input)}
            placeInput={input}
            castExtra={castExtra}
            focus={focus}
            onOpen={open}
            onLeave={() => {
              setFocus(at);
              setHomeAt('valley');
              setTab('home');
            }}
            onBook={setTab}
            notices={null}
            away={null}
            settings={null}
          >
            {tab === 'workshop' ? pageOf(creatureCardEntries, 'Workshop') : null}
          </ValleyFrame>
          {away && (
            <WelcomeBack
              away={gone ? null : AWAY_SAMPLE}
              world={{
                // The raid's one creature and one piece, obtained inside the notice's window.
                creatures: input.creatures.map((c, i) =>
                  i === input.creatures.length - 1
                    ? { ...c, caughtAt: AWAY_SAMPLE.until - 3_600_000 }
                    : c,
                ),
                items: [
                  {
                    ...sampleGearItem({ id: 'away-1', baseId: 'kelp-cap', rarity: 'rare' }),
                    createdAt: AWAY_SAMPLE.until - 1_800_000,
                  },
                ],
                blueprints: [],
                tray: { trips: input.trips, jobs: input.jobs, now: HOME_NOW },
                games: input.games,
                raid: input.raid,
              }}
              now={HOME_NOW}
              timezone={HOME_TZ}
              balances={PURSE}
              onDismiss={() => {
                setGone(true);
              }}
              onPurse={setPurse}
            />
          )}
        </main>
      </div>
    </PopoverHost>
  );
}
