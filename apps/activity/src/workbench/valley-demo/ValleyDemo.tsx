import { useState } from 'preact/hooks';
import { Hud } from '../../Hud';
import { PopoverHost, useCreatureViewer } from '../../PopoverHost';
import { WelcomeBack } from '../../valley/gazette/WelcomeBack';
import type { Balances, Creature, ValleyVisit } from '../../api';
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

/** How the demo's valley systems stand: off (the Bonfire is "not open yet"), a small roster resting, or a big one. */
export const VALLEY_RESTING = ['off', 'few', 'many'] as const;

/** The creatures of a resting roster: `few` is four of the day's, `many` is fourteen (the day's, then copies at other levels). */
function restingRoster(all: readonly Creature[], resting: string): Creature[] {
  if (resting === 'few') return all.slice(0, 4);
  const out = [...all];
  for (let i = 0; out.length < 14; i += 1) {
    const from = all[i % all.length];
    if (from === undefined) break;
    out.push({ ...from, id: `${from.id}-r${String(i)}`, level: 3 + ((i * 5) % 17) });
  }
  return out;
}

/** The server's `valley` block for a roster: everyone rests, each with a gain this visit (a few at their cap with none). */
function restingVisit(creatures: readonly Creature[], brought: number): ValleyVisit {
  return {
    settledAt: HOME_NOW,
    arrived: true,
    awayHours: 9,
    creatures: creatures.map((c, i) => ({
      id: c.id,
      state: 'resting' as const,
      gained: i % 5 === 4 ? 0 : 20 + ((i * 37) % 160),
      catchUpBp: 10000,
      seatId: null,
    })),
    allowance: { store: 0, cap: 480, brought },
    seats: [],
    anvils: [],
    anvilPrices: {
      owned: 0,
      max: 2,
      next: { acorns: 0, scrap: 0 },
      ladder: [
        { acorns: 0, scrap: 0 },
        { acorns: 123, scrap: 38 },
      ],
    },
    forge: {
      shelf: { scrap: 0, essence: 0, shards: { tide: 0, ember: 0, grove: 0, spark: 0, mire: 0 } },
      bag: { count: 0, cap: 200 },
      fireLevel: 1,
      exchange: { rate: 3, critBp: 1000, critYield: 2 },
      queueMax: 3,
      orderCountMax: 99,
    },
    seatPrices: { owned: 0, max: 2, next: 0, ladder: [0, 113] },
    kit: { owned: [], price: 875 },
    places: [],
    night: false,
    special: null,
  };
}

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

export function ValleyDemo({
  start,
  away,
  day,
  resting,
}: {
  start: string;
  away: boolean;
  day: string;
  resting: string;
}) {
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
  const planned = homeInput(day, true);
  // With the valley's systems on the roster rests at the fire, and the allowance brought some Acorns home.
  const base =
    resting === 'off'
      ? planned
      : { ...planned, creatures: restingRoster(planned.creatures, resting) };
  const visit = resting === 'off' ? null : restingVisit(base.creatures, 120);
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
    dungeonPhase: day === 'nothing going on' ? 'none' : 'ready',
    waiting: WAITING.slice(0, base.pending),
  };
  const view = viewOf(tab, homeAt);
  const at = view.kind === 'valley' ? null : view.place;
  const leave = (): void => {
    setFocus(at);
    setHomeAt('valley');
    setTab('home');
  };
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
            {...(view.kind === 'valley'
              ? {}
              : { back: { label: 'Back to the valley', onBack: leave } })}
          />
          <ValleyFrame
            view={view}
            creatures={input.creatures}
            trayInput={{ trips: input.trips, jobs: input.jobs, now: HOME_NOW }}
            alerts={homeAlerts(input)}
            placeInput={input}
            castExtra={castExtra}
            visit={visit}
            focus={focus}
            onOpen={open}
            onLeave={leave}
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
              brought={visit === null ? 0 : visit.allowance.brought}
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
