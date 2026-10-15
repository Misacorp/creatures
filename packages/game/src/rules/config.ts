import type { Element, Rarity } from '../content/schema';

/** A Support's element effect (`RULES.combat.supportFx`); every field optional. */
export interface SupportFx {
  /** Replaces the shared next-hit buff (`supportBuffBp`) for the neighbours. */
  buffBp?: number;
  /** Extra share of a reaction's bonus damage when a neighbour cashes the reaction in. */
  reactionBp?: number;
  /** Heals each neighbour this share of its max HP at round start (capped at what is missing). */
  healBp?: number;
  /** Also clears each neighbour's silence at round start. */
  cleanse?: boolean;
}

export type DurationId = 'short' | 'medium' | 'long';
export type SuppliesId = 'basic' | 'good' | 'great';

const HOUR_MS = 3_600_000;

/**
 * Every tunable number of the M2 rules in one place (the balance simulator reads and overrides a
 * copy of this). Probabilities are integers: basis points (out of 10000) or numerator/denominator.
 */
export const RULES = {
  /**
   * The game's daily reset, in the guild's local time: 13:37, "leet o'clock" (Misa). Everything
   * daily (the dungeon run, streaks) turns over here, not at midnight. A game day is named by the
   * calendar date on which it starts, so 12:00 on the 14th still belongs to the 13th's game day.
   */
  daily: { reset: { hour: 13, minute: 37 } },
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
    /**
     * Guard: extra HP, applied to the effective HP stat. This is the value of fights stored without
     * `rules` (before attack patterns); it stays as it was so those replay exactly. Fights with
     * `rules` use `guard.hpBp` instead.
     */
    guardHpBp: 3_000,
    /**
     * The Guard of fights with `rules` (copied into `FightInput.rules` as `guardHpBp` and
     * `guardArmorBp`): `hpBp` is extra HP in basis points of the HP stat (0: none), `armorBp` is the
     * share of damage the Guard does not take from every hit that reaches it (its own, one it takes
     * for a neighbour, a splash, an enrage hit, a reflect). Armor is one number per fight for now;
     * the engine reads it through `guardArmorFor`, so it can scale with level or gear later. The
     * damage armor prevents on a hit the Guard takes in place of another creature is credited to it.
     */
    guard: { hpBp: 0, armorBp: 2_500 },
    /**
     * Setup credit: the share (basis points, rounded down) of a reaction's bonus damage that goes to
     * the creature that set the mark up; the payoff keeps the rest. Credit only: the damage dealt is
     * the same whatever this is.
     */
    setupShareBp: 6_000,
    /**
     * Guard credit for damage a Guard takes when the hit was aimed at it (basis points, rounded
     * down). Damage it takes in place of a neighbour always counts in full. Credit only.
     */
    guardOwnCreditBp: 10_000,
    /** Boss normal attack as a share of boss Attack. */
    bossAttackBp: 10_000,
    /**
     * Guard cover (docs/design/attack-patterns.md section 1): a creature right beside a living Guard
     * takes this much less (basis points) from area hits. The prevented damage is credited to the
     * Guard. Live fights copy it into `FightInput.rules`; absent there means no cover.
     */
    coverBp: 4_000,
    /**
     * The single-hit cap: no boss hit (aimed or area; not a reflect) takes more than this share of
     * the victim's maximum HP. The safety rail for harder hits. Copied into `FightInput.rules`.
     */
    maxHitBp: 5_000,
    /**
     * Support effects by element, on top of the shared `supportBuffBp` (docs/design/attack-patterns.md
     * section 1): `buffBp` replaces the neighbours' next-hit buff (Ember Stoke); `reactionBp` adds that
     * share of a reaction's bonus when a neighbour cashes it in (Spark Overcharge); `healBp` heals each
     * neighbour that share of its max HP at round start, capped at what is missing, never reviving;
     * `cleanse` also clears its silence (Tide Mend). A living, non-silenced Support only. Ceilings
     * (the steep ends of the study, checked by a test): `buffBp` 3500, `reactionBp` 2000, `healBp` 800.
     * Copied into `FightInput.rules`; absent there means no element effects.
     */
    supportFx: {
      ember: { buffBp: 2_500 },
      spark: { reactionBp: 1_500 },
      tide: { healBp: 400, cleanse: true },
      grove: { healBp: 600 },
    } satisfies Record<Element, SupportFx>,
    /**
     * Luck: small, visible randomness in the player-side damage. Crits (5%, +50%, for players and
     * the boss) are on; Fortune streaks (surge and slump) and the damage spread stay in the code
     * and default off [Misa / lead: crits in, streaks out for now]. The engine never reads
     * this itself: it uses the `luck` a fight input carries (absent means `NO_LUCK`), so whoever
     * builds the input (the worker) copies this in and the stored input keeps what the fight used.
     * See docs/design/luck.md.
     */
    luck: {
      /**
       * Baseline crit chance (basis points) of every creature's hit; 0 switches crits off. A
       * creature's own chance is this plus its species bonus (`crit` in content), capped at
       * `critMaxChanceBp`. On since the progression work (Misa): 500 (5%).
       */
      critChanceBp: 500,
      /**
       * Baseline crit damage: a critical hit adds this much damage (basis points of the plain hit),
       * plus the species bonus, capped at `critMaxBp`. Study proposal: 5000 (+50%).
       */
      critBp: 5_000,
      /** Caps on a creature's or the boss's crit chance and crit damage (study proposal: 30%, +150%). */
      critMaxChanceBp: 3_000,
      critMaxBp: 15_000,
      /**
       * Boss crits: baseline chance and extra damage of the boss's hits on creatures (its own
       * chance; `crit` in the boss content adds to both). 0 switches boss crits off. On (Misa): 5%, +50%.
       */
      bossCritChanceBp: 500,
      bossCritBp: 5_000,
      /**
       * Prototype (study only): the chance that the boss's normal attack picks a random living
       * creature from the whole row instead of the first one in front (a guard in the target's
       * zone still takes the hit). 0: always the front, as shipped.
       */
      bossRandomTargetBp: 0,
      /** Every hit is multiplied by 1 + u, u uniform in [-spreadBp, +spreadBp] basis points. */
      spreadBp: 0,
      /**
       * Surge and Slump: each round a Surge (team damage + swingBp) starts with chance
       * surgeChanceBp and a Slump (team damage - swingBp) with chance slumpChanceBp, and lasts
       * swingRounds rounds. A new one cannot start while one is running.
       */
      surgeChanceBp: 0,
      slumpChanceBp: 0,
      swingBp: 5_000,
      swingRounds: 3,
    },
    /** Row size that guests fill up to when fewer than 3 players take part. */
    guestRowSize: 9,
    /** Guests are added when fewer than this many players take part. */
    guestsBelowPlayers: 3,
  },
  raid: {
    /**
     * Phase structure. A phase is cleared when the boss pool is down `clearAtLossBp` of its maximum
     * (cumulative over the week). That is also the phase's floor: the pool cannot go below
     * `max x (10000 - clearAtLossBp)` in that phase; when it gets there the boss is immune, retreats
     * and the phase ends, and damage past the floor counts for nothing (no overkill; Misa,
     * 2026-10-14). Phase 1 leaves 70% of the HP, Phase 2 leaves 15% for the finale. The finale's
     * round count comes from the boss (`finaleRounds`).
     */
    phases: [
      { id: 'phase1', rounds: 10, clearAtLossBp: 3_000 },
      { id: 'phase2', rounds: 10, clearAtLossBp: 8_500 },
      { id: 'finale', rounds: 12, clearAtLossBp: 10_000 },
    ],
    /**
     * Finale enrage (docs/design/raid-ux-2.md): when the finale's rounds run out with both sides
     * standing, up to `rounds` more rounds are played in which the boss makes its plain attack and
     * hits every living creature for `powerBp` of its Attack (area hits, under the single-hit cap);
     * its gimmicks rest (a charge never lands in an enrage round). The fight ends on a wipe or a
     * kill; standing at the end is a loss. An enrage loss is a normal
     * loss. Phases 1 and 2 have no enrage. Tuned by the simulator (docs/balance/log.md B-007): 500%
     * of the boss's Attack on every creature, which the single-hit cap (50% of a creature's max HP)
     * turns into a wipe in two to three rounds. Beyond about 400% the power hardly matters, because
     * the cap is what limits the hit; the round count is the lever that decides how often a
     * last-moment kill is still possible (the creatures act before the enrage hit each round).
     */
    enrage: { rounds: 3, powerBp: 50_000 },
    scaling: {
      /**
       * Boss HP grows with N^(num/den), N = signed-up players. The engine computes
       * floor(Math.pow(N, num / den) * 10000). Math.pow of identical inputs gives identical
       * results in V8 and workerd (the only runtimes we use), and a test pins the values; the
       * result is floored to integer basis points straight away, so nothing float-valued is stored
       * or compared afterwards.
       *
       * Every signed-up player counts once, whatever their level, power or gear, so the head count
       * is weight-neutral: a veteran adds exactly what a newcomer adds, and one strong player
       * cannot inflate the boss for everybody. That is why no per-player cap is needed (the old
       * average-level factor, which could be pushed by a few veterans, is gone). A party is at
       * most `maxPartySize` players, which bounds the factor.
       */
      hpExponent: { num: 11, den: 10 },
      /**
       * Boss Rank: every rank above 1 multiplies boss HP by this many basis points more than the
       * rank below it, compounding (rank r is 1.40^(r-1) at 4000), floored to integer basis points
       * at every step (`rankFactorBp`). Compounding rather than linear, so a rank always costs the
       * same share of the team's damage and a high-ranked server keeps a real ladder instead of
       * ever smaller steps. Tuned by the simulator (docs/balance/report-2026-10-11-progression.md).
       */
      rankStepBp: 4_000,
      /**
       * Boss Attack follows the rank factor at this share (10000 = the same factor as HP). Half, as
       * the old level scaling did (6% against 12% a level), so higher ranks do not knock out the row.
       */
      atkRankShareBp: 5_000,
      /**
       * Highest rank the ladder reaches. At 20% a step the top factor is about 197x, far beyond what
       * any roster can beat, so nobody gets there; the cap only keeps every number small and safe.
       */
      maxRank: 30,
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
    /**
     * The "Close one!" rule of the after-action card, both in basis points of the stage's target:
     * - `missBp`: a stage that was not cleared is close when it fell short of its target by at most
     *   this much. A phase's target is the HP it had to take off the pool (its clear threshold,
     *   `clearAtLossBp` of the maximum); the finale's target is the whole pool, so a finale is close
     *   when the boss kept at most this share of its maximum HP.
     * - `spareBp`: a cleared stage is close when it had at most this much to spare, counted in
     *   rounds left over: the boss retreated at its floor (a phase) or fell (the finale) with at most
     *   this share of the stage's rounds still to play. A phase can no longer have HP to spare (the
     *   pool cannot go below its floor) and a finale win always empties the pool, so rounds are the
     *   only spare there is; a finale won in enrage rounds has none left and is close.
     */
    closeCall: { missBp: 1_000, spareBp: 1_000 },
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
  /**
   * Week-to-week progression (docs/design/progression.md): the Boss Rank ladder, seasons and
   * Festival weeks, rank-scaled rewards and the readiness band. All integers.
   */
  progression: {
    /**
     * A season is this many raid weeks: the first `seasonWeeks - 1` are normal, the last is a
     * Festival. Weeks are counted by the global week index, so the worker needs no stored counter.
     */
    seasonWeeks: 5,
    /** A finale win in a normal week raises the server's rank by this much. */
    winRankUp: 1,
    /**
     * A finale win in a Festival week raises the rank by this much. 0: the Festival is a break from
     * the ladder, its reward is the Essence bonus and the Festival creature.
     */
    festivalWinRankUp: 0,
    /** The Festival boss fights at (rank - this), never below rank 1. */
    festivalEaseRanks: 3,
    /** After every Festival (won or lost) the server's rank eases by this much, never below 1. */
    seasonResetRanks: 1,
    /** Festival weeks pay this much more Essence (basis points; 5000 = +50%). */
    festivalEssenceBp: 5_000,
    /**
     * Essence of every stage and the jackpot grows with the server's rank: the multiplier is
     * 10000 + rankRewardBp x (rank - 1) basis points, capped at `rankRewardCapBp` (20000 = x2).
     */
    rankRewardBp: 600,
    rankRewardCapBp: 20_000,
    /**
     * Placement rank for a new server: the rank whose boss is as hard as the old per-level rule would
     * have made it. `legacyHpPerLevelBp` is that old rule (boss HP +12% per average creature level
     * above 1), kept only to place a new server once.
     */
    placement: { legacyHpPerLevelBp: 1_200 },
    /**
     * Readiness band (long shot, even, likely, strong) from the forecast margin: mean finale damage
     * over the boss HP left, in basis points (10000 = exactly enough). Bands start at these margins.
     * Calibrated by the simulator (docs/balance/report-2026-10-11-progression.md).
     */
    readiness: {
      evenFromBp: 8_000,
      likelyFromBp: 8_800,
      strongFromBp: 10_300,
      /** Fresh seeds a forecast averages over. */
      samples: 5,
    },
  },
  abilities: {
    /** Creature level at which a species' finale ability unlocks. */
    unlockLevel: 10,
  },
  /**
   * Gear and crafting v1 (docs/design/gear.md). Starting values, to be tuned by the simulator. All
   * amounts are integers: percentages and crit points are basis points. Gear never reaches the engine:
   * `applyGear` folds it into a creature's stats and crit bonus before the fight, with the caps below
   * (and the engine's own crit caps still apply on top).
   */
  gear: {
    /** Upgrade levels: +0 to +5. */
    maxLevel: 5,
    /** Items one player can own (items in the bag plus crafts still in the workshop). */
    inventoryCap: 60,
    /** Jobs one player can run at the same time. */
    workshopSlots: 2,
    /** Per rarity: the multiplier (basis points) on the primary roll, and how many secondaries it has. */
    rarity: {
      common: { primaryBp: 10_000, secondaries: 0 },
      rare: { primaryBp: 12_500, secondaries: 1 },
      epic: { primaryBp: 15_000, secondaries: 2 },
      // Festival gear has epic power and a look of its own.
      festival: { primaryBp: 15_000, secondaries: 2 },
    },
    /** Roll ranges (inclusive, basis points) per stat: the primary stat of an item and its secondaries. */
    rolls: {
      primary: {
        atk: { min: 520, max: 880 },
        hp: { min: 760, max: 1_260 },
        spd: { min: 300, max: 600 },
        critChance: { min: 150, max: 300 },
        critDamage: { min: 700, max: 1_300 },
      },
      secondary: {
        atk: { min: 200, max: 500 },
        hp: { min: 300, max: 700 },
        spd: { min: 150, max: 300 },
        critChance: { min: 75, max: 150 },
        critDamage: { min: 300, max: 600 },
      },
    },
    /** What each upgrade level adds to the primary stat (basis points). */
    upgradeStepBp: { atk: 250, hp: 260, spd: 70, critChance: 35, critDamage: 200 },
    /**
     * Total bonus caps per creature (basis points): Attack +20%, HP +25%, speed +10%, crit chance
     * +5 points and crit damage +25 points. The engine's crit caps (`combat.luck`) still apply.
     */
    caps: { atk: 2_000, hp: 2_500, spd: 1_000, critChance: 500, critDamage: 2_500 },
    /**
     * Upgrade price from level L to L+1 (index L): Essence and scrap, times the rarity's multiplier
     * (basis points). Upgrades never fail.
     */
    upgrade: {
      essence: [20, 30, 45, 65, 90],
      scrap: [2, 3, 5, 8, 12],
      multiplierBp: { common: 10_000, rare: 15_000, epic: 20_000, festival: 20_000 },
      /** Share of the scrap spent on upgrades that dismantling returns (basis points). */
      refundBp: 5_000,
    },
    /** What dismantling returns, by rarity (a shard is of the item's tint; neutral items give none). */
    dismantle: {
      scrap: { common: 2, rare: 5, epic: 10, festival: 10 },
      shard: { common: 0, rare: 1, epic: 2, festival: 2 },
      glimmer: { common: 0, rare: 0, epic: 1, festival: 1 },
    },
    /** What crafting from a blueprint costs, by the blueprint's rarity (a shard is of the base's tint). */
    craft: {
      common: { scrap: 9, shard: 0, glimmer: 0 },
      rare: { scrap: 18, shard: 1, glimmer: 0 },
      epic: { scrap: 32, shard: 2, glimmer: 1 },
      festival: { scrap: 32, shard: 2, glimmer: 2 },
    },
    /** Improve (re-roll one secondary) costs scrap by the item's rarity. */
    improve: { scrap: { rare: 6, epic: 12, festival: 12 } },
    /** Enchanting costs glimmer and shards (of the enchant's element). */
    enchant: { glimmer: 1, shard: 3 },
    /** Job durations in hours before the crafting skill; the craft time follows the blueprint. */
    jobHours: { craft: { common: 4, rare: 8, epic: 12, festival: 12 }, improve: 2, enchant: 6 },
    skill: {
      /** Total XP to reach each level (index 0 is level 1). XP per job is its nominal hours x `xpPerHour`. */
      xpForLevel: [0, 100, 250, 450, 700, 1_000, 1_600, 2_500, 3_800, 5_500],
      xpPerHour: 12,
      /** Each level above 1 shortens jobs by this much and adds this chance of a rarity up on a craft (basis points). */
      timeReductionBpPerLevel: 300,
      rarityUpBpPerLevel: 100,
    },
    drops: {
      /**
       * Finale win, one roll per participant. Rare and epic chances start at these values at Boss
       * Rank 1, grow by `perRankBp` for every rank above 1 and stop at `maxBp`; the rest is common.
       */
      finale: {
        baseBp: { rare: 2_200, epic: 300 },
        perRankBp: { rare: 250, epic: 150 },
        maxBp: { rare: 5_000, epic: 2_500 },
      },
      /** Scrap for every participant of a cleared phase 1 or 2. */
      phaseScrap: { phase1: 3, phase2: 4 },
      expedition: {
        /** Scrap for a completed trip (a recalled trip pays the share of it that was brought back). */
        scrap: { short: 1, medium: 3, long: 6 },
        /** Chance (basis points) of one shard of the explorer's element, on a completed trip. */
        shardBp: { short: 1_500, medium: 3_000, long: 5_000 },
        /** Chance of one glimmer. */
        glimmerBp: { short: 100, medium: 400, long: 1_000 },
        /** Chance of a blueprint. */
        blueprintBp: { short: 200, medium: 800, long: 1_500 },
      },
      /** Rarity odds (basis points) of a dropped blueprint; the base is picked evenly among that rarity. */
      blueprintOddsBp: { common: 6_000, rare: 3_500, epic: 500 },
      /** A blueprint the player already knows turns into this much scrap. */
      duplicateBlueprintScrap: 5,
      /** The welcome kit: one common item, one common blueprint and this much scrap. */
      welcomeScrap: 10,
    },
  },
  /**
   * The daily dungeon (docs/design/daily-dungeon.md): a solo run of `rooms` rooms with the player's own
   * team of three, once per guild-local day. Depth is personal: a full clear adds 1. Starting values,
   * tuned by the simulator. All amounts are integers (percentages in basis points).
   */
  dungeon: {
    /** Rooms in a run: normal foes first, then a room boss. */
    rooms: 3,
    /** Creatures in the team: one row of three, left to right. */
    teamSize: 3,
    /**
     * Who acts first in every dungeon fight: your row from the left, then the foe (Misa,
     * 2026-10-14: dungeons are the simple fight, and the order is yours to plan). It is a rule,
     * not content: dungeon foes and room modifiers cannot change it. The raid's bosses keep their
     * own turn orders.
     */
    turnOrder: 'left_to_right',
    /**
     * Depth scaling (see `depthFactorBp`): every depth above 1 adds `Step` basis points of the depth-1
     * HP and Attack to a foe, plus `Curve` for each square of the depths above 1, so the first depths
     * are gentle and the later ones steepen. Depths past `maxScaledDepth` fight at that depth's
     * strength, which keeps every number small and safe.
     */
    hpStepBp: 3_000,
    hpCurveBp: 300,
    atkStepBp: 2_000,
    atkCurveBp: 150,
    maxScaledDepth: 60,
    /**
     * How strong a foe is at depth 1, as a share of the HP and Attack in its content (basis points;
     * 10000 is the content's own numbers). One knob for the whole dungeon, so the foes keep the
     * relative strengths their content gives them. 11750 is the old 12500 times 0.94: the attack
     * patterns made foes a few points harder to beat, and 6% less foe HP puts the clear rates back
     * (docs/design/attack-patterns.md 4.6, docs/balance/log.md B-007).
     */
    baseHpBp: 11_750,
    baseAtkBp: 10_000,
    /**
     * Every this many depths is a landmark: a better chest, and a fixed room boss (in content order,
     * round again) that also gains its charged `signature` move.
     */
    landmarkEvery: 7,
    /**
     * Boss-room enrage, to teach the mechanic before the Sunday finale: when the boss room's rounds
     * run out with both sides standing, up to `rounds` more rounds in which the boss also hits every
     * creature for `powerBp` of its Attack. Normal rooms keep the old rule (out of rounds ends the
     * run). `enabled: false` switches it off (Misa may walk it back). Tuned by the simulator
     * (B-007): 100% of the foe's Attack on every creature, which the single-hit cap makes a wipe in
     * about two rounds; the power hardly matters above that, and the extra rounds clear about half a
     * point more runs at the frontier.
     */
    enrage: { enabled: true, rounds: 2, powerBp: 10_000 },
    /** Paid for each room cleared, by room index (the last is the room boss). */
    perRoom: [
      { bait: 1, essence: 0, scrap: 0 },
      { bait: 1, essence: 0, scrap: 0 },
      { bait: 1, essence: 1, scrap: 1 },
    ],
    /** Chance (basis points) of one shard of the room boss's element when the boss room is cleared. */
    bossShardBp: 6_000,
    /** Extra for clearing every room: Essence, and a chance (basis points) at a gear drop. */
    fullClear: { essence: 0, gearBp: 1_500 },
    /**
     * Gear odds of a dungeon drop (basis points; the rest is common): rare and epic start at `baseBp`
     * at depth 1, grow by `perDepthBp` for every depth above 1 and stop at `maxBp`. A landmark drop
     * adds `landmarkBonusBp` to both first.
     */
    gearOdds: {
      baseBp: { rare: 1_800, epic: 200 },
      perDepthBp: { rare: 40, epic: 20 },
      maxBp: { rare: 4_500, epic: 1_800 },
      landmarkBonusBp: { rare: 2_000, epic: 600 },
    },
    /** A fully cleared landmark depth pays this on top, and its gear drop is guaranteed. */
    landmark: { essence: 2, scrap: 2, glimmer: 1 },
    /**
     * Daily streaks: days in a row with a run, counted in a cycle of `cycleDays`. A bonus is paid
     * when the run is the `day`-th of the cycle. A missed day starts the count again (depth is kept).
     */
    streak: {
      cycleDays: 7,
      bonuses: [
        { day: 3, bait: 0, essence: 0, scrap: 1, glimmer: 0 },
        { day: 7, bait: 0, essence: 1, scrap: 1, glimmer: 0 },
      ],
    },
  },
  /**
   * Expeditions v2 (docs/design/expeditions-v2.md): trip lengths, explorer ranks, familiarity, slots,
   * push-on choices, account milestones and the values the simulator compares. Starting values, set by
   * the balance simulator (docs/balance/report-2026-10-13-expeditions.md). The content (places,
   * supplies, goals, journal) is data; only numbers live here. `RULES.expedition` (singular) is the
   * v1 table that trips started before v2 and the old client still read.
   */
  expeditions: {
    /**
     * Per trip length: the time, the catch rolls and what a finished trip brings. Rewards grow faster
     * than the hours (the 12 hour trip pays more than three 4 hour ones would): a short trip is the
     * worst way to progress. `loot` are chances in basis points (a value above 10000 is a sure one plus
     * a chance of another); `scrap` is a flat amount; a recalled trip pays only its share of the scrap.
     */
    lengths: {
      short: {
        ms: 2 * HOUR_MS,
        rolls: 1,
        rarityUpBp: 0,
        xp: 4,
        minRank: 1,
        loot: { scrap: 0, shardBp: 600, glimmerBp: 50, blueprintBp: 100, supplyBp: 500 },
        journalBp: 300,
      },
      medium: {
        ms: 6 * HOUR_MS,
        rolls: 1,
        rarityUpBp: 150,
        xp: 110,
        minRank: 1,
        loot: { scrap: 0, shardBp: 1_000, glimmerBp: 150, blueprintBp: 300, supplyBp: 1_500 },
        journalBp: 600,
      },
      long: {
        ms: 12 * HOUR_MS,
        rolls: 1,
        rarityUpBp: 300,
        xp: 300,
        minRank: 1,
        loot: { scrap: 1, shardBp: 1_500, glimmerBp: 300, blueprintBp: 500, supplyBp: 3_000 },
        journalBp: 1_000,
      },
      day: {
        ms: 24 * HOUR_MS,
        rolls: 2,
        rarityUpBp: 600,
        xp: 700,
        minRank: 5,
        loot: { scrap: 3, shardBp: 4_000, glimmerBp: 800, blueprintBp: 1_000, supplyBp: 4_500 },
        journalBp: 1_600,
      },
    },
    /** Most supplies one trip can carry. */
    maxSupplies: 2,
    /** The rarity odds of a roll when a destination does not say (the v1 "basic" odds). */
    defaultOddsBp: { common: 8_300, rare: 1_500, epic: 200 },
    /**
     * Explorer rank, per creature: total XP needed for each rank (index 0 is rank 1). Each rank above
     * 1 shortens that creature's trips by `speedBpPerRank`, and ranks unlock places (their `minRank` in
     * the content), the 24 hour trip (`lengths.day.minRank`) and better push-on goals (`minRank`).
     */
    rank: {
      xpForRank: [0, 200, 800, 2_000, 4_500, 10_000, 22_000, 45_000, 90_000, 160_000],
      speedBpPerRank: 200,
      /**
       * A fixed one-time gift for reaching each rank from 2 to 10 (index 0 is rank 2): Bait, parts and
       * supplies (content ids), growing with rank, with ranks 7 to 10 the biggest. Every rank unlocks
       * or gives something, so there is always a next thing to look forward to. Granted once per
       * (creature, rank) on the claim that raises the rank. Kept modest: the sim checks the economy.
       */
      gifts: [
        { bait: 2, scrap: 1, glimmer: 0, supplies: [] },
        { bait: 3, scrap: 1, glimmer: 0, supplies: [] },
        { bait: 4, scrap: 2, glimmer: 0, supplies: [] },
        { bait: 5, scrap: 2, glimmer: 0, supplies: [] },
        { bait: 6, scrap: 3, glimmer: 1, supplies: [] },
        { bait: 50, scrap: 5, glimmer: 2, supplies: ['lantern-good', 'lure-good'] },
        { bait: 75, scrap: 8, glimmer: 3, supplies: ['map-scrap-good', 'satchel-good'] },
        { bait: 100, scrap: 10, glimmer: 4, supplies: ['lure-great'] },
        { bait: 150, scrap: 15, glimmer: 6, supplies: ['map-scrap-great', 'satchel-great'] },
      ],
    },
    /**
     * Familiarity, per creature and destination, three stars: 1 from `tripsForStar1` finished trips
     * there, 2 for having caught every species there, 3 for a shiny found there. Bonuses are indexed by
     * stars. Stars open the deeper area: `deepChanceBp` is the chance that a roll is drawn from it.
     */
    familiarity: {
      tripsForStar1: 4,
      deepChanceBp: [0, 3_000, 4_000, 5_000],
      /** A deeper-area roll is one of the place's deep species at this chance (basis points). */
      deepFindBp: 3_500,
      rarityUpBp: [0, 200, 400, 800],
      partsBp: [0, 0, 1_000, 2_000],
    },
    /** Role flavour: a Guard brings back more parts, a Setter finds more of its own element. */
    roles: { guardPartsBp: 3_000, setterAffinityWeight: 3 },
    /**
     * Expedition slots: everyone starts with one. Slot 2 comes after `secondAfterTrips` finished trips;
     * slots 3, 4 and 5 come when the sum of the ranks above 1 of all their creatures reaches these
     * numbers (about a month, four months and a year of a daily player's trips).
     */
    slots: { secondAfterTrips: 3, thresholds: [26, 72, 103] },
    /**
     * A duplicate caught on an expedition after the creature's 5 fusions turns into Bait at this share
     * (basis points) of the usual `fusion.convertBait`: trips are free now, so what they convert must
     * not pay for itself (a v1 trip cost about as much Bait as it converted).
     */
    convertBp: 6_000,
    /**
     * The end-of-trip choice. A trip offers one with probability `baseOfferBp` plus `perRankBp` for
     * each explorer rank above 1, joined with its supplies' own chances (the best tier is a sure
     * thing). Two goals are offered (a safe one and a risky one) once a risky goal is open to the
     * explorer; before that one safe goal.
     */
    pushOn: { baseOfferBp: 1_500, perRankBp: 150, maxGoals: 2 },
    /** The tier of a supply found on a trip, by the explorer's rank. */
    foundTier: { good: 4, great: 7 },
    /** Night is from `fromHour` to `toHour` of the guild's local time. */
    night: { fromHour: 20, toHour: 6 },
    /** Account milestones: very small, permanent bonuses (basis points) for things recorded in the stats. */
    milestones: [
      { id: 'first-steps', stat: 'trips_finished', at: 5, bonus: { kind: 'parts', bp: 100 } },
      { id: 'seasoned', stat: 'trips_finished', at: 50, bonus: { kind: 'rarity', bp: 100 } },
      { id: 'veteran', stat: 'trips_finished', at: 200, bonus: { kind: 'rarity', bp: 100 } },
      { id: 'wanderer', stat: 'places_visited', at: 4, bonus: { kind: 'offer', bp: 100 } },
      { id: 'globetrotter', stat: 'places_visited', at: 7, bonus: { kind: 'parts', bp: 100 } },
      { id: 'collector', stat: 'species_found', at: 6, bonus: { kind: 'xp', bp: 200 } },
      { id: 'scholar', stat: 'journal_pages', at: 10, bonus: { kind: 'xp', bp: 200 } },
      { id: 'archivist', stat: 'journal_sets', at: 4, bonus: { kind: 'offer', bp: 100 } },
      { id: 'gambler', stat: 'pushons_won', at: 10, bonus: { kind: 'offer', bp: 100 } },
      { id: 'raid-watcher', stat: 'reactions_seen', at: 200, bonus: { kind: 'rarity', bp: 50 } },
    ],
    /**
     * What things are worth, in Bait, for the simulator's fairness checks (never shown to players): the
     * risky push-on goal of a trip must be a fair gamble against coming home.
     */
    worth: {
      /** One catch roll, by the rarity it comes out as (about 10 at the default odds). */
      roll: { common: 5, rare: 20, epic: 50 },
      scrap: 2,
      shard: 6,
      glimmer: 25,
      blueprint: 40,
      gear: { common: 15, rare: 50, epic: 140 },
      journal: 6,
      /** Bait per 10 explorer XP. */
      xpPer10: 2,
    },
  },
  /**
   * The living room's light follows the guild's local time: night is `RULES.expeditions.night`, and
   * twilight is the `twilightHours` just outside it (the dawn after the night, the dusk before it).
   */
  room: {
    twilightHours: 2,
  },
  nickname: {
    maxCodePoints: 20,
    /** Inputs longer than this (UTF-16 units) are refused before any normalisation work. */
    maxRawLength: 256,
  },
} as const;

/** The shape of `RULES.combat.luck`; a fight input may carry its own. */
export interface LuckConfig {
  critChanceBp: number;
  critBp: number;
  /** Caps for crit chance and damage (creatures and boss). Absent in older stored inputs: no cap. */
  critMaxChanceBp?: number;
  critMaxBp?: number;
  /** Boss crits. Absent in older stored inputs: the boss never crits. */
  bossCritChanceBp?: number;
  bossCritBp?: number;
  /** Chance the boss's normal attack picks a random living creature. Absent: never. */
  bossRandomTargetBp?: number;
  spreadBp: number;
  surgeChanceBp: number;
  slumpChanceBp: number;
  swingBp: number;
  swingRounds: number;
}

/**
 * No luck at all: what the engine uses when a fight input carries no `luck`, so a stored input from
 * before luck existed replays exactly as it was fought, whatever `RULES.combat.luck` says later.
 */
export const NO_LUCK: LuckConfig = {
  critChanceBp: 0,
  critBp: 0,
  spreadBp: 0,
  surgeChanceBp: 0,
  slumpChanceBp: 0,
  swingBp: 0,
  swingRounds: 1,
};

export const DURATION_IDS = ['short', 'medium', 'long'] as const;
export const SUPPLIES_IDS = ['basic', 'good', 'great'] as const;
