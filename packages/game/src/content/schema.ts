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
  flavor: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
});
export type CreatureSpecies = v.InferOutput<typeof CreatureSpeciesSchema>;

export const ElementDefSchema = v.strictObject({
  id: ElementSchema,
  name: NameSchema,
  strongAgainst: ElementSchema,
});
export type ElementDef = v.InferOutput<typeof ElementDefSchema>;

// --- Raid content (M3) ---

const BasisPoints = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000));
const Description = v.pipe(v.string(), v.minLength(1), v.maxLength(200));

export const ZoneSchema = v.picklist(['front', 'middle', 'back']);
export type Zone = v.InferOutput<typeof ZoneSchema>;

export const TurnOrderSchema = v.picklist(['left_to_right', 'right_to_left', 'speed']);
export type TurnOrder = v.InferOutput<typeof TurnOrderSchema>;

/**
 * A mark on the boss and the reaction that consumes it. The mark is identified by its element (the
 * element of the hits that apply it); `triggerElement` is the element that consumes it.
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

const gimmickBase = {
  id: IdSchema,
  name: NameSchema,
  trigger: GimmickTriggerSchema,
};

/** Gimmick effect operations: a small closed set the engine interprets. Powers are basis points of boss Attack. */
export const GimmickSchema = v.variant('op', [
  v.strictObject({
    ...gimmickBase,
    op: v.literal('hit_zone'),
    zone: ZoneSchema,
    power: BasisPoints,
  }),
  v.strictObject({
    ...gimmickBase,
    op: v.literal('silence_ends'),
    turns: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
  }),
  v.strictObject({ ...gimmickBase, op: v.literal('reflect_first_reaction') }),
  v.strictObject({ ...gimmickBase, op: v.literal('strike_highest_atk'), power: BasisPoints }),
]);
export type Gimmick = v.InferOutput<typeof GimmickSchema>;

export const MAX_FINALE_ROUNDS = 30;

export const BossSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  element: ElementSchema,
  baseHp: PositiveInt,
  baseAtk: PositiveInt,
  turnOrder: TurnOrderSchema,
  gimmicks: v.pipe(v.array(GimmickSchema), v.maxLength(4)),
  /** Id of the Phase 2 adaptation rule. */
  adaptation: IdSchema,
  /** Id of the loot table (loot tables arrive with the gear step). */
  lootTable: IdSchema,
  /** Rounds in the live finale (default 12; at most 30, which is 5 minutes at 10 s a round). */
  finaleRounds: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_FINALE_ROUNDS)),
});
export type BossDef = v.InferOutput<typeof BossSchema>;

export const AdaptationSchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  /** `top_reaction`: resist the reaction used most. `top_element`: resist the element that dealt most damage. */
  kind: v.picklist(['top_reaction', 'top_element']),
  resistBp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
  description: Description,
});
export type AdaptationDef = v.InferOutput<typeof AdaptationSchema>;

export const FinaleEffectSchema = v.variant('op', [
  v.strictObject({ op: v.literal('rally'), damageBp: BasisPoints }),
  v.strictObject({ op: v.literal('shield_wall') }),
  v.strictObject({ op: v.literal('re_mark') }),
  v.strictObject({ op: v.literal('purge') }),
]);
export type FinaleEffect = v.InferOutput<typeof FinaleEffectSchema>;

export const FinaleAbilitySchema = v.strictObject({
  id: IdSchema,
  name: NameSchema,
  description: Description,
  effect: FinaleEffectSchema,
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
  creatures: v.pipe(v.array(CreatureSpeciesSchema), v.maxLength(1000)),
  reactions: v.pipe(v.array(ReactionDefSchema), v.maxLength(8)),
  bosses: v.pipe(v.array(BossSchema), v.maxLength(100)),
  adaptations: v.pipe(v.array(AdaptationSchema), v.maxLength(20)),
  finaleAbilities: v.pipe(v.array(FinaleAbilitySchema), v.maxLength(20)),
  guests: v.pipe(v.array(GuestSchema), v.maxLength(20)),
});
export type ContentPack = v.InferOutput<typeof ContentPackSchema>;
