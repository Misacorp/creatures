import * as v from 'valibot';

export const ElementSchema = v.picklist(['tide', 'ember', 'grove', 'spark']);
export type Element = v.InferOutput<typeof ElementSchema>;
export const ELEMENTS: readonly Element[] = ElementSchema.options;

export const RaritySchema = v.picklist(['common', 'rare', 'epic']);
export type Rarity = v.InferOutput<typeof RaritySchema>;
export const RARITIES: readonly Rarity[] = RaritySchema.options;

export const RoleSchema = v.picklist(['setter', 'payoff', 'support', 'guard']);
export type Role = v.InferOutput<typeof RoleSchema>;

/** Lowercase kebab-case identifier, for example "zipmouse" or "ancient-shell". */
export const IdSchema = v.pipe(
  v.string(),
  v.maxLength(32),
  v.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case'),
);

const NameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(32));
const PositiveInt = v.pipe(v.number(), v.integer(), v.minValue(1));
const NonNegativeInt = v.pipe(v.number(), v.integer(), v.minValue(0));

export const StatsSchema = v.strictObject({
  hp: PositiveInt,
  atk: PositiveInt,
  spd: PositiveInt,
});
export type Stats = v.InferOutput<typeof StatsSchema>;

export const GrowthSchema = v.strictObject({
  hp: NonNegativeInt,
  atk: NonNegativeInt,
  spd: NonNegativeInt,
});
export type Growth = v.InferOutput<typeof GrowthSchema>;

export const EvolutionSchema = v.strictObject({
  species: IdSchema,
  level: PositiveInt,
  essence: PositiveInt,
});
export type Evolution = v.InferOutput<typeof EvolutionSchema>;

/**
 * Crit stat bonuses over the global baseline (`RULES.combat.luck`): extra chance and extra damage in
 * basis points. Species and bosses may carry one (a few species as a high-crit archetype). The
 * engine adds it to the baseline and applies the caps, so content never needs to know them.
 */
export const CritBonusSchema = v.strictObject({
  chanceBp: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000)),
  damageBp: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000)),
});
export type CritBonus = v.InferOutput<typeof CritBonusSchema>;

export const CreatureSpeciesSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  line: IdSchema,
  stage: v.picklist([1, 2]),
  element: ElementSchema,
  rarity: RaritySchema,
  role: RoleSchema,
  catchable: v.boolean(),
  starter: v.boolean(),
  baseStats: StatsSchema,
  growth: GrowthSchema,
  levelCap: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
  evolvesTo: v.optional(EvolutionSchema),
  /**
   * A second branch of the evolution (a stage-1 species whose line grows two ways, for example a Guard
   * or a Support). Needs `evolvesTo`; the target is another stage-2 species of the same line. A line with
   * a second branch is the only one a player may Keep a duplicate of (`lineBranches`).
   */
  altEvolvesTo: v.optional(EvolutionSchema),
  /** The creature's finale ability (a `kind: 'creature'` entry of `finaleAbilities`). */
  ability: v.optional(v.strictObject({ id: IdSchema })),
  /** Optional crit bonus over the baseline (a high-crit archetype). */
  crit: v.optional(CritBonusSchema),
  /**
   * Festival-only species: granted for winning a Festival finale (`festivalCreatureFor`) and found
   * on expeditions only at the Festival Grounds, open in Festival weeks. Must not be catchable
   * anywhere else, a starter or part of an evolution line.
   */
  festival: v.optional(v.boolean()),
  flavor: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
});
export type CreatureSpecies = v.InferOutput<typeof CreatureSpeciesSchema>;

export const ElementDefSchema = v.strictObject({
  id: ElementSchema,
  name: NameSchema,
});
export type ElementDef = v.InferOutput<typeof ElementDefSchema>;

/**
 * One pair of the element chart: a creature of `attacker` element hits a boss or foe of `defender`
 * element for `bp` basis points of its damage (15000 strong, 7500 weak). A pair not listed deals
 * 10000. "Strong" means exactly `CHART_STRONG_BP`: marks, Hunter and Ward lines read it that way.
 */
export const ElementChartPairSchema = v.strictObject({
  attacker: ElementSchema,
  defender: ElementSchema,
  bp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
});
export type ElementChartPair = v.InferOutput<typeof ElementChartPairSchema>;
export const ElementChartSchema = v.pipe(v.array(ElementChartPairSchema), v.maxLength(100));
export type ElementChart = v.InferOutput<typeof ElementChartSchema>;

/** The multiplier that counts as "strong" on the element chart (150%). */
export const CHART_STRONG_BP = 15_000;

// --- Raid content (M3) ---

const BasisPoints = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000));
const Description = v.pipe(v.string(), v.minLength(1), v.maxLength(200));

export const ZoneSchema = v.picklist(['front', 'middle', 'back']);
export type Zone = v.InferOutput<typeof ZoneSchema>;

export const TurnOrderSchema = v.picklist([
  'left_to_right',
  'right_to_left',
  'speed',
  'serpentine',
]);
export type TurnOrder = v.InferOutput<typeof TurnOrderSchema>;

/**
 * A mark on the boss and one reaction that consumes it. The mark is identified by its element (the
 * element of the hits that apply it); `triggerElement` is the element that consumes it. A mark can
 * be set off by several elements: each (mark, trigger) pair is its own entry with its own id and
 * name, and entries of one mark repeat the same `markId` and `markName`.
 */
export const ReactionDefSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  markId: IdSchema,
  markName: NameSchema,
  markElement: ElementSchema,
  triggerElement: ElementSchema,
  /** Damage multiplier of a reaction hit in basis points (25000 = x2.5). */
  multiplierBp: BasisPoints,
  /** Extra multiplier for Payoff creatures on reactions in basis points (12500 = x1.25). */
  payoffBonusBp: BasisPoints,
});
export type ReactionDef = v.InferOutput<typeof ReactionDefSchema>;

/** When a gimmick fires: every Nth round (N, 2N, ...) or each round. */
export const GimmickTriggerSchema = v.union([
  v.strictObject({ every: v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(30)) }),
  v.strictObject({ eachRound: v.literal(true) }),
]);
export type GimmickTrigger = v.InferOutput<typeof GimmickTriggerSchema>;

/** A share in basis points, 1 to 10000 (100%). */
const Share = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000));
const Count0to3 = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3));
const Count1to6 = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6));

/** The rows a sweep's walk can name. */
export const SWEEP_ROWS = ['front', 'middle', 'back', 'all', 'payoffs'] as const;
export type SweepRow = (typeof SWEEP_ROWS)[number];
/** Whom a slam's main hit is aimed at. */
export const SLAM_AIMS = ['front', 'strongest', 'left', 'random', 'payoff'] as const;
export type SlamAim = (typeof SLAM_AIMS)[number];

// Attack patterns (docs/design/attack-patterns.md section 2). Powers are basis points of boss Attack
// per creature hit. "Aimed" hits can be taken by a Guard; "area" hits cannot, but a Guard's
// neighbours take less from them (cover, `RULES.combat.coverBp`).

/**
 * Sweep: every living creature in one row takes `power` (area). `rows` is a walk: firing n hits
 * `rows[(n - 1) mod length]`; `all` is every row (in the dungeon, the whole row of three);
 * `payoffs` is the row with the most living Payoffs (ties: the front-most), picked when the sweep
 * is planned, so it punishes a row that stacks its Payoffs (docs/design/combat-rules.md 6.7).
 */
const sweepFields = {
  rows: v.pipe(v.array(v.picklist(SWEEP_ROWS)), v.minLength(1), v.maxLength(4)),
  power: BasisPoints,
};
/**
 * Barrage: `clamp(ceil(living x shareBp / 10000), min, max)` distinct living creatures, picked from
 * the round's dice, each take `power` (area, not interceptable). A creature hit by this gimmick's
 * last volley is skipped unless fewer than the count others live. At most 6 shells.
 */
const barrageFields = {
  shells: v.strictObject({ min: Count1to6, max: Count1to6, shareBp: Share }),
  power: BasisPoints,
};
/**
 * Slam: one aimed hit on the victim (`front`: the front-most living creature, as the plain attack;
 * `strongest`: highest Attack; `left`: the left-most living creature; `random`: one die; `payoff`:
 * the living Payoff with the highest Attack, else the strongest creature). The creature that takes it (the victim, or a Guard stepping in) is the impact; each living creature
 * beside the impact takes `splashBp` of the hit's damage as an area hit.
 */
const slamFields = {
  aim: v.picklist(SLAM_AIMS),
  power: BasisPoints,
  splashBp: Share,
};
/**
 * Lance: one lane (the same slot position in every row; `random`: one die, `strongest`: the lane of
 * the highest-Attack creature) takes `power`, then `power x falloffBp`, and so on, front to back
 * (area). A Guard in the lane takes its hit and stops the lance. In the dungeon it is one creature.
 */
const lanceFields = {
  lane: v.picklist(['random', 'strongest']),
  power: BasisPoints,
  falloffBp: Share,
};
/**
 * Pincer: the first and last living creature of every row (`rows`) or of the whole row (`row`, the
 * dungeon) take `power` (area). A one-creature row is hit once.
 */
const pincerFields = {
  scope: v.picklist(['rows', 'row']),
  power: BasisPoints,
};

/**
 * The first Boss Rank a raid boss move is in play at (absent: always). Raid bosses only: the worker
 * hands the fight the boss as `bossAtRank` makes it for the week's rank, so a stored fight keeps the
 * moves it was fought with. A dungeon foe's move may not carry it (`loadDungeon`).
 */
export const FromRankSchema = v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(99));

/**
 * A status effect (docs/design/combat-rules.md section 13). `perStack` is a strict list of optional
 * signed numbers, each in basis points per stack: `spdBp` changes the fighter's Speed (negative:
 * slower), `damageDealtBp` changes the damage it deals (negative: less). A debuff is removed by purge
 * and cleanse; a buff by neither.
 */
const SignedBp = v.pipe(v.number(), v.integer(), v.minValue(-10_000), v.maxValue(10_000));
export const StatusEffectSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  kind: v.picklist(['debuff', 'buff']),
  /** The most stacks a fighter can carry. */
  maxStacks: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
  /** The base duration, in the target's own turns. */
  turns: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(30)),
  perStack: v.strictObject({
    spdBp: v.optional(SignedBp),
    damageDealtBp: v.optional(SignedBp),
  }),
});
export type StatusEffectDef = v.InferOutput<typeof StatusEffectSchema>;

/**
 * An optional rider on a damaging boss move: every creature the move hits (the creature that takes
 * the hit, a Guard that stepped in, a splash taker) gets the effect at `powerBp` application power
 * (10000 = one stack, 20000 = two, 14000 = one plus a 40% chance of a second), for the effect's
 * duration plus `durationTurns`.
 */
export const AppliesSchema = v.strictObject({
  effect: IdSchema,
  powerBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
  durationTurns: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10))),
});
export type AppliesDef = v.InferOutput<typeof AppliesSchema>;
const appliesField = { applies: v.optional(AppliesSchema) };

const gimmickBase = {
  id: IdSchema,
  name: NameSchema,
  trigger: GimmickTriggerSchema,
  fromRank: v.optional(FromRankSchema),
};

/** Gimmick effect operations: a small closed set the engine interprets. Powers are basis points of boss Attack. */
export const GimmickSchema = v.variant('op', [
  v.strictObject({
    ...gimmickBase,
    op: v.literal('hit_zone'),
    zone: ZoneSchema,
    power: BasisPoints,
    ...appliesField,
  }),
  v.strictObject({
    ...gimmickBase,
    op: v.literal('silence_ends'),
    /**
     * `rows` (the raid): the leftmost and rightmost living creature of EACH row (Front, Middle,
     * Back); a row with one creature standing silences it once, an empty row is skipped. `row`
     * (the dungeon): the two ends of the whole line.
     */
    scope: v.picklist(['rows', 'row']),
    turns: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
  }),
  v.strictObject({ ...gimmickBase, op: v.literal('reflect_first_reaction') }),
  /**
   * The strongest living creature (highest Attack, ties: lower slot), an aimed hit; then `jumps`
   * more (0 to 3, default 0) to the next strongest, each an area hit at `power x decay^k`
   * (`decayBp`, default 5500). The same creature is never hit twice. Defaults: today's strike.
   */
  v.strictObject({
    ...gimmickBase,
    op: v.literal('strike_highest_atk'),
    power: BasisPoints,
    jumps: v.optional(Count0to3),
    decayBp: v.optional(Share),
    ...appliesField,
  }),
  v.strictObject({ ...gimmickBase, op: v.literal('sweep'), ...sweepFields, ...appliesField }),
  v.strictObject({ ...gimmickBase, op: v.literal('barrage'), ...barrageFields, ...appliesField }),
  v.strictObject({ ...gimmickBase, op: v.literal('slam'), ...slamFields, ...appliesField }),
  v.strictObject({ ...gimmickBase, op: v.literal('lance'), ...lanceFields, ...appliesField }),
  v.strictObject({ ...gimmickBase, op: v.literal('pincer'), ...pincerFields, ...appliesField }),
  /**
   * The boss removes every debuff from itself (status effects, `combat-rules.md` 13.6), in its
   * normal move order. Any trigger. It does not touch buffs or the adaptation.
   */
  v.strictObject({ ...gimmickBase, op: v.literal('purge') }),
  /**
   * A pattern announced a round ahead (docs/design/attack-patterns.md 2.7). `trigger` is the round
   * it lands (so it needs `every`, at least 2); at the start of the round before, the engine picks
   * the victims and emits a `charge` event naming them. A victim that fell in between is skipped.
   */
  v.strictObject({
    ...gimmickBase,
    op: v.literal('charge'),
    ...appliesField,
    then: v.variant('op', [
      v.strictObject({ op: v.literal('sweep'), ...sweepFields }),
      v.strictObject({ op: v.literal('barrage'), ...barrageFields }),
      v.strictObject({ op: v.literal('slam'), ...slamFields }),
      v.strictObject({ op: v.literal('lance'), ...lanceFields }),
      v.strictObject({ op: v.literal('pincer'), ...pincerFields }),
    ]),
  }),
]);
export type Gimmick = v.InferOutput<typeof GimmickSchema>;
export type GimmickOp = Gimmick['op'];
/** The patterns a `charge` can carry. */
export type ChargedPattern = Extract<Gimmick, { op: 'charge' }>['then'];
/** The ops that are attack patterns (they draw the round's pattern dice). */
export const PATTERN_OPS = ['sweep', 'barrage', 'slam', 'lance', 'pincer', 'charge'] as const;

export const MAX_FINALE_ROUNDS = 30;
/** The most moves a raid boss has in its content (all ranks together). */
export const MAX_BOSS_GIMMICKS = 6;

export const BossSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  element: ElementSchema,
  baseHp: PositiveInt,
  baseAtk: PositiveInt,
  /**
   * Optional Speed (0 when absent): the base of the boss's dodge chance (`RULES.combat.dodge`). Not
   * scaled by Boss Rank: the raid curve does not move it.
   */
  baseSpd: v.optional(NonNegativeInt),
  turnOrder: TurnOrderSchema,
  gimmicks: v.pipe(v.array(GimmickSchema), v.maxLength(MAX_BOSS_GIMMICKS)),
  /** Id of the Phase 2 adaptation rule. */
  adaptation: IdSchema,
  /** Id of the loot table (loot tables arrive with the gear step). */
  lootTable: IdSchema,
  /** Rounds in the live finale (default 12; at most 30, which is 5 minutes at 10 s a round). */
  finaleRounds: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_FINALE_ROUNDS)),
  /** Optional crit bonus over the boss baseline (`RULES.combat.luck`). Inert while luck is off. */
  crit: v.optional(CritBonusSchema),
  /**
   * Optional lines for the moment the boss reaches a phase's floor and retreats (it is immune and
   * the phase ends; docs/design/raid-ux-2.md). Absent: the shared fallback line. Plain text.
   */
  retreat: v.optional(v.strictObject({ phase1: Description, phase2: Description })),
  /**
   * Optional head-count exponent of this boss's HP, a fraction `num / den` (absent:
   * `RULES.raid.scaling.hpExponent`). Bosses answer differently to a bigger raid (Backdraft's
   * reflect matters less with many creatures, resisted reactions matter more), so each boss gets the
   * exponent that keeps its odds flat from 5 to 15 players (docs/balance/report-2026-10-11-progression.md).
   */
  hpExponent: v.optional(
    v.strictObject({
      num: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
      den: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
    }),
  ),
});
export type BossDef = v.InferOutput<typeof BossSchema>;

/**
 * The boss as it fights at Boss Rank `rank`: its moves whose `fromRank` is absent or at most `rank`
 * (in content order, so a move keeps its place and its dice window). Pure. A rank below 1 or a
 * rank that is not a whole number counts as rank 1. The result is a new object; the boss it came
 * from is untouched, and a boss with nothing gated comes back unchanged in content.
 */
export function bossAtRank(boss: BossDef, rank: number): BossDef {
  const at = Number.isFinite(rank) ? Math.max(1, Math.floor(rank)) : 1;
  return {
    ...boss,
    gimmicks: boss.gimmicks.filter((g) => g.fromRank === undefined || g.fromRank <= at),
  };
}

export const AdaptationSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  /** `top_reaction`: resist the reaction used most. `top_element`: resist the element that dealt most damage. */
  kind: v.picklist(['top_reaction', 'top_element']),
  resistBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
  description: Description,
});
export type AdaptationDef = v.InferOutput<typeof AdaptationSchema>;

const MAX_EFFECT_ROUNDS = MAX_FINALE_ROUNDS;
const EffectRounds = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_EFFECT_ROUNDS));

/** `choose`: the player's pick (with the documented default). `own`: taken from the ability's creature. */
export const EffectTargetSchema = v.picklist(['choose', 'own']);
export type EffectTarget = v.InferOutput<typeof EffectTargetSchema>;

/**
 * Finale ability effects: a small closed set the engine interprets (see `docs/design/creature-abilities.md`).
 * All amounts are integer basis points. `rounds` counts the round the ability fires in.
 */
export const EffectSchema = v.variant('op', [
  /** All creatures deal `damageBp` more damage for `rounds` rounds. */
  v.strictObject({
    op: v.literal('rally'),
    damageBp: BasisPoints,
    rounds: v.optional(EffectRounds, 1),
  }),
  /** One zone takes `reduceBp` less damage (10000 = no damage) for `rounds` rounds. */
  v.strictObject({
    op: v.literal('shield_wall'),
    zone: EffectTargetSchema,
    reduceBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
    rounds: v.optional(EffectRounds, 1),
  }),
  /** Sets the boss's mark to a chosen element or the ability's creature's own element. */
  v.strictObject({ op: v.literal('re_mark'), element: EffectTargetSchema }),
  /** Turns off the Phase 2 adaptation for `rounds` rounds (absent: the rest of the fight). */
  v.strictObject({ op: v.literal('purge'), rounds: v.optional(EffectRounds) }),
  /** The ability's creature hits the boss at once for `atk x atkBp / 10000`. */
  v.strictObject({ op: v.literal('strike'), atkBp: BasisPoints }),
]);
export type Effect = v.InferOutput<typeof EffectSchema>;
export type EffectOp = Effect['op'];

export const FinaleAbilitySchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  description: Description,
  /** `basic`: one of the four everyone can pick. `creature`: belongs to a species (unlocks at a level). */
  kind: v.picklist(['basic', 'creature']),
  effects: v.pipe(v.array(EffectSchema), v.minLength(1), v.maxLength(3)),
  /** The round an absent player's ability fires (1-based). */
  defaultRound: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_FINALE_ROUNDS)),
  /**
   * If true, the default round is the round of the boss's first zone attack from round 2 on (the
   * effect lands that round, as if pressed during the round before) and the default zone is the one
   * attacked; `defaultRound` is the fallback when the boss has no zone attack.
   */
  defaultAtZoneHit: v.optional(v.boolean()),
});
export type FinaleAbilityDef = v.InferOutput<typeof FinaleAbilitySchema>;

/** NPC creature that fills the row when fewer than 3 players take part. Guests earn no loot. */
export const GuestSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  species: IdSchema,
});
export type GuestDef = v.InferOutput<typeof GuestSchema>;

export const ContentPackSchema = v.strictObject({
  version: PositiveInt,
  elements: v.pipe(v.array(ElementDefSchema), v.maxLength(8)),
  elementChart: ElementChartSchema,
  creatures: v.pipe(v.array(CreatureSpeciesSchema), v.maxLength(1000)),
  reactions: v.pipe(v.array(ReactionDefSchema), v.maxLength(40)),
  bosses: v.pipe(v.array(BossSchema), v.maxLength(100)),
  adaptations: v.pipe(v.array(AdaptationSchema), v.maxLength(20)),
  statusEffects: v.pipe(v.array(StatusEffectSchema), v.maxLength(40)),
  finaleAbilities: v.pipe(v.array(FinaleAbilitySchema), v.maxLength(200)),
  guests: v.pipe(v.array(GuestSchema), v.maxLength(20)),
});
export type ContentPack = v.InferOutput<typeof ContentPackSchema>;
