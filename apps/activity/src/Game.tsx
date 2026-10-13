import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ApiError,
  chooseStarter,
  claimExpedition,
  evolveCreature,
  fetchState,
  renameCreature,
  startExpedition,
  trainCreature,
  type ClaimResult,
  type EvolveResult,
  type GameState,
  type LeetSyncStatus,
} from './api';
import { createKeyStore } from './actions';
import { Collection } from './Collection';
import { Expeditions, type SendRequest } from './Expeditions';
import { fetchGear } from './gear-api';
import { createGearActions } from './gear-actions';
import type { GearState, JobResult } from './gear-types';
import { GlossaryTag } from './Glossary';
import { clockOffset, creatureName, errorText, speciesName } from './game';
import { glyphOrUnknown } from './glyphs';
import { Raid } from './Raid';
import { SYNC_POLL_INTERVAL_MS, shouldRefetchLeet } from './leet-status';
import { Sprite } from './sprites/Sprite';
import { StarterPicker } from './StarterPicker';
import { Workshop } from './Workshop';

type Tab = 'collection' | 'expeditions' | 'raid' | 'workshop';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'collection', label: 'Collection' },
  { id: 'expeditions', label: 'Expeditions' },
  { id: 'raid', label: 'Raid' },
  { id: 'workshop', label: 'Workshop' },
];

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
  showPractice,
}: {
  initial: GameState;
  /** True on staging and local runs, where the server can start a practice finale. */
  showPractice: boolean;
  /** Called with the sync status of every state this component loads, so the footer stays current. */
  onLeetSync: (status: LeetSyncStatus) => void;
}) {
  const [current, setCurrent] = useState<Loaded>(() => loaded(initial));
  const [tab, setTab] = useState<Tab>('collection');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<ClaimResult | null>(null);
  // Gear, parts, blueprints and jobs; null until the first load (or when it failed).
  const [gear, setGear] = useState<GearState | null>(null);
  const [gearFailed, setGearFailed] = useState(false);
  const [jobReveal, setJobReveal] = useState<JobResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const keys = useRef(createKeyStore()).current;
  // A second tap in the same tick must not start a second request, even before `busy` renders.
  const inFlight = useRef(false);
  // Counts player actions, so a background refresh that started before one is never applied.
  const actionCount = useRef(0);
  // Counts gear views that came from an action, so a slower load that started before one is dropped.
  const gearVersion = useRef(0);
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
  async function run<T>(
    action: string,
    task: () => Promise<T>,
    currency?: string,
  ): Promise<T | undefined> {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    actionCount.current += 1;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const value = await task();
      keys.settle(action);
      return value;
    } catch (err) {
      keys.settle(action, err);
      setError(errorText(err, currency));
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        try {
          setCurrent(loaded(await fetchState()));
        } catch {
          // Keep the error above; the next action reloads anyway.
        }
        loadGear();
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

  /** Reloads the state in the background (balances move when raids pay Essence). */
  function refreshState(): void {
    if (inFlight.current) return;
    const startedAt = actionCount.current;
    fetchState().then(
      (next) => {
        if (!inFlight.current && actionCount.current === startedAt) setCurrent(loaded(next));
      },
      () => undefined,
    );
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
    keyFor: (action) => keys.keyFor(action),
    apply: (views) => {
      gearVersion.current += 1;
      setCurrent(loaded(views.state));
      setGear(views.gear);
      setGearFailed(false);
    },
  });

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
        <span class="bait-amount">{game.balances.bait}</span>{' '}
        <GlossaryTag entry="bait">Bait</GlossaryTag>
      </p>
      <p class="essence" aria-label="Essence balance">
        <span class="essence-amount">{game.balances.essence}</span>{' '}
        <GlossaryTag entry="essence">Essence</GlossaryTag>
      </p>
      <div class="tabs" role="tablist" aria-label="Sections">
        {TABS.map(({ id, label }) => (
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
              setError(null);
              setNotice(null);
              refreshState();
              if (id === 'workshop' || id === 'collection') loadGear();
            }}
          >
            {id === 'workshop' && (
              <Sprite sprite={glyphOrUnknown('anvil')} scale={2} class="tab-glyph" />
            )}
            {label}
          </button>
        ))}
      </div>
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
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'collection' && (
          <Collection
            state={game}
            gear={gear}
            busy={busy}
            onEquip={async (gearId, creatureId) =>
              (await gearActions.equip(gearId, creatureId)) !== undefined
            }
            onTrain={(creature) => {
              const action = `train:${creature.id}`;
              void runState(action, () => trainCreature(creature.id, keys.keyFor(action)));
            }}
            onEvolve={(creature) => {
              const action = `evolve:${creature.id}`;
              void run(
                action,
                () => evolveCreature(creature.id, keys.keyFor(action)),
                'Essence',
              ).then((done: EvolveResult | undefined) => {
                if (done === undefined) return;
                setCurrent(loaded(done.state));
                setNotice(
                  `${creatureName(creature)} evolved into ${speciesName(done.species)}!${done.firstOnServer ? ' First on server!' : ''}`,
                );
              });
            }}
            onRename={(creature, nickname) => {
              void runState(`rename:${creature.id}`, () => renameCreature(creature.id, nickname));
            }}
          />
        )}
        {tab === 'expeditions' && (
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
                  // The trip's parts and blueprints are in the Workshop now.
                  loadGear();
                },
              );
            }}
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
      </div>
    </>
  );
}
