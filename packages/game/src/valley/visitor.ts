import { RULES as GAME } from '../rules';
import type { GearBase, GearRarity } from '../content/gear-schema';
import { clampItemLevel, linePool, tierCap } from '../rules/gear-items';
import type { ValleyRules } from './rules';

/**
 * The weekly visitor, the pure half (phase 5 step 8, docs/design/valley/systems/visitor.md, V-VIS-1 and V-VIS-3). The lab
 * (`packages/econ/src/visitor.ts`) models the same rules and imports these for the window and the price, so a number changes in
 * one place. Nothing here reads a clock or draws a number; the guild's timezone is always passed in.
 */

type VisitorRules = Pick<ValleyRules, 'visitor'>;

/** Hours in the Monday-first week the visitor's window is counted in. */
export const VISITOR_WEEK_HOURS = 168;

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

function formatFor(timeZone: string): Intl.DateTimeFormat {
  let format = zoneFormats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    zoneFormats.set(timeZone, format);
  }
  return format;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A visitor's week: the guild-local Monday it started on (the week's key) and the hours since that Monday 00:00 on the wall clock. */
export interface VisitorWeek {
  /** `YYYY-MM-DD` of the Monday (guild-local). */
  readonly key: string;
  /** Hours since Monday 00:00 local, fractional (0 up to 168). */
  readonly hoursIn: number;
}

/** The Monday-first week an instant falls in, in the guild's timezone. */
export function visitorWeekOf(at: number, timeZone: string): VisitorWeek {
  const parts: Record<string, string> = {};
  for (const part of formatFor(timeZone).formatToParts(at)) parts[part.type] = part.value;
  const day = Math.max(0, WEEKDAYS.indexOf(parts['weekday'] ?? 'Mon'));
  const year = Number(parts['year']);
  const month = Number(parts['month']);
  const date = Number(parts['day']);
  const monday = new Date(Date.UTC(year, month - 1, date - day));
  const key = `${String(monday.getUTCFullYear()).padStart(4, '0')}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
  return { key, hoursIn: day * 24 + Number(parts['hour']) + Number(parts['minute']) / 60 };
}

/** V-VIS-1: whether he is in the valley this many hours into a Monday-first week (from `arriveDay` 00:00 until `leaveHour`). */
export function visitorHere(rules: VisitorRules, hoursIn: number): boolean {
  const inWeek = hoursIn % VISITOR_WEEK_HOURS;
  return inWeek >= rules.visitor.arriveDay * 24 && inWeek < rules.visitor.leaveHour;
}

/** V-VIS-1: whether he is in the valley at an instant, in the guild's timezone. */
export const visitorHereAt = (rules: VisitorRules, at: number, timeZone: string): boolean =>
  visitorHere(rules, visitorWeekOf(at, timeZone).hoursIn);

/**
 * V-VIS-3: the price of the player's next reroll of a piece of this item level, `[Acorns, scrap]`: linear in the item level over
 * `baseLevel`, times `growth` for each reroll the player already made this week.
 */
export function rerollPrice(
  rules: VisitorRules,
  itemLevel: number,
  rerollsSoFar: number,
): [number, number] {
  const v = rules.visitor;
  const factor = (Math.max(1, itemLevel) / v.baseLevel) * v.growth ** rerollsSoFar;
  return [Math.round(v.acorns * factor), Math.round(v.scrap * factor)];
}

/**
 * V-VIS-5: how a price in shards of ANY element is paid, as the lab's `payShards` does: one shard at a time from the element the player
 * holds most of (the lowest index among equals), so the biggest piles come down first. `held` is the shards by element; the answer is
 * what to take from each, or null when the player holds fewer than `amount` in all.
 */
export function anyShardPayment(held: readonly number[], amount: number): number[] | null {
  const left = held.map((n) => Math.max(0, Math.floor(n)));
  const take = left.map(() => 0);
  if (left.reduce((sum, n) => sum + n, 0) < amount) return null;
  for (let i = 0; i < amount; i++) {
    let top = 0;
    for (let e = 1; e < left.length; e++) if ((left[e] ?? 0) > (left[top] ?? 0)) top = e;
    left[top] = (left[top] ?? 0) - 1;
    take[top] = (take[top] ?? 0) + 1;
  }
  return take;
}

/** What one confirm shows before a reroll (V-VIS-2): how many lines are drawn and the odds each has of the top tier its item level allows. */
export interface RerollOdds {
  /** How many modifier lines the piece has (all are rolled again). */
  readonly lines: number;
  /** The best tier (0 is I, 4 is V) the piece's item level allows. */
  readonly topTier: number;
  /** The chance of each tier a tiered line can land on, the best first (the roller's own weights). */
  readonly tiers: readonly { readonly tier: number; readonly chance: number }[];
  /** The chance a tiered line lands on `topTier` (the first of `tiers`). */
  readonly topChance: number;
  /** The share of the piece's line pool (by weight) that are single lines, which have no tier. */
  readonly singleShare: number;
}

/**
 * The odds a reroll of a piece shows: read from the roller's own pool (`linePool`) and tier weights, so what is shown is what is drawn.
 * The tier odds of a tiered line do not depend on which line it is; the pool only decides how much of it is single lines.
 */
export function rerollOdds(
  base: Pick<GearBase, 'slot' | 'tag' | 'pool' | 'stats'>,
  rarity: GearRarity,
  itemLevel: number,
): RerollOdds {
  const level = clampItemLevel(itemLevel);
  const topTier = tierCap(level);
  const weights = GAME.gear.tierWeights.flatMap((weight, i) =>
    topTier - i >= 0 ? [{ tier: topTier - i, weight }] : [],
  );
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  const tiers = weights.map((w) => ({ tier: w.tier, chance: w.weight / total }));
  const pool = linePool(base, rarity, level);
  const poolWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  const single = pool.filter((p) => p.line.single).reduce((sum, p) => sum + p.weight, 0);
  return {
    lines: Math.min(GAME.gear.rolledLines[rarity], pool.length),
    topTier,
    tiers,
    topChance: tiers[0]?.chance ?? 0,
    singleShare: poolWeight === 0 ? 0 : single / poolWeight,
  };
}
