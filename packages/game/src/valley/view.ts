import * as v from 'valibot';

/**
 * What `/api/state` carries about the valley when `VALLEY_SYSTEMS` is on (phase 5 step 1, `systems/bonfire.md` V-BON-3): the
 * Bonfire reads it. Strict, so the client half and the server tests share one definition. Absent from the answer with the flag off.
 */

/** Where a creature is: resting at the bonfire (V-BON-1). Seats join in step 2 ("post"). */
export const VALLEY_CREATURE_STATES = ['resting'] as const;
export type ValleyCreatureState = (typeof VALLEY_CREATURE_STATES)[number];

const int = v.pipe(v.number(), v.integer(), v.minValue(0));

export const ValleyCreatureViewSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  state: v.picklist(VALLEY_CREATURE_STATES),
  /** The XP the creature gained since this visit began, the "+N" of V-BON-3 (0: nothing, or it is at the top). */
  gained: int,
  /** The catch-up multiplier held since the last visit, in basis points (10000 is x1; above it the "warming up" flame, V-BON-2). */
  catchUpBp: int,
});

export const ValleyViewSchema = v.strictObject({
  /** The server time of this settle (UTC epoch ms). */
  settledAt: int,
  /** This answer began a new visit (the player had been away for the visit gap): the "+N" counts from here. */
  arrived: v.boolean(),
  /** The whole hours away that the arrival settled (0 mid-visit). */
  awayHours: int,
  creatures: v.pipe(v.array(ValleyCreatureViewSchema), v.maxLength(2000)),
  /** The allowance (V-POST-5): Acorns waiting in the store, the store's size, and what this visit already brought home. */
  allowance: v.strictObject({ store: int, cap: int, brought: int }),
});

export type ValleyCreatureView = v.InferOutput<typeof ValleyCreatureViewSchema>;
export type ValleyView = v.InferOutput<typeof ValleyViewSchema>;
