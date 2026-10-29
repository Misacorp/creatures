import { useEffect, useRef, useState } from 'preact/hooks';
import { AbilityChip } from './AbilityChip';
import { ApiError, type Creature } from './api';
import { SHOW_COACH_MARK } from './coach';
import { CoachMark } from './CoachMark';
import { clockOffset, errorText } from './game';
import { useActionRunner } from './use-action-runner';
import { useServerNow } from './hooks';
import { finaleWindow } from './live';
import { startPractice, type LiveSnapshot } from './live-api';
import { Live } from './Live';
import { raidLiveOffered } from './live-flags';
import { useRaidBoardLive } from './use-raid-board-live';
import { Replay } from './Replay';
import { RevealCard } from './Reveal';
import { RaidSummary } from './RaidSummary';
import { summaryBoss } from './raid-summary-view';
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
import { finaleProgress } from './raid-progress';
import { BossCard } from './BossCard';
import { RaidTimeline } from './RaidTimeline';
import { needsPlacement, type NowTarget } from './raid-now';
import { showFullResults } from './raid-timeline';
import { RaidNews } from './RaidNews';
import { Placement } from './Placement';
import { TeamCreaturePage, type TeamConfigure } from './TeamCreaturePage';
import { toPickerCreature } from './roster-picker';
import type { Forecast } from './weather-types';
import { Accordion } from './ui/Accordion';
import { BagFullNote } from './ui/BagFullNote';
import { Alert } from './ui/Alert';
import { Column, Columns } from './ui/Columns';

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
  configure,
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
  /** Getting your board's creatures ready (their configurator and page); absent: their popovers only. */
  configure?: TeamConfigure | undefined;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Your board creature whose own page is open in the tab's place. */
  const [page, setPage] = useState<string | null>(null);
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

  /** The latest loaded view, for the live board socket (it applies a push to what is on screen). */
  const loadedRef = useRef<Loaded | null>(null);
  loadedRef.current = loaded;
  const reloading = useRef(false);

  function apply(view: RaidView): void {
    setLoaded({ view, offset: clockOffset(view.serverNow, Date.now()) });
  }

  // The live board: while this tab shows a party's board (and the finale is not on), a socket brings
  // teammates' placements as they are made. The server offers it through `/api/config`; without it, or
  // while it is down, the tab behaves as it always did.
  const boardWeek = loaded?.view.weekId ?? null;
  const boardParty = loaded?.view.party?.party ?? null;
  const boardOpen = loaded !== null && loaded.view.status !== 'finale' && !liveOpen;
  useRaidBoardLive({
    offered: raidLiveOffered(),
    open: boardOpen,
    week: boardWeek,
    party: boardParty,
    current: () => loadedRef.current?.view ?? null,
    show: (view) => {
      const prev = loadedRef.current;
      if (prev === null) return;
      const next = { ...prev, view };
      loadedRef.current = next;
      setLoaded(next);
    },
    reload: () => {
      if (reloading.current) return;
      reloading.current = true;
      fetchRaid().then(
        (view) => {
          reloading.current = false;
          apply(view);
        },
        () => {
          reloading.current = false;
        },
      );
    },
  });

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
    if (loaded !== null) onNeedsPlacementChange(needsPlacement(loaded.view, creatures.length));
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
    return <Alert level="alert">{loadError}</Alert>;
  }
  if (loaded === null) return <p class="muted">Loading the raid...</p>;

  const { view } = loaded;
  const party = view.party;
  const rosterNames = view.roster.map((r) => r.displayName);
  const { reveal } = view.you;

  // Your creatures on the board, left to right and row by row: what a page flips through.
  const boardTeam =
    party === null
      ? []
      : party.row.flatMap((slot) => {
          const own = slot.creature;
          if (own == null || !own.mine || own.creatureId === undefined) return [];
          const creature = creatures.find((c) => c.id === own.creatureId);
          return creature === undefined ? [] : [creature];
        });
  const paged = page === null ? undefined : boardTeam.find((c) => c.id === page);
  if (configure !== undefined && paged !== undefined && !liveOpen && replay === null) {
    return (
      <TeamCreaturePage
        creature={paged}
        team={boardTeam}
        configure={configure}
        backLabel="Raid"
        remove={
          view.you.canEdit
            ? {
                label: 'Remove from board',
                onAct: () => {
                  setPage(null);
                  runIntent({ type: 'unplace', creatureId: paged.id });
                },
              }
            : undefined
        }
        onFlip={(target) => {
          setPage(target.id);
        }}
        onBack={() => {
          setPage(null);
        }}
      />
    );
  }

  if (liveOpen) {
    return (
      <Live
        initial={liveInitial}
        season={{ weekId: view.weekId, season: view.season }}
        view={view}
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
      {error !== null && <Alert level="alert">{error}</Alert>}
      {reveal !== null && (
        <RevealCard
          reveal={reveal}
          busy={busy}
          season={{ weekId: view.weekId, season: view.season }}
          boss={summaryBoss(view, reveal.week)}
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
      <Columns from="80rem" ratio="5-4">
        <Column>
          <RaidTimeline
            view={view}
            serverNow={serverNow}
            finale={finaleState}
            owned={creatures.length}
            onAct={act}
            onReplay={(phase) => {
              if (party !== null) setReplay({ week: view.weekId, party: party.party, phase });
            }}
          />
          {showPractice && !practiceGone && (
            <Accordion title="Testing tools" class="practice">
              <p class="muted">
                Practice fights only exist on the test server and give no rewards.
              </p>
              <button type="button" disabled={busy} onClick={startPracticeFight}>
                Start practice fight
              </button>
            </Accordion>
          )}
          <BossCard view={view} forecast={forecast} />
        </Column>
        <Column>
          {party !== null && (
            <Placement
              party={party}
              creatures={creatures.map(toPickerCreature)}
              canEdit={view.you.canEdit}
              busy={busy}
              rosterNames={rosterNames}
              turnOrder={view.boss.turnOrder}
              onIntent={runIntent}
              configure={configure}
              owned={creatures}
              onOpenPage={setPage}
            />
          )}
          {party !== null && view.you.canEdit && (
            <BagFullNote
              inventory={configure?.gear?.inventory}
              onOpenWorkshop={configure?.onOpenWorkshop}
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
                    view={view}
                    onReplay={() => {
                      setReplay({ week: view.weekId, party: party.party, phase: result.phase });
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          <RaidNews />
        </Column>
      </Columns>
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

/** One stage of this week in the Results list: the raid summary of the caller's party. */
function ResultCard({
  result,
  week,
  party,
  view,
  onReplay,
}: {
  result: PhaseResultView;
  week: string;
  party: number;
  view: RaidView;
  onReplay: () => void;
}) {
  return (
    <li class="card-item rs-item">
      <RaidSummary
        week={week}
        party={party}
        phase={result.phase}
        cleared={result.cleared}
        mode="result"
        boss={summaryBoss(view, week)}
        paid={{
          essence: result.essence,
          festivalGrant: result.festivalGrant,
          rankChange: result.rankChange,
          progress: finaleProgress(
            { week, rankChange: result.rankChange },
            { weekId: view.weekId, season: view.season },
          ),
        }}
        onReplay={onReplay}
      />
    </li>
  );
}
