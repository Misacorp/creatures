import { REACH_IDS, RULES, blueprintBases } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { SUPPLY_IDS } from './content-ids';
import { IdempotencyKeySchema } from './schemas';

/** Equip (a creature id) or unequip (null). The item is in the path, the player is the session's. */
export const EquipBodySchema = v.strictObject({ creatureId: v.nullable(IdSchema) });

/** Equip best for one creature or a team: the creatures to plan for (at most 24, no repeats needed). */
export const EquipBestBodySchema = v.strictObject({
  creatureIds: v.pipe(v.array(IdSchema), v.minLength(1), v.maxLength(24)),
});

/** Dismisses the one-time conversion card: nothing to say. */
export const DismissNoticeBodySchema = v.strictObject({});

export const ClaimJobBodySchema = v.strictObject({ idempotencyKey: IdempotencyKeySchema });

const BLUEPRINT_IDS = blueprintBases().map((b) => b.id) as [string, ...string[]];

/** The items of a dismantle job: 1 to the bundle size, each a valid id (the server checks they are the player's and distinct). */
const ItemIdsSchema = v.pipe(
  v.array(IdSchema),
  v.minLength(1),
  v.maxLength(RULES.gear.dismantle.bundleMax),
);

/** Pack a treat for the worker (Bait, paid when the job starts): it doubles the job's creature experience. */
const TreatSchema = v.optional(v.boolean());

/** Each kind of job takes exactly its own fields: anything else is rejected. */
export const StartJobBodySchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('craft'),
    creatureId: IdSchema,
    blueprintId: v.picklist(BLUEPRINT_IDS),
    /** What the craft is aimed at; absent means a plain craft (an older client sends none). */
    reach: v.optional(v.picklist(REACH_IDS)),
    treat: TreatSchema,
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    kind: v.literal('dismantle'),
    creatureId: IdSchema,
    itemIds: ItemIdsSchema,
    treat: TreatSchema,
    idempotencyKey: IdempotencyKeySchema,
  }),
  v.strictObject({
    kind: v.literal('supply'),
    creatureId: IdSchema,
    supplyId: v.picklist(SUPPLY_IDS),
    treat: TreatSchema,
    idempotencyKey: IdempotencyKeySchema,
  }),
]);

/** The two job kinds gear v2 removed: an old client that sends one gets a clear answer, not a validation error. */
export const RemovedJobKindSchema = v.object({ kind: v.picklist(['improve', 'enchant']) });

/** The old instant dismantle's body (the route now answers that dismantling is a job): any object is accepted and ignored. */
/** Asks what a craft or a dismantle job would give, before it is started. Changes nothing. */
export const PreviewBodySchema = v.variant('kind', [
  v.strictObject({
    kind: v.literal('craft'),
    creatureId: IdSchema,
    blueprintId: v.picklist(BLUEPRINT_IDS),
  }),
  v.strictObject({ kind: v.literal('dismantle'), creatureId: IdSchema, itemIds: ItemIdsSchema }),
]);
