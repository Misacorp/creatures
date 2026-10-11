/**
 * Plain words for the Boss Rank ladder, seasons and Festival weeks: the rank on the boss card, the
 * season pips, the readiness band, the rank change after a finale and the Festival creature. Pure
 * functions. The server decides every number; the client only phrases them, and never shows a
 * forecast number (the readiness band is four words).
 */
import { speciesName } from './game';
import type { FestivalGrant, RankChange, RaidView, ReadinessBand } from './raid-api';

/** Weeks in a season: four normal weeks and a Festival (`RULES.progression.seasonWeeks`). */
export const SEASON_WEEKS = 5;

/** "Rank 6", or null when the week has no rank (an old week, or nobody in yet). */
export function rankLabel(rank: number | null): string | null {
  return rank === null ? null : `Rank ${String(rank)}`;
}

/** One pip of the season row. `now` is the week being shown. */
export interface SeasonPip {
  week: number;
  state: 'done' | 'now' | 'ahead';
  /** The last week of the season. */
  festival: boolean;
  label: string;
}

/** The five pips of the season, week 1 to 5. Empty when the week has no season (an old week). */
export function seasonPips(season: RaidView['season']): SeasonPip[] {
  if (season === null) return [];
  return Array.from({ length: SEASON_WEEKS }, (_, i) => {
    const week = i + 1;
    const festival = week === SEASON_WEEKS;
    return {
      week,
      festival,
      state: week < season.week ? 'done' : week === season.week ? 'now' : 'ahead',
      label: `Week ${String(week)}${festival ? ' (Festival)' : ''}`,
    };
  });
}

/** "Week 2 of 5 this season", the text behind the pips. Null when there is no season. */
export function seasonText(season: RaidView['season']): string | null {
  if (season === null) return null;
  return season.week === SEASON_WEEKS
    ? `Week ${String(season.week)} of ${String(SEASON_WEEKS)}: the Festival ends the season`
    : `Week ${String(season.week)} of ${String(SEASON_WEEKS)} this season`;
}

export const READINESS_LABELS: Record<ReadinessBand, string> = {
  long_shot: 'Long shot',
  even: 'Even',
  likely: 'Likely',
  strong: 'Strong',
};

/** The one line under the band, so nobody reads it as a promise or a number. */
export const READINESS_HINT = 'How ready your team looks';

/** The band as plain words, or null when the server has none. */
export function readinessLabel(band: ReadinessBand | null): string | null {
  return band === null ? null : READINESS_LABELS[band];
}

/**
 * The Festival banner of a week: what the week is and what winning gives. Null in a normal week.
 * `festivalCreature` is the species id; its name comes from the shared content.
 */
export function festivalBanner(
  view: Pick<RaidView, 'festival' | 'festivalCreature' | 'effectiveRank'>,
): string | null {
  if (!view.festival) return null;
  const prize =
    view.festivalCreature === null ? 'a Festival creature' : speciesName(view.festivalCreature);
  const easier =
    view.effectiveRank === null
      ? 'The boss is easier'
      : `The boss is easier and fights as a ${rankLabel(view.effectiveRank) ?? ''} boss`;
  return `${easier}, Essence pays more, and every winner gets ${prize}.`;
}

/** The teaser of the Festival creature (what it is), or null in a normal week. */
export function festivalTeaser(
  view: Pick<RaidView, 'festival' | 'festivalCreature'>,
): string | null {
  if (!view.festival || view.festivalCreature === null) return null;
  return `${speciesName(view.festivalCreature)} can only be won in a Festival. It is not found on expeditions.`;
}

/** "Best rank cleared: Rank 5", or null until the server has cleared a normal week. */
export function bestRankText(best: number | null): string | null {
  return best === null ? null : `Best rank cleared: ${rankLabel(best) ?? ''}`;
}

/** What a finale did to the server's rank, in a sentence. */
export function rankChangeText(change: RankChange): string {
  if (change.after > change.before) return `The server climbs to Rank ${String(change.after)}.`;
  if (change.after < change.before) {
    return `${change.festival ? 'The Festival is over. ' : ''}The server eases to Rank ${String(change.after)}.`;
  }
  return `Rank ${String(change.after)} stays.`;
}

/** What the Festival creature did for the player, in a sentence. */
export function festivalGrantText(grant: FestivalGrant): string {
  const name = speciesName(grant.species);
  switch (grant.outcome) {
    case 'new':
      return `You won ${name}! A new level 1 creature for your collection.`;
    case 'fused':
      return `You won ${name} again: it fused with yours (fusion ${String(grant.fusionCount ?? 0)} of 5).`;
    case 'converted':
      return `You already had a fully fused ${name}: +${String(grant.bait ?? 0)} Bait instead.`;
  }
}
