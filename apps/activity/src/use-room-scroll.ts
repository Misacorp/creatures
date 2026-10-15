/**
 * Scrolling of a living room that is wider than its window (phones): it starts centred on the
 * player's own spot, a mouse can drag it (touch scrolls natively), and left alone for a while it
 * pans slowly back and forth. Any pointer, wheel, key or scroll interaction stops the pan and
 * restarts the wait. No pan under reduced motion or while the page is hidden, and no animation
 * frame loop at all unless the room scrolls. While the player's own creature is being moved
 * (`holdStill`) the pan is off, and a mouse press that starts on that creature is its drag, not a scroll
 * (the creature's drag scrolls the room itself near an edge, see `use-drag-drop.ts`).
 */
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { initialScroll, panStep } from './room-layout';

/** How long the room must be left alone before it starts to pan. */
export const IDLE_PAN_WAIT_MS = 10_000;
/** A mouse must move this far (CSS px) before a press becomes a drag, so a tap still opens a creature. */
export const DRAG_THRESHOLD_PX = 6;

interface Options {
  /** The element that scrolls sideways. */
  viewport: RefObject<HTMLElement>;
  scrolling: boolean;
  scale: number;
  /** Left edge of the player's spot, in room pixels. Null: start at the left. */
  selfSpotX: number | null;
  roomPixelWidth: number;
  reducedMotion: boolean;
  /** True while a creature is carried or being placed: no idle pan. */
  holdStill: boolean;
}

export function useRoomScroll({
  viewport,
  scrolling,
  scale,
  selfSpotX,
  roomPixelWidth,
  reducedMotion,
  holdStill,
}: Options): void {
  const spotRef = useRef(selfSpotX);
  spotRef.current = selfSpotX;

  // Start centred on the player's own creature (again when the scale or the mode changes).
  useLayoutEffect(() => {
    const el = viewport.current;
    if (el === null) return;
    el.scrollLeft = scrolling
      ? initialScroll(spotRef.current ?? 0, scale, el.clientWidth, roomPixelWidth)
      : 0;
  }, [scrolling, scale, roomPixelWidth]);

  // Dragging with a mouse.
  useEffect(() => {
    const el = viewport.current;
    if (!scrolling || el === null) return undefined;
    let press: { x: number; scroll: number; id: number } | null = null;
    let dragging = false;
    let swallowClick = false;
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      // The player's own creature is dragged, not the room.
      if (event.target instanceof Element && event.target.closest('[data-draggable="true"]'))
        return;
      press = { x: event.clientX, scroll: el.scrollLeft, id: event.pointerId };
      dragging = false;
      swallowClick = false;
    };
    const onMove = (event: PointerEvent): void => {
      if (press === null || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x;
      if (!dragging && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!dragging) {
        dragging = true;
        el.setPointerCapture(event.pointerId);
        el.classList.add('dragging');
      }
      el.scrollLeft = press.scroll - dx;
    };
    const onUp = (event: PointerEvent): void => {
      if (press === null || event.pointerId !== press.id) return;
      if (dragging) {
        swallowClick = true;
        el.classList.remove('dragging');
        // The click that follows a drag must not open the creature under the pointer.
        setTimeout(() => {
          swallowClick = false;
        }, 0);
      }
      press = null;
      dragging = false;
    };
    const onClick = (event: MouseEvent): void => {
      if (!swallowClick) return;
      event.stopPropagation();
      event.preventDefault();
      swallowClick = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick, true);
      el.classList.remove('dragging');
    };
  }, [scrolling]);

  // The idle pan.
  useEffect(() => {
    const el = viewport.current;
    if (!scrolling || reducedMotion || holdStill || el === null) return undefined;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    // The fractional position and direction of the pan (the element's own scrollLeft is rounded).
    let position = el.scrollLeft;
    let direction: 1 | -1 = 1;
    let last = 0;

    const stop = (): void => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      if (wait !== undefined) clearTimeout(wait);
      wait = undefined;
    };
    const tick = (time: number): void => {
      const step = panStep(position, direction, el.scrollWidth - el.clientWidth, time - last);
      last = time;
      position = step.scrollLeft;
      direction = step.direction;
      el.scrollLeft = position;
      frame = requestAnimationFrame(tick);
    };
    const begin = (): void => {
      wait = undefined;
      position = el.scrollLeft;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    /** Stops any pan and waits again (never while the page is hidden). */
    const rest = (): void => {
      stop();
      if (!document.hidden) wait = setTimeout(begin, IDLE_PAN_WAIT_MS);
    };
    const onScroll = (): void => {
      // Our own steps move scrollLeft by less than a pixel from where we put it.
      if (frame !== 0 && Math.abs(el.scrollLeft - position) <= 1) return;
      rest();
    };
    const onVisibility = (): void => {
      rest();
    };
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
    for (const name of events) el.addEventListener(name, rest, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    rest();
    return () => {
      stop();
      for (const name of events) el.removeEventListener(name, rest);
      el.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scrolling, reducedMotion, holdStill]);
}
