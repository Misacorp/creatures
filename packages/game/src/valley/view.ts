import * as v from 'valibot';
import { ANVIL_KITS, KIT_NAMES } from './forge';
import { PaperSchema } from './gazette';
import { SCOUT_KITS } from './scouts';

/**
 * What `/api/state` carries about the valley when `VALLEY_SYSTEMS` is on (phase 5 step 1, `systems/bonfire.md` V-BON-3): the
 * Bonfire reads it. Strict, so the client half and the server tests share one definition. Absent from the answer with the flag off.
 */

/** Where a creature is: resting at the bonfire (V-BON-1), or posted to a scout seat or an anvil (V-POST-1; it earns the same idle XP, V-POST-3). */
export const VALLEY_CREATURE_STATES = ['resting', 'scouting', 'smithing'] as const;
export type ValleyCreatureState = (typeof VALLEY_CREATURE_STATES)[number];

const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const amount = v.pipe(v.number(), v.finite(), v.minValue(0));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

export const ValleyCreatureViewSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  state: v.picklist(VALLEY_CREATURE_STATES),
  /** The XP the creature gained since this visit began, the "+N" of V-BON-3 (0: nothing, or it is at the top). */
  gained: int,
  /**
   * The catch-up multiplier it earns now, in basis points (10000 is x1; above it the "warming up" flame, V-BON-2): fixed at the last
   * visit, and fading to x1 as the creature closes on its target, so it never shows a flame over a creature that has arrived.
   */
  catchUpBp: int,
  /** The seat the creature stands at (null: resting). */
  seatId: v.nullable(id),
});

/** Why a post is paused (V-POST-7): its creature is in the raid, from the first stage's lock to the end of the finale. */
export const PAUSE_REASONS = ['raid'] as const;

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
  /** V-POST-7: why the seat is paused now (null: it works); its pack keeps what it holds. */
  paused: v.nullable(v.picklist(PAUSE_REASONS)),
  /** V-SCOUT-10: not the first of the player's scouts at this place. */
  second: v.boolean(),
  /** V-SCOUT-6: the scout is in the destination's deeper area (its kit does not work there; coming back up is free). */
  deep: v.boolean(),
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

const mastery = v.strictObject({ hours: amount, step: v.picklist([0, 1, 2, 3]), bonusBp: int });
const rarity = v.picklist([0, 1, 2]);
/** The element ids the valley's shards come in. */
const element = v.pipe(v.string(), v.minLength(1), v.maxLength(16));

/** What an order asks of the shelf for its next piece, and what it waits on now (V-FORGE-3, 4): `waiting` is the first input the shelf lacks. */
export const ValleyOrderViewSchema = v.strictObject({
  id,
  /** The blueprint's base (null: "for my team"). */
  blueprintId: v.nullable(id),
  forTeam: v.boolean(),
  count: int,
  made: int,
  reach: v.picklist(['none', 'rare', 'epic']),
  needs: v.strictObject({
    scrap: int,
    /** The element of the shard (null: any pile, or a team order with nothing to dress yet). */
    shardElement: v.nullable(element),
    shard: int,
    essence: int,
  }),
  waiting: v.nullable(v.picklist(['scrap', 'shard', 'essence'])),
});

/** One anvil (V-POST-1, V-FORGE-1 to 5, 7, 8, V-RET-9): its smith, its queue, the piece in hand, why it tinkers, its floor and its pace. */
export const ValleyAnvilViewSchema = v.strictObject({
  id,
  creatureId: v.nullable(id),
  kit: v.nullable(v.picklist(ANVIL_KITS)),
  /** V-POST-7: why the anvil is paused now (null: it works); its piece in hand keeps its progress. */
  paused: v.nullable(v.picklist(PAUSE_REASONS)),
  /** V-POST-12: the smith's smithing hours, its step and the bonus in basis points. */
  mastery,
  orders: v.pipe(v.array(ValleyOrderViewSchema), v.maxLength(8)),
  /** The piece being made (null: none in hand): its rarity is drawn when it starts, so a loupe or Reach shows at once. */
  piece: v.nullable(
    v.strictObject({
      orderId: v.nullable(id),
      rarity,
      progress: amount,
      need: amount,
      /** Hours of work left at the pace as things stand (null: paused). */
      leftHours: v.nullable(amount),
    }),
  ),
  /** Why the smith tinkers now (V-FORGE-2; null: working or no smith). `shardElement` is the pile a `shard` wait is for. */
  tinkering: v.nullable(
    v.strictObject({
      reason: v.picklist(['idle', 'scrap', 'shard', 'essence', 'floor']),
      shardElement: v.nullable(element),
      /** Hours the wait has lasted (a bubble over the Forge appears after a day, V-FORGE-4); null: unknown. */
      sinceHours: v.nullable(amount),
    }),
  ),
  /** V-FORGE-5: what waits on the floor (about three days), by rarity; `full` pauses the anvil. */
  floor: v.strictObject({
    count: int,
    cap: int,
    full: v.boolean(),
    byRarity: v.tuple([int, int, int]),
  }),
  /** Pieces a day at the pace of the current order with the full away share (0: no smith or no order). */
  perDay: v.strictObject({ pieces: amount }),
});

/** The Forge: the shelf, the bag, the fire and the exchange (V-FORGE-3, 7, 10, V-GEAR-6). */
export const ValleyForgeViewSchema = v.strictObject({
  /** The stockpile an order takes its inputs from: scrap, Essence and a pile of shards of each element. */
  shelf: v.strictObject({
    scrap: int,
    essence: int,
    shards: v.record(element, int),
  }),
  /** V-GEAR-6: items in the bag (worn ones do not count) and what it holds. */
  bag: v.strictObject({ count: int, cap: int }),
  /** The fire's level: the item level of every piece that comes out (V-FORGE-7). */
  fireLevel: int,
  /** V-FORGE-10: `rate` shards of another element for 1, with a `critChance` (basis points) of `critYield`. */
  exchange: v.strictObject({ rate: int, critBp: int, critYield: int }),
  /** The most orders an anvil's queue holds, and the most pieces one order asks for. */
  queueMax: int,
  orderCountMax: int,
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

/** One of another player's creatures round the fire (V-BON-4): only what is drawn on its nameplate. */
export const ValleyVisitorCreatureSchema = v.strictObject({
  id,
  species: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  shiny: v.boolean(),
  level: int,
  /** Its nickname (null: the species' name), plain text. */
  name: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
});

/**
 * A player who is online now (V-BON-4, "no couch": the valley shows who is here), with up to three of their resting creatures, which
 * the Bonfire draws among its own. Company brings no XP and no boost. Never the caller; never more than `MAX_ONLINE` players; no id of the player goes out.
 */
export const ValleyOnlineSchema = v.strictObject({
  /** The player's name (plain text). */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  creatures: v.pipe(v.array(ValleyVisitorCreatureSchema), v.maxLength(3)),
});

/** The most online players the valley draws (the fire has seats for a few). */
export const MAX_ONLINE = 4;

export const ValleyViewSchema = v.strictObject({
  /** The server time of this settle (UTC epoch ms). */
  settledAt: int,
  /** This answer began a new visit (the player had been away for the visit gap): the "+N" counts from here. */
  arrived: v.boolean(),
  /** The whole hours away that the arrival settled (0 mid-visit). */
  awayHours: int,
  creatures: v.pipe(v.array(ValleyCreatureViewSchema), v.maxLength(2000)),
  /** Who else is online now and the creatures of theirs that sit by the fire (V-BON-4); empty when alone. */
  online: v.pipe(v.array(ValleyOnlineSchema), v.maxLength(MAX_ONLINE)),
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
  /** The player's anvils, in the order they were bought (V-POST-2, V-FORGE-6). */
  anvils: v.pipe(v.array(ValleyAnvilViewSchema), v.maxLength(8)),
  /** The anvil price ladder: anvils owned, the most the Forge's level allows, the next anvil's price (null: none left) and every price. */
  anvilPrices: v.strictObject({
    owned: int,
    max: int,
    next: v.nullable(v.strictObject({ acorns: int, scrap: int })),
    ladder: v.pipe(v.array(v.strictObject({ acorns: int, scrap: int })), v.maxLength(16)),
  }),
  forge: ValleyForgeViewSchema,
  /** The player's kit (V-SCOUT-5, V-FORGE-8, V-POST-11): the kit bought, and what a new one costs in Acorns. */
  kit: v.strictObject({
    owned: v.pipe(v.array(v.picklist(KIT_NAMES)), v.maxLength(8)),
    price: int,
  }),
  /** The destinations, with the profile and the opening hours each shows (V-RET-9). */
  places: v.pipe(v.array(ValleyPlaceViewSchema), v.maxLength(32)),
  /** It is night on the guild's clock now (the Moonlit Reef gives more). */
  night: v.boolean(),
  /** The week's twist (V-SCOUT-11): its destination and id; null with none. */
  special: v.nullable(v.strictObject({ destination: id, twist: id })),
  /** The welcome-back Gazette's paper (V-RET-0): present only while the last paper is unread; closing it takes it away. */
  paper: v.optional(PaperSchema),
});

export type ValleyCreatureView = v.InferOutput<typeof ValleyCreatureViewSchema>;
export type ValleyOnline = v.InferOutput<typeof ValleyOnlineSchema>;
export type ValleyVisitorCreature = v.InferOutput<typeof ValleyVisitorCreatureSchema>;
export type ValleySeatView = v.InferOutput<typeof ValleySeatViewSchema>;
export type ValleyOrderView = v.InferOutput<typeof ValleyOrderViewSchema>;
export type ValleyAnvilView = v.InferOutput<typeof ValleyAnvilViewSchema>;
export type ValleyForgeView = v.InferOutput<typeof ValleyForgeViewSchema>;
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
