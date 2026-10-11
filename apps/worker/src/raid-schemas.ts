import * as v from 'valibot';
import { ELEMENTS, RULES, basicAbilities, type Element } from '@creatures/game';
import { ZONES, type Zone } from '@creatures/engine';
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

/** Body of `POST /api/raid/channel`. The channel is never in the body: it is the session's own. */
export const RaidChannelBodySchema = v.strictObject({ action: v.picklist(['pin', 'unpin']) });

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

/** The basic finale ability ids (the ones a player picks). */
const ABILITY_IDS = basicAbilities().map((a) => a.id) as [string, ...string[]];

/** `PUT /api/raid/ability`: one of the content's basic finale abilities. */
export const AbilityBodySchema = v.strictObject({ abilityId: v.picklist(ABILITY_IDS) });

/**
 * `POST /api/raid/live/action`. `zone` (Shield Wall) and `element` (Re-mark) are only valid with
 * `fire`, and only for the ability that takes them: the server checks that against the caller's
 * ability, because the schema cannot know it.
 */
export const LiveActionBodySchema = v.strictObject({
  action: v.picklist(['fire', 'hold']),
  zone: v.optional(v.picklist(ZONES as [Zone, ...Zone[]])),
  element: v.optional(v.picklist(ELEMENTS as [Element, ...Element[]])),
});

/** `POST /api/raid/reveal-seen`: the week of the finale whose reveal was seen. */
export const RevealSeenBodySchema = v.strictObject({
  week: v.pipe(
    v.string(),
    v.maxLength(8),
    v.check((value) => isWeekId(value), 'not a raid week id'),
  ),
});
