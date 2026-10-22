/**
 * The building blocks of the strict shape checks that every API parser in the client is made of
 * (`api.ts`, `gear-parse.ts`, `expedition-parse.ts`, `dungeon-parse.ts`, `raid-api.ts`, `live-api.ts`
 * and `raid-channel.ts`). Pure type guards: an answer that does not match is an error, never a
 * half-drawn screen. None of them rejects unknown keys; that is how strict the client is.
 */

type Rec = Record<string, unknown>;

/** A plain object (not null, not an array). */
export const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isStr = (value: unknown): value is string => typeof value === 'string';

export const isBool = (value: unknown): value is boolean => typeof value === 'boolean';

/** A whole number (no fractions, no NaN, no Infinity). */
export const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** A whole number that is not negative. */
export const isCount = (value: unknown): value is number => isInt(value) && value >= 0;

/** A whole number above zero. */
export const isPositiveInt = (value: unknown): value is number => isInt(value) && value > 0;

/** A Guard's reach (`guardReachOf` of the engine): how many creatures it protects on each side, 0 to 3. */
export const isGuardReach = (value: unknown): value is { left: number; right: number } =>
  isRecord(value) &&
  isCount(value['left']) &&
  value['left'] <= 3 &&
  isCount(value['right']) &&
  value['right'] <= 3;

export const isNullableInt = (value: unknown): value is number | null =>
  value === null || isInt(value);

export const isNullableStr = (value: unknown): value is string | null =>
  value === null || isStr(value);

/** An array in which every item passes `guard`. */
export const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

/**
 * The entries of a list that pass `guard`, for a screen that should show what it can read: an entry that
 * does not pass is left out and logged (what it is called, its position and its id when it has one; never
 * its contents), so one odd item never blanks the whole screen. Null when `value` is not a list at all.
 */
export function keepReadable<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  what: string,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const kept: T[] = [];
  value.forEach((entry: unknown, index) => {
    if (guard(entry)) {
      kept.push(entry);
      return;
    }
    const id = isRecord(entry) && isStr(entry['id']) ? ` ${entry['id'].slice(0, 40)}` : '';
    console.error(`skipped an unreadable ${what} (number ${String(index + 1)}${id})`);
  });
  return kept;
}
