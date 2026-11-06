import { useState } from 'preact/hooks';
import { Hud } from '../../Hud';
import { PopoverHost, useCreatureViewer } from '../../PopoverHost';
import { WelcomeBack } from '../../valley/gazette/WelcomeBack';
import { samplePaper, VALLEY_PAPERS } from './paper-sample';
import type { Balances, Creature, ValleyVisit } from '../../api';
import type { KitName, ValleySeatView } from '@creatures/game';
import { homeAlerts } from '../../home-view';
import type { Place } from '../../tabs';
import { GEAR_STATE, SAMPLE_GEAR } from '../../creature-card-sample';
import type { GearActions } from '../../gear-actions';
import type { OrderRequest } from '../../api';
import type { ValleyAnvilView, ValleyCommonsView, ValleyOrderView } from '@creatures/game';
import { SignpostSeats, type SignpostStart } from '../../valley/SignpostSeats';
import type { CommonsActions, CommonsStart } from '../../valley/CommonsBoard';
import {
  COMMONS_PRESETS,
  presetCommons,
  sampleCommons,
  withCommons,
} from '../../valley/commons-sample';
import {
  MARKET_PRESETS,
  presetMarket,
  withMarket,
  withMarketPlace,
} from '../../valley/market-sample';
import type { MarketActions, MarketStart } from '../../valley/MarketPage';
import {
  fullFloor,
  sampleAnvil,
  sampleOrder,
  shardWait,
  withAnvils,
} from '../../valley/forge-sample';
import { SHARD_ELEMENTS } from '../../valley/forge-view';
import type { ForgeStart } from '../../valley/ForgeAnvils';
import { Workshop, type ForgeMode } from '../../Workshop';
import { ValleyFrame } from '../../valley/ValleyFrame';
import { SAMPLE_PLACES, sampleSeat, sampleValley } from '../../valley/signpost-sample';
import { fitsPlace } from '../../valley/signpost-view';
import { trayStates } from '../../valley/tray-state';
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
  'signpost',
  'market',
] as const;

/** How the demo's valley systems stand: off (the Bonfire is "not open yet"), a small roster resting, or a big one. */
export const VALLEY_RESTING = ['off', 'few', 'many'] as const;
export { VALLEY_PAPERS };

/** How the demo's scouts stand: systems off, no seat bought, one scout out, two out, or a full pack among two. */
export const VALLEY_SCOUTS = ['off', 'no seats', 'one scout', 'two scouts', 'a full pack'] as const;

/** How the demo's anvils stand (phase 5 step 3): systems off, no anvil bought, one smith at work, two anvils, a smith tinkering, a full floor. */
export const VALLEY_FORGE = [
  'off',
  'no anvils',
  'one smith',
  'two anvils',
  'tinkering',
  'full floor',
] as const;

/** What the Signpost's or the Forge's page has open at the start (a picker, a drawer), for the shots. */
export const VALLEY_OPEN = [
  'nothing',
  'scout picker',
  'destination',
  'kit',
  'pack and pace',
  'buy a seat',
  'order editor',
  'edit an order',
  'exchange',
  'floor and pace',
  'anvil kit',
  'smith picker',
  'buy an anvil',
  'bag filter',
  'give list',
  'give amount',
  'plaque',
  'collection',
  'helper picker',
  'fire numbers',
  'broker picker',
  'trade toward',
  'broker rates',
] as const;

/** How the demo's commons stand (phase 5 step 6b): off, a young server, a full collection, a grown fire, a bonfire at level 3, helpers posted. */
export const VALLEY_COMMONS = COMMONS_PRESETS;

/** How the demo's Market stands (phase 5 step 7): off, not open, being built, built with a free seat or a broker at work, stuck, or a Master. */
export const VALLEY_MARKET = MARKET_PRESETS;

/** What a `VALLEY_OPEN` setting opens on a project board at the start. */
function commonsStartOf(setting: string): (CommonsStart & { sheet?: boolean }) | undefined {
  switch (setting) {
    case 'give list':
      return { view: 'give', sheet: true };
    case 'give amount':
      return { view: 'give', row: 'acorns', sheet: true };
    case 'plaque':
      return { view: 'plaque', sheet: true };
    case 'collection':
      return { view: 'collection', sheet: true };
    case 'helper picker':
      return { view: 'seat', sheet: true };
    default:
      return undefined;
  }
}

/** A gift on the demo's commons, as the server takes it: a part fills, and a full project is built (the plaque gets the player, a keepsake is theirs). */
function giftDemo(
  commons: ValleyCommonsView,
  place: string,
  part: 'acorns' | 'scrap' | 'shards',
  units: number,
): ValleyCommonsView {
  const value = { acorns: 1, scrap: 0.5, shards: 2 }[part];
  return {
    ...commons,
    places: commons.places.map((p) => {
      if (p.id !== place || p.project === null) return p;
      const needs = { ...p.project.needs, [part]: Math.max(0, p.project.needs[part] - units) };
      const progress = Math.min(p.project.size, p.project.progress + units * value);
      const given = p.mine.given + units * value;
      if (needs.acorns <= 0 && needs.scrap <= 0 && needs.shards <= 0) {
        return {
          ...p,
          level: p.level + 1,
          state: 'building' as const,
          project: null,
          buildDaysLeft: 3,
          plaque: [...p.plaque, 'You'].sort(),
          keepsakes: p.keepsakes + 1,
          mine: { given: 0, shareBp: 0 },
        };
      }
      return {
        ...p,
        project: { ...p.project, needs, progress },
        mine: { given, shareBp: Math.round((given / Math.max(1, progress)) * 10_000) },
      };
    }),
  };
}

/** The seats of a scouts setting, the first two creatures of the roster posted. */
function scoutSeats(roster: readonly Creature[], scouts: string): ValleySeatView[] {
  const [a, b] = roster;
  if (a === undefined || b === undefined || scouts === 'off' || scouts === 'no seats') return [];
  const first = sampleSeat('seat-1', 'ember-caves', a.id, scouts === 'a full pack' ? 72 : 30, {
    fit: true,
    mastery: { hours: 60, step: 1, bonusBp: 500 },
    kit: 'satchel',
  });
  if (scouts === 'one scout') return [first];
  return [
    first,
    sampleSeat('seat-2', 'tidepools', b.id, scouts === 'a full pack' ? 55 : 12, { second: false }),
  ];
}

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
    online: [],
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

/** What a `VALLEY_OPEN` setting opens on the Signpost's page at the start. */
function openAtStart(setting: string): SignpostStart {
  switch (setting) {
    case 'scout picker':
      return { picker: 'seat-1' };
    case 'destination':
      return { where: 'seat-1' };
    case 'kit':
      return { kit: 'seat-1' };
    case 'pack and pace':
      return { detail: 'seat-1' };
    case 'buy a seat':
      return { buy: true };
    case 'give list':
      return { commons: { view: 'give' } };
    case 'give amount':
      return { commons: { view: 'give', row: 'acorns' } };
    case 'plaque':
      return { commons: { view: 'plaque' } };
    case 'collection':
      return { commons: { view: 'collection' } };
    case 'helper picker':
      return { commons: { view: 'seat' } };
    default:
      return {};
  }
}

/** What a `VALLEY_OPEN` setting opens on the Forge's page at the start. */
function forgeStartOf(setting: string): ForgeStart {
  switch (setting) {
    case 'floor and pace':
      return { floor: 'anvil-1' };
    case 'anvil kit':
      return { kit: 'anvil-1' };
    case 'smith picker':
      return { picker: 'anvil-1' };
    case 'buy an anvil':
      return { buy: true };
    case 'bag filter':
      return { bag: true };
    case 'fire numbers':
      return { fire: true };
    case 'give list':
      return { commons: { view: 'give' } };
    case 'give amount':
      return { commons: { view: 'give', row: 'acorns' } };
    case 'plaque':
      return { commons: { view: 'plaque' } };
    case 'collection':
      return { commons: { view: 'collection' } };
    case 'helper picker':
      return { commons: { view: 'seat' } };
    default:
      return {};
  }
}

/** What a `VALLEY_OPEN` setting opens on the Market's page at the start. */
function marketStartOf(setting: string): MarketStart | undefined {
  switch (setting) {
    case 'broker picker':
      return { picker: true };
    case 'trade toward':
      return { toward: true };
    case 'broker rates':
      return { detail: true };
    case 'exchange':
      return { exchange: true };
    default:
      return undefined;
  }
}

const BLUEPRINT = SAMPLE_GEAR.blueprints[0]?.baseId ?? 'kelp-cap';

/** The anvils of a forge setting, the first two creatures of the roster posted. */
function forgeAnvils(roster: readonly Creature[], forge: string): ValleyAnvilView[] {
  const [a, b] = roster;
  if (a === undefined || b === undefined || forge === 'off' || forge === 'no anvils') return [];
  switch (forge) {
    case 'one smith':
      return [
        sampleAnvil('anvil-1', a.id, [
          sampleOrder('order-1', BLUEPRINT, 3, { made: 1 }),
          sampleOrder('order-2', null, 1),
        ]),
      ];
    case 'tinkering':
      return [shardWait('anvil-1', a.id, BLUEPRINT, 5), sampleAnvil('anvil-2', b.id, [])];
    case 'full floor':
      return [fullFloor('anvil-1', a.id, BLUEPRINT), sampleAnvil('anvil-2', null, [])];
    default:
      return [
        sampleAnvil('anvil-1', a.id, [sampleOrder('order-1', BLUEPRINT, 3, { made: 1 })], {
          kit: 'tongs',
        }),
        sampleAnvil('anvil-2', b.id, [sampleOrder('order-2', null, 2, { reach: 'rare' })]),
      ];
  }
}

/** What the demo's shelf holds: scrap for some pieces and a few shards. */
const DEMO_SHELF = {
  scrap: 120,
  essence: 30,
  shards: { tide: 4, ember: 7, grove: 0, spark: 2, mire: 3 },
};

/** The orders after a request, as the server changes them (the demo has no server). */
function orderDemo(anvils: readonly ValleyAnvilView[], request: OrderRequest): ValleyAnvilView[] {
  return anvils.map((anvil) => {
    let orders: ValleyOrderView[] = anvil.orders;
    if (request.action === 'add' && anvil.id === request.seatId) {
      const n = anvils.flatMap((x) => x.orders).length + 1;
      orders = [
        ...orders,
        sampleOrder(
          `order-${String(n)}`,
          'forTeam' in request ? null : request.blueprintId,
          'forTeam' in request ? 1 : request.count,
          { reach: request.reach ?? 'none' },
        ),
      ];
    } else if (request.action === 'edit') {
      orders = orders.map((o) =>
        o.id === request.orderId
          ? {
              ...o,
              count: request.count ?? o.count,
              reach: request.reach ?? o.reach,
              needs: {
                ...o.needs,
                essence: { none: 0, rare: 25, epic: 70 }[request.reach ?? o.reach],
              },
            }
          : o,
      );
    } else if (request.action === 'remove') {
      orders = orders.filter((o) => o.id !== request.orderId);
    }
    return orders === anvil.orders ? anvil : { ...anvil, orders };
  });
}

/** A post or a move on the demo's seats, as the server does it: a creature at another seat swaps; a new place empties the pack. */
function postDemo(
  seats: readonly ValleySeatView[],
  creatures: readonly Creature[],
  body: { seatId: string; creatureId?: string | null; destination?: string },
): ValleySeatView[] {
  const target = seats.find((s) => s.id === body.seatId);
  if (target === undefined) return [...seats];
  const place = (id: string) => SAMPLE_PLACES.find((p) => p.id === id);
  const fits = (creatureId: string | null, destination: string): boolean => {
    const creature = creatures.find((c) => c.id === creatureId);
    return creature !== undefined && fitsPlace(creature, place(destination));
  };
  return seats.map((s) => {
    let next = s;
    if (
      s.id === target.id &&
      body.destination !== undefined &&
      body.destination !== s.destination
    ) {
      next = sampleSeat(s.id, body.destination, s.creatureId, 0, { kit: s.kit });
    }
    if (body.creatureId !== undefined) {
      const left =
        s.id === target.id
          ? body.creatureId
          : s.creatureId === body.creatureId
            ? target.creatureId
            : s.creatureId;
      if (left !== s.creatureId) {
        next = sampleSeat(next.id, next.destination, left, left === null ? 0 : 12, {
          kit: next.kit,
        });
      }
    }
    return { ...next, fit: next.creatureId !== null && fits(next.creatureId, next.destination) };
  });
}

/** `restingVisit` with the scouts: the seats, their prices and kit, and each creature's state at its seat. */
function demoVisit(
  creatures: readonly Creature[],
  seats: readonly ValleySeatView[],
  owned: readonly KitName[],
): ValleyVisit {
  const rest = restingVisit(creatures, 120);
  const sv = sampleValley(creatures, seats, { kit: { owned: [...owned], price: 875 } });
  return {
    ...rest,
    creatures: rest.creatures.map((c, i) => {
      const s = sv.creatures[i];
      return s === undefined ? c : { ...c, state: s.state, seatId: s.seatId };
    }),
    seats: sv.seats,
    seatPrices: sv.seatPrices,
    kit: sv.kit,
    places: sv.places,
    night: sv.night,
    special: sv.special,
  };
}

const NOTHING = () => undefined;
/** The Workshop's buttons do nothing here (the bag's and the blueprints' flows have their own workbench pages). */
const DEMO_GEAR_ACTIONS: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  checkDismantle: () => Promise.resolve({ locked: [] }),
  dismantlePile: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
};
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
  scouts = 'off',
  open: opened = 'nothing',
  forge = 'off',
  commons = 'off',
  market = 'off',
  paper = 'off',
}: {
  start: string;
  away: boolean;
  day: string;
  resting: string;
  /** The Signpost's scouts (phase 5 step 2): one of `VALLEY_SCOUTS`. */
  scouts?: string;
  /** What the Signpost's page has open at the start: one of `VALLEY_OPEN`. */
  open?: string;
  /** The Forge's anvils (phase 5 step 3): one of `VALLEY_FORGE`. */
  forge?: string;
  /** The commons (phase 5 step 6b): one of `VALLEY_COMMONS`. */
  commons?: string;
  /** The Market and its broker (phase 5 step 7): one of `VALLEY_MARKET`. */
  market?: string;
  /** The welcome-back Gazette on the server's paper (phase 5 step 4): one of `VALLEY_PAPERS`. */
  paper?: string;
}) {
  const first = VALLEY_STARTS.includes(start as (typeof VALLEY_STARTS)[number])
    ? (start as PlaceId | 'valley')
    : 'valley';
  const [tab, setTab] = useState<Place>(
    first !== 'valley' && isOpenPlace(first) ? PLACE_TAB[first] : 'home',
  );
  const [homeAt, setHomeAt] = useState<HomeAt>(
    first === 'house' || first === 'school' || first === 'bonfire' || first === 'market'
      ? first
      : 'valley',
  );
  const [focus, setFocus] = useState<PlaceId | null>(null);
  const [gone, setGone] = useState(false);
  // The purse while the welcome-back numbers count up.
  const [purse, setPurse] = useState<Balances | null>(null);
  const planned = homeInput(day, true);
  const scoutsOn = scouts !== 'off';
  const forgeOn = forge !== 'off';
  const marketOn = market !== 'off';
  const commonsOn = commons !== 'off' || marketOn;
  // With the valley's systems on the roster rests at the fire, and the allowance brought some Acorns home. The scouts' demo
  // frees every creature of its trips and jobs (a creature cannot scout and be away).
  const base =
    resting === 'off' && !scoutsOn && !forgeOn && !commonsOn
      ? planned
      : {
          ...planned,
          creatures: restingRoster(planned.creatures, resting === 'off' ? 'many' : resting).map(
            (c) => (scoutsOn || forgeOn || commonsOn ? { ...c, busy: null, away: false } : c),
          ),
        };
  // The seats and kit live here, so the Signpost's page can be played with in the workbench (no server).
  const [seats, setSeats] = useState<ValleySeatView[]>(() => scoutSeats(base.creatures, scouts));
  const [owned, setOwned] = useState<KitName[]>(scouts === 'off' ? [] : ['satchel']);
  const [acorns, setAcorns] = useState(PURSE.bait);
  // The anvils, the shelf and the shards live here too, so the Forge's page can be played with.
  const [anvils, setAnvils] = useState<ValleyAnvilView[]>(() => forgeAnvils(base.creatures, forge));
  const [shelf, setShelf] = useState(DEMO_SHELF);
  // The commons live here too: a gift fills the project, a helper stands at its seat.
  const [block, setBlock] = useState<ValleyCommonsView | null>(() => {
    const own = presetCommons(commons, base.creatures);
    return marketOn ? withMarketPlace(own ?? sampleCommons(), market) : own;
  });
  // The broker's seat (phase 5 step 7): its creature and what it trades toward live here too.
  const [brokerSeat, setBrokerSeat] = useState(() => presetMarket(market, base.creatures));
  const systems = resting !== 'off' || scoutsOn || forgeOn || commonsOn;
  const scoutVisit = systems ? demoVisit(base.creatures, seats, owned) : null;
  const plainVisit =
    scoutVisit === null
      ? null
      : withAnvils(
          {
            ...scoutVisit,
            forge: {
              ...scoutVisit.forge,
              shelf,
              bag: { count: 34, cap: 200 },
            },
          },
          anvils,
        );
  const withBlock =
    plainVisit === null || block === null ? plainVisit : withCommons(plainVisit, block);
  const visit =
    withBlock === null || brokerSeat === null ? withBlock : withMarket(withBlock, brokerSeat);
  const marketActions: MarketActions = {
    post: (body) => {
      setBrokerSeat((now) =>
        now === null || now.seat === null
          ? now
          : { ...now, seat: { ...now.seat, creatureId: body.creatureId } },
      );
      return Promise.resolve(true);
    },
    exchange: ({ to, from, times }) => {
      const rate = visit?.forge.exchange.rate ?? 3;
      const pay =
        from ??
        [...SHARD_ELEMENTS]
          .filter((e) => e !== to)
          .sort((x, y) => shelf.shards[y] - shelf.shards[x])[0];
      if (pay === undefined || shelf.shards[pay as keyof typeof shelf.shards] < rate * times) {
        return Promise.resolve(false);
      }
      const key = pay as keyof typeof shelf.shards;
      setShelf({
        ...shelf,
        shards: {
          ...shelf.shards,
          [key]: shelf.shards[key] - rate * times,
          [to]: (shelf.shards[to as keyof typeof shelf.shards] ?? 0) + times,
        },
      });
      return Promise.resolve(true);
    },
    setToward: (_seatId, toward) => {
      setBrokerSeat((now) =>
        now === null || now.seat === null ? now : { ...now, seat: { ...now.seat, toward } },
      );
      return Promise.resolve(true);
    },
  };
  const commonsActions: CommonsActions | undefined =
    block === null
      ? undefined
      : {
          give: (place, row, units) => {
            if (row.part === 'acorns') setAcorns(acorns - units);
            else if (row.part === 'scrap') setShelf({ ...shelf, scrap: shelf.scrap - units });
            else if (row.element !== null) {
              const key = row.element as keyof typeof shelf.shards;
              setShelf({
                ...shelf,
                shards: { ...shelf.shards, [key]: shelf.shards[key] - units * row.per },
              });
            }
            setBlock(giftDemo(block, place, row.part, units));
            return Promise.resolve(true);
          },
          post: (place, creatureId) => {
            setBlock((now) =>
              now === null
                ? now
                : {
                    ...now,
                    communal: now.communal.map((c) => {
                      if (c.place === place) {
                        return {
                          ...c,
                          seatId: creatureId === null ? c.seatId : `communal-${place}`,
                          creatureId,
                        };
                      }
                      // A creature that stood at another seat swaps into the one this seat held.
                      return creatureId !== null && c.creatureId === creatureId
                        ? {
                            ...c,
                            creatureId:
                              now.communal.find((x) => x.place === place)?.creatureId ?? null,
                          }
                        : c;
                    }),
                  },
            );
            return Promise.resolve(true);
          },
        };
  const commonsStart = commonsStartOf(opened);
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
            {...(commonsActions === undefined
              ? {}
              : {
                  commons: commonsActions,
                  market: marketActions,
                  acorns,
                  ...(commonsStart === undefined ? {} : { commonsStart }),
                })}
            {...(marketStartOf(opened) === undefined
              ? {}
              : { marketStart: marketStartOf(opened) as MarketStart })}
            focus={focus}
            onOpen={open}
            onLeave={leave}
            onBook={setTab}
            notices={null}
            away={null}
            settings={null}
          >
            {tab === 'workshop' && !(forgeOn && visit !== null)
              ? pageOf(creatureCardEntries, 'Workshop')
              : null}
            {tab === 'workshop' && forgeOn && visit !== null && (
              <Workshop
                state={{ ...GEAR_STATE, creatures: [...base.creatures], balances: PURSE }}
                gear={SAMPLE_GEAR}
                failed={false}
                offset={0}
                busy={false}
                reveal={null}
                actions={DEMO_GEAR_ACTIONS}
                onRetry={NOTHING}
                onClaimed={NOTHING}
                onDismissReveal={NOTHING}
                forge={
                  {
                    visit,
                    trayInput: {
                      trips: base.trips,
                      jobs: base.jobs,
                      now: HOME_NOW,
                      ...trayStates(visit),
                    },
                    acorns,
                    ...(commonsActions === undefined ? {} : { commons: commonsActions }),
                    onOpenPaddock: () => {
                      open('paddock');
                    },
                    onOpenMarket: () => {
                      open('market');
                    },
                    start: forgeStartOf(opened),
                    ...(opened === 'order editor'
                      ? { orderStart: { anvilId: 'anvil-1', baseId: BLUEPRINT } }
                      : opened === 'edit an order'
                        ? { orderStart: { anvilId: 'anvil-1', orderId: 'order-1' } }
                        : {}),
                    actions: {
                      post: (body) => {
                        setAnvils((now) => {
                          const target = now.find((x) => x.id === body.seatId);
                          return now.map((x) =>
                            x.id === body.seatId
                              ? { ...x, creatureId: body.creatureId }
                              : x.creatureId === body.creatureId
                                ? { ...x, creatureId: target?.creatureId ?? null }
                                : x,
                          );
                        });
                        return Promise.resolve(true);
                      },
                      setKit: (seatId, kit) => {
                        setAnvils((now) => now.map((x) => (x.id === seatId ? { ...x, kit } : x)));
                        return Promise.resolve(true);
                      },
                      buyKit: (kit) => {
                        if (visit.kit.price > acorns) return Promise.resolve(false);
                        setAcorns(acorns - visit.kit.price);
                        setOwned((now) => [...now, kit]);
                        return Promise.resolve(true);
                      },
                      buyAnvil: () => {
                        const price = visit.anvilPrices.next;
                        if (price === null || price.acorns > acorns || price.scrap > shelf.scrap) {
                          return Promise.resolve(false);
                        }
                        setAcorns(acorns - price.acorns);
                        setShelf({ ...shelf, scrap: shelf.scrap - price.scrap });
                        setAnvils((now) => [
                          ...now,
                          sampleAnvil(`anvil-${String(now.length + 1)}`, null, []),
                        ]);
                        return Promise.resolve(true);
                      },
                      order: (request) => {
                        setAnvils((now) => orderDemo(now, request));
                        return Promise.resolve(true);
                      },
                    },
                  } satisfies ForgeMode
                }
              />
            )}
            {tab === 'expeditions' && visit !== null && (
              <SignpostSeats
                visit={visit}
                creatures={base.creatures}
                trayInput={{
                  trips: base.trips,
                  jobs: base.jobs,
                  now: HOME_NOW,
                  ...trayStates(visit),
                }}
                acorns={acorns}
                busy={false}
                start={openAtStart(opened)}
                {...(commonsActions === undefined ? {} : { commons: commonsActions })}
                onOpenPaddock={() => {
                  open('paddock');
                }}
                actions={{
                  post: (body) => {
                    setSeats((now) => postDemo(now, base.creatures, body));
                    return Promise.resolve(true);
                  },
                  setKit: (seatId, kit) => {
                    setSeats((now) => now.map((s) => (s.id === seatId ? { ...s, kit } : s)));
                    return Promise.resolve(true);
                  },
                  buySeat: () => {
                    const price = visit.seatPrices.next;
                    if (price === null || price > acorns) return Promise.resolve(false);
                    setAcorns(acorns - price);
                    setSeats((now) => [
                      ...now,
                      sampleSeat(`seat-${String(now.length + 1)}`, 'tidepools', null, 0),
                    ]);
                    return Promise.resolve(true);
                  },
                  buyKit: (kit) => {
                    if (visit.kit.price > acorns) return Promise.resolve(false);
                    setAcorns(acorns - visit.kit.price);
                    setOwned((now) => [...now, kit]);
                    return Promise.resolve(true);
                  },
                }}
              />
            )}
          </ValleyFrame>
          {paper !== 'off' && (
            <WelcomeBack
              away={null}
              world={{
                creatures: input.creatures,
                items: null,
                blueprints: null,
                tray: { trips: input.trips, jobs: input.jobs, now: HOME_NOW },
                games: input.games,
                raid: input.raid,
              }}
              now={HOME_NOW}
              timezone={HOME_TZ}
              balances={PURSE}
              paper={gone ? null : samplePaper(paper, input.creatures, HOME_NOW)}
              onClosePaper={() => {
                setGone(true);
              }}
              onPushOn={() => Promise.resolve(true)}
              onDismiss={() => undefined}
              onPurse={setPurse}
            />
          )}
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
