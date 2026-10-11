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
    /**
     * Cost to go from level L to L+1 is baseCost + perLevel * L. Tuned by the balance simulator
     * (docs/balance/report-2026-10-11.md): a casual player can take a first creature to its
     * evolution level within four weeks.
     */
    baseCost: 3,
    perLevel: 2,
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
  combat: {
    /** Element matchup multipliers in basis points. */
    strongBp: 15_000,
    weakBp: 7_500,
    /** Support: extra damage on each neighbour's next hit. */
    supportBuffBp: 1_500,
    /** Guard: extra HP, applied to the effective HP stat. */
    guardHpBp: 3_000,
    /** Boss normal attack as a share of boss Attack. */
    bossAttackBp: 10_000,
    /** Row size that guests fill up to when fewer than 3 players take part. */
    guestRowSize: 9,
    /** Guests are added when fewer than this many players take part. */
    guestsBelowPlayers: 3,
  },
  raid: {
    /**
     * Phase structure. A phase is cleared when the boss pool is down `clearAtLossBp` of its maximum
     * (cumulative over the week). The finale's round count comes from the boss (`finaleRounds`).
     */
    phases: [
      { id: 'phase1', rounds: 10, clearAtLossBp: 1_800 },
      { id: 'phase2', rounds: 10, clearAtLossBp: 5_400 },
      { id: 'finale', rounds: 12, clearAtLossBp: 10_000 },
    ],
    scaling: {
      /**
       * Boss HP grows with N^(num/den), N = signed-up players. The engine computes
       * floor(Math.pow(N, num / den) * 10000). Math.pow of identical inputs gives identical
       * results in V8 and workerd (the only runtimes we use), and a test pins the values; the
       * result is floored to integer basis points straight away, so nothing float-valued is stored
       * or compared afterwards.
       */
      hpExponent: { num: 12, den: 10 },
      /**
       * Boss HP and Attack grow by this many basis points per average creature level above 1.
       * The exponent above 1 and the per-level rate are balance tuning
       * (docs/balance/report-2026-10-11.md): bigger servers earn more Bait per player, so the boss
       * must grow faster than the head count to keep the finale win rate flat from 5 to 15
       * players, and fast enough per level that a week-4 and a week-8 roster face the same odds.
       */
      hpPerLevelBp: 1_200,
      atkPerLevelBp: 600,
    },
    softCap: {
      /** A player's share of total contribution counts fully up to this many basis points... */
      shareBp: 3_500,
      /** ...and at this rate (basis points) above it. Loot weighting only. */
      aboveRateBp: 5_000,
    },
    essence: {
      /** Flat Essence per signed-up player for each cleared stage. */
      flat: { phase1: 10, phase2: 15, finale: 25 },
      /**
       * Contribution-weighted pool as a share of the stage's flat total: 4286 is 3/7, so the week
       * pays about 70% flat and 30% by contribution.
       */
      poolBp: 4_286,
    },
    /**
     * The weekly calendar, in the guild's local time. `weekday` is the ISO weekday (1 = Monday ...
     * 7 = Sunday). A raid week starts at `weekStart` and runs to the next one, so Monday 00:00 to
     * 13:36 still belongs to the previous week. The events must be in chronological order.
     */
    schedule: {
      weekStart: { weekday: 1, hour: 13, minute: 37 },
      phase1: { weekday: 5, hour: 13, minute: 37 },
      phase2: { weekday: 6, hour: 13, minute: 37 },
      finale: { weekday: 7, hour: 20, minute: 0 },
    },
    /** Most players in one party; a bigger roster is split into balanced parties. */
    maxPartySize: 15,
    /** Creatures a player brings to a raid. */
    teamSize: 3,
    /** A player is on the roster if they opened the game or earned a leet credit this recently. */
    activeWindowDays: 14,
    /** Essence paid for a finale jackpot until gear and jackpot items arrive. */
    jackpotEssence: 100,
    jackpot: {
      baseBp: 600,
      /**
       * From this raid without a jackpot on, the chance rises by `softPityStepBp` per raid. Pity
       * counts finale wins only: a lost finale rolls nothing and changes nothing
       * (docs/design/creature-abilities.md).
       */
      softPityFromRaid: 5,
      softPityStepBp: 800,
      /** The raid without a jackpot on which one is guaranteed. */
      hardPityRaid: 10,
    },
  },
  abilities: {
    /** Creature level at which a species' finale ability unlocks. */
    unlockLevel: 10,
  },
  nickname: {
    maxCodePoints: 20,
    /** Inputs longer than this (UTF-16 units) are refused before any normalisation work. */
    maxRawLength: 256,
  },
} as const;

export const DURATION_IDS = ['short', 'medium', 'long'] as const;
export const SUPPLIES_IDS = ['basic', 'good', 'great'] as const;
