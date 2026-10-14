import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from './api';
import { Countdown } from './Countdown';
import { countdownView, spokenCountdown } from './countdown';
import { clockOffset, errorText } from './game';
import { useServerNow } from './hooks';
import {
  abilityStateText,
  abilityTitle,
  autoFireTarget,
  buildAction,
  createKeyLock,
  earlierLines,
  errorRetryDelayMs,
  feedLines,
  isRetryableStatus,
  nextPollDelay,
  noAbilityText,
  otherUsage,
  otherUsageText,
  othersSummary,
  ownAbilities,
  pickNewer,
  PRACTICE_LABEL,
  progressText,
  type FeedLine,
} from './live';
import {
  fetchLive,
  sendLiveAction,
  type LiveAbility,
  type LiveActionRequest,
  type LiveRunning,
  type LiveSnapshot,
} from './live-api';
import type { ReplayRowEntry } from './raid-api';
import { AbilityPopoverBody, AbilityPopoverSection } from './AbilityPopover';
import { setRaidAutofire } from './raid-api';
import { RevealCard } from './Reveal';
import { LiveRegion } from './ui/LiveRegion';
import { BossHp } from './ui/SegmentBar';
import type { Badge } from './stage-abilities';
import { LiveStage, LogToggle } from './Stage';
import { useRemaining } from './use-countdown';

/**
 * The live Sunday finale: the lobby and the fight, with the boss HP, the row, the round's events
 * and the player's abilities (their basic one plus one for each unlocked team creature, each with its
 * own Fire button and Auto fire toggle). The view only displays the server's snapshot and sends
 * Fire and the toggle; it polls while the finale is on and stops by itself when the fight is over.
 */
export function Live({
  initial,
  onClose,
  onBalanceChange,
  onRevealSeen,
  onReplay,
}: {
  /** A snapshot the caller already has (a practice fight that was just started). */
  initial: LiveSnapshot | null;
  onClose: () => void;
  /** Called when the Essence balance may have changed. */
  onBalanceChange: () => void;
  /** Called when the player has seen the loot reveal. */
  onRevealSeen: (week: string) => void;
  /** Opens the replay of a finished finale (it closes this view first). */
  onReplay: (week: string, party: number) => void;
}) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(initial);
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ key: string; text: string } | null>(null);
  /** Keys of the abilities with a request on its way (their buttons are off). */
  const [busyKeys, setBusyKeys] = useState<readonly string[]>([]);
  /** The zone and element picked for each ability that asks for one, by ability key. */
  const [zones, setZones] = useState<Readonly<Record<string, string>>>({});
  const [elements, setElements] = useState<Readonly<Record<string, string>>>({});
  const [dismissed, setDismissed] = useState(false);
  const latest = useRef<LiveSnapshot | null>(initial);
  /** Server clock minus local clock, from the newest snapshot. */
  const offset = useRef(0);
  /** One request at a time per ability: a double tap on one ability sends one request. */
  const locks = useRef(createKeyLock());
  const serverNow = useServerNow(offset.current, true);
  // The countdown over the stage in the last 30 seconds before the start: from the server's start
  // time and the clock offset, so it follows the server's clock and needs no extra requests.
  const startsAtLocal =
    snapshot !== null && snapshot.status !== 'none' ? snapshot.startsAt - offset.current : null;
  const remaining = useRemaining(startsAtLocal);
  const countdown = countdownView(remaining ?? Number.POSITIVE_INFINITY);

  function accept(next: LiveSnapshot): void {
    const kept = pickNewer(latest.current, next);
    latest.current = kept;
    if (kept !== next) return;
    offset.current = clockOffset(next.serverNow, Date.now());
    setSnapshot(next);
  }

  // Poll while the finale is on: every 2 s, and just after each round boundary. Stops at "done"
  // (or "none"), and when this view is closed.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const schedule = (delay: number | null): void => {
      if (cancelled || delay === null) return;
      timer = setTimeout(poll, delay);
    };
    function poll(): void {
      fetchLive().then(
        (next) => {
          if (cancelled) return;
          failures = 0;
          setPollError(null);
          accept(next);
          schedule(nextPollDelay(latest.current ?? next, Date.now() + offset.current));
        },
        (err: unknown) => {
          if (cancelled) return;
          failures += 1;
          const status = err instanceof ApiError ? err.status : null;
          if (!isRetryableStatus(status)) {
            setPollError(errorText(err));
            return;
          }
          setPollError('Connection problem. Trying again...');
          schedule(errorRetryDelayMs(failures));
        },
      );
    }
    if (initial !== null) {
      accept(initial);
      schedule(nextPollDelay(initial, Date.now() + offset.current));
    } else {
      poll();
    }
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  const hasLoot = snapshot !== null && snapshot.status !== 'none' && snapshot.loot !== null;
  useEffect(() => {
    if (hasLoot) onBalanceChange();
  }, [hasLoot]);

  /** Fire an ability or toggle its auto fire. A second tap on it while its request is on its way is ignored. */
  async function act(request: LiveActionRequest): Promise<boolean> {
    const { key } = request;
    if (!locks.current.acquire(key)) return false;
    setBusyKeys((keys) => [...keys, key]);
    setActionError(null);
    try {
      accept(await sendLiveAction(request));
      return true;
    } catch (err) {
      setActionError({ key, text: errorText(err) });
      if (err instanceof ApiError && err.status === 409) {
        // The screen was probably out of date; show what the server says now.
        try {
          accept(await fetchLive());
        } catch {
          // Keep the error above; the next poll catches up.
        }
      }
      return false;
    } finally {
      locks.current.release(key);
      setBusyKeys((keys) => keys.filter((k) => k !== key));
    }
  }

  /**
   * Before the start: sets the Auto fire preference of one ability (the default for the start), then
   * shows what the server says now. Same one-at-a-time rule as `act`.
   */
  async function setAutoFire(key: string, target: string, on: boolean): Promise<boolean> {
    if (!locks.current.acquire(key)) return false;
    setBusyKeys((keys) => [...keys, key]);
    setActionError(null);
    try {
      await setRaidAutofire(target, on);
      accept(await fetchLive());
      return true;
    } catch (err) {
      setActionError({ key, text: errorText(err) });
      if (err instanceof ApiError && err.status === 409) {
        try {
          accept(await fetchLive());
        } catch {
          // Keep the error above; the next poll catches up.
        }
      }
      return false;
    } finally {
      locks.current.release(key);
      setBusyKeys((keys) => keys.filter((k) => k !== key));
    }
  }

  const back = (
    <p>
      <button type="button" onClick={onClose}>
        Back to the raid
      </button>
    </p>
  );
  const errors = (
    <>
      {pollError !== null && (
        <p class="error" role="alert">
          {pollError}
        </p>
      )}
    </>
  );

  if (snapshot === null) {
    return (
      <section class="raid-section" aria-labelledby="live-heading">
        <h3 id="live-heading">Finale</h3>
        {back}
        {errors}
        {pollError === null && <p class="muted">Joining the finale...</p>}
      </section>
    );
  }
  if (snapshot.status === 'none') {
    return (
      <section class="raid-section" aria-labelledby="live-heading">
        <h3 id="live-heading">Finale</h3>
        {back}
        {errors}
        <p class="muted">There is no finale on right now. It starts on Sunday evening.</p>
      </section>
    );
  }

  const fight = snapshot;
  const progress = progressText(fight, serverNow);
  const lobby = fight.status === 'lobby';
  const mine = ownAbilities(fight.abilities, fight.you);
  const mineIds = new Set(
    fight.row.filter((c) => c.owner !== null && c.owner === fight.you).map((c) => c.id),
  );
  // Every ability sits on the stage: a creature's on the creature (a badge, and a popover when it
  // is tapped), the basic one on a chip in the stage's corner. They open the same popover. In the
  // lobby the popover only has the Auto fire toggle, which sets the default for the start.

  /** The inside of an ability's popover, wired to this screen's state. */
  const popoverBody = (ability: LiveAbility, badge: Badge, afterSuccess: () => void) => (
    <AbilityPopoverBody
      fight={fight}
      ability={ability}
      badge={badge}
      busy={busyKeys.includes(ability.key)}
      zone={zones[ability.key] ?? ''}
      element={elements[ability.key] ?? ''}
      error={actionError?.key === ability.key ? actionError.text : null}
      onZone={(value) => {
        setZones((all) => ({ ...all, [ability.key]: value }));
      }}
      onElement={(value) => {
        setElements((all) => ({ ...all, [ability.key]: value }));
      }}
      onAct={(action) => {
        const sent = lobby
          ? setAutoFire(ability.key, autoFireTarget(ability), action === 'unhold')
          : act(
              buildAction(
                ability.key,
                ability.abilityId,
                action,
                zones[ability.key] ?? '',
                elements[ability.key] ?? '',
              ),
            );
        void sent.then((ok) => {
          if (ok) afterSuccess();
        });
      }}
    />
  );

  /** A tap on one of your creatures that has no ability in this fight says why. */
  const noteBody = (creature: ReplayRowEntry) => (
    <AbilityPopoverSection title={creature.name}>
      <p class="ab-state">{noAbilityText(creature.species, creature.level)}</p>
    </AbilityPopoverSection>
  );

  // The stage needs the boss pool and the names; the lobby may not have them (no preview).
  const { hpMax, hpStart } = fight.boss;
  const stageNames = fight.names;
  const showStage =
    hpMax !== null && hpStart !== null && stageNames !== null && fight.row.length > 0;
  const shake =
    countdown !== null && countdown.phase === 'count' && countdown.tier === 'final'
      ? countdown.n % 2 === 0
        ? ' cd-shake-a'
        : ' cd-shake-b'
      : '';

  return (
    <section class="raid-section" aria-labelledby="live-heading">
      <h3 id="live-heading">Finale: {fight.boss.name}</h3>
      {back}
      {errors}
      {fight.practice && <p class="badge first practice-label">{PRACTICE_LABEL}</p>}
      {fight.status !== 'lobby' && fight.loot !== null && !fight.practice && !dismissed && (
        <RevealCard
          reveal={fight.loot}
          busy={false}
          gearWeek={fight.week}
          afterAction={{
            week: fight.week,
            party: fight.party,
            onReplay: () => {
              onReplay(fight.week, fight.party);
            },
          }}
          onDismiss={() => {
            setDismissed(true);
            onRevealSeen(fight.week);
            onBalanceChange();
          }}
        />
      )}

      <p class="live-round" role="status" aria-live="off">
        <strong>{progress.headline}</strong>
        {progress.countdown !== '' && <span class="live-countdown"> {progress.countdown}</span>}
      </p>
      {/* Changes once per round, so a screen reader hears the round and not every tick. */}
      <LiveRegion>{countdown === null ? progress.headline : spokenCountdown(countdown)}</LiveRegion>

      {lobby && !showStage && fight.boss.hpMax !== null && (
        <>
          <BossHp
            caption={`${fight.boss.name} HP`}
            current={fight.boss.hpStart ?? fight.boss.hpMax}
            max={fight.boss.hpMax}
          />
        </>
      )}

      <div class={`stage-wrap${shake}`}>
        {showStage && (
          <LiveStage
            boss={fight.boss}
            hpMax={hpMax}
            hpStart={hpStart}
            rounds={fight.rounds}
            row={fight.row}
            lobby={lobby}
            mineIds={mineIds}
            names={stageNames}
            events={fight.events}

            hold={countdown !== null}
            abilities={{
              list: fight.abilities,
              you: fight.you,
              fight,
              renderPopover: popoverBody,
              renderNote: noteBody,
              ...(mine.length > 0 ? { help: <AbilityHelp lobby={lobby} /> } : {}),
            }}
          />
        )}
        <Countdown view={countdown} />
      </div>

      {lobby && (
        <p class="muted">
          {showStage
            ? 'Tap one of your creatures to set auto fire before the fight. The fight plays on its own whether you watch or not.'
            : 'Your ability can be used once the fight starts. The fight plays on its own whether you watch or not.'}
        </p>
      )}
      {lobby && showStage && mine.length === 0 && actionError !== null && (
        <p class="error" role="alert">
          {actionError.text}
        </p>
      )}

      {fight.status !== 'lobby' && mine.length > 0 && (
        <ul class="visually-hidden" aria-label="Your abilities">
          {mine.map((ability) => (
            <li key={ability.key}>
              {abilityTitle(ability, fight.names)}: {abilityStateText(ability, fight.rounds, true)}
            </li>
          ))}
        </ul>
      )}

      {!lobby && mine.length === 0 && actionError !== null && (
        <p class="error" role="alert">
          {actionError.text}
        </p>
      )}

      {fight.status !== 'lobby' && <LiveDetails fight={fight} />}

      <Watching names={fight.watching} />

      {fight.status === 'done' && (
        <p>
          <button type="button" onClick={onClose}>
            Back to the raid
          </button>
        </p>
      )}
    </section>
  );
}

/** The others' abilities and the plain-text log of a running or finished fight. */
function LiveDetails({ fight }: { fight: LiveRunning }) {
  const others = otherUsage(fight.abilities, fight.you);
  const feed = feedLines(fight.events, fight.names);
  const earlier = earlierLines(fight.events, fight.names);
  const playerName = (key: string | null): string =>
    key === null ? 'Guest' : (fight.names.players?.[key] ?? 'Unknown');
  return (
    <>
      {others.length > 0 && (
        <details class="others">
          <summary>{othersSummary(others)}</summary>
          <ul class="plain-list">
            {others.map((usage) => (
              <li key={usage.alias} class="live-ability">
                <strong>{playerName(usage.alias)}</strong>:{' '}
                <span class="muted">{otherUsageText(usage, fight.names)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <LogToggle id="live-log">
        <h4>This round</h4>
        {feed.length === 0 ? (
          <p class="muted">Nothing has happened yet.</p>
        ) : (
          <ol
            class="live-feed"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Round feed"
          >
            <FeedItems lines={feed} />
          </ol>
        )}
        {earlier.length > 0 && (
          <details class="live-earlier">
            <summary>Earlier rounds</summary>
            <ol class="live-feed">
              <FeedItems lines={earlier} />
            </ol>
          </details>
        )}
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

function FeedItems({ lines }: { lines: readonly FeedLine[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <li key={index} class={line.key ? 'key' : undefined}>
          {line.text}
        </li>
      ))}
    </>
  );
}

/** The "?" popover of the stage: how abilities work, in a few short lines. */
function AbilityHelp({ lobby }: { lobby: boolean }) {
  return (
    <AbilityPopoverSection title="Abilities">
      <p class="ab-help">
        {lobby
          ? 'Tap one of your creatures, or the chip in the corner, to turn auto fire on or off before the fight.'
          : 'Tap one of your creatures, or the chip in the corner, to fire its ability or to turn auto fire on or off.'}
      </p>
      <p class="ab-help">
        {lobby
          ? 'Each ability fires once. With auto fire on, it fires by itself in its round. With auto fire off it waits for you once the fight starts, and still fires in the last round if you do not.'
          : 'Each ability fires once. Fire takes effect at the start of the next round. With auto fire on, it fires by itself in its round; with auto fire off it waits for you, and still fires in the last round if you do not.'}
      </p>
    </AbilityPopoverSection>
  );
}
