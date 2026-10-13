import { gearContent } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { SPEND_KEY_RE } from './ledger';

const idempotencyKey = v.pipe(v.string(), v.regex(SPEND_KEY_RE));

/** Equip (a creature id) or unequip (null). The item is in the path, the player is the session's. */
export const EquipBodySchema = v.strictObject({ creatureId: v.nullable(IdSchema) });

export const UpgradeBodySchema = v.strictObject({ idempotencyKey });
export const DismantleBodySchema = v.strictObject({ idempotencyKey });
export const ClaimJobBodySchema = v.strictObject({ idempotencyKey });

const BASE_IDS = gearContent.bases.map((b) => b.id);
const ENCHANT_IDS = gearContent.enchants.map((e) => e.id);

/** Each kind of job takes exactly its own fields: anything else is rejected. */
export const StartJobBodySchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('craft'),
    creatureId: IdSchema,
    blueprintId: v.picklist(BASE_IDS),
    idempotencyKey,
  }),
  v.strictObject({
    kind: v.literal('improve'),
    creatureId: IdSchema,
    gearId: IdSchema,
    secondaryIndex: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1)),
    idempotencyKey,
  }),
  v.strictObject({
    kind: v.literal('enchant'),
    creatureId: IdSchema,
    gearId: IdSchema,
    enchantId: v.picklist(ENCHANT_IDS),
    idempotencyKey,
  }),
]);
