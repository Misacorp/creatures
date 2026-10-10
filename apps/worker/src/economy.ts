/**
 * Economy balance config for leet points and Bait. Integers only.
 *
 * Leet points per day follow a fixed table indexed by how many players leeted that day. Rules
 * (Misa, 2026-10-10): more leeters never pays anyone less (the table never decreases), a solo leet
 * pays the same as a double leet, every extra leeter adds less than the one before, and a day
 * pays at most 10 points.
 */
export const ECONOMY = {
  /** Bait granted per leet point. */
  baitPerLeetPoint: 7,
  /** Leet points per participant, indexed by participant count (index 0 = nobody leeted). */
  leetPointsByCount: [0, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 10] as readonly number[],
  /** Cap on leet points for one day; also the value for any count past the end of the table. */
  maxLeetPoints: 10,
} as const;

/** Leet points each participant earns for a day on which `participantCount` players leeted. */
export function leetPointsForDay(participantCount: number): number {
  if (!Number.isSafeInteger(participantCount) || participantCount < 0) {
    throw new Error('participantCount must be a non-negative integer');
  }
  const table = ECONOMY.leetPointsByCount;
  const points = participantCount < table.length ? table[participantCount] : undefined;
  return Math.min(points ?? ECONOMY.maxLeetPoints, ECONOMY.maxLeetPoints);
}

/** Bait each participant earns for a day on which `participantCount` players leeted. */
export function baitForDay(participantCount: number): number {
  return leetPointsForDay(participantCount) * ECONOMY.baitPerLeetPoint;
}
