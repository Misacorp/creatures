import { content } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from './api';
import { clockOffset, elementName, errorText, speciesName } from './game';
import { useNow } from './hooks';
import {
  abilityControls,
  abilityEffectLine,
  abilityParamKind,
  abilityStateText,
  abilityTitle,
  buildAction,
  createKeyLock,
  earlierLines,
  errorRetryDelayMs,
  feedLines,
  isRetryableStatus,
  nextPollDelay,
  otherUsage,
  otherUsageText,
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
import { ownerColour } from './raid-slots';
import { stateAt } from './replay';
import { RevealCard } from './Reveal';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

const ZONE_OPTIONS = [
  { id: 'front', label: 'Front' },
  { id: 'middle', label: 'Middle' },
  { id: 'back', label: 'Back' },
] as const;

/**
 * The live Sunday finale: the lobby and the fight, with the boss HP, the row, the round's events
 * and the player's abilities (their basic one plus one for each unlocked team creature, each with its
 * own Fire and Hold). The view only displays the server's snapshot and sends Fire and
 * Hold; it polls while the finale is on and stops by itself when the fight is over.
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
  const now = useNow(true);

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

  /** Fire or Hold one ability. A second tap on it while its request is on its way is ignored. */
  async function act(request: LiveActionRequest): Promise<void> {
    const { key } = request;
    if (!locks.current.acquire(key)) return;
    setBusyKeys((keys) => [...keys, key]);
    setActionError(null);
    try {
      accept(await sendLiveAction(request));
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
  const serverNow = now + offset.current;
  const progress = progressText(fight, serverNow);
  if (fight.status === 'lobby') {
    return (
      <section class="raid-section" aria-labelledby="live-heading">
        <h3 id="live-heading">Finale: {fight.boss.name}</h3>
        {back}
        {errors}
        {fight.practice && <p class="badge first practice-label">{PRACTICE_LABEL}</p>}
        <p class="live-round" role="status" aria-live="off">
          <strong>{progress.headline}</strong>
          {progress.countdown !== '' && <span class="live-countdown"> {progress.countdown}</span>}
        </p>
        {fight.boss.hpMax !== null && (
          <p>
            <label for="live-hp">
              {fight.boss.name} HP: {fight.boss.hpStart ?? fight.boss.hpMax} / {fight.boss.hpMax}
            </label>
            <progress
              id="live-hp"
              class="hp-bar"
              max={fight.boss.hpMax}
              value={fight.boss.hpStart ?? fight.boss.hpMax}
            />
          </p>
        )}
        <p class="muted">
          Your ability can be used once the fight starts. The fight plays on its own whether you
          watch or not.
        </p>
        <Watching names={fight.watching} />
      </section>
    );
  }
  const mine = ownAbilities(fight.abilities, fight.you);
  const others = otherUsage(fight.abilities, fight.you);
  const knockedOut = new Set(
    stateAt(fight.events, fight.events.length, fight.boss.hpStart).knockedOut,
  );
  const feed = feedLines(fight.events, fight.names);
  const earlier = earlierLines(fight.events, fight.names);
  const playerKeys = Object.keys(fight.names.players ?? {});
  const playerName = (key: string | null): string =>
    key === null ? 'Guest' : (fight.names.players?.[key] ?? 'Unknown');

  return (
    <section class="raid-section" aria-labelledby="live-heading">
      <h3 id="live-heading">Finale: {fight.boss.name}</h3>
      {back}
      {errors}
      {fight.practice && <p class="badge first practice-label">{PRACTICE_LABEL}</p>}
      {fight.loot !== null && !fight.practice && !dismissed && (
        <RevealCard
          reveal={fight.loot}
          pity={fight.loot.pity}
          busy={false}
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
      <p class="visually-hidden" role="status" aria-live="polite">
        {progress.headline}
      </p>

      <p>
        <label for="live-hp">
          {fight.boss.name} HP: {fight.bossHp} / {fight.boss.hpMax}
        </label>
        <progress id="live-hp" class="hp-bar" max={fight.boss.hpMax} value={fight.bossHp} />
      </p>

      {mine.length > 0 && (
        <section aria-labelledby="live-abilities-heading">
          <h4 id="live-abilities-heading">Your abilities</h4>
          <p class="muted">
            Each ability fires once. Fire takes effect at the start of the next round. Hold keeps it
            for later; an ability you hold still fires in the last round.
          </p>
          {mine.map((ability) => (
            <AbilityPanel
              key={ability.key}
              fight={fight}
              ability={ability}
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
                void act(
                  buildAction(
                    ability.key,
                    ability.abilityId,
                    action,
                    zones[ability.key] ?? '',
                    elements[ability.key] ?? '',
                  ),
                );
              }}
            />
          ))}
        </section>
      )}
      {mine.length === 0 && actionError !== null && (
        <p class="error" role="alert">
          {actionError.text}
        </p>
      )}

      <h4>The row</h4>
      <ul class="replay-row" aria-label="Row, left to right">
        {fight.row.map((c) => {
          const isMine = c.owner !== null && c.owner === fight.you;
          const classes = ['replay-slot'];
          if (c.owner !== null) classes.push(`owner-${String(ownerColour(c.owner, playerKeys))}`);
          if (isMine) classes.push('mine');
          if (knockedOut.has(c.id)) classes.push('ko');
          return (
            <li key={c.id} class={classes.join(' ')}>
              <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={3} />
              <span class="slot-species">{c.name}</span>
              <span class="slot-meta">
                {speciesName(c.species)} Lv {c.level}
              </span>
              <ElementChip element={c.element} />
              <span class="slot-owner">{isMine ? 'You' : playerName(c.owner)}</span>
              {knockedOut.has(c.id) && <span class="badge bad">KO</span>}
            </li>
          );
        })}
      </ul>

      {others.length > 0 && (
        <>
          <h4>Other players' abilities</h4>
          <ul class="plain-list">
            {others.map((usage) => (
              <li key={usage.alias} class="live-ability">
                <strong>{playerName(usage.alias)}</strong>:{' '}
                <span class="muted">{otherUsageText(usage, fight.names)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Watching names={fight.watching} />

      <h4>This round</h4>
      {feed.length === 0 ? (
        <p class="muted">Nothing has happened yet.</p>
      ) : (
        <ol class="live-feed" aria-live="polite" aria-relevant="additions" aria-label="Round feed">
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

function AbilityPanel({
  fight,
  ability,
  busy,
  zone,
  element,
  error,
  onZone,
  onElement,
  onAct,
}: {
  fight: LiveRunning;
  ability: LiveAbility;
  busy: boolean;
  zone: string;
  element: string;
  error: string | null;
  onZone: (zone: string) => void;
  onElement: (element: string) => void;
  onAct: (action: 'fire' | 'hold') => void;
}) {
  const controls = abilityControls(fight, ability);
  const kind = abilityParamKind(ability.abilityId);
  const effect = abilityEffectLine(ability.abilityId);
  const headingId = `live-ability-${ability.key}`;
  return (
    <div class="ability-panel" role="group" aria-labelledby={headingId}>
      <h5 id={headingId}>{abilityTitle(ability, fight.names)}</h5>
      {effect !== '' && <p class="muted">{effect}</p>}
      <p class="live-ability-state">{abilityStateText(ability, fight.rounds, true)}</p>
      {controls.canFire && kind === 'zone' && (
        <>
          <label for={`live-zone-${ability.key}`}>Zone to protect</label>
          <select
            id={`live-zone-${ability.key}`}
            value={zone}
            disabled={busy}
            onChange={(event) => {
              onZone(event.currentTarget.value);
            }}
          >
            <option value="">The zone the boss attacks first</option>
            {ZONE_OPTIONS.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </>
      )}
      {controls.canFire && kind === 'element' && (
        <>
          <label for={`live-element-${ability.key}`}>Element to mark the boss with</label>
          <select
            id={`live-element-${ability.key}`}
            value={element}
            disabled={busy}
            onChange={(event) => {
              onElement(event.currentTarget.value);
            }}
          >
            <option value="">The default element</option>
            {content.elements.map((e) => (
              <option key={e.id} value={e.id}>
                {elementName(e.id)}
              </option>
            ))}
          </select>
        </>
      )}
      <p class="button-row">
        <button
          type="button"
          class="primary"
          disabled={busy || !controls.canFire}
          onClick={() => {
            onAct('fire');
          }}
        >
          Fire
        </button>
        {controls.canHold && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onAct('hold');
            }}
          >
            Hold
          </button>
        )}
      </p>
      {controls.note !== '' && <p class="muted">{controls.note}</p>}
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
