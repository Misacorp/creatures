import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  chooseStarter,
  dismissLevelReset,
  fetchState,
  setLoungeSpot,
  type Allowance,
  type Attention,
  type ClaimResult,
  type Creature,
  type GameState,
  type LeetSyncStatus,
  type LoungeSpot,
  type SessionUser,
} from './api';
import { ActionIds } from './actions';
import { allowanceNotice } from './allowance-text';
import { AppHead } from './AppHead';
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
import { LOUNGE_REFRESH_MS, loungeEarning, settleClaim } from './room-data';
import { Raid } from './Raid';
import { SYNC_POLL_INTERVAL_MS, shouldRefetchLeet } from './leet-status';
import { Dungeon } from './Dungeon';
import type { Slots } from './dungeon-team';
import { chooseCatch } from './talent-api';
import { choiceResultText } from './talent-view';
import { DevPanelHost } from './DevPanelHost';
import { StarterPicker } from './StarterPicker';
import { TabBar } from './TabBar';
import type { Tab } from './tabs';
import { useActionRunner } from './use-action-runner';
import { useForecast } from './use-forecast';
import { EquipHost } from './equip-from-card';
import { GearItemsContext } from './gear-items-context';
import type { GearItem } from './gear-types';
import { TreatTimesContext } from './TreatBox';
import { useGearState } from './use-gear-state';
import { useRoom } from './use-room';
import { useRoomPhase } from './use-room-phase';
import { useTabPips } from './use-tab-pips';
import { sceneOf } from './LivingRoom';
import { LevelResetCard } from './LevelResetCard';
import { WipeNotice } from './WipeNotice';
import { Workshop } from './Workshop';
import type { TeamConfigure } from './TeamCreaturePage';
import { Alert } from './ui/Alert';

/** Before the gear view has loaded. */
const NO_ITEMS: readonly GearItem[] = [];
const NO_CREATURES: readonly Creature[] = [];

export function Game({
  initial,
  user,
  participants,
  helpRef,
  onHelp,
  onLeetSync,
  allowance,
  showPractice,
  devTools,
  loungeLive = false,
}: {
  initial: GameState;
  /** The signed-in player (their id and display name put their own creature in the living room). */
  user: SessionUser;
  /** Who has the Activity open: the living room shows them. */
  participants: ParticipantSource;
  /** The "?" button of the title row and what it does (the app owns the How to play page). */
  helpRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
  /** True on staging, where the server has the dev tools on: the debug panel loads (see `dev-gate.ts`). */
  devTools: boolean;
  /** The server offers the lounge's live socket (`loungeLive` of `/api/config`); the room polls without it. */
  loungeLive?: boolean;
  /** True on staging and local runs, where the server can start a practice finale. */
  showPractice: boolean;
  /** Called with the sync status of every state this component loads, so the footer stays current. */
  onLeetSync: (status: LeetSyncStatus) => void;
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
  const [tab, setTab] = useState<Tab>('collection');
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
  // The setup row of the Dungeon tab, kept while the player is on other tabs (lost on a reload).
  const dungeonDraft = useRef<Slots | null>(null);

  // The daily allowance lands once (the server tells the player on one request only): say so on the
  // notice line, which the next action clears.
  useEffect(() => {
    const text = allowanceNotice(allowance);
    if (text !== null) setNotice(text);
  }, []);

  // While the first leet sync is still running, ask again every few seconds (a few times at most)
  // so the balance, the history and the footer update as soon as the credits land.
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
            if (next.leetSync !== null) onLeetSync(next.leetSync);
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

  // The pips of the tab bar and the timers that keep them true.
  const alerts = useTabPips({
    expeditions: game.expeditions,
    jobs: gear === null ? null : gear.jobs,
    attention,
    pending: game.pending.length,
    offset,
    refresh: refreshState,
  });

  const creatureActions = createCreatureActions({ run, runKeyed, setCurrent, setNotice });
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
    setDevNonce((n) => n + 1);
  }

  // The living room: the player's own creature comes from the state, the others from the server.
  const craftingLevels = useMemo(
    () => new Map((gear?.skills ?? []).map((skill) => [skill.creatureId, skill.level])),
    [gear],
  );
  const room = useRoom({
    enabled: game.starterChosen,
    participants,
    selfId: user.id,
    selfName: user.displayName,
    state: game,
    craftingLevels,
    loungeLive,
    ...(gear === null ? {} : { gearItems: gear.items }),
  });
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
  // While your lounger earns, reload the state once per XP so its tag and XP bar move (the server pays what
  // you collected when you make a request). Nothing while alone, hidden or Rested.
  const earning = loungeEarning(room.company, false, game);
  useEffect(() => {
    if (!earning) return undefined;
    const timer = setInterval(() => {
      refreshState();
    }, LOUNGE_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [earning]);

  const head = (
    <AppHead
      helpRef={helpRef}
      onHelp={onHelp}
      {...(game.starterChosen
        ? {
            balances: game.balances,
            room: {
              residents: room.residents,
              selfId: user.id,
              instanceId: participants.instanceId,
              scene: sceneOf(phase),
              forecast,
              onMove: moveLounger,
              onSwap: () => {
                setSwapping(true);
                refreshState();
              },
              ...(game.loungerId === null
                ? {}
                : { ownLoungeXp: game.loungeXp[game.loungerId] ?? 0 }),
            },
          }
        : {})}
    />
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
      setTab('collection');
    },
    onOpenWorkshop: () => {
      setTab('workshop');
      loadGear();
    },
  };

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
  ) : (
    <>
      <TabBar
        current={tab}
        alerts={alerts}
        onSelect={(id) => {
          setTab(id);
          setError(null);
          setNotice(null);
          refreshState();
          room.refreshIfStale();
          loadForecast();
          if (
            id === 'workshop' ||
            id === 'collection' ||
            id === 'dungeon' ||
            id === 'raid' ||
            id === 'expeditions'
          )
            loadGear();
        }}
      />
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
      <div key={devNonce} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'collection' && (
          <Collection
            state={game}
            gear={gear}
            busy={busy}
            viewerId={user.id}
            onEquip={equipOn}
            catchActions={catchActions}
            {...creatureActions}
          />
        )}
        {tab === 'expeditions' && (
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
              setTab('workshop');
              loadGear();
            }}
            bag={gear?.inventory ?? null}
          />
        )}
        {tab === 'workshop' && (
          <Workshop
            state={game}
            gear={gear}
            failed={gearFailed}
            offset={offset}
            busy={busy}
            reveal={jobReveal}
            actions={gearActions}
            onRetry={loadGear}
            onClaimed={setJobReveal}
            onDismissReveal={() => {
              setJobReveal(null);
            }}
          />
        )}
        {tab === 'raid' && (
          <Raid
            creatures={game.creatures}
            forecast={forecast}
            showPractice={showPractice}
            onBalanceChange={refreshState}
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
            }}
            onRunStarted={() => {
              // The server deleted the saved draft: the next setup starts from this run's team.
              dungeonDraft.current = null;
            }}
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
    </>
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
          {head}
          {content}
          {swap}
          {devPanel}
        </EquipHost>
      </GearItemsContext.Provider>
    </TreatTimesContext.Provider>
  );
}
