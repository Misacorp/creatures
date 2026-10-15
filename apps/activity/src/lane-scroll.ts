import { keepSpanInView, scrollToSpan } from './raid-board';

/**
 * Scrolls a lane grid (the fight stage's party) sideways to show lanes `first` to `last` (from 0).
 * The grid's lane header holds one `[data-lane]` cell per lane, as wide as a tile, so a lane's place
 * is read from it. `follow` leaves the scroll alone while the lanes are already on screen with a
 * tile to spare at both ends; without it they are centred. `smooth` animates the move.
 */
export function scrollToLanes(
  scroller: HTMLElement | null,
  first: number,
  last: number,
  options: { smooth: boolean; follow: boolean },
): void {
  if (scroller === null) return;
  const lanes = scroller.querySelectorAll<HTMLElement>('[data-lane]');
  const a = lanes[first];
  const b = lanes[last];
  if (a === undefined || b === undefined) return;
  const box = scroller.getBoundingClientRect();
  const left = a.getBoundingClientRect().left - box.left + scroller.scrollLeft;
  const right = b.getBoundingClientRect().right - box.left + scroller.scrollLeft;
  const target = options.follow
    ? keepSpanInView(
        left,
        right,
        scroller.scrollLeft,
        scroller.clientWidth,
        scroller.scrollWidth,
        a.getBoundingClientRect().width,
      )
    : scrollToSpan(left, right, scroller.clientWidth, scroller.scrollWidth);
  if (target === Math.round(scroller.scrollLeft)) return;
  scroller.scrollTo({ left: target, behavior: options.smooth ? 'smooth' : 'auto' });
}
