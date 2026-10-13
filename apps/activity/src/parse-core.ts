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

export const isNullableInt = (value: unknown): value is number | null =>
  value === null || isInt(value);

export const isNullableStr = (value: unknown): value is string | null =>
  value === null || isStr(value);

/** An array in which every item passes `guard`. */
export const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);
