import { content as shippedContent } from '../content';
import type { ContentPack, CreatureSpecies } from '../content/schema';
import { RULES } from './config';
import { applyCatchToCollection, type CollectionEntry, type CollectionOutcome } from './fusion';

/**
 * Week-to-week progression rules: the Boss Rank ladder, seasons and Festival weeks, rank-scaled
 * rewards and the readiness band. Pure and integer-only; every number is in `RULES.progression` and
 * `RULES.raid.scaling`. See docs/design/progression.md.
 *
 * What the server stores per guild: `rank` (integer from 1, set once by `placementRank` at the
 * first raid week) and, per raid week, the week index it computes from the week id.
 */

function clampRank(rank: number): number {
  if (!Number.isFinite(rank)) return 1;
  return Math.min(RULES.raid.scaling.maxRank, Math.max(1, Math.floor(rank)));
}

const factorTable: number[] = [0, 10_000];
/** The step the table was built with: a tuning run that changes `rankStepBp` rebuilds it. */
let tableStepBp = RULES.raid.scaling.rankStepBp;

/**
 * Boss HP factor of a rank in basis points: rank 1 is 10000 and every rank above multiplies the
 * one below by (10000 + `rankStepBp`) / 10000, floored at every step so the table is integers and
 * the same in every runtime. The rank is floored and clamped to 1..`maxRank`.
 */
export function rankFactorBp(rank: number): number {
  const r = clampRank(rank);
  if (tableStepBp !== RULES.raid.scaling.rankStepBp) {
    factorTable.length = 2;
    tableStepBp = RULES.raid.scaling.rankStepBp;
  }
  for (let k = factorTable.length; k <= r; k++) {
    const below = factorTable[k - 1] as number;
    factorTable.push(Math.floor((below * (10_000 + RULES.raid.scaling.rankStepBp)) / 10_000));
  }
  return factorTable[r] as number;
}

/** Boss Attack factor of a rank in basis points: the HP factor's excess at `atkRankShareBp`. */
export function rankAtkFactorBp(rank: number): number {
  const excess = rankFactorBp(rank) - 10_000;
  return 10_000 + Math.floor((excess * RULES.raid.scaling.atkRankShareBp) / 10_000);
}

/**
 * The rank a new server starts at, from the levels of the creatures its players bring to a raid
 * (the 3 team creatures of every signed-up player). It is the rank whose HP factor is closest to
 * what the old rule gave for the average level (1 + 12% per level above 1; ties go to the lower
 * rank), so the first boss is about as hard as it used to be. An empty roster gives rank 1.
 * Used once, at the server's first raid week; after that only the ladder moves the rank.
 */
export function placementRank(levels: readonly number[]): number {
  if (levels.length === 0) return 1;
  let total = 0;
  for (const level of levels) total += Math.max(1, Math.floor(level));
  const avg = Math.max(1, Math.floor(total / levels.length));
  const target = 10_000 + RULES.progression.placement.legacyHpPerLevelBp * (avg - 1);
  let best = 1;
  let bestDiff = Math.abs(rankFactorBp(1) - target);
  for (let r = 2; r <= RULES.raid.scaling.maxRank; r++) {
    const diff = Math.abs(rankFactorBp(r) - target);
    if (diff >= bestDiff) break; // the factor only grows, so the difference has passed its minimum
    best = r;
    bestDiff = diff;
  }
  return best;
}

/** Where a raid week sits in its season. */
export interface SeasonWeek {
  /** Seasons since the week index 0 (0-based). Changes every `seasonWeeks` weeks. */
  seasonIndex: number;
  /** 0-based position in the season; the last one is the Festival. */
  weekInSeason: number;
  festival: boolean;
}

/**
 * The season position of a week, from the week index alone (the worker's `weekIndex(weekId)`, the
 * same number that rotates the bosses): a season is `seasonWeeks` weeks, the last of which is a
 * Festival. Every server shares the calendar, so no counter has to be stored.
 */
export function seasonOf(weekIndex: number): SeasonWeek {
  if (!Number.isInteger(weekIndex) || weekIndex < 0) {
    throw new RangeError(`weekIndex must be an integer >= 0, got ${weekIndex}`);
  }
  const { seasonWeeks } = RULES.progression;
  const weekInSeason = weekIndex % seasonWeeks;
  return {
    seasonIndex: Math.floor(weekIndex / seasonWeeks),
    weekInSeason,
    festival: weekInSeason === seasonWeeks - 1,
  };
}

/** What a raid week is for a server of a given rank. */
export interface RaidWeekPlan extends SeasonWeek {
  /** The server's rank (what the boss card and the post show, and what rewards scale with). */
  rank: number;
  /** The rank the boss fights at: the rank, or the eased rank in a Festival. Pass this to `scaleBoss`. */
  effectiveRank: number;
}

export function raidWeekPlan(weekIndex: number, rank: number): RaidWeekPlan {
  const season = seasonOf(weekIndex);
  const r = clampRank(rank);
  const effectiveRank = season.festival ? Math.max(1, r - RULES.progression.festivalEaseRanks) : r;
  return { ...season, rank: r, effectiveRank };
}

/**
 * The server's rank for the next raid week, given this week and whether its finale was won. A win
 * in a normal week adds `winRankUp`; a loss changes nothing (no demotion, no Resolve). A Festival
 * adds `festivalWinRankUp` on a win and then eases the rank by `seasonResetRanks` whatever the
 * result. Never below 1 or above `maxRank`. A week in which no finale was played changes nothing:
 * do not call this for it.
 */
export function nextRank(rank: number, weekIndex: number, finaleWon: boolean): number {
  const { festival } = seasonOf(weekIndex);
  const p = RULES.progression;
  let r = clampRank(rank);
  if (finaleWon) r += festival ? p.festivalWinRankUp : p.winRankUp;
  if (festival) r -= p.seasonResetRanks;
  return clampRank(r);
}

/**
 * Essence multiplier in basis points for a week: 10000 + `rankRewardBp` x (rank - 1), capped at
 * `rankRewardCapBp`, then `festivalEssenceBp` more in a Festival week (the Festival bonus is on top
 * of the cap). Rewards follow the server's rank, not the eased Festival rank. Used for every
 * stage's Essence and for the jackpot.
 */
export function essenceMultiplierBp(week: { rank: number; festival: boolean }): number {
  const p = RULES.progression;
  const byRank = Math.min(p.rankRewardCapBp, 10_000 + p.rankRewardBp * (clampRank(week.rank) - 1));
  return week.festival ? Math.floor((byRank * (10_000 + p.festivalEssenceBp)) / 10_000) : byRank;
}

/** An Essence amount scaled by the week's multiplier, rounded down. */
export function scaleEssence(amount: number, week: { rank: number; festival: boolean }): number {
  return Math.floor((amount * essenceMultiplierBp(week)) / 10_000);
}

/** The jackpot's Essence for a week (`RULES.raid.jackpotEssence`, scaled like every other payout). */
export function jackpotEssenceFor(week: { rank: number; festival: boolean }): number {
  return scaleEssence(RULES.raid.jackpotEssence, week);
}

/**
 * The Festival creature of a Festival week: the festival-only species (`festival: true` in
 * content, in content order) picked by the season index, so the creatures take turns season by
 * season. Null if the week is not a Festival or the content has no festival species.
 */
export function festivalCreatureFor(
  weekIndex: number,
  pack: ContentPack = shippedContent,
): CreatureSpecies | null {
  const season = seasonOf(weekIndex);
  if (!season.festival) return null;
  const festival = pack.creatures.filter((c) => c.festival === true);
  return festival[season.seasonIndex % Math.max(1, festival.length)] ?? null;
}

/**
 * What winning a Festival finale does to a participant's collection. Owning the creature already
 * is the usual duplicate: it fuses (+stats) up to 5 fusions and then converts to Bait by rarity
 * (`applyCatchToCollection`). A festival grant is never shiny. Pass the participant's entry for the
 * Festival creature's line, or undefined if they do not own it.
 */
export function festivalGrantOutcome(
  entry: CollectionEntry | undefined,
  species: Pick<CreatureSpecies, 'rarity'>,
): CollectionOutcome {
  return applyCatchToCollection(entry, { species, shiny: false });
}

export type ReadinessBand = 'long_shot' | 'even' | 'likely' | 'strong';
export const READINESS_BANDS: readonly ReadinessBand[] = ['long_shot', 'even', 'likely', 'strong'];

/** A forecast: the damage the team is expected to deal and the boss HP it has to remove. */
export interface Forecast {
  /** Mean damage over the forecast's fresh seeds (integer). */
  damage: number;
  /** Boss HP left when the fight starts. */
  hpLeft: number;
}

/** The forecast margin in basis points (10000 = exactly enough damage). Infinity if nothing is left. */
export function forecastMarginBp(forecast: Forecast): number {
  if (forecast.hpLeft <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor((Math.max(0, forecast.damage) * 10_000) / forecast.hpLeft);
}

/**
 * The vague readiness band shown on the boss card, from a forecast (`forecastFinale` in the
 * engine). Never reveal the margin or any frequency; only the band.
 */
export function readinessBand(forecast: Forecast): ReadinessBand {
  const margin = forecastMarginBp(forecast);
  const r = RULES.progression.readiness;
  if (margin < r.evenFromBp) return 'long_shot';
  if (margin < r.likelyFromBp) return 'even';
  if (margin < r.strongFromBp) return 'likely';
  return 'strong';
}
