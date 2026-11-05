import * as v from 'valibot';
import { SCOUT_KITS } from './scouts';

/**
 * What `/api/state` carries about the valley when `VALLEY_SYSTEMS` is on (phase 5 step 1, `systems/bonfire.md` V-BON-3): the
 * Bonfire reads it. Strict, so the client half and the server tests share one definition. Absent from the answer with the flag off.
 */

/** Where a creature is: resting at the bonfire (V-BON-1), or posted to a scout seat (V-POST-1; it earns the same idle XP, V-POST-3). */
export const VALLEY_CREATURE_STATES = ['resting', 'scouting'] as const;
export type ValleyCreatureState = (typeof VALLEY_CREATURE_STATES)[number];

const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const amount = v.pipe(v.number(), v.finite(), v.minValue(0));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

export const ValleyCreatureViewSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  state: v.picklist(VALLEY_CREATURE_STATES),
  /** The XP the creature gained since this visit began, the "+N" of V-BON-3 (0: nothing, or it is at the top). */
  gained: int,
  /** The catch-up multiplier held since the last visit, in basis points (10000 is x1; above it the "warming up" flame, V-BON-2). */
  catchUpBp: int,
  /** The seat the creature stands at (null: resting). */
  seatId: v.nullable(id),
});

/**
 * One scout seat (V-POST-1, V-SCOUT-1..5, V-RET-9): where it stands, who stands there, what its pack holds and what makes its pace.
 * `perDay` is what the seat finds per effective day at the full away share as things stand now (fit, mastery, kit, the place and the
 * week in it); the pack "fills in" `store.fullInHours` at that pace (null: it is full, or no one stands there).
 */
export const ValleySeatViewSchema = v.strictObject({
  id,
  destination: id,
  /** The posted creature (null: an empty seat finds nothing). */
  creatureId: v.nullable(id),
  kit: v.nullable(v.picklist(SCOUT_KITS)),
  /** V-POST-4: the creature's element is the place's. */
  fit: v.boolean(),
  /** V-SCOUT-10: not the first of the player's scouts at this place. */
  second: v.boolean(),
  /** V-POST-12: the creature's scouting hours, its step (0 none, 1 Skilled, 2 Expert, 3 Master) and the bonus in basis points. */
  mastery: v.strictObject({ hours: amount, step: v.picklist([0, 1, 2, 3]), bonusBp: int }),
  /** V-POST-5, V-SCOUT-4: the pack, in effective hours, and what waits in it. `full`: it stopped picking up ("pack full"). */
  store: v.strictObject({
    hours: amount,
    capHours: amount,
    full: v.boolean(),
    /** This answer's pass found the pack full: it stopped picking up for a while and came home ("pack full" in the return walk). */
    wasFull: v.boolean(),
    fullInHours: v.nullable(amount),
    scrap: int,
    shards: int,
    gear: int,
    blueprints: int,
    pages: int,
  }),
  perDay: v.strictObject({
    scrap: amount,
    shards: amount,
    creatures: amount,
    gear: amount,
    blueprints: amount,
    pages: amount,
  }),
});

/** A destination as the Signpost draws it (V-SCOUT-2, 8, 11). */
export const ValleyPlaceViewSchema = v.strictObject({
  id,
  element: v.nullable(v.string()),
  /** What its find profile is rich in. */
  rich: v.picklist(['scrap', 'shards', 'creatures', 'rare', 'none']),
  /** Open now (the Festival Grounds only in festival weeks). */
  open: v.boolean(),
  /** Gives more at night (the Moonlit Reef). */
  night: v.boolean(),
  /** The week's twist lands here (shown from Monday). */
  special: v.boolean(),
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
  /** The player's scout seats, in the order they were bought (V-POST-2). */
  seats: v.pipe(v.array(ValleySeatViewSchema), v.maxLength(16)),
  /** The seat price ladder (V-POST-2): seats owned, the most the Signpost's level allows, the next seat's Acorns (null: none left) and every price. */
  seatPrices: v.strictObject({
    owned: int,
    max: int,
    next: v.nullable(int),
    ladder: v.pipe(v.array(int), v.maxLength(16)),
  }),
  /** The player's kit (V-SCOUT-5, V-POST-11): the kit bought, and what a new one costs in Acorns. */
  kit: v.strictObject({
    owned: v.pipe(v.array(v.picklist(SCOUT_KITS)), v.maxLength(8)),
    price: int,
  }),
  /** The destinations, with the profile and the opening hours each shows (V-RET-9). */
  places: v.pipe(v.array(ValleyPlaceViewSchema), v.maxLength(32)),
  /** It is night on the guild's clock now (the Moonlit Reef gives more). */
  night: v.boolean(),
  /** The week's twist (V-SCOUT-11): its destination and id; null with none. */
  special: v.nullable(v.strictObject({ destination: id, twist: id })),
});

export type ValleyCreatureView = v.InferOutput<typeof ValleyCreatureViewSchema>;
export type ValleySeatView = v.InferOutput<typeof ValleySeatViewSchema>;
export type ValleyPlaceView = v.InferOutput<typeof ValleyPlaceViewSchema>;
export type ValleyView = v.InferOutput<typeof ValleyViewSchema>;

/**
 * Reads the `valley` key of `/api/state` (the client's parser): `null` when absent (the flag is off, or an action's answer, which
 * leaves it out); a strict check otherwise, so anything of another shape is `undefined` (the caller refuses the answer).
 */
export function parseValleyView(value: unknown): ValleyView | null | undefined {
  if (value === undefined || value === null) return null;
  const result = v.safeParse(ValleyViewSchema, value);
  return result.success ? result.output : undefined;
}
