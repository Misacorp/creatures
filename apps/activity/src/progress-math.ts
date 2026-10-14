/**
 * How far along `value` is of `max`, as a percentage from 0 to 100 in steps of a tenth (rounded
 * down, so a bar never says "done" early and a long wait still moves smoothly). `value` is
 * clamped to `0..max`; a `max` that is zero, negative or not a number is 0%.
 */
export function percent(value: number, max: number): number {
  if (!(max > 0)) return 0;
  const clamped = Math.min(max, Math.max(0, value));
  // The tiny nudge undoes floating point error (`0.3 * 1000` is `299.99999999999994`).
  return Math.floor((clamped * 1000) / max + 1e-9) / 10;
}
