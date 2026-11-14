import * as v from 'valibot';
import { ELEMENTS, RULES, basicAbilities, type Element } from '@creatures/game';
import { ZONES, type Zone } from '@creatures/engine';
import { IdSchema } from './collection-schemas';
import { isWeekId, RAID_PHASES } from './raid-schedule';

/** The phases a combat v2 stage is stored under (besides `finale`). */
const RESULT_PHASES_V2 = ['stage1', 'stage2'] as const;

/** Slots are small: a party row has at most 3 x 15 slots, a combat v2 board at most 4 rows of 15 columns. */
// A v2 board is up to four rows by the players and one spare column (`raid-v2-core.ts`).
const MAX_SLOT = (RULES.raid.maxPartySize + 1) * Math.max(RULES.raid.teamSize, 4) - 1;
/** Most rows a boss's arena has is 4 (a bound for the schema; the server checks the boss's own). */
const MAX_ROW = 3;

/** `creatureIds`: exactly three creature ids, or null for the automatic team. */
export const TeamBodySchema = v.strictObject({
  creatureIds: v.nullable(v.pipe(v.array(IdSchema), v.length(RULES.raid.teamSize))),
});

export const PlacementBodySchema = v.strictObject({
  creatureId: IdSchema,
  slot: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_SLOT)),
});

export const UnplaceBodySchema = v.strictObject({ creatureId: IdSchema });

/** Body of `POST /api/raid/channel`. The channel is never in the body: it is the session's own. */
export const RaidChannelBodySchema = v.strictObject({ action: v.picklist(['pin', 'unpin']) });

/** Path parameters of `GET /api/raid/replay/:week/:party/:phase` (and `/stats/...`). */
export const ReplayParamsSchema = v.strictObject({
  week: v.pipe(
    v.string(),
    v.maxLength(8),
    v.check((value) => isWeekId(value), 'not a raid week id'),
  ),
  party: v.pipe(v.string(), v.regex(/^[1-9]\d{0,2}$/), v.transform(Number)),
  phase: v.picklist([...RAID_PHASES, ...RESULT_PHASES_V2]),
});

/** The basic finale ability ids (the ones a player picks). */
const ABILITY_IDS = basicAbilities().map((a) => a.id) as [string, ...string[]];

/** `PUT /api/raid/ability`: one of the content's basic finale abilities. */
export const AbilityBodySchema = v.strictObject({ abilityId: v.picklist(ABILITY_IDS) });

/**
 * `POST /api/raid/live/action`. `key` names one use of one ability (the caller's own). `zone` (Shield Wall) and `element` (Re-mark) are only valid with
 * `fire` (`hold` and `unhold` are the Auto fire toggle: off and on again), and only for the ability that takes them: the server checks that against the caller's
 * ability, because the schema cannot know it.
 */
export const LiveActionBodySchema = v.strictObject({
  /** `<alias>:basic` or `<alias>:c<team slot>`; the server checks that it is the caller's own. */
  key: v.pipe(v.string(), v.maxLength(16), v.regex(/^m[1-9]\d{0,2}:(basic|c\d)$/)),
  action: v.picklist(['fire', 'hold', 'unhold']),
  zone: v.optional(v.picklist(ZONES as [Zone, ...Zone[]])),
  element: v.optional(v.picklist(ELEMENTS as [Element, ...Element[]])),
  /** Combat v2: the row a Shield Wall covers (the server checks it against the boss's rows). */
  row: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_ROW))),
});

/** `POST /api/finale/ticket`: the party whose finale the socket will listen to. The server checks membership. */
export const FinaleTicketBodySchema = v.strictObject({
  week: v.pipe(
    v.string(),
    v.maxLength(8),
    v.check((value) => isWeekId(value), 'not a raid week id'),
  ),
  party: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999)),
});

/** `POST /api/raid/reveal-seen`: the week of the finale whose reveal was seen. */
export const RevealSeenBodySchema = v.strictObject({
  week: v.pipe(
    v.string(),
    v.maxLength(8),
    v.check((value) => isWeekId(value), 'not a raid week id'),
  ),
});

/**
 * `PUT /api/raid/autofire`: the Auto fire setting of one ability for this week's finale. `target` is
 * `basic` (the basic ability) or the id of one of the caller's own team creatures; the server checks
 * that it is theirs, because the schema cannot know it. The player is the session's.
 */
export const AutofireBodySchema = v.strictObject({
  target: v.union([v.literal('basic'), IdSchema]),
  on: v.boolean(),
});

/** `POST /api/raid/swap`: two different slots of the caller's party board (combat v2, R19). The server finds the player to ask. */
export const SwapAskBodySchema = v.strictObject({
  slotA: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_SLOT)),
  slotB: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_SLOT)),
});

/** `:id` of `POST /api/raid/swap/:id/accept` and `/decline`/`/cancel`: a request id (a UUID). */
export const SwapIdSchema = v.pipe(v.string(), v.uuid());
