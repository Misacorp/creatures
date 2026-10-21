import type { Rarity } from '../content/schema';
import { RULES } from './config';

/** Cumulative stat bonus in basis points after `fusionCount` fusions (capped at 5). */
export function fusionBonusBp(fusionCount: number): number {
  if (!Number.isInteger(fusionCount) || fusionCount < 0) {
    throw new RangeError(`fusionCount must be an integer >= 0, got ${fusionCount}`);
  }
  const index = Math.min(fusionCount, RULES.fusion.maxFusions);
  const bp = RULES.fusion.cumulativeBonusBp[index];
  if (bp === undefined) throw new Error('fusion table is shorter than maxFusions');
  return bp;
}

/** What the collection stores about one owned line. */
export interface CollectionEntry {
  fusionCount: number;
  shiny: boolean;
}

/** A catch as far as collection rules are concerned. */
export interface CaughtCreature {
  species: { rarity: Rarity };
  shiny: boolean;
}

/** `new`: the line was not owned. `duplicate`: it was; the catch waits as a choice (Teach, Fuse, Release or Keep). */
export type CollectionOutcome = { kind: 'new' } | { kind: 'duplicate'; becameShiny: boolean };

/**
 * Decides what a catch does to the player's collection. A new line is added. A duplicate no longer
 * fuses by itself (and never turns into Bait): it arrives as a pending card with its rolled talent and
 * the player chooses (docs/design/gear-and-creatures-v2.md section 8.2). A shiny duplicate makes the
 * creature the player owns shiny at once.
 */
export function applyCatchToCollection(
  entry: CollectionEntry | undefined,
  caught: CaughtCreature,
): CollectionOutcome {
  if (entry === undefined) return { kind: 'new' };
  return { kind: 'duplicate', becameShiny: caught.shiny && !entry.shiny };
}

/** Fusion points a duplicate of this rarity adds when fused in. */
export function fusionPointsFor(rarity: Rarity): number {
  return RULES.fusion.pointsByRarity[rarity];
}

function checkPoints(points: number): void {
  if (!Number.isInteger(points) || points < 0) {
    throw new RangeError(`fusion points must be an integer >= 0, got ${points}`);
  }
}

/** Cumulative points needed to reach fusion `level` (1 to the maximum); 0 for level 0. */
export function fusionThreshold(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > RULES.fusion.maxFusions) {
    throw new RangeError(`fusion level must be an integer from 0 to ${RULES.fusion.maxFusions}`);
  }
  if (level === 0) return 0;
  const t = RULES.fusion.thresholds[level - 1];
  if (t === undefined) throw new Error('fusion thresholds are shorter than maxFusions');
  return t;
}

/** The fusion level (0 to the maximum) a creature with this many points has reached. */
export function fusionLevel(points: number): number {
  checkPoints(points);
  let level = 0;
  while (level < RULES.fusion.maxFusions && points >= fusionThreshold(level + 1)) level += 1;
  return level;
}

/** Where a creature stands: its level and the points into the next level (`need` is null at the maximum). */
export interface FusionProgress {
  level: number;
  /** Points gathered toward the next level. */
  into: number;
  /** Points the next level takes from the last one; null at the maximum. */
  need: number | null;
}

export function fusionProgress(points: number): FusionProgress {
  const level = fusionLevel(points);
  if (level >= RULES.fusion.maxFusions) return { level, into: 0, need: null };
  const floor = fusionThreshold(level);
  return { level, into: points - floor, need: fusionThreshold(level + 1) - floor };
}

/**
 * The points after fusing a duplicate of `rarity` in, or null when the creature is at the maximum
 * level already (nothing to fuse). Points past the maximum are not stored.
 */
export function fuseInto(points: number, rarity: Rarity): number | null {
  checkPoints(points);
  const max = fusionThreshold(RULES.fusion.maxFusions);
  if (points >= max) return null;
  return Math.min(max, points + fusionPointsFor(rarity));
}

/** True while a creature with these points can take more (below the maximum level). */
export function canFuse(points: number): boolean {
  return fuseInto(points, 'common') !== null;
}
