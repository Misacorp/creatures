import * as v from 'valibot';

/**
 * What the visitor's routes answer (phase 5 step 8b; the server's types are `VisitorView`, `RerollResult` and `BlueprintResult` in
 * `apps/worker/src/valley-visitor.ts`, and a worker test checks its answers against these). Strict where the server's shape is fixed, so
 * the client refuses an answer of another shape. Nothing here draws a number.
 */

const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const chance = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

/** What a reroll costs or has cost: Acorns and scrap. */
export const VisitorPriceSchema = v.strictObject({ acorns: int, scrap: int });
export type VisitorPriceView = v.InferOutput<typeof VisitorPriceSchema>;

/** One modifier line of a piece as the reroll's answer lists it: the line's id and its tier (0 is I). */
const LineSchema = v.strictObject({ id, tier: int });

/** The odds of a reroll (`rerollOdds`): how many lines, the best tier and its chance, and the share of single lines. */
export const RerollOddsViewSchema = v.strictObject({
  lines: int,
  topTier: int,
  tiers: v.array(v.strictObject({ tier: int, chance })),
  topChance: chance,
  singleShare: chance,
});
export type RerollOddsView = v.InferOutput<typeof RerollOddsViewSchema>;

/** `GET /api/valley/visitor`: away (his stock is hidden) or here with the week's blueprint and, when asked, one piece's price and odds. */
export const VisitorViewSchema = v.variant('here', [
  v.strictObject({ here: v.literal(false) }),
  v.strictObject({
    here: v.literal(true),
    blueprint: v.strictObject({ baseId: id, acorns: int, shards: int, bought: v.boolean() }),
    rerolls: int,
    item: v.optional(
      v.strictObject({
        id,
        itemLevel: int,
        rarity: v.picklist(['common', 'rare', 'epic']),
        price: VisitorPriceSchema,
        odds: RerollOddsViewSchema,
      }),
    ),
  }),
]);
export type VisitorViewState = v.InferOutput<typeof VisitorViewSchema>;

/** What `POST /api/valley/visitor/reroll` answers besides the valley and the state. */
export const RerollAnswerSchema = v.object({
  itemId: id,
  before: v.array(LineSchema),
  after: v.array(LineSchema),
  paid: VisitorPriceSchema,
  rerolls: int,
  next: VisitorPriceSchema,
});
export type RerollAnswerView = v.InferOutput<typeof RerollAnswerSchema>;

/** What `POST /api/valley/visitor/blueprint` answers besides the valley and the state. */
export const BlueprintAnswerSchema = v.object({
  baseId: id,
  duplicate: v.boolean(),
  marks: v.optional(int),
  scrapBack: v.optional(int),
  paid: v.strictObject({ acorns: int, shards: int }),
});
export type BlueprintAnswerView = v.InferOutput<typeof BlueprintAnswerSchema>;

/** The visitor's read as the client takes it: the view, or `undefined` for any other shape. */
export function parseVisitorView(value: unknown): VisitorViewState | undefined {
  const result = v.safeParse(VisitorViewSchema, value);
  return result.success ? result.output : undefined;
}

/** A reroll's answer, or `undefined` for any other shape (the other keys, `valley` and `state`, are the caller's). */
export function parseRerollAnswer(value: unknown): RerollAnswerView | undefined {
  const result = v.safeParse(RerollAnswerSchema, value);
  return result.success ? result.output : undefined;
}

/** A blueprint purchase's answer, or `undefined` for any other shape. */
export function parseBlueprintAnswer(value: unknown): BlueprintAnswerView | undefined {
  const result = v.safeParse(BlueprintAnswerSchema, value);
  return result.success ? result.output : undefined;
}
