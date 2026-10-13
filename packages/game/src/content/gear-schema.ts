/**
 * Gear and enchant content (`data/gear.json`, `data/enchants.json`): schemas and load-time checks.
 * Items are data: a base item says what it is called, what kind it is, which stat it mainly raises,
 * which element it is tinted with and what rarity of blueprint crafts it. Everything numeric (rolls,
 * caps, costs) lives in `RULES.gear`. The engine never reads this: gear is folded into a creature's
 * stats before a fight (`applyGear`), so it needs no engine support.
 */
import * as v from 'valibot';
import { ElementSchema, IdSchema, RoleSchema } from './schema';

export const GEAR_RARITIES = ['common', 'rare', 'epic', 'festival'] as const;
export const GearRaritySchema = v.picklist(GEAR_RARITIES);
export type GearRarity = v.InferOutput<typeof GearRaritySchema>;

/** The stats gear can raise. `atk`, `hp` and `spd` are percentages; the crit stats are crit points. */
export const GEAR_STATS = ['atk', 'hp', 'spd', 'critChance', 'critDamage'] as const;
export const GearStatSchema = v.picklist(GEAR_STATS);
export type GearStat = v.InferOutput<typeof GearStatSchema>;

export const GEAR_KINDS = ['charm', 'band', 'trinket'] as const;
export const GearKindSchema = v.picklist(GEAR_KINDS);
export type GearKind = v.InferOutput<typeof GearKindSchema>;

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(32));
const Flavor = v.pipe(v.string(), v.minLength(1), v.maxLength(120));

export const GearBaseSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  kind: GearKindSchema,
  /** The stat the item mainly raises. */
  primary: GearStatSchema,
  /** The element of the item's tint (its sprite colour, and the shard its dismantling returns); null: neutral. */
  tint: v.nullable(ElementSchema),
  /** The rarity of the blueprint that crafts it, which is the rarity a craft starts from. */
  blueprint: GearRaritySchema,
  flavor: Flavor,
});
export type GearBase = v.InferOutput<typeof GearBaseSchema>;

/** Who an enchant works for: a role, or an element. Absent: everyone. */
export const EnchantConditionSchema = v.union([
  v.strictObject({ role: RoleSchema }),
  v.strictObject({ element: ElementSchema }),
]);
export type EnchantCondition = v.InferOutput<typeof EnchantConditionSchema>;

export const EnchantSchema = v.strictObject({
  id: IdSchema,
  name: Name,
  stat: GearStatSchema,
  /** Basis points of the stat (for crit stats, of crit points). */
  bp: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5_000)),
  /** Only a wearer who matches gets the bonus (it shows as inactive otherwise). */
  when: v.optional(EnchantConditionSchema),
  /** The element of the shards the enchanting costs. */
  shard: ElementSchema,
  flavor: Flavor,
});
export type EnchantDef = v.InferOutput<typeof EnchantSchema>;

export const GearPackSchema = v.strictObject({
  bases: v.pipe(v.array(GearBaseSchema), v.minLength(1), v.maxLength(200)),
  enchants: v.pipe(v.array(EnchantSchema), v.maxLength(100)),
});
export type GearPack = v.InferOutput<typeof GearPackSchema>;

function fail(message: string): never {
  throw new Error(`Invalid gear content: ${message}`);
}

/**
 * Validates raw gear content (schema first, then cross-references) and returns it typed. Throws an
 * Error naming the first problem. Shipped content is checked at module load.
 */
export function loadGear(rawBases: unknown, rawEnchants: unknown): GearPack {
  const parsed = v.safeParse(GearPackSchema, { bases: rawBases, enchants: rawEnchants });
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(`Invalid gear schema at "${path}": ${first?.message ?? 'unknown error'}`);
  }
  const pack = parsed.output;
  const ids = new Set<string>();
  for (const base of pack.bases) {
    if (ids.has(base.id)) fail(`duplicate base id "${base.id}"`);
    ids.add(base.id);
  }
  const enchantIds = new Set<string>();
  for (const enchant of pack.enchants) {
    if (enchantIds.has(enchant.id)) fail(`duplicate enchant id "${enchant.id}"`);
    enchantIds.add(enchant.id);
  }
  // Festival items are their own family: a festival blueprint, and an element tint for the shard.
  for (const base of pack.bases) {
    if (base.blueprint === 'festival' && base.tint === null) {
      fail(`festival base "${base.id}" must have an element tint`);
    }
  }
  if (!pack.bases.some((b) => b.blueprint === 'festival')) fail('no festival base');
  // Every normal rarity must have something to craft, for every tint.
  for (const element of ElementSchema.options) {
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      if (!pack.bases.some((b) => b.tint === element && b.blueprint === rarity)) {
        fail(`no ${element} base with a ${rarity} blueprint`);
      }
    }
  }
  if (!pack.bases.some((b) => b.tint === null && b.blueprint === 'common')) {
    fail('no neutral common base');
  }
  return pack;
}
