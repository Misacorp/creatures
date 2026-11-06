/**
 * Patchwork pieces (`data/patchwork.json`; docs/design/valley/systems/forge.md V-FORGE-12, decision 2026-11-06 "Patchwork pieces"): a
 * few blueprints, one per slot, that every player knows from the start (with the valley's systems on) and that take shards of any element
 * plus scrap. The piece's element is the shard's, chosen when an order names one or, left unset, at the moment a piece starts (the pile
 * held most). They roll Common or Rare only (`maxRarity`), with fewer rolled lines than a proper blueprint (`rolledLines`), so they never
 * replace the proper ones. This is data: the costs, the rarity cap and the line counts are tuned here and read everywhere (the Forge's
 * pass, the server, the client and the economy lab); nothing is copied into code.
 *
 * A patchwork blueprint is not a gear base: the item it makes is the plainest base of its slot in the shard's element (a Kelp Cap for a
 * Tide hat), so its art, tint, element badge and wearing rules are the ones every gear piece has. Ids are never renamed once shipped (they
 * are stored on orders and on the Forge floor).
 */
import * as v from 'valibot';
import { GEAR_RARITIES, GearSlotSchema, type GearRarity, type GearSlot } from './gear-schema';
import { IdSchema } from './schema';

const PLAIN_TEXT = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*$/u;
const Text = (max: number) =>
  v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(max),
    v.regex(PLAIN_TEXT, 'must be plain text without control or format characters'),
  );
const Int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

/** One patchwork blueprint: a slot, what a piece takes (scrap and shards of one element, the element chosen per piece) and its words. */
export const PatchworkBlueprintSchema = v.strictObject({
  id: IdSchema,
  name: Text(32),
  slot: GearSlotSchema,
  /** Scrap a piece takes when it starts. */
  scrap: Int(1, 10_000),
  /** Shards of the piece's one element a piece takes when it starts. */
  shards: Int(1, 1_000),
  flavor: Text(120),
});
export type PatchworkBlueprint = v.InferOutput<typeof PatchworkBlueprintSchema>;

export const PatchworkPackSchema = v.strictObject({
  /** The best rarity a patchwork piece can roll (Common or Rare: a Reach cannot lift it). */
  maxRarity: v.picklist(GEAR_RARITIES),
  /** Lines a piece rolls by rarity (a proper piece rolls `RULES.gear.rolledLines`: 1, 2, 3); fewer here. */
  rolledLines: v.strictObject({ common: Int(0, 6), rare: Int(0, 6), epic: Int(0, 6) }),
  blueprints: v.pipe(v.array(PatchworkBlueprintSchema), v.minLength(1), v.maxLength(9)),
});
export type PatchworkPack = v.InferOutput<typeof PatchworkPackSchema>;

/** Validates the pack: one blueprint per slot at most, ids unique, and fewer lines than a proper piece of the rarity rolls. */
export function loadPatchwork(
  raw: unknown,
  properLines: Readonly<Record<GearRarity, number>>,
): PatchworkPack {
  const pack = v.parse(PatchworkPackSchema, raw);
  const ids = new Set<string>();
  const slots = new Set<GearSlot>();
  for (const bp of pack.blueprints) {
    if (ids.has(bp.id)) throw new Error(`patchwork: duplicate id "${bp.id}"`);
    if (slots.has(bp.slot)) throw new Error(`patchwork: two blueprints for the ${bp.slot} slot`);
    ids.add(bp.id);
    slots.add(bp.slot);
  }
  for (const rarity of GEAR_RARITIES) {
    const proper = properLines[rarity];
    if (pack.rolledLines[rarity] >= proper) {
      throw new Error(
        `patchwork: ${rarity} rolls ${String(pack.rolledLines[rarity])} lines, a proper piece rolls ${String(proper)}: it must be fewer`,
      );
    }
  }
  return pack;
}
