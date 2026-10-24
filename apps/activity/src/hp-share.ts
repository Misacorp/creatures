/** The share of HP left, 0 to 1 (more than full counts as full; no maximum counts as empty). */
export function hpShare(current: number, max: number): number {
  return max <= 0 ? 0 : Math.max(0, Math.min(1, current / max));
}
