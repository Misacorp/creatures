import { useEffect, useRef, useState } from 'preact/hooks';
import { AbilityChip } from './AbilityChip';
import { AfterAction } from './AfterAction';
import { ApiError, type Creature } from './api';
import { SHOW_COACH_MARK } from './coach';
import { CoachMark } from './CoachMark';
import { clockOffset, errorText } from './game';
import { useActionRunner } from './use-action-runner';
import { GlossaryTag } from './Glossary';
import { useServerNow } from './hooks';
import { finaleWindow } from './live';
import { startPractice, type LiveSnapshot } from './live-api';
import { Live } from './Live';
import { Replay } from './Replay';
import { RevealCard } from './Reveal';
import {
  fetchRaid,
  markRevealSeen,
  placeCreature,
  setRaidAbility,
  setRaidAutofire,
  unplaceCreature,
  type PhaseResultView,
  type RaidPhaseId,
  type RaidView,
} from './raid-api';
import type { Intent } from './raid-slots';
import { festivalGrantText, rankChangeText } from './raid-progress';
import { phaseName, stageOutcomeNote, stageOutcomeText } from './raid-text';
import { BossCard } from './BossCard';
import { RaidTimeline } from './RaidTimeline';
import { needsPlacement, type NowTarget } from './raid-now';
import { showFullResults } from './raid-timeline';
import { RaidNews } from './RaidNews';
import { Placement } from './Placement';
import { toPickerCreature } from './roster-picker';
import type { Forecast } from './weather-types';

interface Loaded {
  view: RaidView;
  /** Server clock minus local clock when the view arrived. */
  offset: number;
}

/** Extra wait after an event is due before asking the server what happened. */
const REFRESH_GRACE_MS = 3000;

export function Raid({
  creatures,
  forecast,
  showPractice,
  onBalanceChange,
  onNeedsPlacementChange,
}: {
  creatures: Creature[];
  /** The valley's sky for today and tomorrow, for the one line on the boss card (null: none loaded). */
  forecast: Forecast | null;
  /** True on staging and local runs, where the server can start a practice finale. */
  showPractice: boolean;
  /** Called when the Essence balance may have changed (a finale reveal was seen). */
  onBalanceChange: () => void;
  /** Whether team creatures are still to be placed, whenever the raid view loads or changes (the tab's pip). */
  onNeedsPlacementChange: (needed: boolean) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The replay on screen: the week and party come from the result or reveal it was opened from. */
  const [replay, setReplay] = useState<{
    week: string;
    party: number;
    phase: RaidPhaseId;
  } | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveInitial, setLiveInitial] = useState<LiveSnapshot | null>(null);
  const [practiceGone, setPracticeGone] = useState(false);
  // Placement is not a spend, so no keys: one change at a time. After a definite "no", if the screen
  // was stale, the raid is loaded again.
  const { busy, error, setBusy, setError, run } = useActionRunner({
    onStale: async () => {
      apply(await fetchRaid());
    },
  });
  const practiceInFlight = useRef(false);
  /** The finale view opens by itself once, when the fight starts; closing it keeps it closed. */
  const autoOpened = useRef(false);
  const serverNow = useServerNow(loaded?.offset ?? 0, loaded !== null);

  function apply(view: RaidView): void {
    setLoaded({ view, offset: clockOffset(view.serverNow, Date.now()) });
  }

  useEffect(() => {
    let cancelled = false;
    fetchRaid().then(
      (view) => {
        if (!cancelled) apply(view);
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The tab's pip follows the raid view on screen.
  useEffect(() => {
    if (loaded !== null) onNeedsPlacementChange(needsPlacement(loaded.view));
  }, [loaded?.view]);

  // When the next phase is due, ask again shortly after, so the results appear by themselves.
  const nextAt = loaded?.view.next?.at ?? null;
  const offset = loaded?.offset ?? 0;
  useEffect(() => {
    if (nextAt === null) return undefined;
    const delay = nextAt - (Date.now() + offset) + REFRESH_GRACE_MS;
    if (delay > 2_000_000_000) return undefined;
    const timer = setTimeout(
      () => {
        fetchRaid().then(apply, () => undefined);
      },
      Math.max(delay, REFRESH_GRACE_MS),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [nextAt, offset]);

  // The finale view opens by itself when the fight starts, for players who are in a party.
  const finaleAt = loaded?.view.schedule.finale ?? null;
  const finaleRounds = loaded?.view.boss.finaleRounds ?? 1;
  const inParty = loaded?.view.you.party != null;
  const finaleState =
    finaleAt === null ? 'before' : finaleWindow(finaleAt, finaleRounds, serverNow);
  useEffect(() => {
    if (finaleState === 'live' && inParty && !autoOpened.current) {
      autoOpened.current = true;
      setLiveOpen(true);
    }
  }, [finaleState, inParty]);

  // A reveal the player has not seen yet means the Essence balance may have moved.
  const revealWeek = loaded?.view.you.reveal?.week ?? null;
  useEffect(() => {
    if (revealWeek !== null) onBalanceChange();
  }, [revealWeek]);

  /** Runs one change. After a definite "no" the screen was probably stale, so it reloads. */
  async function mutate(task: () => Promise<RaidView>): Promise<boolean> {
    const done = await run(async () => {
      apply(await task());
      return true;
    });
    return done === true;
  }

  function closeLive(): void {
    autoOpened.current = true;
    setLiveOpen(false);
    setLiveInitial(null);
    // The result may have landed while the fight was on.
    fetchRaid().then(apply, () => undefined);
  }

  function startPracticeFight(): void {
    if (practiceInFlight.current) return;
    practiceInFlight.current = true;
    setBusy(true);
    setError(null);
    startPractice().then(
      (snapshot) => {
        practiceInFlight.current = false;
        setBusy(false);
        setLiveInitial(snapshot);
        setLiveOpen(true);
      },
      (err: unknown) => {
        practiceInFlight.current = false;
        setBusy(false);
        if (err instanceof ApiError && err.status === 404) {
          setPracticeGone(true);
          setError('Practice fights are only available on the test server.');
        } else if (err instanceof ApiError && err.code === 'practice_cooldown') {
          // The party's earlier practice fight is still on show: join it.
          setLiveInitial(null);
          setLiveOpen(true);
        } else {
          setError(errorText(err));
        }
      },
    );
  }

  function runIntent(intent: Intent): void {
    void mutate(() =>
      intent.type === 'place'
        ? placeCreature(intent.creatureId, intent.slot)
        : unplaceCreature(intent.creatureId),
    );
  }

  if (loadError !== null) {
    return (
      <p class="error" role="alert">
        {loadError}
      </p>
    );
  }
  if (loaded === null) return <p class="muted">Loading the raid...</p>;

  const { view } = loaded;
  const party = view.party;
  const rosterNames = view.roster.map((r) => r.displayName);
  const { reveal } = view.you;

  if (liveOpen) {
    return (
      <Live
        initial={liveInitial}
        season={{ weekId: view.weekId, season: view.season }}
        onClose={closeLive}
        onBalanceChange={onBalanceChange}
        onRevealSeen={(week) => {
          markRevealSeen(week).then(apply, () => undefined);
        }}
        onReplay={(week, partyNumber) => {
          closeLive();
          setReplay({ week, party: partyNumber, phase: 'finale' });
        }}
      />
    );
  }

  if (replay !== null) {
    return (
      <Replay
        weekId={replay.week}
        party={replay.party}
        phase={replay.phase}
        onClose={() => {
          setReplay(null);
        }}
      />
    );
  }

  /** The "what to do now" button: go to the placement step or open the finale. */
  function act(target: NowTarget): void {
    if (target === 'live') {
      autoOpened.current = true;
      setLiveInitial(null);
      setLiveOpen(true);
    } else {
      focusPlacement();
    }
  }

  return (
    <>
      {SHOW_COACH_MARK && <CoachMark />}
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {reveal !== null && (
        <RevealCard
          reveal={reveal}
          busy={busy}
          gearWeek={reveal.week}
          season={{ weekId: view.weekId, season: view.season }}
          afterAction={{
            week: reveal.week,
            party: reveal.party,
            onReplay: () => {
              setReplay({ week: reveal.week, party: reveal.party, phase: 'finale' });
            },
          }}
          onDismiss={() => {
            void mutate(() => markRevealSeen(reveal.week)).then((ok) => {
              if (ok) onBalanceChange();
            });
          }}
        />
      )}
      <RaidTimeline
        view={view}
        serverNow={serverNow}
        finale={finaleState}
        onAct={act}
        onReplay={(phase) => {
          if (party !== null) setReplay({ week: view.weekId, party: party.party, phase });
        }}
      />
      {showPractice && !practiceGone && (
        <details class="practice">
          <summary>Testing tools</summary>
          <p class="muted">Practice fights only exist on the test server and give no rewards.</p>
          <button type="button" disabled={busy} onClick={startPracticeFight}>
            Start practice fight
          </button>
        </details>
      )}
      <BossCard view={view} forecast={forecast} />
      {party !== null && (
        <Placement
          party={party}
          creatures={creatures.map(toPickerCreature)}
          canEdit={view.you.canEdit}
          busy={busy}
          rosterNames={rosterNames}
          turnOrder={view.boss.turnOrder}
          next={view.next}
          onIntent={runIntent}
        />
      )}

      {view.you.ability !== null && (
        <AbilityChip
          you={view.you}
          current={view.you.ability}
          abilities={view.you.abilities}
          team={view.you.team?.creatures ?? []}
          editable={serverNow < view.schedule.finale}
          busy={busy}
          onPick={(abilityId) => {
            void mutate(() => setRaidAbility(abilityId));
          }}
          onAutoFire={(target, on) => {
            void mutate(() => setRaidAutofire(target, on));
          }}
        />
      )}
      {party !== null && showFullResults(party.results) && (
        <section class="raid-section" aria-labelledby="raid-results-heading">
          <h3 id="raid-results-heading">Results</h3>
          <ul class="cards">
            {party.results.map((result) => (
              <ResultCard
                key={result.phase}
                result={result}
                week={view.weekId}
                party={party.party}
                onReplay={() => {
                  setReplay({ week: view.weekId, party: party.party, phase: result.phase });
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <RaidNews />
    </>
  );
}

/** Scrolls the Raid Roster into view and puts focus on its first free slot (else its first slot). */
function focusPlacement(): void {
  const section = document.getElementById('raid-placement');
  if (section === null) return;
  section.scrollIntoView({ block: 'start' });
  const slots = [...section.querySelectorAll<HTMLElement>('[data-slot]:not(:disabled)')];
  (slots.find((s) => s.classList.contains('empty')) ?? slots[0])?.focus({ preventScroll: true });
}

function ResultCard({
  result,
  week,
  party,
  onReplay,
}: {
  result: PhaseResultView;
  week: string;
  party: number;
  onReplay: () => void;
}) {
  return (
    <li class="card-item">
      <h4>
        {phaseName(result.phase)}{' '}
        <span class={result.cleared ? 'badge good' : 'badge bad'}>
          {result.cleared ? 'Cleared' : 'Not cleared'}
        </span>
      </h4>
      {stageOutcomeNote(result) !== null && <p>{stageOutcomeText(result)}</p>}
      <p>
        <GlossaryTag entry="essence">Essence</GlossaryTag> you got:{' '}
        <strong>{result.essence}</strong>
      </p>
      {result.festivalGrant !== null && (
        <p class="reveal-festival">{festivalGrantText(result.festivalGrant)}</p>
      )}
      {result.rankChange !== null && <p class="reveal-rank">{rankChangeText(result.rankChange)}</p>}
      <AfterAction week={week} party={party} phase={result.phase} onReplay={onReplay} />
    </li>
  );
}
