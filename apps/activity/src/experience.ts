/**
 * Creature experience as the server sends it (docs/design/gear-and-creatures-v2.md section 9): what an
 * activity paid a creature (`ExperienceView`, on a trip's, a dungeon run's and a Workshop job's result)
 * and the ribbon a creature waits for (`RibbonView`, on the creature). Types, their checks and the short
 * sentences the screens show. The server decides every number; nothing here computes experience.
 */
import { PART_KINDS } from '@creatures/game';
import type { PartKind } from './gear-types';
import { isArrayOf, isCount, isInt, isRecord, isStr } from './parse-core';

/** One thing that changed an XP gain: a treat's multiplier, or a share on top (basis points; negative: less). */
export type XpBoostPart =
  | { source: 'treat'; name: string; times: number }
  | { source: 'day' | 'gear' | 'trip'; name: string; bp: number };

/**
 * What changed an XP gain, as the server worked it out with the gain (`@creatures/game` `xp-boost.ts`): the
 * parts in the order they were applied and the total multiplier (10000 is x1). Sent next to every gain
 * something changed (creature experience, explorer XP, Crafting XP); absent when nothing did.
 */
export interface XpBoost {
  parts: XpBoostPart[];
  totalBp: number;
}

const BOOST_SOURCES: ReadonlySet<unknown> = new Set(['day', 'gear', 'trip']);

function isXpBoostPart(value: unknown): value is XpBoostPart {
  if (!isRecord(value) || !isStr(value['name']) || value['name'].length > 64) return false;
  if (value['source'] === 'treat') return isCount(value['times']);
  return BOOST_SOURCES.has(value['source']) && isInt(value['bp']);
}

export function isXpBoost(value: unknown): value is XpBoost {
  return (
    isRecord(value) &&
    isCount(value['totalBp']) &&
    isArrayOf(value['parts'], isXpBoostPart) &&
    value['parts'].length <= 12
  );
}

/** What one award did to one creature. */
export interface ExperienceView {
  creatureId: string;
  /** The experience the activity paid (a treat already doubled). */
  gained: number;
  /** A treat was packed for this activity. */
  treat: boolean;
  levelBefore: number;
  level: number;
  /** Experience banked towards the next level, and what that level needs (null at the top). */
  exp: number;
  needed: number | null;
  /** The creature waits at a level it may not leave yet (a ribbon, or its evolution). */
  waiting: boolean;
  /** The Gold Ribbon came with this gain. */
  gold: boolean;
  /** What changed the amount (a treat, the day) and the total multiplier; absent when nothing did and on older results. */
  boost?: XpBoost;
  /**
   * The older form of `boost`, on a dungeon run's award only (absent on a trip's, a job's and older runs):
   * what the treat multiplied the experience by (null: no treat), and the day's Boons and Omens that changed
   * it, by name, with the change in basis points (negative: less). Read only for runs stored before `boost`.
   */
  treatTimes?: number | null;
  dayEffects?: DayEffect[];
}

/** A Boon or Omen that changed the experience of a day. */
export interface DayEffect {
  name: string;
  bp: number;
}

/** A ribbon a creature waits for, with its price and whether the player can pay it now. */
export interface RibbonView {
  id: 'bronze' | 'silver';
  level: number;
  parts: Partial<Record<PartKind, number>>;
  /** Finished trips of this creature the ribbon asks for, and how many it has made. */
  trips: number;
  tripsDone: number;
  ready: boolean;
}

function isDayEffect(value: unknown): value is DayEffect {
  return isRecord(value) && typeof value['name'] === 'string' && isInt(value['bp']);
}

export function isExperienceView(value: unknown): value is ExperienceView {
  return (
    isRecord(value) &&
    (value['boost'] === undefined || isXpBoost(value['boost'])) &&
    (value['treatTimes'] === undefined ||
      value['treatTimes'] === null ||
      isInt(value['treatTimes'])) &&
    (value['dayEffects'] === undefined ||
      (Array.isArray(value['dayEffects']) && value['dayEffects'].every(isDayEffect))) &&
    typeof value['creatureId'] === 'string' &&
    isInt(value['gained']) &&
    typeof value['treat'] === 'boolean' &&
    isInt(value['levelBefore']) &&
    isInt(value['level']) &&
    isInt(value['exp']) &&
    (value['needed'] === null || isInt(value['needed'])) &&
    typeof value['waiting'] === 'boolean' &&
    typeof value['gold'] === 'boolean'
  );
}

/** Parts by kind: only known kinds, whole numbers (this file stays free of `gear-parse`, which imports it). */
function isParts(value: unknown): value is RibbonView['parts'] {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([kind, amount]) => (PART_KINDS as readonly string[]).includes(kind) && isInt(amount),
    )
  );
}

export function isRibbonView(value: unknown): value is RibbonView {
  return (
    isRecord(value) &&
    (value['id'] === 'bronze' || value['id'] === 'silver') &&
    isInt(value['level']) &&
    isParts(value['parts']) &&
    isInt(value['trips']) &&
    isInt(value['tripsDone']) &&
    typeof value['ready'] === 'boolean'
  );
}

const RIBBON_NAMES: Readonly<Record<RibbonView['id'], string>> = {
  bronze: 'Bronze Ribbon',
  silver: 'Silver Ribbon',
};

export function ribbonName(id: RibbonView['id'] | 'gold'): string {
  return id === 'gold' ? 'Gold Ribbon' : RIBBON_NAMES[id];
}

const PART_NAMES: Readonly<Record<string, string>> = {
  scrap: 'scrap',
  glimmer: 'glimmer',
  'tide-shard': 'Tide shards',
  'ember-shard': 'Ember shards',
  'grove-shard': 'Grove shards',
  'spark-shard': 'Spark shards',
};

/** "6 scrap and 2 Ember shards": a ribbon's parts, in the order the server lists them, as words. */
export function ribbonCostText(ribbon: RibbonView): string {
  const parts = Object.entries(ribbon.parts)
    .filter(([, amount]) => typeof amount === 'number' && amount > 0)
    .map(([kind, amount]) => `${String(amount)} ${PART_NAMES[kind] ?? kind}`);
  const trips =
    ribbon.trips > 0
      ? [`${String(ribbon.trips)} finished ${ribbon.trips === 1 ? 'trip' : 'trips'}`]
      : [];
  const all = [...parts, ...trips];
  if (all.length <= 1) return all.join('');
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1] ?? ''}`;
}

/** What is missing before the ribbon can be earned, in words; null when it is ready. */
export function ribbonBlocker(ribbon: RibbonView): string | null {
  if (ribbon.ready) return null;
  if (ribbon.tripsDone < ribbon.trips) {
    const left = ribbon.trips - ribbon.tripsDone;
    return `Needs ${String(left)} more ${left === 1 ? 'trip' : 'trips'}.`;
  }
  return 'Short of parts.';
}
