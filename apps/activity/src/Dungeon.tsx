import { useEffect, useRef, useState } from 'preact/hooks';
import { ActionIds } from './actions';
import type { Creature } from './api';
import { CaveCanvas } from './cave-canvas/CaveCanvas';
import { caveCanvasOn } from './cave-canvas/flag';
import {
  heldOf,
  release,
  runEndedForPhase,
  type CaveView,
  type HeldAnswer,
} from './cave-canvas/hold';
import { DungeonPlayback } from './DungeonPlayback';
import { DungeonResults } from './DungeonResults';
import { DungeonRun } from './DungeonRun';
import { DungeonSetup } from './DungeonSetup';
import type { TeamConfigure } from './TeamCreaturePage';
import {
  dungeonAct,
  fetchDungeonReplay,
  fetchDungeonToday,
  saveDungeonTeam,
  startDungeonRun,
} from './dungeon-api';
import {
  dungeonPhase,
  initialScreen,
  msUntilReset,
  openRun,
  RESET_GRACE_MS,
  screenAfterAct,
  screenAfterFight,
  type DungeonPhase,
} from './dungeon-flow';
import { replayInput, roomInput, type PlaybackInput } from './dungeon-playback';
import { buildRunRequest, completeTeam, type Slots } from './dungeon-team';
import { dungeonErrorText, isStaleDungeonError } from './dungeon-text';
import type {
  DungeonAct,
  DungeonActResponse,
  DungeonReplay,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
} from './dungeon-types';
import { clockOffset } from './game';
import { useActionRunner } from './use-action-runner';
import type { TrayInput } from './valley/tray-state';
import type { Forecast } from './weather-types';
import { Alert } from './ui/Alert';

/**
 * What the tab shows. `run` is an open run on its map; a mystery room's card and the camp's card
 * are that same view, picked by what the state says is pending (`runScreenOf`), so a reload lands
 * on them too. `fight` plays the one room a move just played, and `summary` is set when that fight
 * ended the run (the results follow it). `playback` is "Watch again" over a finished run.
 */
type View =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'run'; state: DungeonRunState }
  | {
      kind: 'fight';
      input: PlaybackInput;
      state: DungeonRunState;
      summary: DungeonRunSummary | null;
      /** The run as it stood before the room: what the Cave canvas shows until the fight has played (`cave-canvas/hold.ts`). */
      before: DungeonRunState;
    }
  | { kind: 'playback'; input: PlaybackInput; run: DungeonRunSummary }
  | { kind: 'results'; run: DungeonRunSummary };

/**
 * The Dungeon tab: the pre-run screen, the open run (its map, mystery rooms and camp), the playback
 * of each fight and the results (which also carry the streak and the reset time).
 * The run is the server's: it draws the seed of every fight, plays it, keeps the run's state and
 * pays the rewards when the run ends. This screen sends the player's picks, one act at a time with
 * the step it last saw and an idempotency key that is reused if the answer never arrived, and shows
 * what the server answers. An open run is always on the server: coming back (or reloading) shows it
 * again where it stands. A run's results stay on screen after it ended; coming back later shows them
 * again with "Watch again".
 */
export function Dungeon({
  creatures,
  forecast,
  bait,
  draft,
  onDraftChange,
  onRunStarted,
  onCanRunChange,
  onPhaseChange,
  onRunFinished,
  configure,
  canvas = false,
  treatsOff = false,
  trayInput,
  onCanvasChange,
}: {
  creatures: readonly Creature[];
  /** The valley's sky for today and tomorrow, for the one line on the pre-run card (null: none loaded). */
  forecast: Forecast | null;
  /** The player's Bait: a treat for a creature of the team costs some of it. */
  bait: number;
  /** The setup row of this session, kept by the game across tab switches (null: none). */
  draft: Slots | null;
  /** The setup row changed. */
  onDraftChange: (slots: Slots) => void;
  /** A run was accepted by the server: it deleted the saved draft, so the game forgets its copy. */
  onRunStarted: () => void;
  /** Whether a run can start now, whenever today's state is loaded or changes (the tab's pip). */
  onCanRunChange: (canRun: boolean) => void;
  /** Where today's dungeon stands (a run in progress, one that can start, neither), for the valley's Cave. */
  onPhaseChange?: ((phase: DungeonPhase) => void) | undefined;
  /** The run's playback ended (or was skipped): balances and the bag changed, so reload them. */
  onRunFinished: () => void;
  /** Getting the team ready on the pre-run card (see `DungeonSetup`); absent: the creature popover only. */
  configure?: TeamConfigure | undefined;
  /**
   * The valley is on: the Cave may be a canvas (`cave-canvas/`), which it is when the day's dungeon also plays by combat v2 and any
   * open run began on it (`caveCanvasOn`). Otherwise, and always when this is off, the page below.
   */
  canvas?: boolean;
  /** The server refuses treats (the valley's systems are on): the canvas does not offer them. */
  treatsOff?: boolean;
  /** What the creature tray under the canvas's scene reads (trips and jobs); absent: nothing is away. */
  trayInput?: TrayInput | undefined;
  /** Whether the Cave is drawn as a canvas, whenever today changes: the valley then draws no scene of its own above it. */
  onCanvasChange?: ((on: boolean) => void) | undefined;
}) {
  const [today, setToday] = useState<DungeonToday | null>(null);
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const replays = useRef(new Map<string, DungeonReplay>());
  const unmounted = useRef(false);
  // A run ended and its balances have not been reloaded yet (they wait until its last fight has played).
  const refreshOwed = useRef(false);
  // The timers below outlive a render: they read the latest view and callback through these.
  const latestView = useRef<View>({ kind: 'loading' });
  // What the canvas holds back while a room's fight plays (`cave-canvas/hold.ts`), applied when it has.
  const held = useRef<HeldAnswer | null>(null);
  const onCanvas = caveCanvasOn(canvas, today);
  const canvasNow = useRef(false);
  canvasNow.current = onCanvas;
  const latestFinished = useRef(onRunFinished);
  latestFinished.current = onRunFinished;
  // The dungeon's own words, and its own idea of a stale screen (by code, not by status). After
  // such a "no" today is loaded again: the run may exist.
  const runner = useActionRunner({
    errorText: dungeonErrorText,
    isStale: isStaleDungeonError,
    onStale: () => {
      load('initial');
    },
  });
  const { busy, error, setError } = runner;

  useEffect(
    () => () => {
      unmounted.current = true;
      // Left while a fight was still playing (or the results not yet shown): the run was paid anyway.
      if (refreshOwed.current) latestFinished.current();
    },
    [],
  );

  latestView.current = view;

  // The tab's pip follows what the server last said about today.
  useEffect(() => {
    if (today !== null) onCanRunChange(today.canRun);
  }, [today]);

  // The valley draws no scene of its own above the canvas.
  useEffect(() => {
    if (today !== null) onCanvasChange?.(onCanvas);
  }, [onCanvas, today === null]);

  // The valley's Cave says what the page knows: a run in progress is not "quiet".
  useEffect(() => {
    if (today === null || onPhaseChange === undefined) return;
    const phase = dungeonPhase(view.kind, today.canRun, runEndedForPhase(view, onCanvas));
    if (phase !== null) onPhaseChange(phase);
  }, [today, view]);

  function accept(next: DungeonToday, screen: 'keep' | 'initial'): void {
    setToday(next);
    setOffset(clockOffset(next.serverNow, Date.now()));
    if (screen === 'initial') {
      const pick = initialScreen(next);
      const open = openRun(next);
      if (pick === 'run' && open !== null) setView({ kind: 'run', state: open });
      else if (pick === 'results' && next.last !== null)
        setView({ kind: 'results', run: next.last });
      else setView({ kind: 'setup' });
    }
  }

  function load(screen: 'keep' | 'initial'): void {
    fetchDungeonToday().then(
      (next) => {
        if (unmounted.current) return;
        setLoadError(null);
        accept(next, screen);
      },
      (err: unknown) => {
        if (unmounted.current) return;
        setLoadError(dungeonErrorText(err));
      },
    );
  }

  useEffect(() => {
    load('initial');
  }, []);

  // When the day resets under an open screen, ask again: a new run is open.
  useEffect(() => {
    if (today === null) return undefined;
    const wait = msUntilReset(today, Date.now(), offset) + RESET_GRACE_MS;
    const timer = setTimeout(
      () => {
        // A fight on screen plays out first.
        const playing =
          latestView.current.kind === 'playback' || latestView.current.kind === 'fight';
        if (!runner.inFlight()) load(playing ? 'keep' : 'initial');
      },
      Math.min(wait, 2 ** 31 - 1),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [today?.resetsAt, offset]);

  async function watch(run: DungeonRunSummary): Promise<void> {
    // A failed read changes nothing, so the screen is not reloaded for it.
    await runner.run(
      async () => {
        const cached = replays.current.get(run.id);
        const replay = cached ?? (await fetchDungeonReplay(run.id));
        replays.current.set(run.id, replay);
        if (!unmounted.current) {
          setView({ kind: 'playback', input: replayInput(replay), run: replay.summary });
        }
      },
      { reload: false },
    );
  }

  /** A room's fight has played out: what the canvas held back is applied now, then the run goes on or its results show. */
  function fightDone(fight: Extract<View, { kind: 'fight' }>): void {
    release(held.current, {
      accept: (next) => {
        accept(next, 'keep');
      },
      load: () => {
        load('keep');
      },
    });
    held.current = null;
    if (screenAfterFight(fight.summary ?? undefined, fight.state) === 'results') {
      if (fight.summary !== null) finish(fight.summary);
    } else setView({ kind: 'run', state: fight.state });
  }

  /** The run is over and its summary is in: show the results and reload the balances. */
  function finish(run: DungeonRunSummary): void {
    refreshOwed.current = false;
    setView({ kind: 'results', run });
    onRunFinished();
  }

  /** What an act answered: the fight to play, the results, or the run as it stands now. */
  function apply(answer: DungeonActResponse): void {
    // On the canvas a room's fight plays on the scene and nothing of the answer shows before it has (`cave-canvas/hold.ts`).
    const hold = canvasNow.current && answer.room !== undefined;
    if (hold) held.current = heldOf(answer);
    else if (answer.today !== undefined) accept(answer.today, 'keep');
    else if (answer.summary !== undefined) load('keep');
    if (answer.summary !== undefined) {
      replays.current.delete(answer.summary.id);
      refreshOwed.current = true;
    }
    switch (screenAfterAct(answer)) {
      case 'fight':
        if (answer.room !== undefined) {
          setView({
            kind: 'fight',
            input: roomInput(
              answer.state.team,
              answer.room,
              answer.state.landmark,
              answer.state.map.floors,
              answer.state.undercroft?.maps ?? [],
            ),
            state: answer.state,
            summary: answer.summary ?? null,
            before: latestView.current.kind === 'run' ? latestView.current.state : answer.state,
          });
        }
        return;
      case 'results':
        if (answer.summary !== undefined) finish(answer.summary);
        return;
      default:
        setView({ kind: 'run', state: answer.state });
    }
  }

  /**
   * One act of the open run, sent with the step the screen last saw. The key belongs to this act at
   * this step: kept if the answer never came, so a retry cannot play a room twice.
   */
  async function act(state: DungeonRunState, what: DungeonAct): Promise<void> {
    await runner.runKeyed(ActionIds.dungeonAct(state.id, state.step, what), async (key) => {
      const answer = await dungeonAct({
        runId: state.id,
        step: state.step,
        idempotencyKey: key,
        act: what,
      });
      if (!unmounted.current) apply(answer);
    });
  }

  async function enter(slots: Slots, treats: ReadonlySet<string>, depth?: number): Promise<void> {
    const team = completeTeam(slots);
    if (today === null || team === null) return;
    const request = buildRunRequest(slots, '', treats);
    const picked = request?.treats ?? [];
    // One key per distinct run: a retry of the same picks (and treats) reuses it, other picks get their own.
    await runner.runKeyed(ActionIds.dungeonStart(team, picked, depth), async (key) => {
      const answer = await startDungeonRun({
        team,
        ...(picked.length === 0 ? {} : { treats: picked }),
        ...(depth === undefined ? {} : { depth }),
        idempotencyKey: key,
      });
      onRunStarted();
      if (unmounted.current) return;
      accept(answer.today, 'keep');
      setView({ kind: 'run', state: answer.state });
    });
  }

  if (loadError !== null && today === null) {
    return (
      <section class="raid-section">
        <Alert level="alert">{loadError}</Alert>
        <p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              load('initial');
            }}
          >
            Try again
          </button>
        </p>
      </section>
    );
  }
  if (today === null || view.kind === 'loading') {
    return <p class="muted">Loading the dungeon...</p>;
  }

  if (onCanvas) {
    const shown: CaveView =
      view.kind === 'fight'
        ? {
            kind: 'fight',
            input: view.input,
            before: view.before,
            after: view.state,
            summary: view.summary,
          }
        : view;
    return (
      <CaveCanvas
        today={today}
        offset={offset}
        view={shown}
        creatures={creatures}
        busy={busy}
        error={error ?? loadError}
        bait={bait}
        treatsOff={treatsOff}
        draft={draft}
        onDraftChange={onDraftChange}
        saveDraft={(team) => saveDungeonTeam({ team })}
        onEnter={(slots, treats, depth) => {
          void enter(slots, treats, depth);
        }}
        onAct={(what) => {
          if (view.kind === 'run') void act(view.state, what);
        }}
        onFightDone={() => {
          if (view.kind === 'fight') fightDone(view);
        }}
        onPlaybackDone={() => {
          if (view.kind !== 'playback') return;
          setView({ kind: 'results', run: view.run });
          onRunFinished();
        }}
        onWatch={(run) => {
          void watch(run);
        }}
        onRetry={() => {
          setError(null);
          setView({ kind: 'setup' });
        }}
        onSeeLast={() => {
          if (today.last !== null) setView({ kind: 'results', run: today.last });
        }}
        configure={configure}
        trayInput={trayInput ?? { trips: [], jobs: null, now: Date.now() + offset }}
      />
    );
  }

  return (
    <>
      {loadError !== null && <Alert level="alert">{loadError}</Alert>}
      {view.kind === 'setup' && (
        <DungeonSetup
          today={today}
          forecast={forecast}
          creatures={creatures}
          bait={bait}
          busy={busy}
          error={error}
          draft={draft}
          onDraftChange={onDraftChange}
          saveDraft={(team) => saveDungeonTeam({ team })}
          onEnter={(slots, treats, depth) => {
            void enter(slots, treats, depth);
          }}
          onSeeLast={() => {
            if (today.last !== null) setView({ kind: 'results', run: today.last });
          }}
          configure={configure}
        />
      )}
      {view.kind === 'run' && (
        <DungeonRun
          state={view.state}
          creatures={creatures}
          busy={busy}
          error={error}
          onAct={(what) => {
            void act(view.state, what);
          }}
        />
      )}
      {view.kind === 'fight' && (
        <DungeonPlayback
          input={view.input}
          onDone={() => {
            fightDone(view);
          }}
        />
      )}
      {view.kind === 'playback' && (
        <DungeonPlayback
          input={view.input}
          onDone={() => {
            setView({ kind: 'results', run: view.run });
            onRunFinished();
          }}
        />
      )}
      {view.kind === 'results' && (
        <DungeonResults
          run={view.run}
          today={today}
          offset={offset}
          canRetry={today.canRun}
          busy={busy}
          error={error}
          onWatch={() => {
            void watch(view.run);
          }}
          onRetry={() => {
            setError(null);
            setView({ kind: 'setup' });
          }}
        />
      )}
    </>
  );
}
