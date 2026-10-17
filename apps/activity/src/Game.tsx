import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  chooseStarter,
  dismissLevelReset,
  evolveCreature,
  fetchState,
  renameCreature,
  setLounger,
  setLoungeSpot,
  earnRibbon,
  type Allowance,
  type Attention,
  type ClaimResult,
  type EvolveResult,
  type GameState,
  type LeetSyncStatus,
  type LoungeSpot,
  type SessionUser,
} from './api';
import { ActionIds } from './actions';
import { allowanceNotice } from './allowance-text';
import { AppHead } from './AppHead';
import { Collection } from './Collection';
import type { CatchChoiceActions } from './DuplicateCard';
import { claimExpedition, pushOn, sendExpedition, type SendRequest } from './expedition-api';
import type { Trip } from './expedition-types';
import { Expeditions } from './Expeditions';
import { fetchGear } from './gear-api';
import { createGearActions } from './gear-actions';
import type { GearState, JobResult } from './gear-types';
import type { ChoiceResult } from './talent-types';
import { ribbonName } from './experience';
import { clockOffset, creatureName, errorText, speciesName } from './game';
import type { ParticipantSource } from './participants';
import { settleClaim } from './room-data';
import { Raid } from './Raid';
import { SYNC_POLL_INTERVAL_MS, shouldRefetchLeet } from './leet-status';
import { Dungeon } from './Dungeon';
import type { Slots } from './dungeon-team';
import { chooseAllRecommended, chooseCatch, slotTalent } from './talent-api';
import { choiceResultText } from './talent-view';
import { DevPanelHost } from './DevPanelHost';
import { StarterPicker } from './StarterPicker';
import { TabBar } from './TabBar';
import { RECHECK_RETRY_MS, changeDelay, nextChangeAt, recheckDelay, tabAlerts } from './tab-alerts';
import type { Tab } from './tabs';
import { useActionRunner } from './use-action-runner';
import { useRoom } from './use-room';
import { useRoomPhase } from './use-room-phase';
import { sceneOf } from './LivingRoom';
import { LevelResetCard } from './LevelResetCard';
import { WipeNotice } from './WipeNotice';
import { Workshop } from './Workshop';
import { fetchForecast } from './weather-api';
import type { Forecast } from './weather-types';
import { forecastRecheckDelay } from './weather-view';

interface Loaded {
  game: GameState;
  /** Server clock minus local clock at the moment the state arrived. */
  offset: number;
}

function loaded(game: GameState): Loaded {
  return { game, offset: clockOffset(game.serverNow, Date.now()) };
}

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
}: {
  initial: GameState;
  /** The signed-in player (their id and display name put their own creature in the living room). */
  user: SessionUser;
  /** Who has the Activity open: the living room shows them. */
  participants: ParticipantSource;
  /** The "?" button of the title row and what it does (the app owns the How to play page). */
  helpRef: RefObject<HTMLButtonElement>;
  onHelp: () => void;
  /** True on staging, where the server has the dev tools on: the debug panel loads (see `dev-gate.ts`). */
  devTools: boolean;
  /** True on staging and local runs, where the server can start a practice finale. */
  showPractice: boolean;
  /** Called with the sync status of every state this component loads, so the footer stays current. */
  onLeetSync: (status: LeetSyncStatus) => void;
  /** The daily Bait allowance the server paid when the Activity opened; null when there is none to tell. */
  allowance: Allowance | null;
}) {
  const [current, setCurrent] = useState<Loaded>(() => loaded(initial));
  const [tab, setTab] = useState<Tab>('collection');
  const [reveal, setReveal] = useState<{ result: ClaimResult; trip: Trip | undefined } | null>(
    null,
  );
  // Gear, parts, blueprints and jobs; null until the first load (or when it failed).
  const [gear, setGear] = useState<GearState | null>(null);
  const [gearFailed, setGearFailed] = useState(false);
  const [jobReveal, setJobReveal] = useState<JobResult | null>(null);
  // The valley's sky for today and tomorrow (Boons and Omens); null until the first load (or when it failed).
  const [forecast, setForecast] = useState<Forecast | null>(null);
  // What each duplicate answered this session became (a card id to a sentence), so a claim reveal can say
  // what happened to the cards it showed.
  const [settled, setSettled] = useState<Record<string, string>>({});
  // Bumped by the debug panel after a tool changed something: the view on screen loads afresh.
  const [devNonce, setDevNonce] = useState(0);
  // Counts player actions, so a background refresh that started before one is never applied.
  const actionCount = useRef(0);
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
  // Counts gear views that came from an action, so a slower load that started before one is dropped.
  const gearVersion = useRef(0);
  const { game, offset } = current;
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
  // Bumped when a trip or job runs out, so the pips are worked out again at that moment.
  const [pipTick, setPipTick] = useState(0);

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
    fetchState().then(
      (next) => {
        if (!inFlight() && actionCount.current === startedAt) setCurrent(loaded(next));
      },
      () => undefined,
    );
    return true;
  }

  /** Loads the gear view (inventory, parts, jobs). The first call also gives the welcome kit, once. */
  function loadGear(): void {
    const startedAt = gearVersion.current;
    fetchGear().then(
      (next) => {
        // An action answered while this was on its way: its view is newer.
        if (gearVersion.current !== startedAt) return;
        setGear(next);
        setGearFailed(false);
      },
      () => {
        setGearFailed(true);
      },
    );
  }

  // The gear view loads once the game is on screen, so the collection can offer its items at once.
  useEffect(() => {
    if (game.starterChosen) loadGear();
  }, [game.starterChosen]);

  /** Loads the forecast (a plain read: a failure keeps the one on screen, the next call tries again). */
  function loadForecast(): void {
    fetchForecast().then(setForecast, () => undefined);
  }

  // The forecast loads with the game, and again a moment after the day turns over (the server draws the
  // next one at the daily reset), so the calendar and the cards never show yesterday's sky.
  useEffect(() => {
    if (game.starterChosen) loadForecast();
  }, [game.starterChosen]);
  const forecastEnds = forecast?.today?.endsAt ?? null;
  useEffect(() => {
    const wait = forecastRecheckDelay(forecast, Date.now() + offset);
    if (wait === null) return undefined;
    const timer = setTimeout(loadForecast, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [forecastEnds, offset]);

  // The pips of the Expeditions and Workshop tabs follow the server's clock: one timer, set for the
  // next trip or job to run out (a long wait is capped), and set again after it fires.
  const serverNow = Date.now() + offset;
  const jobs = gear === null ? null : gear.jobs;
  const alerts = tabAlerts({
    expeditions: game.expeditions,
    jobs,
    attention,
    pending: game.pending.length,
    serverNow,
  });
  const changeAt = nextChangeAt({ expeditions: game.expeditions, jobs, serverNow });
  useEffect(() => {
    if (changeAt === null) return undefined;
    const timer = setTimeout(
      () => {
        setPipTick((n) => n + 1);
      },
      changeDelay(changeAt, Date.now() + offset),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [changeAt, offset, pipTick]);

  // When the server said something could change by itself (the daily reset, the next raid event),
  // ask once a moment after; if an action was running, once more a few seconds later.
  const recheckAt = attention?.recheckAt ?? null;
  useEffect(() => {
    const wait = recheckDelay(recheckAt, Date.now() + offset);
    if (wait === null) return undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      if (refreshState()) return;
      retry = setTimeout(() => {
        refreshState();
      }, RECHECK_RETRY_MS);
    }, wait);
    return () => {
      clearTimeout(timer);
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [recheckAt, offset]);

  const gearActions = createGearActions({
    run,
    runKeyed,
    apply: (views) => {
      gearVersion.current += 1;
      setCurrent(loaded(views.state));
      setGear(views.gear);
      setGearFailed(false);
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
    choose: (card, request) => {
      void runKeyed(ActionIds.catchChoice(card.id, request), (key) =>
        chooseCatch(card.id, request, key),
      ).then((done) => {
        if (done === undefined) return;
        setCurrent(loaded(done.state));
        noteChoices([done.result], done.state);
        setNotice(choiceResultText(done.result, done.state.creatures));
      });
    },
    chooseAll: () => {
      void runKeyed(ActionIds.catchAll(), (key) => chooseAllRecommended(key)).then((done) => {
        if (done === undefined) return;
        setCurrent(loaded(done.state));
        noteChoices(done.results, done.state);
        setNotice(
          done.results.length === 1
            ? 'Applied Recommended to the waiting catch.'
            : `Applied Recommended to ${String(done.results.length)} waiting catches.`,
        );
      });
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
            },
          }
        : {})}
    />
  );

  const devPanel = (
    <DevPanelHost enabled={devTools} tab={tab} creatures={game.creatures} onChanged={devRefresh} />
  );

  const content = !game.starterChosen ? (
    <>
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
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
          if (id === 'workshop' || id === 'collection') loadGear();
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
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {notice !== null && (
        <p class="notice" role="status">
          {notice}
        </p>
      )}
      <div key={devNonce} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'collection' && (
          <Collection
            state={game}
            gear={gear}
            busy={busy}
            viewerId={user.id}
            onEquip={async (gearId, creatureId) =>
              (await gearActions.equip(gearId, creatureId)) !== undefined
            }
            onRibbon={(creature) => {
              void runKeyed(ActionIds.ribbon(creature.id), (key) =>
                earnRibbon(creature.id, key),
              ).then((done) => {
                if (done === undefined) return;
                setCurrent(loaded(done.state));
                const level = done.result.experience?.level;
                setNotice(
                  `${creatureName(creature)} earned the ${ribbonName(done.result.ribbon)}${level === undefined ? '' : ` and is level ${String(level)}`}!`,
                );
              });
            }}
            onEvolve={(creature) => {
              void runKeyed(
                ActionIds.evolve(creature.id),
                (key) => evolveCreature(creature.id, key),
                { currency: 'Essence' },
              ).then((done: EvolveResult | undefined) => {
                if (done === undefined) return;
                setCurrent(loaded(done.state));
                setNotice(
                  `${creatureName(creature)} evolved into ${speciesName(done.species)}!${done.firstOnServer ? ' First on server!' : ''}`,
                );
              });
            }}
            onRename={(creature, nickname) => {
              void run(() => renameCreature(creature.id, nickname)).then(showState);
            }}
            catchActions={catchActions}
            onSlotTalent={(creature, talentId, golden, slot) => {
              void runKeyed(ActionIds.talentSlot(creature.id, talentId, golden, slot), (key) =>
                slotTalent(creature.id, { talentId, golden, slot }, key),
              ).then((done) => {
                if (done === undefined) return;
                setCurrent(loaded(done.state));
                setNotice(`Put the talent in slot ${String(done.result.slot)}.`);
              });
            }}
            onLounge={(creature) => {
              // Not a spend, and a repeat is harmless (the server just says the same thing).
              void run(() => setLounger(creature.id)).then((loungerId) => {
                if (loungerId === undefined) return;
                setCurrent((now) => ({ ...now, game: { ...now.game, loungerId } }));
              });
            }}
          />
        )}
        {tab === 'expeditions' && (
          <Expeditions
            state={game}
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
          />
        )}
      </div>
    </>
  );

  return (
    <>
      {head}
      {content}
      {devPanel}
    </>
  );
}
