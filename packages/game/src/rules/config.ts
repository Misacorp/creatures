import type { Rarity } from '../content/schema';

export type DurationId = 'short' | 'medium' | 'long';
export type SuppliesId = 'basic' | 'good' | 'great';

const HOUR_MS = 3_600_000;

/**
 * Every tunable number of the M2 rules in one place (the balance simulator reads and overrides a
 * copy of this). Probabilities are integers: basis points (out of 10000) or numerator/denominator.
 */
export const RULES = {
  training: {
    /** Cost to go from level L to L+1 is baseCost + perLevel * L. */
    baseCost: 10,
    perLevel: 5,
    /** Half price while level < serverMedianLevel - discountLevelsBelowMedian. */
    discountLevelsBelowMedian: 5,
  },
  expedition: {
    durations: {
      short: { ms: 1 * HOUR_MS, rolls: 1 },
      medium: { ms: 6 * HOUR_MS, rolls: 2 },
      long: { ms: 12 * HOUR_MS, rolls: 3 },
    },
    supplies: {
      basic: { costPerRoll: 10, oddsBp: { common: 7200, rare: 2500, epic: 300 } },
      good: { costPerRoll: 25, oddsBp: { common: 6000, rare: 3300, epic: 700 } },
      great: { costPerRoll: 50, oddsBp: { common: 5000, rare: 3800, epic: 1200 } },
    },
  },
  catching: {
    /** Chance that a catch is shiny: numerator / denominator. */
    shiny: { numerator: 1, denominator: 500 },
    /** Species weight multiplier when the species has the explorer's element. */
    explorerAffinityWeight: 2,
    /** After this many duplicates in a row the next catch avoids owned species if possible. */
    dupeShieldStreak: 4,
    /** The first claim of a player's first expedition starts with this line. */
    firstExpeditionLine: 'zipmouse',
  },
  fusion: {
    /** Cumulative stat bonus in basis points after N fusions (index = N). */
    cumulativeBonusBp: [0, 600, 1100, 1500, 1800, 2000],
    maxFusions: 5,
    /** Bait granted for a duplicate once the creature has reached maxFusions. */
    convertBait: { common: 5, rare: 15, epic: 40 } satisfies Record<Rarity, number>,
  },
  nickname: {
    maxCodePoints: 20,
    /** Inputs longer than this (UTF-16 units) are refused before any normalisation work. */
    maxRawLength: 256,
  },
} as const;

export const DURATION_IDS = ['short', 'medium', 'long'] as const;
export const SUPPLIES_IDS = ['basic', 'good', 'great'] as const;
