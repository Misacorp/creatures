/**
 * The live Sunday finale on combat v2 (docs/design/finale-live.md, docs/design/combat/integration.md, section 9): the v2 stage played from
 * the server's snapshots (the finale socket when the server offers it, else the 2 s poll, as the shipped finale), with the caller's one
 * input under it. A round plays through in the time the server gives it (a fixed round, its beats squeezed to fit); the stage resumes at
 * the round that is on when the tab was away. The result and the loot are the same reveal card as everywhere. Names are text only.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError } from './api';
import { clockOffset, errorText } from './game';
import { FinaleInputV2 } from './FinaleInputV2';
import { createFinaleSocketWith } from './finale-socket';
import { createFinalePoller, type FinalePoller } from './finale-poller';
import { LOBBY_LINE, DONE_LINE, ownInput } from './finale-v2';
import { foldSetupOf, stageModelOf, type FoldSetup } from './fight-v2';
import { fetchLiveV2, parseLiveV2, sendLiveActionV2, type LiveSnapshotV2 } from './fight-v2-api';
import { useServerNow } from './hooks';
import { finaleLiveOffered } from './live-flags';
import { createKeyLock, finaleSocketTarget, pickNewer } from './live';
import { INTRO_LIVE_MS, roundBudgetMs } from './playback-v2';
import type { RaidView } from './raid-api';
import { RevealCard } from './Reveal';
import { summaryBoss } from './raid-summary-view';
import { StageV2 } from './StageV2';
import { LogToggle } from './Stage';
import { formatCountdown } from './time-format';
import { Alert } from './ui/Alert';
import { DrillHead } from './ui/DrillHead';
import { onDrillKey } from './ui/drill-keys';
import { usePlaybackV2 } from './use-playback-v2';

export function LiveV2({
  initial,
  onClose,
  onBalanceChange,
  onRevealSeen,
  onReplay,
  season = null,
  view = null,
}: {
  initial: LiveSnapshotV2 | null;
  onClose: () => void;
  /** Called when the Essence balance may have changed. */
  onBalanceChange: () => void;
  /** Called when the player has seen the loot reveal. */
  onRevealSeen: (week: string) => void;
  /** Opens the replay of the finished finale (it closes this view first). */
  onReplay: (week: string, party: number) => void;
  season?: { weekId: string; season: RaidView['season'] } | null;
  view?: Pick<RaidView, 'weekId' | 'boss' | 'effectiveRank'> | null;
}) {
  const [snapshot, setSnapshot] = useState<LiveSnapshotV2 | null>(initial);
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const latest = useRef<LiveSnapshotV2 | null>(initial);
  /** Server clock minus local clock, from the newest snapshot. */
  const offset = useRef(0);
  const locks = useRef(createKeyLock());
  const serverNow = useServerNow(offset.current, true);

  function accept(next: LiveSnapshotV2): void {
    const kept = pickNewer(latest.current, next);
    latest.current = kept;
    if (kept !== next) return;
    offset.current = clockOffset(next.serverNow, Date.now());
    setSnapshot(next);
  }

  // The poll (every 2 s and after each round boundary, or a slow safety poll while the socket delivers) and the socket on top of it.
  const poller = useRef<FinalePoller<LiveSnapshotV2> | null>(null);
  useEffect(() => {
    const next = createFinalePoller<LiveSnapshotV2>({
      fetchSnapshot: fetchLiveV2,
      accept,
      latest: () => latest.current,
      serverNow: () => Date.now() + offset.current,
      onError: (err, retrying) => {
        setPollError(retrying ? 'Connection problem. Trying again...' : errorText(err));
      },
      onRecovered: () => {
        setPollError(null);
      },
    });
    poller.current = next;
    next.start(initial);
    return () => {
      next.stop();
      poller.current = null;
    };
  }, []);
  const target = finaleSocketTarget(finaleLiveOffered(), snapshot);
  const targetKey = target === null ? null : `${target.week}:${String(target.party)}`;
  useEffect(() => {
    const active = poller.current;
    if (target === null || active === null) return undefined;
    const socket = createFinaleSocketWith(parseLiveV2, {
      week: target.week,
      party: target.party,
      poller: active,
    });
    socket.start();
    return () => {
      socket.stop();
    };
  }, [targetKey]);

  const hasLoot = snapshot !== null && snapshot.loot !== null;
  useEffect(() => {
    if (hasLoot) onBalanceChange();
  }, [hasLoot]);

  /** Fire, Hold or Unhold the caller's input. One request at a time. */
  async function act(key: string, action: 'fire' | 'hold' | 'unhold', row?: number): Promise<void> {
    if (!locks.current.acquire(key)) return;
    setBusy(true);
    setActionError(null);
    try {
      accept(await sendLiveActionV2({ key, action, ...(row === undefined ? {} : { row }) }));
    } catch (err) {
      setActionError(errorText(err));
      if (err instanceof ApiError && err.status === 409) {
        // The screen was probably out of date; show what the server says now.
        try {
          accept(await fetchLiveV2());
        } catch {
          // The error above stays; the next poll catches up.
        }
      }
    } finally {
      locks.current.release(key);
      setBusy(false);
    }
  }

  const back = <DrillHead title="Finale" onBack={onClose} backLabel="to the raid" />;
  const errors = pollError !== null && <Alert level="alert">{pollError}</Alert>;

  if (snapshot === null) {
    return (
      <section class="raid-section" aria-label="Finale" onKeyDown={onDrillKey(onClose)}>
        {back}
        {errors}
        {pollError === null && <p class="muted">Joining the finale...</p>}
      </section>
    );
  }
  if (snapshot.status === 'none') {
    return (
      <section class="raid-section" aria-label="Finale" onKeyDown={onDrillKey(onClose)}>
        {back}
        {errors}
        <p class="muted">There is no finale to play right now.</p>
      </section>
    );
  }

  return (
    <section class="raid-section" aria-label="Finale" onKeyDown={onDrillKey(onClose)}>
      {back}
      {errors}
      {snapshot.status !== 'lobby' &&
        snapshot.loot !== null &&
        !dismissed &&
        snapshot.party !== null && (
          <RevealCard
            reveal={snapshot.loot}
            busy={false}
            season={season}
            boss={summaryBoss(view, snapshot.week, snapshot.boss)}
            afterAction={{
              week: snapshot.week,
              party: snapshot.party,
              onReplay: () => {
                onReplay(snapshot.week, snapshot.party ?? 0);
              },
            }}
            onDismiss={() => {
              setDismissed(true);
              onRevealSeen(snapshot.week);
              onBalanceChange();
            }}
          />
        )}
      <FightV2
        snapshot={snapshot}
        serverNow={serverNow}
        busy={busy}
        actionError={actionError}
        onFire={(key, row) => {
          void act(key, 'fire', row);
        }}
        onAuto={(key, on) => {
          void act(key, on ? 'unhold' : 'hold');
        }}
      />
      <Watching names={snapshot.watching} />
      {snapshot.status === 'done' && (
        <p>
          <button type="button" onClick={onClose}>
            Back to the raid
          </button>
        </p>
      )}
    </section>
  );
}

/** The round counter and the time to the next one. */
function progressV2(
  snapshot: LiveSnapshotV2,
  serverNow: number,
): { headline: string; countdown: string } {
  if (snapshot.status === 'done') return { headline: DONE_LINE, countdown: '' };
  if (snapshot.status === 'lobby' || snapshot.round < 1) {
    const wait = (snapshot.startsAt ?? serverNow) - serverNow;
    return { headline: LOBBY_LINE, countdown: `Starts in ${formatCountdown(wait, 'clock')}` };
  }
  const last = snapshot.round >= snapshot.rounds;
  const wait =
    snapshot.nextRoundAt === null ? '' : formatCountdown(snapshot.nextRoundAt - serverNow, 'hms');
  return {
    headline: `Round ${String(snapshot.round)} / ${String(snapshot.rounds)}`,
    countdown: wait === '' ? '' : last ? `Ends in ${wait}` : `Next round in ${wait}`,
  };
}

/** The lobby, or the stage of a fight in progress (or over) with the caller's input under it. */
export function FightV2({
  snapshot,
  serverNow,
  busy,
  actionError,
  onFire,
  onAuto,
}: {
  snapshot: LiveSnapshotV2;
  serverNow: number;
  busy: boolean;
  actionError: string | null;
  onFire: (key: string, row: number | undefined) => void;
  onAuto: (key: string, on: boolean) => void;
}) {
  const progress = progressV2(snapshot, serverNow);
  const { boss, bossDef, card, names } = snapshot;
  const showStage =
    snapshot.status !== 'lobby' &&
    boss !== null &&
    bossDef !== null &&
    card !== null &&
    names !== null &&
    boss.hpStart !== null &&
    boss.hpMax !== null;
  const ability = ownInput(snapshot);
  return (
    <>
      <p class="live-round" role="status" aria-live="off">
        {/* With the stage on screen its head already says the round, so the page's line keeps only the countdown (and says the round to a screen reader). */}
        {showStage ? (
          <span class="visually-hidden">{progress.headline}</span>
        ) : (
          <strong>{progress.headline}</strong>
        )}
        {progress.countdown !== '' && <span class="live-countdown"> {progress.countdown}</span>}
      </p>
      {showStage && boss !== null && bossDef !== null && card !== null && names !== null && (
        <LiveStageV2
          snapshot={snapshot}
          boss={bossDef}
          hpMax={boss.hpMax ?? bossDef.hp}
          hpStart={boss.hpStart ?? bossDef.hp}
          card={card}
          names={names}
        >
          {ability !== null && snapshot.status !== 'done' && (
            <FinaleInputV2
              snapshot={snapshot}
              ability={ability}
              busy={busy}
              error={actionError}
              onFire={(row) => {
                onFire(ability.key, row);
              }}
              onAuto={(on) => {
                onAuto(ability.key, on);
              }}
            />
          )}
        </LiveStageV2>
      )}
      {snapshot.status === 'lobby' && (
        <p class="muted">
          Your action is set on the Raid tab. The fight plays on its own whether you watch or not.
        </p>
      )}
    </>
  );
}

function LiveStageV2({
  snapshot,
  boss,
  hpMax,
  hpStart,
  card,
  names,
  children,
}: {
  snapshot: LiveSnapshotV2;
  boss: NonNullable<LiveSnapshotV2['bossDef']>;
  hpMax: number;
  hpStart: number;
  card: NonNullable<LiveSnapshotV2['card']>;
  names: NonNullable<LiveSnapshotV2['names']>;
  children: ComponentChildren;
}) {
  const setup: FoldSetup = useMemo(
    () => foldSetupOf({ fighters: snapshot.fighters, card, bossHpStart: hpStart }),
    [snapshot.fighters, card, hpStart],
  );
  const model = useMemo(() => stageModelOf(setup, snapshot.events), [setup, snapshot.events]);
  const playback = usePlaybackV2({
    model,
    events: snapshot.events,
    rounds: snapshot.rounds,
    speed: 1,
    introMs: INTRO_LIVE_MS,
    budgetMs: roundBudgetMs(snapshot.roundMs, INTRO_LIVE_MS),
    mode: 'live',
  });
  return (
    <>
      <StageV2
        boss={boss}
        card={card}
        fighters={snapshot.fighters}
        names={names}
        you={snapshot.you}
        model={model}
        playback={playback}
        place="Finale"
        hpMax={hpMax}
        rounds={snapshot.rounds}
      >
        {children}
      </StageV2>
      <LogToggle id="live-log">
        <ol class="replay-log" tabIndex={0} aria-label="Fight log">
          {snapshot.events
            .slice(0, model.beats[playback.beat - 1]?.to ?? 0)
            .map((event, i) => (event.text === '' ? null : <li key={i}>{event.text}</li>))}
        </ol>
      </LogToggle>
    </>
  );
}

function Watching({ names }: { names: readonly string[] }) {
  return (
    <>
      <h4>Watching ({names.length})</h4>
      {names.length === 0 ? (
        <p class="muted">Nobody yet.</p>
      ) : (
        <ul class="roster">
          {names.map((name, index) => (
            <li key={index} class="roster-entry">
              {name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
