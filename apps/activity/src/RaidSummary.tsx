import { fetchGear } from './gear-api';
import { grantsForWeek, lootIsEmpty } from './gear-view';
import type { GrantLoot } from './gear-types';
import { fetchStats, type FestivalGrant, type RaidPhaseId, type RankChange } from './raid-api';
import { phaseName } from './raid-text';
import { RaidSummaryCard, SummaryFrame, type SummaryMode } from './RaidSummaryCard';
import { Rewards, SectionHead, SummaryActions } from './RaidSummaryParts';
import type { FinaleProgress } from './raid-progress';
import type { SummaryBoss } from './raid-summary-view';
import { OutcomeBadge } from './ui/RevealShell';
import { useLoaded } from './use-loaded';

/** What the stage paid the caller, as the raid page already knows it (the summary adds the gear itself). */
export interface SummaryPaid {
  essence: number;
  festivalGrant: FestivalGrant | null;
  rankChange: RankChange | null;
  progress: FinaleProgress | null;
}

/** A grant that gave something, as loot; null when there is none. */
const lootOrNull = (grant: GrantLoot | null): GrantLoot | null =>
  grant === null || lootIsEmpty(grant) ? null : grant;

/**
 * The raid summary of one resolved stage of the caller's party, for the game: it asks the server for the
 * fight's numbers (and, for a finale, the gear it gave) and draws `RaidSummaryCard`. Until the numbers
 * arrive, or when they cannot be had, it shows the result, the rewards and the buttons, so a player is
 * never stuck behind a failed request. It only states what happened; it never says what to change.
 */
export function RaidSummary({
  week,
  party,
  phase,
  cleared,
  mode,
  boss,
  paid,
  onReplay,
  onDismiss,
  busy = false,
}: {
  week: string;
  party: number;
  phase: RaidPhaseId;
  /** Whether the stage was cleared, for the badge while the numbers load. */
  cleared: boolean;
  mode: SummaryMode;
  /** The boss of the raid view when it is of this week (see `summaryBoss`); null when not known. */
  boss: SummaryBoss | null;
  paid: SummaryPaid;
  /** Shows "Watch replay" when given. */
  onReplay?: (() => void) | undefined;
  /** Shows "Got it" when given. */
  onDismiss?: (() => void) | undefined;
  busy?: boolean;
}) {
  // A new stage starts empty: another stage's numbers never show while this one loads.
  const stats = useLoaded(
    () => fetchStats(week, party, phase),
    [week, party, phase],
    undefined,
    true,
  );
  // Only a finale gives gear. A failed read of it leaves the gear out and nothing else.
  const gear = useLoaded(
    async () => (phase === 'finale' ? grantsForWeek((await fetchGear()).grants, week) : null),
    [week, phase],
  );
  const id = `raid-summary-${phase}`;
  const rewards = {
    ...paid,
    finaleLoot: lootOrNull(gear.value?.finale ?? null),
    festivalLoot: lootOrNull(gear.value?.festival ?? null),
  };
  if (stats.value !== null) {
    return (
      <RaidSummaryCard
        input={{ boss, stats: stats.value, rewards }}
        mode={mode}
        id={id}
        onReplay={onReplay}
        onDismiss={onDismiss}
        busy={busy}
      />
    );
  }
  return (
    <SummaryFrame
      mode={mode}
      id={id}
      title={`${phaseName(phase)} result`}
      badge={<OutcomeBadge cleared={cleared} />}
      footer={<SummaryActions onReplay={onReplay} onDismiss={onDismiss} busy={busy} />}
    >
      <div class="rs">
        <p class="muted">
          {stats.failed
            ? 'The fight stats are not available right now.'
            : 'Loading the fight stats...'}
        </p>
        <SectionHead>Your rewards</SectionHead>
        <Rewards rewards={rewards} />
      </div>
    </SummaryFrame>
  );
}
