import { VALLEY_RULES, type AwayCurve, type ValleyRules } from './rules';
import { awayShare, catchUpMultiplier, levelAtXp, xpAtLevel } from './formulas';
import type { Rng } from '../rng';
import {
  finishForge,
  forgeAdvance,
  forgeBoundary,
  forgeInstants,
  startForge,
  type ForgeHours,
  type MadePiece,
  type SettleForge,
} from './forge';
import {
  QUIET_WORLD,
  masteryHoursOf,
  placeOpen,
  placeProfile,
  seatRates,
  type PlaceProfile,
  type ScoutKit,
  type ScoutWorld,
  type SeatRates,
} from './scouts';

/**
 * The lazy pass, skeleton (V-POST-14, docs/design/valley/systems/posts.md): a pure walk through time from `from` to `to` that splits
 * only where something changes, never hour by hour. Today it wires one rule, idle XP by the away steps (V-BON-1, V-POST-3,
 * V-POST-10), as the lab computes it: an hour is worth the away share of the hours since the player's last visit, times the
 * hearth, times the base rate. Amounts are expected values; integers keep a fractional carry so nothing is lost or invented.
 *
 * Step 1 added what resting needs: each creature's catch-up multiplier (held between visits, V-BON-2) and the time it joined (a
 * creature earns nothing before it exists), and the allowance building up in a store (V-POST-5; `rules.acorns.allowancePerDay` an
 * hour-share at a time, capped at `rules.posts.storeHours` of it, nothing lost to a full store but the surplus). Seats and their
 * stores, and the notable events the Gazette reads, join `SettleState` and `SettleEvent` in later steps. The two rules that hold
 * (tested): settling a to c equals settling a to b and then b to c, and settling again at the same `now` changes nothing.
 *
 * Step 2 adds scouts' seats (V-POST-14, V-SCOUT-2): each seat with a creature takes the stretch's effective hours (the away share
 * times the hours) into its store until the store is full (V-SCOUT-4), grows the creature's scouting hours (V-POST-12, which keep
 * counting when the store is full), pays scrap and shards as expected values with a carry, and reports one `SeatStretch` per
 * stretch so the caller can draw creatures, gear, blueprints and pages live: a stretch is split where the rates change (a mastery
 * step, a full store, night falling, a new week's twist), never hour by hour. The same two rules hold.
 *
 * Times are UTC epoch milliseconds (or any one unit of milliseconds: only differences are used).
 */

const HOUR_MS = 3_600_000;

/** One creature as the pass sees it: whole XP, the fraction not yet paid out (0 up to 1), and the XP bank (Infinity: none). */
export interface SettleCreature {
  readonly xp: number;
  readonly carry: number;
  readonly capXp: number;
  /** The XP multiplier fixed at the last visit (V-BON-2; default 1). Never applied to anything but idle XP. */
  readonly catchUp?: number;
  /**
   * The level the multiplier was fixed toward (V-BON-2) and the creature's total XP at the start of the pass (`xpAtLevel(level) + exp`).
   * Given both, the multiplier fades as the creature closes the gap (the pass splits at each level-up), so it never lifts a creature
   * past its target, as the lab's `effectiveCatchUp` does; absent, the held multiplier applies throughout.
   */
  readonly catchTarget?: number;
  readonly baseXp?: number;
  /** When the creature joined the player's roster: it earns nothing before (default: always there). */
  readonly joinedAt?: number;
  /** The creature's scouting hours (V-POST-12): effective hours it has worked at a scout seat (default 0). */
  readonly scoutHours?: number;
  /** The creature's smithing hours (V-POST-12): effective hours it has worked at an anvil (default 0). */
  readonly smithHours?: number;
}

/** The allowance store (V-POST-5): whole Acorns waiting, and the fraction not yet paid into them (0 up to 1). */
export interface SettleAllowance {
  readonly store: number;
  readonly carry: number;
}

/** One scout seat as the pass sees it (V-POST-1, V-SCOUT-2). Whole scrap and shards wait in the store with a carry. */
export interface SettleSeat {
  readonly id: string;
  /** The index in `creatures` of the posted creature; -1: an empty seat, which does nothing. */
  readonly creature: number;
  readonly destination: string;
  readonly kit: ScoutKit | null;
  /** V-POST-4: the creature's element is the place's. */
  readonly fit: boolean;
  /** V-SCOUT-10: not the player's first scout at this place. */
  readonly second: boolean;
  /** V-SCOUT-6: the scout is in the destination's deeper area (absent: not). */
  readonly deep?: boolean;
  /** Effective hours in the store, 0 up to `rules.posts.storeHours` (V-POST-5). */
  readonly storeHours: number;
  readonly scrap: number;
  readonly scrapCarry: number;
  readonly shards: number;
  readonly shardCarry: number;
}

/** What a stretch of one seat picked up, for the live draws (V-POST-14): `hours` of effective work at `rates`, in `world`. */
export interface SeatStretch {
  readonly seat: string;
  readonly at: number;
  /** Effective hours picked up (less than the stretch's when the store filled in it). */
  readonly hours: number;
  readonly rates: SeatRates;
  readonly world: ScoutWorld;
  readonly place: PlaceProfile;
  /** The seat was in the deeper area (V-SCOUT-6): the creature it finds comes from there. */
  readonly deep: boolean;
}

/** The world as a function of time: day or night, festival or not, the week's twist, and when it next changes (Infinity: never). */
export interface WorldClock {
  at(at: number): ScoutWorld;
  nextChange(at: number): number;
}

export interface SettleState {
  /** Everything up to this moment is settled. */
  readonly settledAt: number;
  /** The player's last visit (the away steps count from here). */
  readonly lastVisitAt: number;
  /** The hearth's growth multiplier, fixed at each visit and held until the next (V-POST-14). */
  readonly hearth: number;
  readonly creatures: readonly SettleCreature[];
  /** Absent: no store (the pass builds none). */
  readonly allowance?: SettleAllowance;
  /** Absent: no seats. */
  readonly seats?: readonly SettleSeat[];
  /** What the seats picked up in this pass, by stretch, in time order (output only; never an input of the next pass). */
  readonly stretches?: readonly SeatStretch[];
  /** Absent: no anvils (step 3, V-FORGE-1 to 5): the queues, the shelf, the pieces on their way and the floors. */
  readonly forge?: SettleForge;
  /** Output only: the pieces that reached a floor in this pass, in time order. */
  readonly made?: readonly MadePiece[];
  /** Output only: the orders that made their last piece in this pass (they leave the queue). */
  readonly finishedOrders?: readonly string[];
  /** Output only: effective anvil hours by what the anvils did in this pass (T-4). */
  readonly forgeHours?: ForgeHours;
}

/** A change point the caller knows about. A visit restarts the away steps, and may bring a new hearth multiplier. */
export interface SettleEvent {
  readonly at: number;
  readonly kind: 'visit';
  readonly hearth?: number;
}

/** A creature away from its post (V-POST-7: in the raid from the first stage's lock to the end of the finale): its seat or anvil pauses. */
export interface AwayWindow {
  /** The index in `creatures`. */
  readonly creature: number;
  readonly from: number;
  /** Infinity: it has not ended. */
  readonly to: number;
}

export interface SettleOptions {
  /** Times a creature's post is paused (idle XP is not: a creature on a post can still fight, and earns the same). */
  readonly away?: readonly AwayWindow[];
  readonly rules?: ValleyRules;
  readonly curve?: AwayCurve;
  /** Absent: always day, no festival, no twist. */
  readonly world?: WorldClock;
  /** The randomness for the rarity of a piece when it starts (required when an anvil can start one). */
  readonly rng?: Rng;
}

/** A tolerance so a total that is a whole number in exact arithmetic is not left a hair short by rounding (and splits agree). */
const EPSILON = 1e-9;

/** The first moment after `at` where the away share steps down, counting from the last visit (Infinity after the last step). */
function nextAwayBoundary(
  rules: ValleyRules,
  curve: AwayCurve,
  lastVisitAt: number,
  at: number,
): number {
  for (const step of rules.away[curve]) {
    const boundary = lastVisitAt + step.until * HOUR_MS;
    if (boundary > at) return boundary;
  }
  return Number.POSITIVE_INFINITY;
}

/** Adds `gain` to a whole amount with a carry, up to `cap` (at the cap the carry is dropped). */
function payInto(
  amount: number,
  carry: number,
  gain: number,
  cap: number,
): { amount: number; carry: number } {
  const total = carry + gain;
  const whole = Math.floor(total + EPSILON);
  const next = amount + whole;
  if (next >= cap) return { amount: Math.min(next, cap), carry: 0 };
  return { amount: next, carry: Math.max(0, total - whole) };
}

function pay(creature: SettleCreature, gain: number): SettleCreature {
  const paid = payInto(creature.xp, creature.carry, gain, creature.capXp);
  return { ...creature, xp: paid.amount, carry: paid.carry };
}

/** The catch-up multiplier a creature earns now: the held one, faded to the gap it has left when its target is known. */
function catchNow(rules: ValleyRules, c: SettleCreature): number {
  const held = c.catchUp ?? 1;
  if (held <= 1) return 1;
  if (c.catchTarget === undefined || c.baseXp === undefined) return held;
  const level = levelAtXp(c.baseXp + c.xp + c.carry);
  return Math.min(held, catchUpMultiplier(rules, c.catchTarget - level));
}

/** The next moment after `at` a catching-up creature reaches its next level (its multiplier changes there); Infinity when none does. */
function nextCatchStep(
  rules: ValleyRules,
  creatures: readonly SettleCreature[],
  ratePerHour: number,
  at: number,
): number {
  let next = Number.POSITIVE_INFINITY;
  if (!(ratePerHour > 0)) return next;
  for (const c of creatures) {
    if (c.joinedAt !== undefined && c.joinedAt > at) continue;
    const mult = catchNow(rules, c);
    if (mult <= 1 || c.baseXp === undefined) continue;
    const total = c.baseXp + c.xp + c.carry;
    const need = xpAtLevel(levelAtXp(total) + 1) - total;
    if (need <= 0) continue;
    next = Math.min(next, at + Math.ceil((need / (ratePerHour * mult)) * HOUR_MS));
  }
  return next;
}

/** Whether `creature` is away from its post at `at` (V-POST-7). */
const isAway = (windows: readonly AwayWindow[], creature: number, at: number): boolean =>
  windows.some((w) => w.creature === creature && at >= w.from && at < w.to);

/** The next edge of an away window after `at` (Infinity when none). */
function nextAwayEdge(windows: readonly AwayWindow[], at: number): number {
  let next = Number.POSITIVE_INFINITY;
  for (const w of windows) {
    if (w.from > at) next = Math.min(next, w.from);
    if (w.to > at) next = Math.min(next, w.to);
  }
  return next;
}

/** The next moment after `at` a creature joins (Infinity when none does). */
function nextJoin(creatures: readonly SettleCreature[], at: number): number {
  let next = Number.POSITIVE_INFINITY;
  for (const c of creatures)
    if (c.joinedAt !== undefined && c.joinedAt > at) next = Math.min(next, c.joinedAt);
  return next;
}

/** One seat's work in a stretch: what it takes into the store, and the rates it works at. */
interface SeatWork {
  readonly seat: SettleSeat;
  readonly place: PlaceProfile;
  readonly rates: SeatRates;
  readonly worker: SettleCreature;
}

function seatWork(
  rules: ValleyRules,
  seats: readonly SettleSeat[],
  creatures: readonly SettleCreature[],
  world: ScoutWorld,
  at: number,
  away: readonly AwayWindow[],
): SeatWork[] {
  const out: SeatWork[] = [];
  for (const seat of seats) {
    if (seat.creature >= 0 && isAway(away, seat.creature, at)) continue;
    const worker = creatures[seat.creature];
    const place = placeProfile(rules, seat.destination);
    if (worker === undefined || place === undefined || !placeOpen(place, world)) continue;
    if (worker.joinedAt !== undefined && worker.joinedAt > at) continue;
    out.push({
      seat,
      place,
      worker,
      rates: seatRates(rules, {
        place,
        fit: seat.fit,
        masteryHours: worker.scoutHours ?? 0,
        kit: seat.kit,
        second: seat.second,
        world,
        deep: seat.deep === true,
      }),
    });
  }
  return out;
}

/** The next moment (a ms value, maybe fractional) a seat's rates change by themselves: its store fills or its creature's mastery steps up. */
function nextSeatBoundary(
  rules: ValleyRules,
  work: readonly SeatWork[],
  world: ScoutWorld,
  share: number,
  cursor: number,
): number {
  let next = Number.POSITIVE_INFINITY;
  if (share <= 0) return next;
  for (const w of work) {
    const room = rules.posts.storeHours - w.seat.storeHours;
    if (room > EPSILON) next = Math.min(next, cursor + (room / share) * HOUR_MS);
    const hours = w.worker.scoutHours ?? 0;
    const step = rules.posts.mastery.find((m) => m.hours > hours + EPSILON);
    if (step !== undefined) {
      const perHour = share * masteryHoursOf(1, w.place, world);
      next = Math.min(next, cursor + ((step.hours - hours) / perHour) * HOUR_MS);
    }
  }
  return next;
}

/**
 * Walks `state` from `from` (which must be `state.settledAt`) to `to`. Events with `from < at <= to` are applied at their moment (an
 * event at `to` is applied, so the next pass starts after it). Returns the new state; the input is never changed.
 */
export function settle(
  state: SettleState,
  from: number,
  to: number,
  events: readonly SettleEvent[],
  options: SettleOptions = {},
): SettleState {
  if (from !== state.settledAt)
    throw new RangeError('settle must start where the state was last settled');
  if (to < from) throw new RangeError('settle cannot go back in time');
  const rules = options.rules ?? VALLEY_RULES;
  const curve = options.curve ?? 'B';
  const due = events
    .filter((e) => e.at > from && e.at <= to)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map((x) => x.e);

  let { lastVisitAt, hearth, creatures } = state;
  let allowance = state.allowance;
  let seats = state.seats;
  const forge =
    state.forge !== undefined && state.forge.anvils.length > 0 ? startForge(state.forge) : null;
  const stretches: SeatStretch[] = [];
  const world = options.world;
  const away = options.away ?? [];
  const allowanceCap = (rules.acorns.allowancePerDay / 24) * rules.posts.storeHours;
  const allowancePerHour = rules.acorns.allowancePerDay / 24;
  let cursor = from;
  let next = 0;
  for (;;) {
    for (let e = due[next]; e !== undefined && e.at <= cursor; e = due[++next]) {
      lastVisitAt = e.at;
      if (e.hearth !== undefined) hearth = e.hearth;
    }
    if (forge !== null) {
      if (options.rng === undefined) throw new RangeError('a pass with anvils needs an rng');
      forgeInstants(rules, forge, smithsOf(creatures, away, cursor), cursor, options.rng);
    }
    if (cursor >= to) break;
    const share = awayShare(rules, curve, (cursor - lastVisitAt) / HOUR_MS);
    const scoutWorld = world?.at(cursor) ?? QUIET_WORLD;
    const work =
      seats === undefined || seats.length === 0
        ? []
        : seatWork(rules, seats, creatures, scoutWorld, cursor, away);
    const boundary = Math.min(
      to,
      due[next]?.at ?? Number.POSITIVE_INFINITY,
      nextAwayEdge(away, cursor),
      nextCatchStep(rules, creatures, rules.xp.idlePerHour * hearth * share, cursor),
      nextAwayBoundary(rules, curve, lastVisitAt, cursor),
      nextJoin(creatures, cursor),
      seats === undefined || seats.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(
            world?.nextChange(cursor) ?? Number.POSITIVE_INFINITY,
            nextSeatBoundary(rules, work, scoutWorld, share, cursor),
          ),
      forge === null
        ? Number.POSITIVE_INFINITY
        : forgeBoundary(rules, forge, smithsOf(creatures, away, cursor), share, cursor),
    );
    const hours = (boundary - cursor) / HOUR_MS;
    const gain = rules.xp.idlePerHour * hearth * share * hours;
    if (gain > 0) {
      const at = cursor;
      creatures = creatures.map((c) =>
        c.joinedAt !== undefined && c.joinedAt > at ? c : pay(c, gain * catchNow(rules, c)),
      );
    }
    const stored = allowancePerHour * share * hours;
    if (allowance !== undefined && stored > 0) {
      const paid = payInto(allowance.store, allowance.carry, stored, allowanceCap);
      allowance = { store: paid.amount, carry: paid.carry };
    }
    if (seats !== undefined && work.length > 0 && hours > 0) {
      const effective = share * hours;
      const worked = new Map(work.map((w) => [w.seat.id, w]));
      const grown = new Map<number, number>();
      seats = seats.map((seat) => {
        const w = worked.get(seat.id);
        if (w === undefined) return seat;
        const picked = Math.min(effective, Math.max(0, rules.posts.storeHours - seat.storeHours));
        grown.set(seat.creature, masteryHoursOf(effective, w.place, scoutWorld));
        if (picked <= 0) return seat;
        stretches.push({
          seat: seat.id,
          at: cursor,
          hours: picked,
          rates: w.rates,
          world: scoutWorld,
          place: w.place,
          deep: seat.deep === true,
        });
        const scrap = payInto(seat.scrap, seat.scrapCarry, picked * w.rates.scrap, Infinity);
        const shards = payInto(seat.shards, seat.shardCarry, picked * w.rates.shards, Infinity);
        const filled = seat.storeHours + picked;
        return {
          ...seat,
          storeHours: rules.posts.storeHours - filled < EPSILON ? rules.posts.storeHours : filled,
          scrap: scrap.amount,
          scrapCarry: scrap.carry,
          shards: shards.amount,
          shardCarry: shards.carry,
        };
      });
      if (grown.size > 0) {
        creatures = creatures.map((c, i) => {
          const more = grown.get(i);
          return more === undefined ? c : { ...c, scoutHours: (c.scoutHours ?? 0) + more };
        });
      }
    }
    if (forge !== null && hours > 0) {
      const grown = forgeAdvance(rules, forge, smithsOf(creatures, away, cursor), share * hours);
      if (grown.size > 0) {
        creatures = creatures.map((c, i) => {
          const more = grown.get(i);
          return more === undefined ? c : { ...c, smithHours: (c.smithHours ?? 0) + more };
        });
      }
    }
    cursor = boundary;
  }
  return {
    settledAt: to,
    lastVisitAt,
    hearth,
    creatures,
    ...(allowance === undefined ? {} : { allowance }),
    ...(seats === undefined ? {} : { seats }),
    ...(stretches.length === 0 ? {} : { stretches }),
    ...(forge === null || state.forge === undefined
      ? {}
      : {
          forge: finishForge(forge, state.forge),
          ...(forge.made.length === 0 ? {} : { made: forge.made }),
          ...(forge.finished.length === 0 ? {} : { finishedOrders: forge.finished }),
          forgeHours: forge.hours,
        }),
  };
}

/** The smiths as the forge step sees them at `at`: a creature away (V-POST-7) counts as not yet there, so its anvil pauses as it does before a creature joins. */
const smithsOf = (
  creatures: readonly SettleCreature[],
  away: readonly AwayWindow[],
  at: number,
): { smithHours: number; joinedAt?: number }[] =>
  creatures.map((c, i) => ({
    smithHours: c.smithHours ?? 0,
    ...(isAway(away, i, at)
      ? { joinedAt: Number.POSITIVE_INFINITY }
      : c.joinedAt === undefined
        ? {}
        : { joinedAt: c.joinedAt }),
  }));
