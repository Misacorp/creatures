import { AfterAction } from './AfterAction';
import { glyphOrUnknown } from './glyphs';
import { FinaleProgress } from './FinaleProgress';
import { revealSummary } from './live';
import type { RaidReveal, RaidView } from './raid-api';
import { finaleProgress } from './raid-progress';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { FinaleGearLoot } from './FinaleGearLoot';
import {
  OutcomeBadge,
  RevealLater,
  RevealShell,
  RevealStage,
  useRevealSequence,
} from './ui/RevealShell';

/** "First on server" as a banner with a sparkle on each side. */
function FirstBanner() {
  const sparkle = glyphOrUnknown('sparkle');
  return (
    <span class="banner-first pix">
      <Sprite sprite={sparkle} scale={2} />
      First on server
      <Sprite sprite={sparkle} scale={2} />
    </span>
  );
}

/**
 * The finale loot reveal. An orb shakes and opens into a gem, the Essence counts up (one figure: the
 * server's jackpot is hidden and only ever part of this total), and then the result shows: the
 * Festival creature (its sprite pops in) and what the finale did to the server's rank. The animation
 * is stepped and short, and the real text is in the page from the start, so screen readers get the
 * result at once; a player who prefers reduced motion sees the end state straight away.
 */
export function RevealCard({
  reveal,
  busy,
  afterAction,
  gearWeek,
  season = null,
  onDismiss,
}: {
  reveal: Pick<RaidReveal, 'cleared' | 'essence'> &
    Partial<Pick<RaidReveal, 'week' | 'rankChange' | 'festivalGrant'>>;
  busy: boolean;
  /** Where the finale's after-action card is asked for (the caller's party in that finale). */
  afterAction?: { week: string; party: number; onReplay?: () => void };
  /** The raid week whose gear grant (the finale's roll and the Festival piece) is shown as a pop-in. */
  gearWeek?: string;
  /**
   * The raid page's week and its place in the season, for the season pips (they show only when it is
   * the week of this finale, or the finale was a Festival's).
   */
  season?: { weekId: string; season: RaidView['season'] } | null;
  onDismiss: () => void;
}) {
  const summary = revealSummary(reveal);
  const { frame, done } = useRevealSequence(reveal.essence);
  const festivalSpecies = reveal.festivalGrant?.species ?? null;
  const progress = finaleProgress(
    { week: reveal.week ?? gearWeek ?? '', rankChange: reveal.rankChange },
    season,
  );
  return (
    <RevealShell
      id="reveal-heading"
      title="Finale result"
      badge={<OutcomeBadge cleared={summary.cleared} />}
      status
      busy={busy}
      onDismiss={onDismiss}
    >
      <p>{summary.outcome}</p>
      <RevealStage frame={frame} />
      <p class="reveal-essence">
        <span class="visually-hidden">{summary.essence}</span>
        <span aria-hidden="true">
          <Sprite sprite={glyphOrUnknown('gem')} scale={2} /> You got{' '}
          <span class="reveal-count">{frame.count}</span> Essence
        </span>
      </p>
      {summary.festival !== null && (
        <RevealLater done={done} class="reveal-festival-box">
          {festivalSpecies !== null && (
            <Sprite sprite={creatureSpriteOrFallback(festivalSpecies)} scale={6} class="pop-in" />
          )}
          <p class="reveal-festival">{summary.festival.text}</p>
          {summary.festival.firstOnServer && <FirstBanner />}
        </RevealLater>
      )}
      {summary.rank !== null && <p class="reveal-rank">{summary.rank}</p>}
      {progress !== null && <FinaleProgress progress={progress} />}
      {gearWeek !== undefined && <FinaleGearLoot week={gearWeek} done={done} />}
      {afterAction !== undefined && (
        <AfterAction
          week={afterAction.week}
          party={afterAction.party}
          phase="finale"
          {...(afterAction.onReplay === undefined ? {} : { onReplay: afterAction.onReplay })}
        />
      )}
    </RevealShell>
  );
}
