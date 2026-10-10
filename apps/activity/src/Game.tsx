import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ApiError,
  chooseStarter,
  claimExpedition,
  fetchState,
  renameCreature,
  startExpedition,
  trainCreature,
  type ClaimResult,
  type GameState,
  type LeetSyncStatus,
} from './api';
import { createKeyStore } from './actions';
import { Collection } from './Collection';
import { Expeditions, type SendRequest } from './Expeditions';
import { clockOffset, errorText } from './game';
import { SYNC_POLL_INTERVAL_MS, shouldRefetchLeet } from './leet-status';
import { StarterPicker } from './StarterPicker';

type Tab = 'collection' | 'expeditions';

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
  onLeetSync,
}: {
  initial: GameState;
  /** Called with the sync status of every state this component loads, so the footer stays current. */
  onLeetSync: (status: LeetSyncStatus) => void;
}) {
  const [current, setCurrent] = useState<Loaded>(() => loaded(initial));
  const [tab, setTab] = useState<Tab>('collection');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<ClaimResult | null>(null);
  const keys = useRef(createKeyStore()).current;
  // A second tap in the same tick must not start a second request, even before `busy` renders.
  const inFlight = useRef(false);
  // Counts player actions, so a background refresh that started before one is never applied.
  const actionCount = useRef(0);
  const { game, offset } = current;

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
            if (!inFlight.current && actionCount.current === startedAt) setCurrent(loaded(next));
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

  /**
   * Runs one user action. Idempotency keys are reused when the outcome is unknown (network error)
   * so a retry cannot spend twice. After a definite "no" the state is reloaded, since the screen
   * was probably out of date.
   */
  async function run<T>(action: string, task: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    actionCount.current += 1;
    setBusy(true);
    setError(null);
    try {
      const value = await task();
      keys.settle(action);
      return value;
    } catch (err) {
      keys.settle(action, err);
      setError(errorText(err));
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        try {
          setCurrent(loaded(await fetchState()));
        } catch {
          // Keep the error above; the next action reloads anyway.
        }
      }
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function runState(action: string, task: () => Promise<GameState>): Promise<void> {
    const next = await run(action, task);
    if (next !== undefined) setCurrent(loaded(next));
  }

  if (!game.starterChosen) {
    return (
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
            const action = `starter:${species}`;
            void runState(action, () => chooseStarter(species, keys.keyFor(action)));
          }}
        />
      </>
    );
  }

  return (
    <>
      <p class="bait" aria-label="Bait balance">
        <span class="bait-amount">{game.balances.bait}</span> Bait
      </p>
      <div class="tabs" role="tablist" aria-label="Sections">
        {(['collection', 'expeditions'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            class={tab === id ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(id);
            }}
          >
            {id === 'collection' ? 'Collection' : 'Expeditions'}
          </button>
        ))}
      </div>
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'collection' ? (
          <Collection
            state={game}
            busy={busy}
            onTrain={(creature) => {
              const action = `train:${creature.id}`;
              void runState(action, () => trainCreature(creature.id, keys.keyFor(action)));
            }}
            onRename={(creature, nickname) => {
              void runState(`rename:${creature.id}`, () => renameCreature(creature.id, nickname));
            }}
          />
        ) : (
          <Expeditions
            state={game}
            offset={offset}
            busy={busy}
            reveal={reveal}
            onSend={(request: SendRequest) => {
              const action = `send:${request.creatureId}:${request.duration}:${request.supplies}`;
              void runState(action, () =>
                startExpedition({ ...request, idempotencyKey: keys.keyFor(action) }),
              );
            }}
            onClaim={(expedition) => {
              void run(`claim:${expedition.id}`, () => claimExpedition(expedition.id)).then(
                (done) => {
                  if (done === undefined) return;
                  setCurrent(loaded(done.state));
                  setReveal(done.result);
                },
              );
            }}
            onDismissReveal={() => {
              setReveal(null);
            }}
          />
        )}
      </div>
    </>
  );
}
