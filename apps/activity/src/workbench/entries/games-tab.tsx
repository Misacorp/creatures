import { useMemo, useState } from 'preact/hooks';
import { CreatureGamesView } from '../../games/CreatureGamesRow';
import { EntryPicker } from '../../games/EntryPicker';
import { EntrySlot, EventCard } from '../../games/GamesParts';
import { GamesResults } from '../../games/GamesResults';
import { GamesTab, type GamesApi } from '../../games/GamesTab';
import { MedalCabinet } from '../../games/MedalCabinet';
import { PrizeStall } from '../../games/PrizeStall';
import { TrophyBoard } from '../../games/RoomTrophy';
import type { GamesView } from '../../games-types';
import { placeMedal, withSlot } from '../../games-view';
import { gamesXp } from '@creatures/game';
import {
  GAMES_FIXTURES,
  GAMES_SELF_ID,
  GAMES_VIEWS,
  SAMPLE_TEAM,
  gamesRoster,
  gamesView,
  type GamesViewName,
} from '../games-tab-sample';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const FILE = 'apps/activity/src/games/';

/** Answers like the server's, without a request: the entry is set on the view the page holds. */
function fakeApi(get: () => GamesView, set: (v: GamesView) => void): GamesApi {
  return {
    setEntry: (_day, eventId, creatureIds) => {
      const now = get();
      const next = { ...now.next, entries: { ...now.next.entries, [eventId]: [...creatureIds] } };
      if (creatureIds.length === 0) delete next.entries[eventId];
      set({ ...now, next });
      return Promise.resolve(next);
    },
    buy: () => Promise.resolve(GAMES_FIXTURES.stallBuy),
  };
}

function TabPreview({ p }: { p: Props }) {
  const name = str(p, 'view') as GamesViewName;
  const start = useMemo(() => gamesView(name), [name]);
  const [view, setView] = useState(start.view);
  const roster = useMemo(gamesRoster, []);
  let latest = view;
  const api = fakeApi(
    () => latest,
    (v) => {
      latest = v;
      setView(v);
    },
  );
  return (
    <GamesTab
      view={view}
      failed={false}
      creatures={roster}
      selfId={GAMES_SELF_ID}
      offset={start.offset}
      onView={setView}
      onReload={() => undefined}
      onPurchased={() => undefined}
      api={api}
    />
  );
}

const gamesTab: Entry = {
  name: 'GamesTab',
  file: `${FILE}GamesTab.tsx`,
  group: 'Creatures & game pieces',
  description:
    'The Games tab on the real captured server answers (fixtures/games-*.json): the title and countdown, your last show, the events of the day with their slots (tap one for the picker; picks act on the page; an entered good fit wears the "Good fit" badge; a favour icon says what it means in that event), the medal cabinet and the Prize Stall; from the lock the stands; during the show (and a replay) only the show, edge to edge on a phone. Covers GamesHeader and Lineup.',
  covers: ['GamesHeader', 'Lineup'],
  controls: { view: { kind: 'select', options: GAMES_VIEWS } },
  defaults: { view: 'entries: one entered' },
  presets: GAMES_VIEWS.map((v) => ({ name: v, props: { view: v } })),
  render: (p) => <TabPreview key={str(p, 'view')} p={p} />,
};

const LINEUP = GAMES_FIXTURES.entries.next.lineup;
const EVENT_IDS = LINEUP.map((e) => e.id);
/** The first event of the sample lineup that favours small creatures. */
const SMALL_EVENT = LINEUP.find((e) => e.favours.includes('small'))?.id ?? EVENT_IDS[0] ?? '';

function CardPreview({ p }: { p: Props }) {
  const roster = useMemo(gamesRoster, []);
  const base = GAMES_FIXTURES.entries.next;
  const event = LINEUP.find((e) => e.id === str(p, 'event')) ?? LINEUP[0];
  if (event === undefined) return null;
  const filled = num(p, 'filled');
  const ids = roster.slice(0, filled).map((c) => c.id);
  const next = {
    ...base,
    open: !bool(p, 'locked'),
    entries: ids.length === 0 ? {} : { [event.id]: event.team === 3 ? ids : ids.slice(0, 1) },
    // The first entered creature is a good fit unless the preset says otherwise.
    goodFit: { [event.id]: bool(p, 'goodFit') ? ids.slice(0, 1) : [] },
  };
  return (
    <ul class="ge-cards">
      <EventCard
        event={event}
        next={next}
        creatures={roster}
        onSlot={next.open ? () => undefined : undefined}
      />
    </ul>
  );
}

const eventCard: Entry = {
  name: 'EventCard',
  file: `${FILE}GamesParts.tsx`,
  group: 'Creatures & game pieces',
  description:
    'One event of the Games lineup: its scene as a strip, the name, what it favours as icons (tap one: the icon, the favour and what it means in this event, with a link to the Games in How to play), and its slot, or three for the team event, each a creature (with the "Good fit" badge when the server says it suits the event) or an empty "+". Covers FavourIcons, GoodFitMark, EventBadge and BadgeShelf (seen on the EntryPicker and CreatureGamesView pages), EventThumb and the medal pictures (MedalCountsRow, MedalSprite, PinSprite).',
  covers: [
    'FavourIcons',
    'GoodFitMark',
    'EventBadge',
    'BadgeShelf',
    'EventThumb',
    'MedalCountsRow',
    'MedalSprite',
    'PinSprite',
  ],
  controls: {
    event: { kind: 'select', options: EVENT_IDS },
    filled: { kind: 'number', min: 0, max: 3 },
    goodFit: { kind: 'toggle' },
    locked: { kind: 'toggle' },
  },
  defaults: { event: EVENT_IDS[0] ?? '', filled: 1, goodFit: true, locked: false },
  presets: [
    { name: 'Entered, a good fit', props: {} },
    { name: 'Entered, not a good fit', props: { goodFit: false } },
    { name: 'Empty', props: { filled: 0 } },
    { name: 'Team event, two of three', props: { event: SAMPLE_TEAM, filled: 2 } },
    { name: 'Team event, full', props: { event: SAMPLE_TEAM, filled: 3 } },
    { name: 'Locked (after 13:37)', props: { locked: true } },
    ...LINEUP.map((e) => ({ name: `Scene: ${e.name}`, props: { event: e.id } })),
  ],
  render: (p) => <CardPreview p={p} />,
};

function SlotPreview({ p }: { p: Props }) {
  const roster = useMemo(gamesRoster, []);
  const creature = bool(p, 'empty') ? null : (roster[num(p, 'creature')] ?? null);
  return (
    <div class="ge-slots">
      <EntrySlot
        creature={creature}
        goodFit={creature !== null && bool(p, 'goodFit')}
        compact={bool(p, 'compact')}
        label="Melon Run"
        onOpen={bool(p, 'locked') ? undefined : () => undefined}
      />
    </div>
  );
}

const entrySlot: Entry = {
  name: 'EntrySlot',
  file: `${FILE}GamesParts.tsx`,
  group: 'Slots',
  description:
    'One entry slot of a Games event: the creature, its name in its rarity colour and the "Good fit" badge when it suits the event, or a dashed "+" to fill; a button while entries are open, a plain box after the lock.',
  controls: {
    empty: { kind: 'toggle' },
    creature: { kind: 'number', min: 0, max: 5 },
    goodFit: { kind: 'toggle' },
    compact: { kind: 'toggle' },
    locked: { kind: 'toggle' },
  },
  defaults: { empty: false, creature: 1, goodFit: true, compact: false, locked: false },
  presets: [
    { name: 'Filled, a good fit', props: {} },
    { name: 'Filled, not a good fit', props: { goodFit: false } },
    { name: 'Empty', props: { empty: true } },
    { name: 'Team seat', props: { compact: true } },
    { name: 'Locked', props: { locked: true } },
  ],
  render: (p) => <SlotPreview p={p} />,
};

/** The sample roster (all young) plus an evolved creature and a single-stage line: both sizes. */
function mixedRoster() {
  const roster = gamesRoster();
  const first = roster[0];
  if (first === undefined) return roster;
  return [
    ...roster,
    { ...first, id: 'wb-evolved', species: 'tidewing', nickname: null, level: 14 },
    { ...first, id: 'wb-single', species: 'lanternfin', nickname: null, level: 10 },
  ];
}

function PickerPreview({ p }: { p: Props }) {
  const mixed = bool(p, 'mixed');
  const roster = useMemo(() => (mixed ? mixedRoster() : gamesRoster()), [mixed]);
  const event = LINEUP.find((e) => e.id === str(p, 'event')) ?? LINEUP[0];
  if (event === undefined) return null;
  const ids = roster.map((c) => c.id);
  const next = {
    ...GAMES_FIXTURES.entries.next,
    // The captured good fits (two or three, as in a typical roster), and a badge or two for this event.
    goodFit: {
      [event.id]: [
        ...(GAMES_FIXTURES.entries.next.goodFit[event.id] ?? []),
        ...(mixed ? ['wb-single'] : []),
      ],
    },
    badges: bool(p, 'badges') ? { [event.id]: { [ids[3] ?? '']: 3, [ids[4] ?? '']: 1 } } : {},
    entries: bool(p, 'others')
      ? {
          [LINEUP.find((e) => e.id !== event.id)?.id ?? '']: [roster[5]?.id ?? ''],
          [event.id]: withSlot([], 0, roster[0]?.id ?? null),
        }
      : {},
  };
  return (
    <EntryPicker
      event={event}
      slot={0}
      next={next}
      creatures={roster}
      busy={false}
      onPick={() => undefined}
      onClear={() => undefined}
      onClose={() => undefined}
    />
  );
}

const entryPicker: Entry = {
  name: 'EntryPicker',
  file: `${FILE}EntryPicker.tsx`,
  group: 'Creatures & game pieces',
  description:
    'The picker of a Games entry slot: a drawer with the event, its favours and teaser line, your creatures with the good fits first (each with the green "Good fit" badge at the right; no scores), the rest by name; a creature that has won this event shows its badge and win count beside its name; one in another event says so, and a tap moves it; Clear when the slot is filled. When the event favours small or big creatures, each creature of that size shows the favour’s glyph at the right ("mixed" adds an evolved creature and a single-stage line, both big).',
  controls: {
    event: { kind: 'select', options: EVENT_IDS },
    others: { kind: 'toggle' },
    mixed: { kind: 'toggle' },
    badges: { kind: 'toggle' },
  },
  defaults: { event: EVENT_IDS[0] ?? '', others: true, mixed: false, badges: true },
  presets: [
    { name: 'Filled, one creature in another event', props: {} },
    { name: 'Nothing entered yet', props: { others: false } },
    { name: 'No badges won yet', props: { badges: false } },
    { name: 'The team event', props: { event: SAMPLE_TEAM } },
    {
      name: 'Favours small, both sizes in the roster',
      props: { event: SMALL_EVENT, others: false, mixed: true },
    },
  ],
  render: (p) => <PickerPreview p={p} />,
};

const medalCabinet: Entry = {
  name: 'MedalCabinet',
  file: `${FILE}MedalCabinet.tsx`,
  group: 'Creatures & game pieces',
  description:
    'Your Valley Games medals: lifetime gold, silver, bronze and pins as pictures with counts, your medal points for the Prize Stall, then the server’s medal table with you highlighted.',
  controls: {
    you: { kind: 'select', options: ['none yet', 'after a show'] },
    board: { kind: 'toggle' },
  },
  defaults: { you: 'after a show', board: true },
  presets: [
    { name: 'After a show, with the table', props: {} },
    { name: 'No medals yet', props: { you: 'none yet', board: false } },
  ],
  render: (p) => {
    const after = gamesView('after: results and the next lineup').view;
    return (
      <MedalCabinet
        you={str(p, 'you') === 'none yet' ? GAMES_FIXTURES.entries.you : after.you}
        board={bool(p, 'board') ? after.board : []}
        selfId={GAMES_SELF_ID}
      />
    );
  },
};

function StallPreview({ p }: { p: Props }) {
  const [dismissed, setDismissed] = useState(false);
  const open = bool(p, 'open');
  const which = str(p, 'purchase');
  const purchase =
    which === 'gear'
      ? GAMES_FIXTURES.stallBuy.purchase
      : which === 'bait'
        ? GAMES_FIXTURES.stallBuyBait.purchase
        : null;
  const stall = open
    ? { ...GAMES_FIXTURES.stallBuy.stall, offers: GAMES_FIXTURES.stallBuy.stall.offers }
    : GAMES_FIXTURES.entries.stall;
  const now = open ? stall.opensAt + 3_600_000 : stall.opensAt - 26 * 3_600_000;
  return (
    <PrizeStall
      stall={stall}
      pocket={num(p, 'pocket')}
      serverNow={now}
      timezone="Europe/Helsinki"
      busy={false}
      purchase={dismissed ? null : purchase}
      onBuy={() => undefined}
      onDismissPurchase={() => {
        setDismissed(true);
      }}
    />
  );
}

const prizeStall: Entry = {
  name: 'PrizeStall',
  file: `${FILE}PrizeStall.tsx`,
  group: 'Loot & reveals',
  description:
    'The Valley Games Prize Stall: on Wednesdays bunting, your medal points and the offers (a picture, the name, the price in medal points, how many are left this week, Buy), with the prize just bought shown as every grant is; on other days a shuttered stall with when it opens and a countdown. Covers StallOfferTile and StallReveal.',
  covers: ['StallOfferTile', 'StallReveal'],
  controls: {
    open: { kind: 'toggle' },
    pocket: { kind: 'number', min: 0, max: 40 },
    purchase: { kind: 'select', options: ['none', 'gear', 'bait'] },
  },
  defaults: { open: true, pocket: 8, purchase: 'none' },
  presets: [
    { name: 'Open', props: {} },
    { name: 'Open, a gear prize just bought', props: { purchase: 'gear', pocket: 3 } },
    { name: 'Open, Bait just bought', props: { purchase: 'bait', pocket: 5 } },
    { name: 'Open, no medal points', props: { pocket: 0 } },
    { name: 'Closed (opens Wednesday)', props: { open: false } },
  ],
  render: (p) => <StallPreview p={p} />,
};

const gamesResults: Entry = {
  name: 'GamesResults',
  file: `${FILE}GamesResults.tsx`,
  group: 'Loot & reveals',
  description:
    'Your last Valley Games show: per event the medal (or your place), who went, a pin for a personal best and ▶ its replay, then the experience each creature earned as the shared XP rows, each with where it came from beside the name ("+50" for entering, the medal and its "+60", the pin and its "+15", or the place off the podium, "6th"), and ▶ Watch for the whole show. Covers ReplayButton and XpParts.',
  covers: ['ReplayButton', 'XpParts'],
  controls: {
    pin: { kind: 'toggle' },
    offPodium: { kind: 'toggle' },
    gold: { kind: 'toggle' },
  },
  defaults: { pin: true, offPodium: true, gold: false },
  presets: [
    { name: 'The captured show', props: { pin: false, offPodium: false } },
    { name: 'A pin and a place off the podium', props: {} },
    { name: 'Gold and a pin, and 6th in the team event', props: { gold: true } },
  ],
  render: (p) => {
    const f = GAMES_FIXTURES.after;
    const results = (f.you.lastResults?.results ?? []).map((r, i) => {
      const pins = bool(p, 'pin') && i === 0 ? r.creatureIds.slice(0, 1) : [];
      const place = bool(p, 'offPodium') && i === 1 ? 6 : bool(p, 'gold') && i === 0 ? 1 : r.place;
      const medal = placeMedal(place);
      // The experience as the server pays it: each creature its own, the entry's together.
      const xp = r.creatureIds.reduce(
        (sum, id) => sum + gamesXp(medal === null ? null : place, pins.includes(id)),
        0,
      );
      return { ...r, place, medal, pins, pin: pins.length > 0, xp };
    });
    return (
      <GamesResults
        results={results}
        lineup={f.show?.lineup ?? []}
        creatures={gamesRoster()}
        onReplay={() => undefined}
      />
    );
  },
};

const creatureGames: Entry = {
  name: 'CreatureGamesView',
  file: `${FILE}CreatureGamesRow.tsx`,
  group: 'Creatures & game pieces',
  description:
    'A creature’s Valley Games block on its page: its event badges (one medallion per event it has won, tinted by the event’s scene, with the event’s name and its wins; events never won are not shown), its medals (only the kinds it has) and its best score in each event it ran, in seconds, metres, peppers or laps. Nothing at all for a creature with none.',
  controls: { more: { kind: 'toggle' } },
  defaults: { more: false },
  presets: [
    { name: 'The captured creature', props: {} },
    { name: 'A seasoned one (badges from four events)', props: { more: true } },
  ],
  render: (p) => (
    <CreatureGamesView
      games={
        bool(p, 'more')
          ? {
              medals: { gold: 6, silver: 2, bronze: 4, pins: 5 },
              badges: [
                { eventId: 'melon-run', wins: 3 },
                { eventId: 'pepper-panic', wins: 1 },
                { eventId: 'sauna-showdown', wins: 1 },
                { eventId: 'log-carry', wins: 1 },
              ],
              records: [
                { eventId: 'melon-run', name: 'Melon Run', best: 42, unit: 'm', day: '2027-01-12' },
                {
                  eventId: 'sauna-showdown',
                  name: 'Sauna Showdown',
                  best: 61,
                  unit: 'ticks',
                  day: '2027-01-13',
                },
                {
                  eventId: 'pepper-panic',
                  name: 'Pepper Panic',
                  best: 7,
                  unit: 'peppers',
                  day: '2027-01-14',
                },
                {
                  eventId: 'shark-derby',
                  name: 'Shark Derby',
                  best: 150,
                  unit: 'centilaps',
                  day: '2027-01-15',
                },
              ],
            }
          : GAMES_FIXTURES.creature
      }
    />
  ),
};

const trophyBoard: Entry = {
  name: 'TrophyBoard',
  file: `${FILE}RoomTrophy.tsx`,
  group: 'Popovers',
  description:
    'The living room’s trophy shelf popover: the top three of the server’s medal table (you in gold) and a button to the Games tab. The shelf itself is on the LivingRoom page. Covers RoomTrophy.',
  covers: ['RoomTrophy'],
  controls: { empty: { kind: 'toggle' } },
  defaults: { empty: false },
  presets: [
    { name: 'Top three', props: {} },
    { name: 'No medals on the server yet', props: { empty: true } },
  ],
  render: (p) => (
    <div class="gm-demo">
      <TrophyBoard
        board={bool(p, 'empty') ? [] : gamesView('after: stall open').view.board}
        selfId={GAMES_SELF_ID}
        onOpen={() => undefined}
      />
    </div>
  ),
};

export const gamesTabEntries: readonly Entry[] = [
  gamesTab,
  eventCard,
  entrySlot,
  entryPicker,
  medalCabinet,
  prizeStall,
  gamesResults,
  creatureGames,
  trophyBoard,
];
