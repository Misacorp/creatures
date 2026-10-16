import { content as shippedContent } from '../content';
import type { ContentPack, CreatureSpecies } from '../content/schema';
import { RULES, type LuckConfig, type RankRow } from './config';
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

/**
 * The curve's numbers for a rank (1..`maxRank`, floored): the table's row, or above the table the
 * last row grown by `RULES.raid.curve.beyond` for every rank past it (HP and Attack compounding,
 * floored at every step so the numbers are integers and the same in every runtime; the boss attacks
 * and the crit bonus stay at the last row's). An empty table is rank 1's numbers everywhere.
 */
export function rankRow(rank: number): RankRow {
  const r = clampRank(rank);
  const { ranks, beyond } = RULES.raid.curve;
  const last = ranks[ranks.length - 1];
  if (last === undefined) return { hpBp: 10_000, atkBp: 10_000, bossAttacks: 1, critBonusBp: 0 };
  const row = ranks[r - 1];
  if (row !== undefined) return { ...row };
  let hpBp = last.hpBp;
  let atkBp = last.atkBp;
  for (let k = ranks.length + 1; k <= r; k++) {
    hpBp = Math.floor((hpBp * (10_000 + beyond.hpStepBp)) / 10_000);
    atkBp = Math.floor((atkBp * (10_000 + beyond.atkStepBp)) / 10_000);
  }
  return { ...last, hpBp, atkBp };
}

/**
 * Boss HP factor of a rank in basis points (10000 = rank 1): the curve's `hpBp` for the rank
 * (`rankRow`). The rank is floored and clamped to 1..`maxRank`.
 */
export function rankFactorBp(rank: number): number {
  return rankRow(rank).hpBp;
}

/** Boss Attack factor of a rank in basis points (10000 = rank 1): the curve's `atkBp` for the rank. */
export function rankAtkFactorBp(rank: number): number {
  return rankRow(rank).atkBp;
}

/**
 * How many times the boss makes its plain attack each round at `rank` (`FightInput.bossAttacks`),
 * 1 to 3: the curve's `bossAttacks` for the rank. The rank is floored and clamped to 1..`maxRank`.
 */
export function bossAttacksAtRank(rank: number): number {
  return Math.min(3, Math.max(1, Math.floor(rankRow(rank).bossAttacks)));
}

/**
 * Extra boss crit chance at `rank` in basis points, on top of `RULES.combat.luck.bossCritChanceBp`
 * (the curve's `critBonusBp`). Never negative.
 */
export function bossCritBonusAtRank(rank: number): number {
  return Math.max(0, Math.floor(rankRow(rank).critBonusBp));
}

/**
 * The luck rules a boss fights with at `rank`: `luck` with the curve's crit bonus added to the
 * boss's crit chance (the same object back when the bonus is 0). The chance cap is the engine's
 * (`critMaxChanceBp`), so a high bonus cannot run away.
 */
export function luckAtRank(luck: LuckConfig, rank: number): LuckConfig {
  const bonus = bossCritBonusAtRank(rank);
  if (bonus === 0) return luck;
  return { ...luck, bossCritChanceBp: (luck.bossCritChanceBp ?? 0) + bonus };
}

/**
 * The rank a new server starts at: `RULES.progression.placement.startRank` (1), whatever its
 * creatures. The levels are still taken, and ignored, so the callers that place a server from the
 * creatures its members bring (and the stored ranks of servers placed under the old rule) keep
 * working. Used once, at the server's first raid week; after that only the ladder moves the rank.
 */
export function placementRank(levels: readonly number[]): number {
  // The levels are deliberately not read: placement no longer depends on the creatures.
  void levels;
  return clampRank(RULES.progression.placement.startRank);
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
