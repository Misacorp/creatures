/**
 * Catches earned when an expedition is claimed at `now`: floor(rolls x elapsed / total), with
 * elapsed clamped to [0, total]. A clock before the start gives 0, after the end gives all rolls.
 * All times are UTC epoch milliseconds.
 */
export function recallCatches(
  rolls: number,
  startedAt: number,
  endsAt: number,
  now: number,
): number {
  const total = endsAt - startedAt;
  if (!Number.isInteger(rolls) || rolls < 0) throw new RangeError('rolls must be an integer >= 0');
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('endsAt must be after startedAt');
  const elapsed = Math.min(Math.max(now - startedAt, 0), total);
  return Math.floor((rolls * elapsed) / total);
}
