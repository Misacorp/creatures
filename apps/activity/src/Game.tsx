import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  chooseStarter,
  evolveCreature,
  fetchState,
  renameCreature,
  setLounger,
  trainCreature,
  type ClaimResult,
  type EvolveResult,
  type GameState,
  type LeetSyncStatus,
  type SessionUser,
} from './api';
import { ActionIds } from './actions';
import { AppHead } from './AppHead';
import { Collection } from './Collection';
import { claimExpedition, pushOn, sendExpedition, type SendRequest } from './expedition-api';
import type { Trip } from './expedition-types';
import { Expeditions } from './Expeditions';
import { fetchGear } from './gear-api';
import { createGearActions } from './gear-actions';
import type { GearState, JobResult } from './gear-types';
import { clockOffset, creatureName, speciesName } from './game';
import { glyphOrUnknown } from './glyphs';
import type { ParticipantSource } from './participants';
import { Raid } from './Raid';
import { SYNC_POLL_INTERVAL_MS, shouldRefetchLeet } from './leet-status';
import { Dungeon } from './Dungeon';
import { DevPanelHost } from './DevPanelHost';
import { Sprite } from './sprites/Sprite';
import { StarterPicker } from './StarterPicker';
import { TABS, tabAfterKey, tabPalette, type Tab } from './tabs';
import { useActionRunner } from './use-action-runner';
import { useRoom } from './use-room';
import { useRoomPhase } from './use-room-phase';
import { sceneOf } from './LivingRoom';
import { WipeNotice } from './WipeNotice';
import { Workshop } from './Workshop';

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
      <div
        class="tabs"
        role="tablist"
        aria-label="Sections"
        onKeyDown={(event) => {
          // Arrow keys, Home and End move between the tabs; Enter or Space opens the focused one.
          const next = tabAfterKey(tab, event.key);
          if (next === null) return;
          event.preventDefault();
          document.getElementById(`tab-${next}`)?.focus();
        }}
      >
        {TABS.map(({ id, label, glyph }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            class={tab === id ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(id);
              setError(null);
              setNotice(null);
              refreshState();
              room.refreshIfStale();
              if (id === 'workshop' || id === 'collection') loadGear();
            }}
          >
            <Sprite
              sprite={glyphOrUnknown(glyph)}
              scale={2}
              class="tab-glyph"
              {...(tabPalette(tab === id) === undefined
                ? {}
                : { palette: tabPalette(tab === id) as Readonly<Record<string, string>> })}
            />
            <span class="tab-label">{label}</span>
          </button>
        ))}
      </div>
      <WipeNotice key={devNonce} cancelled={game.cancelled} creatures={game.creatures} />
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
            onEquip={async (gearId, creatureId) =>
              (await gearActions.equip(gearId, creatureId)) !== undefined
            }
            onTrain={(creature) => {
              void runKeyed(ActionIds.train(creature.id), (key) =>
                trainCreature(creature.id, key),
              ).then(showState);
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
            showPractice={showPractice}
            onBalanceChange={refreshState}
          />
        )}
        {tab === 'dungeon' && (
          <Dungeon
            creatures={game.creatures}
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
