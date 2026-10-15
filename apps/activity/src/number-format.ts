/**
 * Short whole numbers for tight spots (the words on a boss HP bar). Plain below 10,000 ("337", so the
 * dungeon's numbers never change), then thousands, millions or billions with at most one decimal:
 * "12.3K", "49.9M", "50M". The decimal is cut, never rounded up, so a boss that is not at full HP never
 * reads as full ("49,997,944" is "49.9M", not "50M"). Exact numbers belong in the spoken label.
 */
export function compactCount(n: number): string {
  const value = whole(n);
  return value < 10_000 ? String(value) : inUnit(value, unitOf(value));
}

/**
 * "current / max" for a bar, both in the unit `max` needs, so the two halves always read alike:
 * "7K / 10K", not "7000 / 10K", and "0.4M / 50M" late in a fight. Plain below 10,000 like
 * `compactCount`.
 */
export function compactPair(current: number, max: number): string {
  const top = whole(max);
  const now = whole(current);
  if (top < 10_000) return `${String(now)} / ${String(top)}`;
  const unit = unitOf(top);
  return `${inUnit(now, unit)} / ${inUnit(top, unit)}`;
}

type Unit = readonly [number, string];

function whole(n: number): number {
  return Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
}

function unitOf(value: number): Unit {
  return value >= 1_000_000_000
    ? [1_000_000_000, 'B']
    : value >= 1_000_000
      ? [1_000_000, 'M']
      : [1_000, 'K'];
}

function inUnit(value: number, [unit, letter]: Unit): string {
  const tenths = Math.floor(value / (unit / 10));
  const units = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${String(units)}${decimal === 0 ? '' : `.${String(decimal)}`}${letter}`;
}
