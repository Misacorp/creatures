import { blueprintBases, expeditionContent } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { IdempotencyKeySchema } from './schemas';

/** Equip (a creature id) or unequip (null). The item is in the path, the player is the session's. */
export const EquipBodySchema = v.strictObject({ creatureId: v.nullable(IdSchema) });

/** Equip best for one creature or a team: the creatures to plan for (at most 24, no repeats needed). */
export const EquipBestBodySchema = v.strictObject({
  creatureIds: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(24)),
});

/** Dismisses the one-time conversion card: nothing to say. */
export const DismissNoticeBodySchema = v.strictObject({});

export const DismantleBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });
export const ClaimJobBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

const BLUEPRINT_IDS = blueprintBases().map((b) => b.id) as [string, ...string[]];
const SUPPLY_IDS = expeditionContent.supplies.map((s) => s.id);

/** Each kind of job takes exactly its own fields: anything else is rejected. */
export const StartJobBodySchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('craft'),
    creatureId: IdSchema,
    blueprintId: v.picklist(BLUEPRINT_IDS),
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    kind: v.literal('supply'),
    creatureId: IdSchema,
    supplyId: v.picklist(SUPPLY_IDS),
    idempotencyKey: IdempotencyKeySchema,
  }),
]);

/** The two job kinds gear v2 removed: an old client that sends one gets a clear answer, not a validation error. */
export const RemovedJobKindSchema = v.object({ kind: v.picklist(['improve', 'enchant']) });
