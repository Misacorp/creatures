import * as v from 'valibot';
import { RULES } from '@creatures/game';
import { IdSchema } from './collection-schemas';
import { isWeekId, RAID_PHASES } from './raid-schedule';

/** Slots are small: a party row has at most 3 x 15 slots. */
const MAX_SLOT = RULES.raid.maxPartySize * RULES.raid.teamSize - 1;

/** `creatureIds`: exactly three creature ids, or null for the automatic team. */
export const TeamBodySchema = v.strictObject({
  creatureIds: v.nullable(v.pipe(v.array(IdSchema), v.length(RULES.raid.teamSize))),
});

export const PlacementBodySchema = v.strictObject({
  creatureId: IdSchema,
  slot: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_SLOT)),
});

export const UnplaceBodySchema = v.strictObject({ creatureId: IdSchema });

export const OptOutBodySchema = v.strictObject({ optOut: v.boolean() });

/** Path parameters of `GET /api/raid/replay/:week/:party/:phase`. */
export const ReplayParamsSchema = v.strictObject({
  week: v.pipe(
    v.string(),
    v.maxLength(8),
    v.check((value) => isWeekId(value), 'not a raid week id'),
  ),
  party: v.pipe(v.string(), v.regex(/^[1-9]\d{0,2}$/), v.transform(Number)),
  phase: v.picklist(RAID_PHASES),
});
