import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  buyAnvil,
  buyScoutSeat,
  closeGazette,
  setScoutDeep,
  chooseStarter,
  dismissAway,
  dismissLevelReset,
  exchangeShards,
  fetchState,
  giveToProject,
  postCommunal,
  setBroker,
  postOrder,
  postScout,
  scoutKit,
  setLoungeSpot,
  type Allowance,
  type Attention,
  type Balances,
  type ClaimResult,
  type Creature,
  type GameState,
  type LeetSyncStatus,
  type LoungeSpot,
  type LoungeXpPush,
  type SessionUser,
  type ValleyVisit,
} from './api';
import { ActionIds } from './actions';
import { allowanceNotice } from './allowance-text';
import { AppHead, RoomBand } from './AppHead';
import { AppFrame } from './AppFrame';
import {
  browserSettingsStorage,
  loadBoardSettings,
  saveBoardSettings,
} from './home/board-settings';
import type { BoardSettings } from './home/board';
import { SettingsPage } from './settings/SettingsPage';
import { serverNotifications } from './notifications-api';
import { HomeBook } from './home/HomeBook';
import { HomeScreen } from './home/HomeScreen';
import { Hud } from './Hud';
import { MainNav } from './MainNav';
import { navPlaces } from './nav-places';
import { useBar, useWide } from './ui/wide-layout';
import { Collection } from './Collection';
import { createCreatureActions } from './creature-actions';
import { LoungeSwap } from './LoungeSwap';
import type { CatchChoiceActions } from './find-view';
import { claimExpedition, pushOn, sendExpedition, type SendRequest } from './expedition-api';
import type { Trip } from './expedition-types';
import { Expeditions } from './Expeditions';
import { createGearActions } from './gear-actions';
import type { JobResult } from './gear-types';
import type { ChoiceResult } from './talent-types';
import { errorText } from './game';
import { loaded, type Loaded } from './loaded-state';
import type { ParticipantSource } from './participants';
import { applyLoungeXp, settleClaim } from './room-data';
import { Raid } from './Raid';
import { SYNC_POLL_INTERVAL_MS, shouldRefetchLeet } from './leet-status';
import { Dungeon } from './Dungeon';
import { GamesTab } from './games/GamesTab';
import { gamesAlert } from './games-view';
import { fetchCreatureGames } from './games-api';
import { useGames } from './use-games';
import type { DungeonPhase } from './dungeon-flow';
import type { Slots } from './dungeon-team';
import { chooseCatch } from './talent-api';
import { choiceResultText } from './talent-view';
import { DevPanelHost } from './DevPanelHost';
import { StarterPicker } from './StarterPicker';
import { navStateFor, type GoOptions } from './nav-state';
import { useCreatureViewer } from './PopoverHost';
import { DEFAULT_PLACE, NAV_HOME, isPlace, type Place } from './tabs';
import { useActionRunner } from './use-action-runner';
import { useForecast } from './use-forecast';
import { EquipHost } from './equip-from-card';
import { GearItemsContext } from './gear-items-context';
import type { GearItem } from './gear-types';
import { TreatTimesContext } from './TreatBox';
import { useGearState } from './use-gear-state';
import { useLoungePresence } from './use-lounge-presence';
import { useRaidGlance } from './use-raid-glance';
import { useRoomMode } from './use-room-mode';
import { useRoomPhase } from './use-room-phase';
import { scrollToTop } from './scroll-to';
import { useScrollTopOnChange } from './use-scroll-top';
import { useTabPips } from './use-tab-pips';
import { sceneOf, type LivingRoom } from './LivingRoom';
import { LevelResetCard } from './LevelResetCard';
import { WipeNotice } from './WipeNotice';
import { Workshop, type ForgeMode } from './Workshop';
import type { TeamConfigure } from './TeamCreaturePage';
import { Alert } from './ui/Alert';
import { WelcomeBack } from './valley/gazette/WelcomeBack';
import { ValleyFrame } from './valley/ValleyFrame';
import type { MarketActions, MarketStart } from './valley/MarketPage';
import { SignpostSeats, type SignpostActions } from './valley/SignpostSeats';
import type { CommonsActions } from './valley/CommonsBoard';
import { COMMONS_NAMES } from './valley/commons-view';
import { ANVIL_KIT_INFO, shardName } from './valley/forge-view';
import type { ForgeActions } from './valley/ForgeAnvils';
import { KIT_INFO } from './valley/signpost-view';
import { trayStates } from './valley/tray-state';
import { placeOf, type PlaceId } from './valley/valley-art';
import {
  PLACE_TAB,
  isOpenPlace,
  placeOfView,
  viewOf,
  type HomeAt,
  type ValleyView,
} from './valley/valley-nav';

/** Before the gear view has loaded. */
const NO_ITEMS: readonly GearItem[] = [];
const NO_CREATURES: readonly Creature[] = [];

export function Game({
  initial,
  user,
  participants,
  helpRef,
  onHelp,
  allowance,
  showPractice,
  devTools,
  loungeLive = false,
  valley = false,
  valleySystems = false,
}: {
  initial: GameState;
  /** The signed-in player (their id and display name put their own creature in the living room). */
  user: SessionUser;
  /** Who has the Activity open: the living room shows them. */
  participants: ParticipantSource;
  /** Where How to play's focus returns (the title row's "?" before a game, Settings' How to play in one) and what opens it (the app owns the page). */
  helpRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
  /** True on staging, where the server has the dev tools on: the debug panel loads (see `dev-gate.ts`). */
  devTools: boolean;
  /** The server offers the lounge's live socket (`loungeLive` of `/api/config`); the room polls without it. */
  loungeLive?: boolean;
  /** The server shows the valley shell (`valley` of `/api/config`): a map of places instead of the dock and tabs. */
  valley?: boolean;
  /** The valley's base systems are on (`valleySystems` of `/api/config`; phase 5): the Bonfire opens and creatures rest. */
  valleySystems?: boolean;
  /** True on staging and local runs, where the server can start a practice finale. */
  showPractice: boolean;
  /** The daily Bait allowance the server paid when the Activity opened; null when there is none to tell. */
  allowance: Allowance | null;
}) {
  const [current, setCurrent] = useState<Loaded>(() => loaded(initial));
  const { game, offset } = current;
  // Gear, parts, blueprints and jobs; null until the first load (or when it failed).
  const {
    gear,
    failed: gearFailed,
    load: loadGear,
    replace: replaceGear,
  } = useGearState(game.starterChosen);
  // The valley's sky for today and tomorrow (Boons and Omens); null until the first load (or when it failed).
  const { forecast, load: loadForecast } = useForecast(game.starterChosen, offset);
  // The Valley Games: the tab, its pip and the living room's trophy shelf; null until the first load.
  // A show's awards changed the creatures' experience: reload them, or the result rows draw old bars.
  const games = useGames(game.starterChosen, offset, () => {
    refreshState();
  });
  const [tab, setTab] = useState<Place>(DEFAULT_PLACE);
  // The raid's week times for Home, loaded when the game opens and whenever Home is shown (a failed load
  // leaves the raid rows out).
  const valleyOn = valley && game.starterChosen;
  // The valley shell: Home's tab is drawn as the map, the House's living room, or a place that is not open yet.
  const [homeAt, setHomeAt] = useState<HomeAt>('valley');
  // The Market's page opens its exchange on the shard a smith waits for when the Forge sends the player there (Q64); forgotten on leaving.
  const [marketStart, setMarketStart] = useState<MarketStart | undefined>(undefined);
  useEffect(() => {
    if (homeAt !== 'market') setMarketStart(undefined);
  }, [homeAt]);
  const { raid: raidGlance, adopt: adoptRaid } = useRaidGlance(
    game.starterChosen,
    // The valley keeps it "on Home" throughout: one load when it opens and the schedule's own timer, never one per
    // return to the map (the Arena's line reads it).
    valleyOn || tab === 'home',
    offset,
  );
  // The Settings page (from the cog in the HUD) is drawn in place of the screen; the screen stays mounted under it,
  // so Back finds it as it was. Choosing a place closes it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The purse while the welcome-back numbers fly in: it counts up to the total the server already holds (display only).
  const [purse, setPurse] = useState<Balances | null>(null);
  // The Home board's "?" pin: where the focus returns when How to play, opened from it, closes.
  const boardHelpRef = useRef<HTMLButtonElement>(null);
  // The Home board's display options, kept on this device (read once, written on every change).
  const [boardSettings, setBoardSettings] = useState<BoardSettings>(() =>
    loadBoardSettings(browserSettingsStorage()),
  );
  // The Creatures view opens with its "Needs you" filter on when the Home notice for creatures that need you opened it.
  const [creaturesNeeds, setCreaturesNeeds] = useState(false);
  // Every change of place goes through here: it also closes Settings and the Creatures "Needs you" filter
  // (unless asked), so no route leaves the old page's state behind.
  const goTo = (place: Place, opts?: GoOptions): void => {
    const next = navStateFor(place, opts);
    setTab(next.tab);
    setSettingsOpen(next.settingsOpen);
    setCreaturesNeeds(next.creaturesNeeds);
  };
  // Every change of place (dock, tray, rail, a Home notice) starts at the top of the new page.
  useScrollTopOnChange(tab);
  // The creature whose page the popover's "View" asked for: the Creatures page opens it, then clears this.
  const [viewing, setViewing] = useState<string | null>(null);
  // The place whose button takes the focus when the map comes back from its page.
  const [focusPlace, setFocusPlace] = useState<PlaceId | null>(null);
  const view: ValleyView = viewOf(tab, homeAt);
  const [reveal, setReveal] = useState<{ result: ClaimResult; trip: Trip | undefined } | null>(
    null,
  );
  const [jobReveal, setJobReveal] = useState<JobResult | null>(null);
  // What each duplicate answered this session became (a card id to a sentence), so a claim reveal can say
  // what happened to the cards it showed.
  const [settled, setSettled] = useState<Record<string, string>>({});
  // Bumped by the debug panel after a tool changed something: the view on screen loads afresh.
  const [devNonce, setDevNonce] = useState(0);
  /** The lounge swap sheet is open (from "Swap" in the popover of the player's own room creature). */
  const [swapping, setSwapping] = useState(false);
  // Counts player actions, so a background refresh that started before one is never applied.
  const actionCount = useRef(0);
  // Counts background state reloads, so only the newest one is applied.
  const refreshSeq = useRef(0);
  // One action at a time (a second tap in the same tick is turned away before `busy` renders).
  // Idempotency keys are reused when the outcome is unknown (network error) so a retry cannot spend
  // twice. After a definite "no" the state is reloaded, since the screen was probably out of date.
  const { busy, error, notice, setError, setNotice, inFlight, run, runKeyed } = useActionRunner({
    onStart: () => {
      actionCount.current += 1;
    },
    onStale: async () => {
      try {
        setCurrent(loaded(await fetchState()));
      } catch {
        // Keep the error; the next action reloads anyway.
      }
      loadGear();
    },
  });
  // The guild's timezone comes with GET /api/state only; the answers of actions leave it out, so it is kept.
  const timezone = useRef<string | null>(null);
  if (game.timezone !== null) timezone.current = game.timezone;
  // What needs the player (the tab pips) also comes with GET /api/state only, so the last known is
  // kept. The Dungeon and Raid screens write their own news into it at once (the last write wins).
  const [attention, setAttention] = useState<Attention | null>(initial.attention);
  useEffect(() => {
    if (game.attention !== null) setAttention(game.attention);
  }, [game.attention]);
  // The valley's resting creatures also come with GET /api/state only (and only with `VALLEY_SYSTEMS` on): kept like the pips.
  const [visit, setVisit] = useState<ValleyVisit | null>(initial.valley);
  useEffect(() => {
    if (game.valley !== null) setVisit(game.valley);
  }, [game.valley]);
  const systems = valleySystems ? visit : null;
  // The setup row of the Dungeon tab, kept while the player is on other tabs (lost on a reload).
  const dungeonDraft = useRef<Slots | null>(null);
  // The same row as state, so the valley's Cave scene can draw the team standing at the cave mouth (null until the
  // Dungeon page has reported one this session).
  const [dungeonTeam, setDungeonTeam] = useState<Slots | null>(null);
  // What the Dungeon page last said about today (a run in progress, one to start, neither); null until it has.
  const [dungeonPhase, setDungeonPhase] = useState<DungeonPhase | null>(null);

  // The daily allowance lands once (the server tells the player on one request only): say so on the
  // notice line, which the next action clears.
  useEffect(() => {
    const text = allowanceNotice(allowance);
    if (text !== null) setNotice(text);
  }, []);

  // While the first leet sync is still running, ask again every few seconds (a few times at most)
  // so the balance, the history and the currency popover's warning update as soon as the credits land.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (status: LeetSyncStatus | null, attempts: number): void => {
      if (cancelled || !shouldRefetchLeet(status, attempts)) return;
      timer = setTimeout(() => {
        const startedAt = actionCount.current;
        fetchState().then(
          (next) => {
            if (cancelled) return;
            if (!inFlight() && actionCount.current === startedAt) setCurrent(loaded(next));
            schedule(next.leetSync, attempts + 1);
          },
          () => {
            schedule(status, attempts + 1);
          },
        );
      }, SYNC_POLL_INTERVAL_MS);
    };
    schedule(initial.leetSync, 0);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  /** Shows the collection of an action's answer, if it had one. */
  function showState(next: GameState | undefined): void {
    if (next !== undefined) setCurrent(loaded(next));
  }

  /**
   * Reloads the state in the background (balances move when raids pay Essence). Returns false when it
   * did not start because an action is running.
   */
  function refreshState(): boolean {
    if (inFlight()) return false;
    const startedAt = actionCount.current;
    // Only the newest reload may land: an older one that answers late would show older numbers (a
    // lounging tag that seems to go back a step).
    const seq = ++refreshSeq.current;
    fetchState().then(
      (next) => {
        if (seq !== refreshSeq.current) return;
        if (!inFlight() && actionCount.current === startedAt) setCurrent(loaded(next));
      },
      () => undefined,
    );
    return true;
  }

  /**
   * Lounging paid your lounger (pushed over the live socket): the bar and the XP move in place. A level-up,
   * a ribbon wait or a creature this screen does not know is one normal background reload instead.
   */
  function applyPaid(push: LoungeXpPush): void {
    if (applyLoungeXp(game, push) === null) {
      refreshState();
      return;
    }
    setCurrent((now) => ({ ...now, game: applyLoungeXp(now.game, push) ?? now.game }));
  }

  // The pips of the main navigation and the timers that keep them true.
  const alerts = useTabPips({
    expeditions: game.expeditions,
    jobs: gear === null ? null : gear.jobs,
    attention,
    pending: game.pending.length,
    games: gamesAlert(games.view, game.creatures, Date.now() + offset),
    offset,
    refresh: refreshState,
  });

  const creatureActions = createCreatureActions({ run, runKeyed, setCurrent, setNotice });
  /**
   * The Signpost's scouts (phase 5 step 2): each route answers the settled valley and the state, both taken in at once. Posting and
   * kit setting are free and repeatable (no key); a seat and a kit are keyed spends. True when the server took it.
   */
  const takeValley = (answer: { valley: ValleyVisit; state: GameState } | undefined): boolean => {
    if (answer === undefined) return false;
    setCurrent(loaded(answer.state));
    // Pieces came home (or left the bag): the Workshop's bag is out of date.
    if (visit !== null && answer.valley.forge.bag.count !== visit.forge.bag.count) loadGear();
    setVisit(answer.valley);
    return true;
  };
  const signpostActions: SignpostActions = {
    post: async (body) => takeValley(await run(() => postScout(body))),
    setKit: async (seatId, kit) =>
      takeValley(await run(() => scoutKit({ action: 'set', seatId, kit }))),
    buySeat: async () => {
      const owned = systems?.seatPrices.owned ?? 0;
      const ok = takeValley(await runKeyed(ActionIds.seatBuy(owned), (key) => buyScoutSeat(key)));
      if (ok) setNotice('A new scout seat is yours.');
      return ok;
    },
    buyKit: async (kit) => {
      const ok = takeValley(
        await runKeyed(ActionIds.kitBuy(kit), (key) =>
          scoutKit({ action: 'buy', kit, idempotencyKey: key }),
        ),
      );
      if (ok) setNotice(`The ${KIT_INFO[kit].name} is yours.`);
      return ok;
    },
  };
  /**
   * The Forge's anvils (phase 5 step 3), the same way: a post, a kit and an order are free, an anvil, a kit and a run of trades are keyed
   * spends. Each answer's `valley` and state are taken in at once.
   */
  const forgeActions: ForgeActions = {
    post: async (body) => takeValley(await run(() => postScout(body))),
    setKit: async (seatId, kit) =>
      takeValley(await run(() => scoutKit({ action: 'set', seatId, kit }))),
    order: async (request) => takeValley(await run(() => postOrder(request))),
    buyAnvil: async () => {
      const owned = systems?.anvilPrices.owned ?? 0;
      const ok = takeValley(await runKeyed(ActionIds.anvilBuy(owned), (key) => buyAnvil(key)));
      if (ok) setNotice('A new anvil is yours.');
      return ok;
    },
    buyKit: async (kit) => {
      const ok = takeValley(
        await runKeyed(ActionIds.kitBuy(kit), (key) =>
          scoutKit({ action: 'buy', kit, idempotencyKey: key }),
        ),
      );
      if (ok) setNotice(`The ${ANVIL_KIT_INFO[kit].name} is yours.`);
      return ok;
    },
  };
  /**
   * The commons (phase 5 step 6b): a gift to a place's project is a keyed spend; a creature on a communal seat is free. Each answer's
   * `valley` and state are taken in at once.
   */
  const commonsActions: CommonsActions = {
    give: async (place, row, units) => {
      const answer = await runKeyed(ActionIds.gift(place, row.id, units, row.max), (key) =>
        giveToProject({
          place,
          currency: row.part,
          ...(row.element === null ? {} : { element: row.element }),
          amount: units * row.per,
          idempotencyKey: key,
        }),
      );
      if (!takeValley(answer) || answer === undefined) return false;
      setNotice(
        answer.levelUp
          ? `The ${COMMONS_NAMES[place] ?? 'place'} grew to level ${String(answer.level)}!`
          : 'Thank you. Your gift is in.',
      );
      return true;
    },
    post: async (place, creatureId) =>
      takeValley(await run(() => postCommunal({ place, creatureId }))),
  };
  /** The Market's broker (phase 5 step 7): posting and setting what it trades toward are free; each answer's `valley` and state are taken in at once. */
  const marketActions: MarketActions = {
    post: async (body) => takeValley(await run(() => postScout(body))),
    setToward: async (seatId, toward) => takeValley(await run(() => setBroker({ seatId, toward }))),
    // Q64: the shard exchange lives at the Market (a keyed spend; the server answers 409 until it is built).
    exchange: async ({ to, from, times }) => {
      const held = systems?.forge.shelf.shards[to] ?? 0;
      const answer = await runKeyed(ActionIds.exchange(to, from, times, held), (key) =>
        exchangeShards({ to, from, times, idempotencyKey: key }),
      );
      if (!takeValley(answer) || answer === undefined) return false;
      setNotice(`You traded for ${String(answer.gained)} ${shardName(to)}.`);
      return true;
    },
  };
  /** Wears an item or takes it off (the card's and the dungeon's); true when the server took it. */
  const equipOn = async (gearId: string, creatureId: string | null): Promise<boolean> =>
    (await gearActions.equip(gearId, creatureId)) !== undefined;
  const gearActions = createGearActions({
    run,
    runKeyed,
    apply: (views) => {
      setCurrent(loaded(views.state));
      replaceGear(views.gear);
    },
  });

  /** Remembers what answered cards became; Release adds parts, so the bag loads again after it. */
  function noteChoices(results: readonly ChoiceResult[], next: GameState): void {
    setSettled((now) => ({
      ...now,
      ...Object.fromEntries(
        results.map((r) => [r.pendingId, choiceResultText(r, next.creatures)] as const),
      ),
    }));
    if (results.some((r) => r.choice === 'release')) loadGear();
  }

  const catchActions: CatchChoiceActions = {
    chooseMany: async (picks) => {
      const results: ChoiceResult[] = [];
      let last: GameState | null = null;
      for (const { card, request } of picks) {
        const done = await runKeyed(ActionIds.catchChoice(card.id, request), (key) =>
          chooseCatch(card.id, request, key),
        );
        if (done === undefined) break;
        results.push(done.result);
        last = done.state;
      }
      if (last !== null) {
        setCurrent(loaded(last));
        noteChoices(results, last);
        const only = results.length === 1 ? results[0] : undefined;
        setNotice(
          only !== undefined
            ? choiceResultText(only, last.creatures)
            : `Settled ${String(results.length)} catches.`,
        );
      }
      return results.length === picks.length;
    },
  };

  /** The debug panel changed server state: reload the state and the bag, and rebuild the view. */
  function devRefresh(): void {
    actionCount.current += 1;
    fetchState().then(
      (next) => {
        setCurrent(loaded(next));
      },
      () => undefined,
    );
    loadGear();
    games.load();
    setDevNonce((n) => n + 1);
  }

  // The living room: the player's own creature comes from the state, the others from the server.
  const craftingLevels = useMemo(
    () => new Map((gear?.skills ?? []).map((skill) => [skill.creatureId, skill.level])),
    [gear],
  );
  // Presence lives here, not in the room's drawing: the room is on screen only in the desktop band or in the
  // phone's Lounge sheet, and you are in the room (and your lounger earns) whether it is drawn or not.
  const room = useLoungePresence(
    {
      enabled: game.starterChosen,
      participants,
      selfId: user.id,
      selfName: user.displayName,
      state: game,
      craftingLevels,
      loungeLive,
      onLoungeXp: applyPaid,
      ...(gear === null ? {} : { gearItems: gear.items }),
    },
    game,
    refreshState,
  );
  // The room's light follows the guild's local time by the server's clock; one timer swaps it.
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const phase = useRoomPhase(offsetRef, timezone.current);

  /**
   * Moves the player's lounger to a spot of the living room. The creature moves at once (the claim's
   * time is the local estimate of the server's clock); the server's answer then replaces it, and a
   * failure puts the old spot back and shows the error. Not a spend: a repeat is harmless, and it does
   * not take the screen's one-action-at-a-time lock.
   */
  function moveLounger(spotId: string): void {
    const previous = game.loungeSpot;
    const claim: LoungeSpot = { id: spotId, at: Date.now() + offsetRef.current };
    const settle = (settled: LoungeSpot | null): void => {
      setCurrent((now) => ({
        ...now,
        game: { ...now.game, loungeSpot: settleClaim(now.game.loungeSpot, claim, settled) },
      }));
    };
    setCurrent((now) => ({ ...now, game: { ...now.game, loungeSpot: claim } }));
    setLoungeSpot(spotId).then(settle, (err: unknown) => {
      settle(previous);
      setError(errorText(err));
    });
  }
  // The main navigation: the dock on a phone, one bottom bar in between, the rail on a wide window. The HUD
  // names the place you are in.
  const wide = useWide();
  // Where the room is drawn on a wide window: under the HUD everywhere, or only on Home as its hero (`looks.ts`).
  const roomMode = useRoomMode();
  // Between the phone and the wide window: one bottom bar with every place (no sub-menus).
  const bar = useBar();
  const places = navPlaces(alerts);
  /** Goes to a place the way the navigation does (the dock, the rail and the valley's places all come through here). */
  const select = (id: Place): void => {
    goTo(id);
    setError(null);
    setNotice(null);
    refreshState();
    room.refreshIfStale();
    loadForecast();
    if (id === 'games' || id === 'home') games.load();
    if (id !== 'games') loadGear();
  };
  /** The valley: opens a place (its page, the House's living room, or the line of one not open yet). */
  const openPlace = (id: PlaceId): void => {
    if (isOpenPlace(id)) {
      setHomeAt(id === 'house' ? 'house' : 'valley');
      select(PLACE_TAB[id]);
    } else {
      setHomeAt(id);
      select('home');
    }
  };
  /** The valley: back to the map from a place, the focus on that place's button. */
  const leavePlace = (): void => {
    setFocusPlace(placeOfView(view));
    setHomeAt('valley');
    // Only the view changes: the map draws creatures the state already holds, so it loads nothing.
    goTo('home');
  };
  /** The valley: from the Journal or the Stats back to the House's two entries. */
  const backToHouse = (): void => {
    setHomeAt('house');
    goTo('home');
  };
  // "View" in a creature's popover (the valley's scenes): the creature's page, on the Creatures page of the paddock.
  useCreatureViewer(
    valleyOn
      ? (id) => {
          setViewing(id);
          openPlace('paddock');
        }
      : null,
  );
  const placeLabelBeforeSettings = valleyOn
    ? valleyTitle(view)
    : tab === NAV_HOME.id
      ? NAV_HOME.label
      : (places.find((p) => p.id === tab)?.label ?? '');
  const placeLabel = settingsOpen ? 'Settings' : placeLabelBeforeSettings;

  // The living room's props: the same room in the desktop's band and at the top of the phone's Home page.
  const roomProps: Parameters<typeof LivingRoom>[0] = {
    residents: room.residents,
    selfId: user.id,
    instanceId: participants.instanceId,
    scene: sceneOf(phase),
    forecast,
    trophy: {
      board: games.view?.board ?? [],
      selfId: user.id,
      onOpen: () => {
        goTo('games');
        games.load();
      },
    },
    onMove: moveLounger,
    onSwap: () => {
      setSwapping(true);
      refreshState();
    },
    ...(game.loungerId === null ? {} : { ownLoungeXp: game.loungeXp[game.loungerId] ?? 0 }),
  };

  // With a game on screen: the HUD and, on a wide window, the living room band under it (a phone has the
  // room at the top of the Home page instead). Before a game (choosing a starter): the title row.
  const head = game.starterChosen ? (
    <>
      <Hud
        title={placeLabel}
        balances={purse ?? game.balances}
        leetSync={game.leetSync}
        helpRef={helpRef}
        onHelp={onHelp}
        onSettings={() => {
          setSettingsOpen(true);
        }}
        {...(valleyOn && view.kind !== 'valley' && !settingsOpen
          ? {
              // The valley's way back lives in the HUD: from a book to the House, from a place to the map.
              back: {
                label:
                  view.kind === 'place' && view.book !== null
                    ? 'Back to the House'
                    : 'Back to the valley',
                onBack: view.kind === 'place' && view.book !== null ? backToHouse : leavePlace,
              },
            }
          : {})}
      />
      {!valleyOn && wide && (roomMode === 'every' || tab === NAV_HOME.id) && (
        <RoomBand room={roomProps} hero={roomMode === 'home'} />
      )}
    </>
  ) : (
    <AppHead helpRef={helpRef} onHelp={onHelp} />
  );

  const devPanel = (
    <DevPanelHost enabled={devTools} tab={tab} creatures={game.creatures} onChanged={devRefresh} />
  );

  /** What the dungeon's and the raid's team screens need to get creatures ready (their configurator and page). */
  const teamConfigure: TeamConfigure = {
    state: game,
    gear,
    busy,
    actions: { ...creatureActions, onEquip: equipOn },
    onAnswerCatch: () => {
      goTo('collection');
    },
    onOpenWorkshop: () => {
      goTo('workshop');
      loadGear();
    },
  };

  const notices = (
    <>
      <WipeNotice key={devNonce} cancelled={game.cancelled} creatures={game.creatures} />
      {game.levelReset !== null && (
        <LevelResetCard
          notice={game.levelReset}
          busy={busy}
          onDismiss={() => {
            void run(() => dismissLevelReset()).then(showState);
          }}
        />
      )}
      {error !== null && (
        <Alert
          key={error}
          level="alert"
          onDismiss={() => {
            setError(null);
          }}
        >
          {error}
        </Alert>
      )}
      {notice !== null && (
        <Alert
          key={notice}
          level="success"
          onDismiss={() => {
            setNotice(null);
          }}
        >
          {notice}
        </Alert>
      )}
    </>
  );

  const settingsPage = settingsOpen ? (
    <SettingsPage
      settings={boardSettings}
      onChange={(next) => {
        setBoardSettings(next);
        saveBoardSettings(browserSettingsStorage(), next);
      }}
      onBack={() => {
        setSettingsOpen(false);
      }}
      backLabel={`to ${placeLabelBeforeSettings}`}
      onHowTo={onHelp}
      howToRef={helpRef}
      notifications={serverNotifications}
    />
  ) : null;

  const pages = (
    <div key={devNonce} hidden={settingsOpen}>
      {tab === 'home' && !valleyOn && (
        <HomeScreen
          offset={offset}
          timezone={timezone.current}
          trips={game.expeditions}
          jobs={gear === null ? null : gear.jobs}
          creatures={game.creatures}
          games={games.view}
          pending={game.pending.length}
          attention={attention}
          raid={raidGlance}
          forecast={forecast}
          settings={boardSettings}
          creatureState={game}
          onHowTo={() => {
            // A click may not focus the button (Safari): make it the opener the focus returns to.
            boardHelpRef.current?.focus();
            onHelp();
          }}
          howToRef={boardHelpRef}
          away={game.awayRewards}
          awayBusy={busy}
          onDismissAway={(until) => {
            void run(() => dismissAway(until)).then(showState);
          }}
          onGo={(place, needsFilter) => {
            goTo(place, needsFilter === true ? { needsFilter } : {});
            refreshState();
            loadForecast();
            if (place === 'games') games.load();
            else loadGear();
          }}
          room={wide ? undefined : <RoomBand room={roomProps} />}
        />
      )}
      {(tab === 'journal' || tab === 'stats') && (
        <HomeBook
          page={tab}
          creatures={game.creatures}
          tripsFinished={game.slots.tripsFinished}
          {...(valleyOn
            ? {
                // In the valley the books are the House's two entries: Back returns to the House.
                onBack: backToHouse,
                backLabel: 'to the House',
                bare: true,
              }
            : {})}
        />
      )}
      {tab === 'collection' && (
        <Collection
          initialNeeds={creaturesNeeds}
          openRequest={viewing}
          onOpenHandled={() => {
            setViewing(null);
          }}
          state={game}
          gear={gear}
          busy={busy}
          viewerId={user.id}
          loadGames={fetchCreatureGames}
          onEquip={equipOn}
          catchActions={catchActions}
          {...creatureActions}
        />
      )}
      {tab === 'expeditions' && valleyOn && valleySystems && systems !== null && (
        // With the valley's systems on the Signpost is its scouts, not trips (`/api/expeditions` answers 404).
        <SignpostSeats
          visit={systems}
          creatures={game.creatures}
          trayInput={{
            trips: game.expeditions,
            jobs: gear === null ? null : gear.jobs,
            now: Date.now() + offset,
            ...trayStates(systems),
          }}
          acorns={game.balances.bait}
          busy={busy}
          actions={signpostActions}
          commons={commonsActions}
          onOpenPaddock={() => {
            openPlace('paddock');
          }}
        />
      )}
      {tab === 'expeditions' && !(valleyOn && valleySystems) && (
        <Expeditions
          state={game}
          forecast={forecast}
          offset={offset}
          busy={busy}
          reveal={reveal}
          catchActions={catchActions}
          settled={settled}
          timezone={timezone.current}
          onSend={async (request: SendRequest) => {
            const answer = await runKeyed(ActionIds.send(request), (key) =>
              sendExpedition(request, key),
            );
            if (answer === undefined) return false;
            setCurrent(loaded(answer.state));
            return true;
          }}
          onPushOn={(trip, goalId) => {
            void run(() => pushOn(trip.id, goalId)).then((answer) => {
              if (answer !== undefined) setCurrent(loaded(answer.state));
            });
          }}
          onClaim={(trip) => {
            void run(() => claimExpedition(trip.id)).then((done) => {
              if (done === undefined) return;
              setCurrent(loaded(done.state));
              setReveal({
                result: done.result,
                trip: done.state.expeditions.find((e) => e.id === trip.id),
              });
              // The trip's parts, blueprints and gear are in the Workshop now.
              loadGear();
            });
          }}
          onRefresh={refreshState}
          onDismissReveal={() => {
            setReveal(null);
          }}
          onOpenWorkshop={() => {
            goTo('workshop');
            loadGear();
          }}
          bag={gear?.inventory ?? null}
        />
      )}
      {tab === 'workshop' && (
        <Workshop
          {...(valleyOn && valleySystems && systems !== null
            ? {
                forge: {
                  visit: systems,
                  trayInput: {
                    trips: game.expeditions,
                    jobs: gear === null ? null : gear.jobs,
                    now: Date.now() + offset,
                    ...trayStates(systems),
                  },
                  acorns: game.balances.bait,
                  actions: forgeActions,
                  commons: commonsActions,
                  onOpenPaddock: () => {
                    openPlace('paddock');
                  },
                  // Q64: an anvil that waits on a shard leads to the Market (its exchange once built, else its project).
                  onOpenMarket: (to: string | null) => {
                    setMarketStart(
                      systems.market?.open === true && to !== null ? { exchange: to } : undefined,
                    );
                    openPlace('market');
                  },
                } satisfies ForgeMode,
              }
            : {})}
          state={game}
          gear={gear}
          failed={gearFailed}
          offset={offset}
          busy={busy}
          error={error}
          reveal={jobReveal}
          actions={gearActions}
          onRetry={loadGear}
          onClaimed={setJobReveal}
          onDismissReveal={() => {
            setJobReveal(null);
          }}
        />
      )}
      {tab === 'games' && (
        <GamesTab
          view={games.view}
          failed={games.failed}
          creatures={game.creatures}
          selfId={user.id}
          offset={offset}
          onView={games.replace}
          onReload={games.load}
          onPurchased={() => {
            // A prize pays Bait, parts, a supply or a gear piece: the balances and the bag.
            refreshState();
            loadGear();
          }}
        />
      )}
      {tab === 'raid' && (
        <Raid
          creatures={game.creatures}
          forecast={forecast}
          showPractice={showPractice}
          onBalanceChange={refreshState}
          onViewChange={valleyOn ? adoptRaid : undefined}
          onNeedsPlacementChange={(needed) => {
            setAttention((now) => ({
              dungeon: false,
              recheckAt: null,
              ...now,
              raid: needed,
            }));
          }}
          configure={teamConfigure}
        />
      )}
      {tab === 'dungeon' && (
        <Dungeon
          creatures={game.creatures}
          forecast={forecast}
          bait={game.balances.bait}
          draft={dungeonDraft.current}
          onDraftChange={(slots) => {
            dungeonDraft.current = slots;
            if (valleyOn) setDungeonTeam(slots);
          }}
          onRunStarted={() => {
            // The server deleted the saved draft: the next setup starts from this run's team.
            dungeonDraft.current = null;
            if (valleyOn) setDungeonTeam(null);
          }}
          onPhaseChange={valleyOn ? setDungeonPhase : undefined}
          onCanRunChange={(canRun) => {
            setAttention((now) => ({
              raid: false,
              recheckAt: null,
              ...now,
              dungeon: canRun,
            }));
          }}
          onRunFinished={() => {
            // A run pays Bait, Essence, parts and maybe gear: reload the balances and the bag.
            refreshState();
            loadGear();
          }}
          configure={teamConfigure}
        />
      )}
    </div>
  );

  const content = !game.starterChosen ? (
    <>
      {error !== null && (
        <Alert
          key={error}
          level="alert"
          onDismiss={() => {
            setError(null);
          }}
        >
          {error}
        </Alert>
      )}
      <StarterPicker
        options={game.starterOptions}
        busy={busy}
        onChoose={(species) => {
          void runKeyed(ActionIds.starter(species), (key) => chooseStarter(species, key)).then(
            showState,
          );
        }}
      />
    </>
  ) : valleyOn ? (
    <>
      {head}
      <ValleyFrame
        view={view}
        creatures={game.creatures}
        trayInput={{
          trips: game.expeditions,
          jobs: gear === null ? null : gear.jobs,
          now: Date.now() + offset,
        }}
        alerts={alerts}
        placeInput={{
          now: Date.now() + offset,
          timezone: timezone.current,
          trips: game.expeditions,
          jobs: gear === null ? null : gear.jobs,
          creatures: game.creatures,
          games: games.view,
          pending: game.pending.length,
          attention,
          raid: raidGlance,
        }}
        visit={systems}
        {...(systems === null
          ? {}
          : {
              commons: commonsActions,
              market: marketActions,
              acorns: game.balances.bait,
              busy,
              error,
              ...(marketStart === undefined ? {} : { marketStart }),
            })}
        castExtra={{
          dungeonTeam,
          dungeonPhase,
          waiting: game.pending.map((p) => ({ id: p.id, species: p.species, shiny: p.shiny })),
        }}
        focus={focusPlace}
        onOpen={openPlace}
        onLeave={leavePlace}
        onBook={select}
        notices={notices}
        away={null}
        settings={settingsPage}
      >
        {pages}
      </ValleyFrame>
      <WelcomeBack
        away={game.awayRewards}
        world={{
          creatures: game.creatures,
          items: gear === null ? null : gear.items,
          blueprints: gear === null ? null : gear.blueprints,
          tray: {
            trips: game.expeditions,
            jobs: gear === null ? null : gear.jobs,
            now: Date.now() + offset,
          },
          games: games.view,
          raid: raidGlance,
          bestFirst: valleySystems,
        }}
        now={Date.now() + offset}
        timezone={timezone.current}
        balances={game.balances}
        brought={systems === null ? 0 : systems.allowance.brought}
        onDismiss={(until) => {
          void run(() => dismissAway(until)).then(showState);
        }}
        onPurse={setPurse}
        // With the valley's systems on the paper is the server's (`valley.paper`); absent otherwise, today's notice is the source.
        {...(valleySystems
          ? {
              paper: systems?.paper ?? null,
              onClosePaper: (paperId: string) => {
                // The server only marks it read; the client drops its own copy so it does not reopen.
                void run(() => closeGazette(paperId)).then((closed) => {
                  if (closed === true) {
                    setVisit((was) => {
                      if (was === null) return was;
                      const rest = { ...was };
                      delete rest.paper;
                      return rest;
                    });
                  }
                });
              },
              onPushOn: async (seatId: string) =>
                takeValley(await run(() => setScoutDeep(seatId, true))),
            }
          : {})}
      />
    </>
  ) : (
    <AppFrame
      place={tab}
      head={head}
      nav={
        <MainNav
          places={places}
          current={tab}
          wide={wide}
          bar={bar}
          home
          onSelect={(id) => {
            if (!isPlace(id)) return;
            // Tapping the place you are in also goes back to its top.
            if (id === tab) scrollToTop();
            select(id);
          }}
        />
      }
    >
      {notices}
      {settingsPage}
      {pages}
    </AppFrame>
  );

  const swap = swapping && (
    <LoungeSwap
      state={game}
      onPick={(creatureId) => {
        setSwapping(false);
        const creature = game.creatures.find((c) => c.id === creatureId);
        if (creature !== undefined) creatureActions.onLounge(creature);
      }}
      onClose={() => {
        setSwapping(false);
      }}
    />
  );

  return (
    <TreatTimesContext.Provider value={forecast?.today?.treatTimes ?? 2}>
      <GearItemsContext.Provider value={gear?.items ?? NO_ITEMS}>
        <EquipHost creatures={gear === null ? NO_CREATURES : game.creatures} onEquip={equipOn}>
          {!game.starterChosen && head}
          {content}
          {swap}
          {devPanel}
        </EquipHost>
      </GearItemsContext.Provider>
    </TreatTimesContext.Provider>
  );
}

/** The HUD's title in the valley: "Valley" on the map, else the place's name (the book's name inside the House). */
function valleyTitle(view: ValleyView): string {
  if (view.kind === 'valley') return 'Valley';
  if (view.kind === 'place' && view.book !== null) {
    return view.book === 'journal' ? 'Journal' : 'Stats';
  }
  return placeOf(view.place).name;
}
