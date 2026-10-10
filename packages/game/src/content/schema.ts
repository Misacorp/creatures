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

export const ContentPackSchema = v.strictObject({
  version: PositiveInt,
  elements: v.pipe(v.array(ElementDefSchema), v.maxLength(8)),
  creatures: v.pipe(v.array(CreatureSpeciesSchema), v.maxLength(1000)),
});
export type ContentPack = v.InferOutput<typeof ContentPackSchema>;
