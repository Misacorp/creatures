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

/** One row of the raid difficulty curve (`RULES.raid.curve.ranks`), whole numbers only. */
export interface RankRow {
  hpBp: number;
  atkBp: number;
  bossAttacks: number;
  critBonusBp: number;
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
  /**
   * Boons and Omens (docs/design/gear-and-creatures-v2.md section 10): at every daily reset the valley
   * gets one Boon and, from Boss Rank 3, one Omen, drawn a day ahead. `tiers` give their strength by the
   * server's Boss Rank (the last row whose `fromRank` is reached): `boonBp` and `omenBp` are the multiplier
   * on every number of the day's Boon and Omen in basis points (10000 is x1; `omenBp` 0 means no Omen). A
   * wild Omen (rank `wildFromRank` and up, at most one a raid week, never in a Festival week, drawn a day
   * ahead) replaces the day's Omen with chance `wildChanceBp`. Days older than `keepDays` are forgotten.
   * Starting values; the sim reports what they do to the raid (docs/balance/log.md B-017).
   */
  weather: {
    /** How strong the day's Boon and Omen are, by the server's Boss Rank: the row with the highest `fromRank` reached counts. */
    tiers: [
      { fromRank: 1, boonBp: 10_000, omenBp: 0 },
      { fromRank: 3, boonBp: 10_000, omenBp: 10_000 },
      { fromRank: 6, boonBp: 12_500, omenBp: 15_000 },
      { fromRank: 10, boonBp: 15_000, omenBp: 20_000 },
      { fromRank: 14, boonBp: 15_000, omenBp: 25_000 },
    ],
    /** The Boss Rank from which a wild Omen can replace the day's Omen. */
    wildFromRank: 10,
    /** The chance that a day a wild Omen may be drawn for draws one (basis points). */
    wildChanceBp: 2_000,
    /** Days of drawn weather the server keeps; older days are forgotten. */
    keepDays: 30,
  },
  /**
   * Creature experience (docs/design/gear-and-creatures-v2.md section 9, "Creatures B"): levels come from
   * what a creature does, never from Bait. Experience from level L to L + 1 is `perLevel x L +
   * perLevelSquared x L x L` (27 at level 1, 450 at 10, 1,300 at 20; about 28,000 from 1 to 30). Starting
   * values, tuned with the journey sim to the starting pace of the design (docs/balance/log.md B-016): the
   * design's first numbers were 10 / 30 / 60 / 120 for a trip, 20 and 20 for the dungeon, 50 / 50 / 100 for
   * the raid and 4 an hour for a job; the pace needs about twice as much from trips and jobs, three times
   * from the dungeon and four times from the raid. There is no catch-up bonus (2026-10-16).
   */
  experience: {
    perLevel: 25,
    perLevelSquared: 2,
    /** No levels past this (the Gold Ribbon is the reward for reaching it). */
    maxLevel: 30,
    /** Experience per creature for a finished trip, by length (a recall or a failed trip pays none). */
    trip: { short: 20, medium: 60, long: 120, day: 240 },
    /** The daily dungeon: per fight cleared (a run is 3 to 6 fights), and on top of that for beating the floor boss. Depth adds nothing. */
    dungeon: { perRoom: 35, fullClear: 60 },
    /** Raid stages, per creature in the fight: the stage's experience, times `clearedBp` when it was cleared. */
    raid: { phase1: 200, phase2: 200, finale: 400, clearedBp: 15_000 },
    /** A Workshop job: experience per hour of its nominal work time. */
    workshopPerHour: 8,
    /**
     * Treats (a per-creature checkbox when an activity starts): the activity's experience for that
     * creature is multiplied by `multiplier`, and the treat costs `baitBase + ceil(level / 2)` Bait, paid
     * when the activity starts. Raids take no treats.
     */
    treat: { multiplier: 2, baitBase: 3 },
    /**
     * The ribbons that gate a creature: it stops at `level` until the ribbon is earned. Materials only:
     * scrap, shards of the creature's element, glimmer, and finished trips (the creature's own). Gold
     * is the reward for reaching `maxLevel` and costs nothing.
     */
    ribbons: [
      { id: 'bronze', level: 10, scrap: 6, shards: 2, glimmer: 0, trips: 0 },
      { id: 'silver', level: 20, scrap: 15, shards: 5, glimmer: 1, trips: 5 },
    ] as readonly {
      id: 'bronze' | 'silver';
      level: number;
      scrap: number;
      shards: number;
      glimmer: number;
      trips: number;
    }[],
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
    dupeShieldStreak: 3,
    /** The first claim of a player's first expedition starts with this line. */
    firstExpeditionLine: 'zipmouse',
    /**
     * New-species pity (2026-10-17): the server counts a player's catch rolls. After `newAfter` rolls
     * without a new species, the next roll brings a creature, and it is a species the player lacks (when
     * the place has one). Whatever the species, the `creatureEvery`-th roll in a row without any
     * creature brings one. Counters are stored per player and move with the trip claim.
     */
    pity: { newAfter: 60, creatureEvery: 10 },
  },
  fusion: {
    /** Cumulative stat bonus in basis points after N fusions (index = N). */
    cumulativeBonusBp: [0, 600, 1100, 1500, 1800, 2000],
    maxFusions: 5,
  },
  /**
   * Talents and the duplicate choice (docs/design/gear-and-creatures-v2.md section 8, "Creatures A").
   * Starting values; the sim reports where they land. A talent's own size is content
   * (`data/talents.json`); what a catch rolls and what a duplicate may become is here.
   */
  talents: {
    /** One catch in `denominator` rolls its talent golden: `numerator / denominator`. */
    golden: { numerator: 1, denominator: 20 },
    /** A golden talent is worth this much of a normal one (1.5x), rounded down to a whole percent or point. */
    goldenBp: 15_000,
    /** The creature level at which talent slots 1, 2 and 3 open (the unlock ladder, spec 9.3a). */
    slotLevels: [1, 20, 25] as readonly number[],
    /** How many slots a species of each rarity has: commons two, rares and epics three. */
    slotsByRarity: { common: 2, rare: 3, epic: 3 } satisfies Record<Rarity, number>,
    /** Slotting a talent from a creature's Talent Book costs this much Bait and is instant. */
    bookSlotBait: 10,
    /** A player holds at most this many pending duplicates; one more settles the oldest with Recommended. */
    maxPending: 10,
    /** At most this many creatures of one line (a Kept duplicate is the second), and only for a branching line. */
    maxPerLine: 2,
    /** What releasing a duplicate pays, by rarity: parts, never Bait (a shard is of the creature's element). */
    release: {
      common: { scrap: 3, shard: 0, glimmer: 0 },
      rare: { scrap: 6, shard: 1, glimmer: 0 },
      epic: { scrap: 12, shard: 2, glimmer: 1 },
    } satisfies Record<Rarity, { scrap: number; shard: number; glimmer: number }>,
  },
  /**
   * Bait income (docs/design/player-journey-sim.md, decisions 2026-10-15): `dailyAllowance` for
   * opening the game on a game day, and a leet bonus by how many players leeted that day
   * (`leetBonusByCount`, index = leeters; past the end, the last value). Solo leet 40 in all, 10 or
   * more leeters 57.
   */
  income: {
    dailyAllowance: 25,
    leetBonusByCount: [0, 15, 15, 17, 19, 21, 23, 25, 27, 29, 32] as readonly number[],
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
     * the victim's maximum HP. 0 means no cap, and it is off (Misa, 2026-10-15: big hits stay big);
     * the number stays in the fight rules for a mutator or a rollback. Copied into
     * `FightInput.rules`.
     */
    maxHitBp: 0,
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
     * hits every living creature for `powerBp` of its Attack (area hits, which Guard cover and Shield Wall soften);
     * its gimmicks rest (a charge never lands in an enrage round). The fight ends on a wipe or a
     * kill; standing at the end is a loss. An enrage loss is a normal
     * loss. Phases 1 and 2 have no enrage. Tuned by the simulator (docs/balance/log.md B-008, with the
     * single-hit cap off): 400% of the boss's Attack on every creature wipes a row that reaches
     * enrage in two to three rounds (mean 2.75 to 2.8; 55% to 70% of the lost overtimes end in a
     * wipe, the rest with the row standing after the last round), and about one finale in fourteen
     * is won in the enrage rounds (the creatures act before the enrage hit each round, so the first
     * is a free one). A harder enrage would wipe faster and cost those wins.
     */
    enrage: { rounds: 3, powerBp: 40_000 },
    /**
     * The raid difficulty curve by Boss Rank (Misa, 2026-10-15: "a power curve that isn't just a 40
     * percent increase week over week ... we can control it and we don't need to be up front about
     * it"). It replaced a compounding +40% HP (and half that Attack) a rank. One row per rank, rank 1
     * first; every number is an integer and no float is stored. Players are never told the numbers.
     * - `hpBp`: the boss's HP pool at this rank in basis points of its own `baseHp` (10000 = the
     *   calibrated pool; `baseHp` is the sweep's gauge, the curve is the ladder).
     * - `atkBp`: its Attack the same way, from `baseAtk`. Independent of `hpBp`: later bosses can hit
     *   harder without lasting longer, or the reverse.
     * - `bossAttacks`: how many times it makes its plain attack each round (1 to 3).
     * - `critBonusBp`: extra boss crit chance in basis points on top of `combat.luck.bossCritChanceBp`.
     * The boss's rank-gated moves (`fromRank` in content, ranks 4 and 7) are the other half of the curve.
     *
     * The shape, and why (docs/balance/log.md B-010; the targets are the `curve-*` ones in
     * `packages/sim/targets.json`, measured on whole journey servers):
     * - Rank 1 is a tutorial boss (35% of the pool, 65% Attack): a new server's first week is won by
     *   mostly casual players (about 85% for a server with no engaged player at all, 97% to 100% with
     *   one or two) so players learn what a raid pays.
     * - Ranks 2 to 5 climb steeply (1.9x, 3.0x, 3.6x and 4.3x the calibrated pool) while the roster grows fast (levels,
     *   evolutions, fusions, gear): a default server wins about 80%, a committed one about 97%.
     * - From rank 6 the pool is nearly flat (4.7x to 4.95x the calibrated pool) because player power stops growing
     *   quickly after week 6: Attack, boss crit chance (from rank 9) and a second plain attack (from
     *   rank 14) carry the difficulty, and the rank-gated moves punish setups. A default server wins
     *   about 55%, a committed one about 87%; luck, positioning and loadouts decide it.
     * Ranks past 9 are extrapolated from 24 and 36 week runs of committed servers (about 65% to 75%
     * at ranks 10 to 13), not measured on a live server. Past the last row the numbers grow by `beyond`.
     */
    curve: {
      ranks: [
        { hpBp: 3_500, atkBp: 6_500, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 19_200, atkBp: 11_000, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 29_800, atkBp: 12_500, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 36_000, atkBp: 14_000, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 43_200, atkBp: 15_500, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 47_000, atkBp: 17_000, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 47_500, atkBp: 18_500, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 48_500, atkBp: 20_000, bossAttacks: 1, critBonusBp: 0 },
        { hpBp: 49_500, atkBp: 21_500, bossAttacks: 1, critBonusBp: 250 },
        { hpBp: 49_500, atkBp: 23_000, bossAttacks: 1, critBonusBp: 250 },
        { hpBp: 49_500, atkBp: 24_500, bossAttacks: 1, critBonusBp: 500 },
        { hpBp: 49_500, atkBp: 26_000, bossAttacks: 1, critBonusBp: 500 },
        { hpBp: 49_500, atkBp: 27_500, bossAttacks: 1, critBonusBp: 500 },
        { hpBp: 49_500, atkBp: 29_000, bossAttacks: 2, critBonusBp: 750 },
        { hpBp: 49_500, atkBp: 30_500, bossAttacks: 2, critBonusBp: 750 },
      ] as RankRow[],
      /**
       * Above the table's last rank every rank multiplies the row below it: HP by `hpStepBp` and
       * Attack by `atkStepBp` more than 10000 (compounding, floored at every step: +5% and +3% a
       * rank), and the boss attacks and crit bonus stay at the last row's. Gentle on purpose: the
       * table is where the design lives, the extrapolation only keeps an unexpectedly high rank
       * sensible.
       */
      beyond: { hpStepBp: 500, atkStepBp: 300 },
    },
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
       * Highest rank the ladder reaches. A safety cap only: the curve (`RULES.raid.curve`) keeps
       * growing gently past its table, and nobody is expected anywhere near this high.
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
     * Placement of a new server: every server starts at `startRank`, whatever its creatures
     * (Misa, 2026-10-15: no rank skipping, and a first week that casual players can clear). The old
     * rule placed a server by its creatures' levels, one rank (or two) up, which made the first
     * boss a wipe; the curve is built from rank 1 instead (docs/balance/log.md B-010).
     */
    placement: { startRank: 1 },
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
   * Gear and crafting v2 (docs/design/gear-and-creatures-v2.md, "Gear A"). Starting values, tuned
   * by the simulator at the end of the revamp. All amounts are integers: percentages and points are
   * basis points. Gear never reaches the engine as items: `wornEffects` folds a creature's items into
   * its stats, crit bonus and modifier sheet (`SlotMods`) before the fight. Which lines exist, what
   * they are worth and how heavy they are in each slot is content (`gear-lines.json`); how items roll
   * is here.
   */
  gear: {
    /** Items one player can own (items in the bag plus crafts still in the workshop). */
    inventoryCap: 60,
    /** Jobs one player can run at the same time. */
    workshopSlots: 2,
    /** Item levels run from 1 to this; an item's level is fixed when it drops or is crafted. */
    maxItemLevel: 20,
    /**
     * The creature level at which each slot opens (the unlock ladder, v2 spec 9.3a). An item also
     * needs a wearer whose level is at least the item's level.
     */
    slotUnlockLevel: { hat: 1, scarf: 7, charm: 13 },
    /**
     * Lines an item rolls by rarity (its base stat or base line is extra; a Festival piece is only a
     * different base, so it rolls the same number, from its narrow pool, and has its unique line on top).
     */
    rolledLines: { common: 1, rare: 2, epic: 3 },
    /** The item level that unlocks tiers I to V (also the bands of the base line's value). */
    tierFromItemLevel: [1, 5, 10, 15, 20],
    /**
     * How a tier is rolled: counting down from the best tier the item level allows, these weights
     * (the best tier first); tiers further down than the list cannot roll. Item level 20: V 15%, IV
     * 30%, III 30%, II 25%.
     */
    tierWeights: [15, 30, 30, 25],
    /**
     * Tag weights, as a multiple of a line's weight (10000 = 1x): an element tag multiplies its own
     * element's four lines, a role-locked Charm its role's lines, and the Crossroads Compass the
     * utility lines up and every combat line down.
     */
    tagWeightBp: { own: 30_000, compassUtility: 30_000, compassCombat: 3_000 },
    /** The place whose push-on finds are Crossroads Compasses (explorer pieces). */
    compassPlace: 'old-crossroads',
    /** The slot of a dropped piece: weights (even by default). */
    dropSlotWeights: { hat: 1, scarf: 1, charm: 1 },
    /** A dropped Charm of the finale is role-locked with this chance (1 in 20). */
    roleCharmBp: 500,
    /** Item level of each source (the table of spec 2.4). `rank` is the Boss Rank, 0 above is the base. */
    itemLevel: {
      welcome: 1,
      /** Raid finale reward slot: `base + Boss Rank`. */
      finale: { base: 3 },
      /** Daily dungeon: `base + floor(depth / depthPerLevel)`, plus `landmarkBonus` at a landmark. */
      dungeon: { base: 1, depthPerLevel: 2, landmarkBonus: 3 },
      /** Expedition finds: this times the finder's explorer rank. */
      expeditionPerRank: 2,
      /** Crafting: this times the crafter's Crafting level. */
      craftPerLevel: 2,
      /**
       * The conversion of old gear: the higher of `base + Boss Rank` and the best dungeon depth's
       * drop level, at most `max`. Its lines roll at tier II or better.
       */
      convert: { base: 3, max: 12, minTier: 1 },
    },
    /**
     * Crafting (spec section 3). A plain craft costs `scrap` and `shard` of the base's element (every
     * other base takes `plainScrap` and no shard), makes a Common and takes `hours`. The scrap grows by 1
     * for every `scrapPerItemLevels` item levels the craft makes (a level 10 crafter makes item level 20:
     * +5), so the price follows the item and a dismantle, which gives back a fraction of it, can never
     * pay for a craft (Misa: a dismantle returns "a fraction of its costs"). Reach pays more
     * for better odds: Essence, shards (of the base's element; the other bases pay them from the
     * player's biggest piles), glimmer, a longer job and a Crafting level to ask for it. `oddsBp` is the
     * rarity drawn before the one-step-up chance (whole percents, so the shown odds are exact).
     */
    craft: {
      scrap: 6,
      shard: 1,
      plainScrap: 8,
      hours: 3,
      scrapPerItemLevels: 4,
      reach: {
        rare: {
          minLevel: 3,
          essence: 25,
          shard: 0,
          glimmer: 0,
          hours: 6,
          oddsBp: { common: 4_000, rare: 6_000, epic: 0 },
        },
        epic: {
          minLevel: 6,
          essence: 70,
          shard: 0,
          glimmer: 1,
          hours: 10,
          oddsBp: { common: 1_500, rare: 5_500, epic: 3_000 },
        },
      },
      /** Well-thumbed blueprint marks: at most `max`, each adding `upBp` to the one-step-up chance. */
      marks: { max: 10, upBp: 100 },
    },
    /**
     * Dismantling is a Workshop job (spec section 3). The refund of each item is rolled at the claim
     * inside its rarity's range and does not depend on who works. The scrap range is a share of what
     * crafting that base at that item level costs in scrap (`craftScrapCost`), never more than half of
     * it, for crafted and dropped items alike. Commons go in bundles of up to `bundleMax` in one job. A shard is
     * of the item's element; neutral, explorer and role pieces give a random one.
     */
    dismantle: {
      bundleMax: 5,
      /** Nominal minutes of a job by the rarity of what is taken apart (a bundle of Commons: one job). */
      minutes: { common: 15, rare: 60, epic: 120 },
      /** Inclusive ranges per item: `[min, max]`. */
      ranges: {
        common: { shard: [0, 0], glimmer: [0, 0], essence: [0, 0] },
        rare: { shard: [1, 1], glimmer: [0, 0], essence: [3, 8] },
        epic: { shard: [1, 2], glimmer: [0, 1], essence: [10, 25] },
      },
      /**
       * The scrap range as a share of the item's craft scrap cost, in basis points: `[min, max]`, rounded
       * down and at least 1. No rarity reaches 5000 (half), so a craft and a dismantle never pay for each other.
       */
      scrapShareBp: {
        common: [2_500, 4_000],
        rare: [3_500, 4_500],
        epic: [4_000, 5_000],
      },
      /** The chance (basis points) to learn the item's blueprint (or add a mark): base plus per Crafting level. */
      learnBp: 600,
      learnBpPerLevel: 100,
      /** The least Crafting XP a dismantle job gives (the rest follows `skill.xpPerHour`). */
      minXp: 6,
    },
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
       *
       * The reward slot (Misa, 2026-10-15): every participant of a won finale gets exactly one reward,
       * a gear piece or, with chance `blueprintBp`, a blueprint they do not know yet (gear when they
       * know them all). The piece's item level follows the Boss Rank (`itemLevel.finale`).
       */
      finale: {
        baseBp: { rare: 2_200, epic: 300 },
        perRankBp: { rare: 250, epic: 150 },
        maxBp: { rare: 5_000, epic: 2_500 },
        blueprintBp: 2_500,
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
      /** A blueprint the player already knows turns into this much scrap. */
      duplicateBlueprintScrap: 5,
      /** The welcome kit: one common Hat (item level 1), one blueprint and this much scrap. */
      welcomeScrap: 10,
    },
    /**
     * The old gear's prices, for the one-time conversion only (upgrades, Improve and enchants are
     * gone): what an upgrade from level L cost (index L), by rarity multiplier, and an enchant.
     * Converted players get these back as materials.
     */
    legacy: {
      upgrade: {
        essence: [20, 30, 45, 65, 90],
        scrap: [2, 3, 5, 8, 12],
        multiplierBp: { common: 10_000, rare: 15_000, epic: 20_000, festival: 20_000 },
      },
      enchant: { glimmer: 1, shard: 3 },
      /** The nominal hours of the two removed jobs (an Improve or Enchant still running pays the XP of these). */
      jobHours: { improve: 2, enchant: 6 },
      /** The nominal hours of a craft by its blueprint's rarity before v2 (a craft running at the switch pays the XP of these). */
      craftHours: { common: 4, rare: 8, epic: 12, festival: 12 },
      /** What dismantling an old item returned (the rules before v2), by rarity. */
      dismantle: {
        scrap: { common: 2, rare: 5, epic: 10, festival: 10 },
        shard: { common: 0, rare: 1, epic: 2, festival: 2 },
        glimmer: { common: 0, rare: 0, epic: 1, festival: 1 },
      },
    },
  },
  /**
   * The daily dungeon (docs/design/daily-dungeon.md): a solo run of `rooms` rooms with the player's own
   * team of three, once per guild-local day. Depth is personal: a full clear adds 1. Starting values,
   * tuned by the simulator. All amounts are integers (percentages in basis points).
   */
  dungeon: {
    /** Rooms in a run: normal foes first, then a floor boss. */
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
    hpStepBp: 4_500,
    hpCurveBp: 340,
    atkStepBp: 2_000,
    atkCurveBp: 150,
    maxScaledDepth: 60,
    /**
     * How strong a foe is at depth 1, as a share of the HP and Attack in its content (basis points;
     * 10000 is the content's own numbers). One knob for the whole dungeon, so the foes keep the
     * relative strengths their content gives them. 11750 is the old 12500 times 0.94: the attack
     * patterns made foes a few points harder to beat, and 6% less foe HP puts the clear rates back
     * (docs/design/attack-patterns.md 4.6, docs/balance/log.md B-007). The map runs (B-019) play 4 to 5
     * fights a run instead of 3 and a first-day team has to win all of them, so the foe's HP at depth 1
     * comes down to 6500 and `hpStepBp` rises to 4500 to keep the ladder as steep as before (a first
     * week clears depth 1 about 90% of the time, a median daily player gains about 1.7 depths a week).
     * The carved door (B-020) is a free room on 35% of the maps, which lifts that by about 0.1 (a median of
     * 1.9 to 2.0, the target's limit): `hpCurveBp` rises from 300 to 340 (the later depths, not the first:
     * the second depth stays under 1.5 times the first) and brings it back to about 1.8.
     */
    baseHpBp: 6_500,
    baseAtkBp: 10_000,
    /**
     * Every this many depths is a landmark: a better chest, and a fixed floor boss (in content order,
     * round again) that also gains its charged `signature` move.
     */
    landmarkEvery: 7,
    /**
     * Boss-room enrage, to teach the mechanic before the Sunday finale: when the boss room's rounds
     * run out with both sides standing, up to `rounds` more rounds in which the boss also hits every
     * creature for `powerBp` of its Attack. Normal rooms keep the old rule (out of rounds ends the
     * run). `enabled: false` switches it off (Misa may walk it back). Tuned by the simulator
     * (B-008, single-hit cap off): the power hardly matters (5% to 100% of the foe's Attack: a lost
     * boss room lasts 1.5 to 1.8 enrage rounds, because the boss's own attack finishes a team that is
     * already hurt), so it is a modest 30%; the extra rounds clear about 1.2 points more runs at the
     * frontier.
     */
    enrage: { enabled: true, rounds: 2, powerBp: 3_000 },
    /**
     * Paid for each room cleared, by room index (the last is the floor boss). `supply` is the number
     * of expedition supplies the room drops (its tier and kind are rolled: `supplyTiers`). Only the
     * first room drops one, with a scrap beside it: a run that clears its first room always takes a
     * supply home, even if it is lost later, so the promise holds at the depth wall where full clears
     * are rare (B-011: one per full clear dried up after week 8, one per room piled up unused).
     */
    perRoom: [
      { bait: 1, essence: 0, scrap: 1, supply: 1 },
      { bait: 1, essence: 0, scrap: 0, supply: 0 },
      { bait: 1, essence: 1, scrap: 1, supply: 0 },
    ],
    /**
     * The tier of a supply the dungeon drops, by depth (basis points; the rest is basic). A tier is
     * closed below `fromDepth`, starts at `baseBp` at `fromDepth`, grows by `perDepthBp` for every depth
     * past it and stops at `maxBp`: deeper is better. The kind is drawn evenly.
     */
    supplyTiers: {
      good: { fromDepth: 4, baseBp: 1_500, perDepthBp: 400, maxBp: 5_000 },
      great: { fromDepth: 12, baseBp: 500, perDepthBp: 200, maxBp: 2_500 },
    },
    /** Chance (basis points) of one shard of the floor boss's element when the boss room is cleared. */
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
    /**
     * The map redesign (docs/design/dungeon-paths.md). The keys above stay for stored three-room
     * runs; a map run uses the keys below. A run is `floors` floors from an entrance (floor 0) to a
     * floor boss (the last floor), with the camp on `campFloor`.
     */
    floors: 7,
    /** The camp: every path meets on this floor, in the middle lane. */
    campFloor: 3,
    /**
     * How a day's map is drawn (`generateDungeonMap`). Floors other than the camp and the boss have
     * three nodes, or two with chance `twoNodeFloorBp`. Floor 0 is all fights; the other floors roll
     * each node by `kinds` (weights, which add up to 10000). The rest are caps and floors that keep
     * every map worth playing: some risk (an elite), some surprise (a mystery), a few different
     * elements to fight, and no more than one free chest.
     */
    map: {
      twoNodeFloorBp: 3_500,
      kinds: { fight: 5_500, mystery: 2_500, cache: 1_000, elite: 1_000 },
      /** Elites can only stand on these floors, one per floor at most. */
      eliteFloors: [2, 4, 5],
      maxElites: 2,
      minElites: 1,
      maxCaches: 1,
      minMysteries: 1,
      maxMysteries: 3,
      /** The fights of one map (elites too) use at least this many different elements. */
      minElements: 3,
    },
    /**
     * An elite is a normal foe at the player's depth with this on top (basis points of its numbers:
     * 14000 is 140%, so +40% HP and +20% Attack).
     */
    elite: { hpBp: 14_000, atkBp: 12_000 },
    /** The camp: Rest heals standing creatures this share of max HP; a camp offers this many keepsakes. */
    camp: { restBp: 4_000, offers: 2 },
    /**
     * What each kind of room puts in the run's pack when it is cleared (the pack is at risk; the
     * run's supply never goes in it). Mystery rooms pay by the option picked. `boss` is the boss
     * chest's Essence and scrap; its shard and gear chances are the keys above. Starting values: the
     * simulator tunes them so a full clear pays about what a three-room run did.
     */
    loot: {
      fight: { bait: 1, essence: 0, scrap: 0 },
      elite: { bait: 0, essence: 0, scrap: 1 },
      cache: { bait: 1, essence: 0, scrap: 1 },
      boss: { bait: 0, essence: 1, scrap: 1 },
    },
    /**
     * A defeat keeps this share of the pack, each amount rounded up (1 Bait stays 1, 3 scrap becomes
     * 2): generous on purpose, so an early defeat costs almost nothing and a late one costs more.
     */
    defeatKeepBp: 5_000,
    /**
     * The Undercroft (docs/design/dungeon-paths.md): a deeper, optional level below the floor boss, from
     * depth `fromDepth` (the first landmark has been passed). Its foes are scaled as if the depth were
     * `depthBonus` higher for every level. It has `baseFloors` floors of two rooms, plus `perLandmark`
     * for every landmark passed after the first, at most `maxFloors`, then the keeper (a floor boss with
     * its landmark signature). A carved door on the main map (`doorBp` of maps, on one of `doorFloors`)
     * adds one floor of one room of a random kind but a boss (`markOdds`, basis points that add up to
     * 10000) when the player steps through, at most `maxMarks` a run; the player is told only what it could be. A level's keeper
     * has a cracked floor with chance `crackBp`, which opens another level (a deeper one has
     * `deeperFloors` floors), at most `maxLevels` in a run. Fights there put `lootMultiplier` times their
     * loot in the pack; standing creatures recover `catchBreathBp` of max HP on the way down and a
     * knocked-out one gets back up at `reviveBp` (B-021: with 1000 about twice as many rows go down, 54% of the
     * offers, and a descent clears its first keeper 22% of the time, 35% before; 500 is the same, 52% and 22%, so the
     * size hardly matters). Tuned by the simulator (docs/balance/log.md B-020). `depthBonus` was 3: the keeper (a floor boss with its
     * signature, met after two fights and no rest by a row that has just beaten the boss) was beaten 32% of
     * the time and a descent cleared its first keeper 17% of the time, so five of six went home with half a
     * pack. At 1 the keeper is beaten about 48% of the time and a descent clears 33%; at 0, 45%. The
     * rest are the design's numbers (before B-021 the descent rate, 23 to 27% of the offers, was decided by a
     * creature being knocked out on the way, not by these).
     */
    undercroft: {
      fromDepth: 8,
      catchBreathBp: 2_000,
      reviveBp: 1_000,
      depthBonus: 1,
      baseFloors: 2,
      perLandmark: 1,
      maxFloors: 5,
      deeperFloors: 2,
      maxMarks: 2,
      lootMultiplier: 2,
      crackBp: 1_500,
      maxLevels: 3,
      /** A level's map: the same weights as the main map's rooms (`map.kinds`), with these caps per level. */
      map: { maxElites: 2, maxCaches: 1, maxMysteries: 2 },
      /** The epic fight: one normal foe at boss strength (basis points of its depth-scaled numbers) and what it pays into the pack. */
      epic: { hpBp: 16_000, atkBp: 13_000, loot: { bait: 0, essence: 1, scrap: 2 } },
      /**
       * The keeper's chest: Essence and scrap into the pack, a `gearBp` chance of a piece with
       * `rareBonusBp` and `epicBonusBp` added to the dungeon's gear odds and `itemLevelBonus` item levels more.
       */
      chest: {
        essence: 1,
        scrap: 2,
        gearBp: 4_000,
        rareBonusBp: 1_500,
        epicBonusBp: 500,
        itemLevelBonus: 2,
      },
      /** The carved door: on the main map, floors it can stand on, chance a map has one, and what stepping through adds. */
      doorFloors: [4, 5],
      doorBp: 3_500,
      markOdds: {
        fight: 3_000,
        elite: 1_500,
        mystery: 1_500,
        cache: 1_000,
        camp: 1_500,
        epic: 1_500,
      },
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
     * Per trip length: the time, the catch rolls and what a finished trip brings. A roll brings a
     * creature only with chance `catchBp` (2026-10-16: trips brought far too many creatures and
     * duplicates); a roll that brings none brings a small find, `findScrap` scrap. A lure raises the
     * chance and the odds of a species the player lacks. Rewards grow faster
     * than the hours (the 12 hour trip pays more than three 4 hour ones would): a short trip is the
     * worst way to progress. `loot` are chances in basis points (a value above 10000 is a sure one plus
     * a chance of another); `scrap` is a flat amount; a recalled trip pays only its share of the scrap.
     */
    lengths: {
      short: {
        ms: 2 * HOUR_MS,
        rolls: 1,
        catchBp: 300,
        findScrap: 1,
        rarityUpBp: 0,
        xp: 4,
        minRank: 1,
        loot: { scrap: 0, shardBp: 600, glimmerBp: 50, blueprintBp: 100, supplyBp: 500 },
        journalBp: 300,
      },
      medium: {
        ms: 6 * HOUR_MS,
        rolls: 1,
        catchBp: 600,
        findScrap: 1,
        rarityUpBp: 150,
        xp: 110,
        minRank: 1,
        loot: { scrap: 0, shardBp: 1_000, glimmerBp: 150, blueprintBp: 300, supplyBp: 1_500 },
        journalBp: 600,
      },
      long: {
        ms: 12 * HOUR_MS,
        rolls: 1,
        catchBp: 1800,
        findScrap: 2,
        rarityUpBp: 300,
        xp: 300,
        minRank: 1,
        loot: { scrap: 1, shardBp: 1_500, glimmerBp: 300, blueprintBp: 500, supplyBp: 3_000 },
        journalBp: 1_000,
      },
      day: {
        ms: 24 * HOUR_MS,
        rolls: 2,
        catchBp: 1800,
        findScrap: 2,
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
        { bait: 50, scrap: 5, glimmer: 2, supplies: ['lantern-good', 'satchel-good'] },
        { bait: 75, scrap: 8, glimmer: 3, supplies: ['map-scrap-good', 'satchel-good'] },
        { bait: 100, scrap: 10, glimmer: 4, supplies: ['lantern-great'] },
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
