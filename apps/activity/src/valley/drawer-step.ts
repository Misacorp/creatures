/**
 * Where a step that used to be a sheet opens (Misa, 2026-11-14: "no sheet over a drawer"): the Forge's item card (from the bag) and
 * the fire's numbers are steps of the panel that holds them, never the app's bottom `Drawer` over it. One switch, two looks:
 *
 * - `replace` (default): the step takes the place of the list in the same drawer (a page on a phone), with Back to the list; the
 *   list keeps its scroll.
 * - `beside`: on a wide window the step opens in the OTHER drawer (left list, right step: the side rule), the list staying put on
 *   the left; on a phone it is the same as `replace` (a phone shows one page).
 *
 * Read from the page's `?step=beside` once, so a screenshot of each look is a URL; `setStepPlace` is the tests' and the workbench's.
 */
export type StepPlace = 'replace' | 'beside';

export const DEFAULT_STEP_PLACE: StepPlace = 'replace';

export function stepPlaceOf(search: string): StepPlace {
  return new URLSearchParams(search).get('step') === 'beside' ? 'beside' : DEFAULT_STEP_PLACE;
}

let current: StepPlace | null = null;

export function stepPlace(): StepPlace {
  current ??= stepPlaceOf(typeof location === 'undefined' ? '' : location.search);
  return current;
}

/** Sets the look (null: read the page's address again). */
export function setStepPlace(place: StepPlace | null): void {
  current = place;
}

/** True when a step opens in the other drawer: only on a wide window and only for the `beside` look. */
export function stepBeside(wide: boolean): boolean {
  return wide && stepPlace() === 'beside';
}
