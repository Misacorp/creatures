/**
 * Short whole numbers for tight spots (the words on a boss HP bar). Plain below 10,000 ("337", so the
 * dungeon's numbers never change), then thousands, millions or billions with at most one decimal:
 * "12.3K", "49.9M", "50M". The decimal is cut, never rounded up, so a boss that is not at full HP never
 * reads as full ("49,997,944" is "49.9M", not "50M"). Exact numbers belong in the spoken label.
 */
export function compactCount(n: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  if (value < 10_000) return String(value);
  const [unit, letter] =
    value >= 1_000_000_000
      ? ([1_000_000_000, 'B'] as const)
      : value >= 1_000_000
        ? ([1_000_000, 'M'] as const)
        : ([1_000, 'K'] as const);
  const tenths = Math.floor(value / (unit / 10));
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${String(whole)}${decimal === 0 ? '' : `.${String(decimal)}`}${letter}`;
}
