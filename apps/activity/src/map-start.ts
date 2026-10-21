import { HUB } from './sprites/world-map-art';

/**
 * Where a map that scrolls starts: a place with a trip at home (to claim), else the place of the first
 * trip that is out, else the hub (Old Crossroads). `places` come from `mapPlaces`; `trips` are the trips
 * that are out, in order.
 */
export function startingPlace(
  places: readonly { id: string; home: boolean }[],
  trips: readonly { destination: string }[],
): string {
  return places.find((p) => p.home)?.id ?? trips[0]?.destination ?? HUB;
}

/** Scrolls `scroller` (no animation) so `target` is in the middle of it, as far as it can scroll. */
export function centerOn(scroller: HTMLElement, target: HTMLElement): void {
  if (typeof scroller.scrollTo !== 'function') return;
  const box = scroller.getBoundingClientRect();
  const at = target.getBoundingClientRect();
  scroller.scrollTo({
    left: scroller.scrollLeft + (at.left + at.width / 2) - (box.left + box.width / 2),
    top: scroller.scrollTop + (at.top + at.height / 2) - (box.top + box.height / 2),
    behavior: 'instant',
  });
}
