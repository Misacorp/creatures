import { VALLEY_RULES, type AwayCurve, type ValleyRules } from './rules';
import { awayShare } from './formulas';

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
  /** When the creature joined the player's roster: it earns nothing before (default: always there). */
  readonly joinedAt?: number;
}

/** The allowance store (V-POST-5): whole Acorns waiting, and the fraction not yet paid into them (0 up to 1). */
export interface SettleAllowance {
  readonly store: number;
  readonly carry: number;
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
}

/** A change point the caller knows about. A visit restarts the away steps, and may bring a new hearth multiplier. */
export interface SettleEvent {
  readonly at: number;
  readonly kind: 'visit';
  readonly hearth?: number;
}

export interface SettleOptions {
  readonly rules?: ValleyRules;
  readonly curve?: AwayCurve;
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

/** The next moment after `at` a creature joins (Infinity when none does). */
function nextJoin(creatures: readonly SettleCreature[], at: number): number {
  let next = Number.POSITIVE_INFINITY;
  for (const c of creatures)
    if (c.joinedAt !== undefined && c.joinedAt > at) next = Math.min(next, c.joinedAt);
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
  const allowanceCap = (rules.acorns.allowancePerDay / 24) * rules.posts.storeHours;
  const allowancePerHour = rules.acorns.allowancePerDay / 24;
  let cursor = from;
  let next = 0;
  for (;;) {
    for (let e = due[next]; e !== undefined && e.at <= cursor; e = due[++next]) {
      lastVisitAt = e.at;
      if (e.hearth !== undefined) hearth = e.hearth;
    }
    if (cursor >= to) break;
    const boundary = Math.min(
      to,
      due[next]?.at ?? Number.POSITIVE_INFINITY,
      nextAwayBoundary(rules, curve, lastVisitAt, cursor),
      nextJoin(creatures, cursor),
    );
    const hours = (boundary - cursor) / HOUR_MS;
    const share = awayShare(rules, curve, (cursor - lastVisitAt) / HOUR_MS);
    const gain = rules.xp.idlePerHour * hearth * share * hours;
    if (gain > 0) {
      const at = cursor;
      creatures = creatures.map((c) =>
        c.joinedAt !== undefined && c.joinedAt > at ? c : pay(c, gain * (c.catchUp ?? 1)),
      );
    }
    const stored = allowancePerHour * share * hours;
    if (allowance !== undefined && stored > 0) {
      const paid = payInto(allowance.store, allowance.carry, stored, allowanceCap);
      allowance = { store: paid.amount, carry: paid.carry };
    }
    cursor = boundary;
  }
  return {
    settledAt: to,
    lastVisitAt,
    hearth,
    creatures,
    ...(allowance === undefined ? {} : { allowance }),
  };
}
