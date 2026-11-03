/**
 * Schema of the raid boss track (`raid-track.json`), in the style of `boss-schema.ts`
 * (docs/design/combat/content-as-data.md, section 5 step 4; what the track is: docs/design/combat/boss-track.md).
 *
 * The track says which raid boss a server meets at which Boss Rank and how strong that meeting is. `order` is the order of the
 * bosses, repeating after the last (slot n has `order[(n - 1) % order.length]`). Each slot lists every number the game needs
 * for that meeting, written out, so nothing has to be derived: the boss's HP, Attack and armour (absolute, before its rule cards;
 * the track tuner writes them), the strength of its rule cards in bp, how many of the boss's own cards it has (the first ones, in
 * the order of `raid-bosses.json`) and whether it has its escalation (the young-server ramp: a new server meets a boss with fewer
 * rules), and the extra cards the slot adds on top of the boss's own (a later lap's new card; a card that stays on a boss's
 * later laps is listed at each of its slots). The lab's tuning-only parts (the arrival weeks, the prepared lines, the tuning
 * targets) stay in the lab.
 */
import * as v from 'valibot';
import { IdSchema } from '../content/schema';

const Int = v.pipe(v.number(), v.integer());

export const TrackSlotSchema = v.pipe(
  v.strictObject({
    /** The slot, and the Boss Rank it stands for (slot 1 is Boss Rank 1). */
    slot: v.pipe(Int, v.minValue(1)),
    /** A raid boss (`raid-bosses.json`). */
    boss: IdSchema,
    /** The boss's HP, Attack and armour at this slot, before its cards. */
    hp: v.pipe(Int, v.minValue(1)),
    atk: v.pipe(Int, v.minValue(1)),
    armour: v.pipe(Int, v.minValue(0)),
    /** The strength of every card and gate at this slot, bp of the full card. */
    strengthBp: v.pipe(Int, v.minValue(0), v.maxValue(10_000)),
    /** How many of the boss's own rule cards it has: the first ones, in order. */
    cards: v.pipe(Int, v.minValue(0)),
    /** Whether the boss has its escalation. */
    buildUp: v.boolean(),
    /** Rule cards (ids) the slot adds to the boss on top of its own, at the slot's strength. */
    extraCards: v.pipe(v.array(IdSchema), v.readonly()),
  }),
  v.readonly(),
);
export type TrackSlotDef = v.InferOutput<typeof TrackSlotSchema>;

export const RaidTrackSchema = v.pipe(
  v.strictObject({
    /** The order of the raid bosses (ids); it repeats after the last. */
    order: v.pipe(v.array(IdSchema), v.minLength(1), v.readonly()),
    /** Slots 1 to N, in order. Later slots follow the lab's ranks until the game plays them (phase 4). */
    slots: v.pipe(v.array(TrackSlotSchema), v.minLength(1), v.readonly()),
  }),
  v.readonly(),
);
export type RaidTrackDef = v.InferOutput<typeof RaidTrackSchema>;
