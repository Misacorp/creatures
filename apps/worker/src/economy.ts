/**
 * Economy balance config for leet points and Bait. These values move to a shared package in M3.
 * Integers only.
 */
export const ECONOMY = {
  /** Bait granted per leet point. */
  baitPerLeetPoint: 10,
  /** Leet points for a solo leet: a bonus for showing up when nobody else did. */
  soloLeetPoints: 2,
  /** Cap on leet points for one day. */
  maxLeetPoints: 8,
} as const;

/** Leet points each participant earns for a day on which `participantCount` players leeted. */
export function leetPointsForDay(participantCount: number): number {
  if (!Number.isSafeInteger(participantCount) || participantCount < 0) {
    throw new Error('participantCount must be a non-negative integer');
  }
  if (participantCount === 0) return 0;
  if (participantCount === 1) return ECONOMY.soloLeetPoints;
  return Math.min(participantCount, ECONOMY.maxLeetPoints);
}

/** Bait each participant earns for a day on which `participantCount` players leeted. */
export function baitForDay(participantCount: number): number {
  return leetPointsForDay(participantCount) * ECONOMY.baitPerLeetPoint;
}
