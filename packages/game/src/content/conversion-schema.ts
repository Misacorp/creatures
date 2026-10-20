/**
 * Workshop conversions (docs/design/decisions.md, 2026-10-20): recipes that turn some things into other
 * things as a timed Workshop job. Everything here is data: a recipe names what it takes and gives by
 * supply id or part kind, never by effect, so supply numbers can change and later currencies can add
 * recipes without engine changes. Two kinds today:
 *
 * - `refine`: supplies of one kind and tier become one supply of the same kind, next tier up.
 * - `recycle`: one supply gives a small share of its recipe's parts back (always under half of each part,
 *   so nothing loops) and never any Bait.
 *
 * Amounts are fixed integers (no ranges). Recipe ids are stored in players' jobs and never renamed.
 */
import * as v from 'valibot';
import { IdSchema } from './schema';
import { PARTS_KEYS, SUPPLY_TIERS, type SupplyDef } from './expedition-schema';

const Int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

export const CONVERSION_KINDS = ['refine', 'recycle'] as const;
export type ConversionKind = (typeof CONVERSION_KINDS)[number];

/** One line of a recipe: a supply or a part, and how many. */
export const IngredientSchema = v.variant('type', [
  v.strictObject({ type: v.literal('supply'), id: IdSchema, amount: Int(1, 99) }),
  v.strictObject({ type: v.literal('part'), id: v.picklist(PARTS_KEYS), amount: Int(1, 99) }),
]);
export type Ingredient = v.InferOutput<typeof IngredientSchema>;

export const ConversionSchema = v.strictObject({
  id: IdSchema,
  kind: v.picklist(CONVERSION_KINDS),
  inputs: v.pipe(v.array(IngredientSchema), v.minLength(1), v.maxLength(4)),
  outputs: v.pipe(v.array(IngredientSchema), v.minLength(1), v.maxLength(4)),
  /** Hours the job takes before the Crafting skill shortens it (also the XP: hours x XP per hour). */
  hours: Int(1, 24),
  /** The Crafting level the worker needs. */
  craftingLevel: Int(1, 10),
});
export type ConversionDef = v.InferOutput<typeof ConversionSchema>;

export const ConversionPackSchema = v.pipe(
  v.array(ConversionSchema),
  v.minLength(1),
  v.maxLength(200),
);

function fail(message: string): never {
  throw new Error(`Invalid conversion content: ${message}`);
}

function distinct(list: readonly Ingredient[], recipe: string): void {
  const seen = new Set<string>();
  for (const i of list) {
    const key = `${i.type}:${i.id}`;
    if (seen.has(key)) fail(`recipe "${recipe}" lists ${key} twice`);
    seen.add(key);
  }
}

/**
 * Validates raw conversions (schema first, then every cross-reference and the rules of each kind)
 * against the supplies and returns them typed. Throws an Error naming the first problem.
 */
export function loadConversions(raw: unknown, supplies: readonly SupplyDef[]): ConversionDef[] {
  const parsed = v.safeParse(ConversionPackSchema, raw);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const path = first?.path?.map((p) => String(p.key)).join('.') ?? '';
    throw new Error(
      `Invalid conversion content schema at "${path}": ${first?.message ?? 'unknown error'}`,
    );
  }
  const byId = new Map(supplies.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const c of parsed.output) {
    if (ids.has(c.id)) fail(`duplicate recipe id "${c.id}"`);
    ids.add(c.id);
    distinct(c.inputs, c.id);
    distinct(c.outputs, c.id);
    for (const i of [...c.inputs, ...c.outputs]) {
      if (i.type === 'supply' && !byId.has(i.id)) fail(`recipe "${c.id}": no supply "${i.id}"`);
    }
    const supplyIn = c.inputs[0];
    if (c.inputs.length !== 1 || supplyIn?.type !== 'supply') {
      fail(`recipe "${c.id}": a ${c.kind} takes supplies of one kind`);
    }
    const from = byId.get(supplyIn.id);
    if (from === undefined) fail(`recipe "${c.id}": no supply "${supplyIn.id}"`);
    if (c.kind === 'refine') {
      const out = c.outputs[0];
      if (c.outputs.length !== 1 || out?.type !== 'supply' || out.amount !== 1) {
        fail(`recipe "${c.id}": a refine gives exactly one supply`);
      }
      const to = byId.get(out.id);
      if (to === undefined) fail(`recipe "${c.id}": no supply "${out.id}"`);
      const up = SUPPLY_TIERS.indexOf(from.tier) + 1;
      if (to.kind !== from.kind || SUPPLY_TIERS.indexOf(to.tier) !== up) {
        fail(`recipe "${c.id}": a refine gives the same kind, one tier up`);
      }
      if (supplyIn.amount < 2) fail(`recipe "${c.id}": a refine takes at least 2 supplies`);
      if (c.craftingLevel < to.blueprint.craftingLevel) {
        fail(`recipe "${c.id}": needs at least the Crafting level of "${to.id}"`);
      }
    } else {
      if (supplyIn.amount !== 1) fail(`recipe "${c.id}": a recycle takes one supply`);
      for (const out of c.outputs) {
        // Parts only (never Bait), and under half of what the supply's recipe cost, part by part.
        if (out.type !== 'part') fail(`recipe "${c.id}": a recycle gives parts only`);
        const cost = (from.blueprint.parts as Record<string, number | undefined>)[out.id] ?? 0;
        if (out.amount * 2 >= cost) {
          fail(
            `recipe "${c.id}": gives ${out.id} ${String(out.amount)} of a cost of ${String(cost)}`,
          );
        }
      }
    }
  }
  return parsed.output;
}
