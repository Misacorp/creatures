import { useEffect, useRef, useState } from 'preact/hooks';
import { ActionIds } from './actions';
import type { Creature } from './api';
import { DungeonPlayback } from './DungeonPlayback';
import { DungeonResults } from './DungeonResults';
import { DungeonSetup } from './DungeonSetup';
import {
  fetchDungeonReplay,
  fetchDungeonToday,
  saveDungeonTeam,
  startDungeonRun,
} from './dungeon-api';
import { initialScreen, msUntilReset, RESET_GRACE_MS } from './dungeon-flow';
import { completeTeam, type Slots } from './dungeon-team';
import { dungeonErrorText, isStaleDungeonError } from './dungeon-text';
import type { DungeonReplay, DungeonRunSummary, DungeonToday } from './dungeon-types';
import { clockOffset } from './game';
import { useActionRunner } from './use-action-runner';

type View =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'playback'; replay: DungeonReplay }
  | { kind: 'results'; run: DungeonRunSummary };

/**
 * The Dungeon tab: the pre-run screen, the playback of the run and its results (which also carry
 * the streak and the reset time).
 * The run itself is the server's (it draws the seed, plays the rooms and pays the rewards in one
 * go); this screen sends the player's picks with an idempotency key, which is reused if the answer
 * never arrived, and then shows what the server stored. A run's results stay on screen after it has
 * been played; coming back later shows them again with "Watch again".
 */
export function Dungeon({
  creatures,
  draft,
  onDraftChange,
  onRunStarted,
  onCanRunChange,
  onRunFinished,
}: {
  creatures: readonly Creature[];
  /** The setup row of this session, kept by the game across tab switches (null: none). */
  draft: Slots | null;
  /** The setup row changed. */
  onDraftChange: (slots: Slots) => void;
  /** A run was accepted by the server: it deleted the saved draft, so the game forgets its copy. */
  onRunStarted: () => void;
  /** Whether a run can start now, whenever today's state is loaded or changes (the tab's pip). */
  onCanRunChange: (canRun: boolean) => void;
  /** The run's playback ended (or was skipped): balances and the bag changed, so reload them. */
  onRunFinished: () => void;
}) {
  const [today, setToday] = useState<DungeonToday | null>(null);
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const replays = useRef(new Map<string, DungeonReplay>());
  const unmounted = useRef(false);
  // The dungeon's own words, and its own idea of a stale screen (by code, not by status). After
  // such a "no" today is loaded again: the run may exist.
  const runner = useActionRunner({
    errorText: dungeonErrorText,
    isStale: isStaleDungeonError,
    onStale: () => {
      load('keep');
    },
  });
  const { busy, error, setError } = runner;

  useEffect(
    () => () => {
      unmounted.current = true;
    },
    [],
  );

  // The tab's pip follows what the server last said about today.
  useEffect(() => {
    if (today !== null) onCanRunChange(today.canRun);
  }, [today]);

  function accept(next: DungeonToday, screen: 'keep' | 'initial'): void {
    setToday(next);
    setOffset(clockOffset(next.serverNow, Date.now()));
    if (screen === 'initial') {
      const pick = initialScreen(next);
      setView(
        pick === 'results' && next.last !== null
          ? { kind: 'results', run: next.last }
          : { kind: 'setup' },
      );
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
        if (!runner.inFlight()) load(view.kind === 'playback' ? 'keep' : 'initial');
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
        if (!unmounted.current) setView({ kind: 'playback', replay });
      },
      { reload: false },
    );
  }

  async function enter(slots: Slots): Promise<void> {
    const team = completeTeam(slots);
    if (today === null || team === null) return;
    // One key per distinct run: a retry of the same picks reuses it, other picks get their own.
    await runner.runKeyed(ActionIds.dungeonRun(team), async (key) => {
      const answer = await startDungeonRun({ team, idempotencyKey: key });
      onRunStarted();
      if (unmounted.current) return;
      accept(answer.today, 'keep');
      replays.current.delete(answer.run.id);
      // The run is final. Show it: the replay's events come from the server, owner only.
      try {
        const replay = await fetchDungeonReplay(answer.run.id);
        replays.current.set(answer.run.id, replay);
        if (!unmounted.current) setView({ kind: 'playback', replay });
      } catch (err) {
        // The run exists and is paid; only the playback failed. "Watch again" tries once more.
        if (!unmounted.current) {
          setView({ kind: 'results', run: answer.run });
          setError(dungeonErrorText(err));
        }
        onRunFinished();
      }
    });
  }

  if (loadError !== null && today === null) {
    return (
      <section class="raid-section">
        <p class="error" role="alert">
          {loadError}
        </p>
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

  return (
    <>
      {loadError !== null && (
        <p class="error" role="alert">
          {loadError}
        </p>
      )}
      {view.kind === 'setup' && (
        <DungeonSetup
          today={today}
          creatures={creatures}
          busy={busy}
          error={error}
          draft={draft}
          onDraftChange={onDraftChange}
          saveDraft={(team) => saveDungeonTeam({ team })}
          onEnter={(slots) => {
            void enter(slots);
          }}
          onSeeLast={() => {
            if (today.last !== null) setView({ kind: 'results', run: today.last });
          }}
        />
      )}
      {view.kind === 'playback' && (
        <DungeonPlayback
          replay={view.replay}
          onDone={() => {
            setView({ kind: 'results', run: view.replay.summary });
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
