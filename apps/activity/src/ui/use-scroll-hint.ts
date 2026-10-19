/**
 * The scroll hint: tells a player that a box scrolls without a scrollbar. When the content of the box overflows,
 * it waits (`delayMs`, 2.5 s), then moves the content down very slowly (`speed`, 12 px a second, one
 * `requestAnimationFrame` at a time) until the bottom, and stops. It is over for that content the moment the
 * player does anything with the box: a pointer or touch press, the wheel, a key, focus inside it, or a scroll
 * the hint did not cause. It never scrolls back up. Each new `contentKey` (another item, another page) starts
 * it again from the top, every time, with no memory of what the player did before.
 *
 * `useScrollHint(ref, contentKey, options)` returns whether there is more below the visible part, for a fade at
 * the bottom edge (`ScrollHint.tsx` draws it). Where the player asks for less motion
 * (`prefers-reduced-motion: reduce`, or `options.reducedMotion`) nothing is scrolled, the fade is the hint.
 * A box whose content fits does no work at all. Timers, frames and listeners are cleaned up when the content
 * changes and when the box goes away.
 *
 * Reuse: put a ref on the scrolling element (it needs `overflow-y: auto` and a height limit), pass anything that
 * changes when its content does as `contentKey`. Or use the `ScrollHint` component, which does both.
 */
import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  SCROLL_HINT_DELAY_MS,
  SCROLL_HINT_INTERACTIONS,
  SCROLL_HINT_SPEED,
  hasMoreBelow,
  isOwnScroll,
  maxScroll,
  nextScrollTop,
  overflows,
} from './scroll-hint-logic';

export interface ScrollHintOptions {
  /** Rest before the hint starts, in ms. Default 2500. */
  delayMs?: number;
  /** Pixels a second. Default 12. */
  speed?: number;
  /** Force "less motion" on or off (the default asks the browser). */
  reducedMotion?: boolean;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

/** Runs the hint on the element of `ref`; true while there is more content below. */
export function useScrollHint(
  ref: RefObject<HTMLElement | null>,
  contentKey: unknown,
  options: ScrollHintOptions = {},
): boolean {
  const { delayMs = SCROLL_HINT_DELAY_MS, speed = SCROLL_HINT_SPEED, reducedMotion } = options;
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    // New content starts at the top, whatever the last one left behind.
    if (el.scrollTop !== 0) el.scrollTop = 0;
    const calm = reducedMotion ?? prefersReducedMotion();
    let stopped = false;
    let listening = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let position = 0;
    let expected = 0;
    let last: number | undefined;

    const refresh = (): void => {
      setMore(hasMoreBelow(el));
    };
    const stop = (): void => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      if (listening) {
        for (const type of SCROLL_HINT_INTERACTIONS) el.removeEventListener(type, stop);
        listening = false;
      }
    };
    const onScroll = (): void => {
      // A scroll the hint did not cause is the player's: the hint is over.
      if (!stopped && !isOwnScroll(el.scrollTop, expected)) stop();
      refresh();
    };
    const tick = (time: number): void => {
      frame = 0;
      if (stopped) return;
      if (last !== undefined) {
        const max = maxScroll(el);
        position = nextScrollTop(position, time - last, speed, max);
        el.scrollTop = position;
        expected = el.scrollTop;
        if (position >= max) {
          stop();
          refresh();
          return;
        }
      }
      last = time;
      frame = requestAnimationFrame(tick);
    };
    const begin = (): void => {
      timer = undefined;
      if (stopped || !overflows(el)) return;
      position = el.scrollTop;
      expected = el.scrollTop;
      last = undefined;
      frame = requestAnimationFrame(tick);
    };

    refresh();
    el.addEventListener('scroll', onScroll, { passive: true });
    if (!calm && overflows(el)) {
      for (const type of SCROLL_HINT_INTERACTIONS) {
        el.addEventListener(type, stop, { passive: true });
      }
      listening = true;
      timer = setTimeout(begin, delayMs);
    }
    return () => {
      stop();
      el.removeEventListener('scroll', onScroll);
    };
  }, [ref, contentKey, delayMs, speed, reducedMotion]);
  return more;
}
