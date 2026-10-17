/**
 * Plain words for the Boss Rank ladder, seasons and Festival weeks: the rank on the boss card, the
 * season pips, the readiness band, the rank change after a finale and the Festival creature. Pure
 * functions. The server decides every number; the client only phrases them, and never shows a
 * forecast number (the readiness band is four words).
 */
import { finaleItemLevel } from '@creatures/game';
import { speciesName } from './game';
import { compactPair } from './number-format';
import type { TrackStep, TrackUnlock } from './progress-track';
import {
  READINESS_BANDS,
  type FestivalGrant,
  type RankChange,
  type RaidView,
  type ReadinessBand,
} from './raid-api';

/** Weeks in a season: four normal weeks and a Festival (`RULES.progression.seasonWeeks`). */
export const SEASON_WEEKS = 5;

/** "Rank 6", or null when the week has no rank (an old week, or nobody in yet). */
export function rankLabel(rank: number | null): string | null {
  return rank === null ? null : `Rank ${String(rank)}`;
}

/**
 * The words of the boss card's HP bar: `text` is written on the bar (short, "42K / 50.2K"), `label`
 * is what a screen reader hears (the exact numbers).
 */
export function bossHpWords(current: number, max: number): { text: string; label: string } {
  return {
    text: compactPair(current, max),
    label: `Boss HP this week: ${String(current)} / ${String(max)}`,
  };
}

/** One pip of the season row. `now` is the week being shown. */
interface SeasonPip {
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

/** "Week 2 / 5 this season" for a week of the season (1 to 5); the 5th is the Festival. */
export function seasonWeekText(week: number): string {
  return week === SEASON_WEEKS
    ? `Week ${String(week)} / ${String(SEASON_WEEKS)}: the Festival ends the season`
    : `Week ${String(week)} / ${String(SEASON_WEEKS)} this season`;
}

/** "Week 2 / 5 this season", the text behind the pips. Null when there is no season. */
export function seasonText(season: RaidView['season']): string | null {
  return season === null ? null : seasonWeekText(season.week);
}

export const READINESS_LABELS: Record<ReadinessBand, string> = {
  long_shot: 'Long shot',
  even: 'Even',
  likely: 'Likely',
  strong: 'Strong',
};

/** The small meter next to the Rank: how many of its four steps are lit, and the word. */
export interface ReadinessMeter {
  band: ReadinessBand;
  /** Steps lit, 1 (long shot) to 4 (strong). */
  filled: number;
  total: number;
  word: string;
}

/** The band as a meter (four steps), or null when the server has none. Never a number on screen. */
export function readinessMeter(band: ReadinessBand | null): ReadinessMeter | null {
  if (band === null) return null;
  return {
    band,
    filled: READINESS_BANDS.indexOf(band) + 1,
    total: READINESS_BANDS.length,
    word: READINESS_LABELS[band],
  };
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

/**
 * What winning the finale pays, for the boss card: Essence for everyone and the reward slot (a gear
 * piece or a blueprint), better at higher ranks. It names the item level this week's gear arrives at
 * (the server's rank decides it, as it does the drop).
 */
export function winPaysText(view: Pick<RaidView, 'rank'>): string {
  const base = 'Win: Essence for everyone, plus a gear piece or blueprint, better at higher ranks.';
  return view.rank === null
    ? base
    : `${base} This week's gear arrives at item level ${String(finaleItemLevel(view.rank))}.`;
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
    case 'duplicate':
      return `You won ${name} again! It waits on the Collection tab: Teach its talent, Fuse, Release or Keep it.`;
    case 'fused':
      return `You won ${name} again: it fused with yours (fusion ${String(grant.fusionCount ?? 0)} / 5).`;
    case 'converted':
      return `You already had a fully fused ${name}: +${String(grant.bait ?? 0)} Bait instead.`;
  }
}

// --- The Boss Rank and season row after a finale ---

/** What the next Rank brings, as words (never a number): the track lists them under the next step. */
const NEXT_RANK_UNLOCKS: readonly TrackUnlock[] = [
  { icon: 'skull', text: 'A tougher boss' },
  { icon: 'gem', text: 'More Essence' },
];

/**
 * The server's Boss Rank as a track in the dungeon depth's language: the Rank for next week (lit)
 * and the one after it, across the width. The ladder has no top, so there is always a next.
 */
export function bossRankTrack(rank: number): { steps: TrackStep[]; current: number } {
  const now = Math.max(1, Math.floor(rank));
  return {
    steps: [
      { id: now, label: rankLabel(now) ?? '', unlocks: [] },
      { id: now + 1, label: rankLabel(now + 1) ?? '', unlocks: NEXT_RANK_UNLOCKS },
    ],
    current: 0,
  };
}

/** What the row after a finale shows: the Rank track and the season's pips. Either may be missing. */
export interface FinaleProgress {
  rank: { steps: TrackStep[]; current: number } | null;
  season: { week: number; weeks: number; text: string; label: string } | null;
}

/**
 * The Rank and season row of a finale result. The rank comes from the ladder's move (null until
 * every party of the server has finished, and for practice fights). The season week is the week the
 * finale was played in: a Festival's own result knows it is the 5th; otherwise it is read from the
 * raid page's season when that is the same week, and left out when it cannot be told. Null when
 * there is nothing to show.
 */
export function finaleProgress(
  reveal: { week: string; rankChange?: RankChange | null | undefined },
  at: { weekId: string; season: RaidView['season'] } | null,
): FinaleProgress | null {
  const change = reveal.rankChange ?? null;
  let week: number | null = null;
  if (change?.festival === true) week = SEASON_WEEKS;
  else if (at !== null && at.season !== null && at.weekId === reveal.week) week = at.season.week;
  const rank = change === null ? null : bossRankTrack(change.after);
  const season =
    week === null
      ? null
      : {
          week,
          weeks: SEASON_WEEKS,
          text: seasonWeekText(week),
          label: `Season: ${seasonWeekText(week)}`,
        };
  return rank === null && season === null ? null : { rank, season };
}
