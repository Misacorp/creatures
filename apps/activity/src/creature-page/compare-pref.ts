/**
 * Whether the item picker compares: one setting per viewer, kept in the browser's storage (a convenience: where
 * storage is missing or blocked, which can happen inside Discord, the picker still works and starts with
 * the compare off). Off by default; a viewer who switches it on keeps it on.
 */

/** Where the setting is kept. */
export const COMPARE_KEY = 'creatures:picker-compare';

/** The stored setting; false unless the viewer switched it on. */
export function loadCompareOn(): boolean {
  try {
    return typeof localStorage === 'undefined' ? false : localStorage.getItem(COMPARE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCompareOn(on: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(COMPARE_KEY, on ? '1' : '0');
  } catch {
    // Storage is a convenience: when it is full or blocked the switch still works for this session.
  }
}
