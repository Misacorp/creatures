import type { RaidReveal, RaidView } from './raid-api';
import { finaleProgress } from './raid-progress';
import type { SummaryBoss } from './raid-summary-view';
import { RaidSummary } from './RaidSummary';

/**
 * The finale's result card at the top of the Raid tab and the live view, until the player taps "Got it".
 * It is the raid summary (`RaidSummary`: the boss and how it ended, the scoreboard, the highlights and
 * the rewards, with the Essence, the gear, the Festival creature and what the finale did to the server's
 * rank and the season). The text is in the page from the start, so a screen reader gets the result at
 * once.
 */
export function RevealCard({
  reveal,
  busy,
  afterAction,
  season = null,
  boss = null,
  onDismiss,
}: {
  reveal: Pick<RaidReveal, 'cleared' | 'essence'> &
    Partial<Pick<RaidReveal, 'week' | 'rankChange' | 'festivalGrant' | 'enraged'>>;
  busy: boolean;
  /** Where the finale's numbers are asked for (the caller's party in that finale), and the replay button. */
  afterAction: { week: string; party: number; onReplay?: () => void };
  /**
   * The raid page's week and its place in the season, for the season pips (they show only when it is
   * the week of this finale, or the finale was a Festival's).
   */
  season?: { weekId: string; season: RaidView['season'] } | null;
  /** The finale's boss (`summaryBoss`), for its picture, name and moves; null when not known. */
  boss?: SummaryBoss | null;
  onDismiss: () => void;
}) {
  return (
    <RaidSummary
      week={afterAction.week}
      party={afterAction.party}
      phase="finale"
      cleared={reveal.cleared}
      mode="reveal"
      boss={boss}
      paid={{
        essence: reveal.essence,
        festivalGrant: reveal.festivalGrant ?? null,
        rankChange: reveal.rankChange ?? null,
        progress: finaleProgress({ week: afterAction.week, rankChange: reveal.rankChange }, season),
      }}
      onReplay={afterAction.onReplay}
      onDismiss={onDismiss}
      busy={busy}
    />
  );
}
