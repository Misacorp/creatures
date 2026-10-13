import { expeditionContent, gearContent } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { IdempotencyKeySchema } from './schemas';

/** Equip (a creature id) or unequip (null). The item is in the path, the player is the session's. */
export const EquipBodySchema = v.strictObject({ creatureId: v.nullable(IdSchema) });

export const UpgradeBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });
export const DismantleBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });
export const ClaimJobBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

const BASE_IDS = gearContent.bases.map((b) => b.id);
const ENCHANT_IDS = gearContent.enchants.map((e) => e.id);
const SUPPLY_IDS = expeditionContent.supplies.map((s) => s.id);

/** Each kind of job takes exactly its own fields: anything else is rejected. */
export const StartJobBodySchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('craft'),
    creatureId: IdSchema,
    blueprintId: v.picklist(BASE_IDS),
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    kind: v.literal('improve'),
    creatureId: IdSchema,
    gearId: IdSchema,
    secondaryIndex: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1)),
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    kind: v.literal('enchant'),
    creatureId: IdSchema,
    gearId: IdSchema,
    enchantId: v.picklist(ENCHANT_IDS),
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    kind: v.literal('supply'),
    creatureId: IdSchema,
    supplyId: v.picklist(SUPPLY_IDS),
    idempotencyKey: IdempotencyKeySchema,
  }),
]);
