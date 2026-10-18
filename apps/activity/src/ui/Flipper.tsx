import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  canStep,
  classifyMove,
  dragOffset,
  flipAnnouncement,
  flipLabel,
  startsOnBlocked,
  stepOfSwipe,
  swipeAllowed,
  swipeOutcome,
  type FlipProps,
  type FlipStep,
} from './flip-logic';
import { tryFlip } from './flip-keys';
import { LiveRegion } from './LiveRegion';

/** A pixel arrow head, drawn with squares so it stays sharp; it points left for the previous thing. */
function Arrow({ step }: { step: FlipStep }) {
  const left = step < 0;
  return (
    <svg class="flip-arrow" viewBox="0 0 4 7" aria-hidden="true" shape-rendering="crispEdges">
      <rect x={left ? 3 : 0} y="0" width="1" height="1" />
      <rect x={left ? 2 : 1} y="1" width="1" height="1" />
      <rect x={left ? 1 : 2} y="2" width="1" height="1" />
      <rect x={left ? 0 : 3} y="3" width="1" height="1" />
      <rect x={left ? 1 : 2} y="4" width="1" height="1" />
      <rect x={left ? 2 : 1} y="5" width="1" height="1" />
      <rect x={left ? 3 : 0} y="6" width="1" height="1" />
    </svg>
  );
}

/**
 * The flip controls: a previous arrow, the position ("3 / 12", small and quiet) and a next arrow. The
 * same on the creature page and in the item drawers. The buttons name where they lead ("Previous
 * creature: Cindle") and, at the first or last thing, say so by `aria-disabled` rather than `disabled`,
 * so a keyboard user who flipped to the end keeps the focus where it was. Draws nothing for fewer than
 * two things. One look everywhere: a full-width row, previous at the left, next at the right.
 */
export function FlipNav({ flip }: { flip: FlipProps }) {
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  // Drawn anew after a flip by a button: that button takes the focus back.
  useEffect(() => {
    if (flip.focusButton === undefined || flip.focusButton === null) return;
    (flip.focusButton < 0 ? prev : next).current?.focus({ preventScroll: true });
  }, []);
  if (flip.count < 2) return null;
  const button = (step: FlipStep, ref: typeof prev) => {
    const available = canStep(step, flip.index, flip.count);
    return (
      <button
        type="button"
        ref={ref}
        class="flip-btn"
        aria-label={flipLabel(step, flip.noun, step < 0 ? flip.prevName : flip.nextName)}
        aria-disabled={available ? undefined : 'true'}
        onClick={() => {
          tryFlip(flip, step, 'button');
        }}
      >
        <Arrow step={step} />
      </button>
    );
  };
  return (
    <div class="flip-nav" role="group" aria-label={`Flip between ${flip.noun}s`}>
      {button(-1, prev)}
      <span class="flip-count pix">
        {flip.index + 1} / {flip.count}
      </span>
      {button(1, next)}
    </div>
  );
}

/** Where a gesture began and what it has become. */
interface Gesture {
  id: number;
  x: number;
  y: number;
  at: number;
  /** `undecided` until the finger has gone far enough to tell a sideways swipe from a scroll. */
  mode: 'undecided' | 'swipe';
}

/**
 * The area that flips with a swipe: put the detail of one thing inside it (the creature page, an item's
 * card). A swipe left shows the next thing and a swipe right the previous one; only a clearly
 * horizontal move counts, so vertical scrolling works as always (`touch-action: pan-y`) and a tap on a
 * button is still a tap. A swipe that starts in a text field, a list or a slider (or a part marked
 * `data-no-flip`) is left alone. The content follows the finger; at the first or last thing it only
 * gives a little, like a rubber band, and settles back. The thing that appears slides in briefly (not at
 * all with reduced motion). Pointer events: a finger or pen, and the mouse only when `flip.pointers` is
 * `"any"`.
 */
export function FlipArea({
  flip,
  class: extra,
  children,
}: {
  /** Without it (one thing only) the content is drawn as it is. */
  flip: FlipProps | undefined;
  class?: string | undefined;
  children: ComponentChildren;
}) {
  return flip === undefined ? (
    <>{children}</>
  ) : (
    <SwipeArea flip={flip} class={extra}>
      {children}
    </SwipeArea>
  );
}

function SwipeArea({
  flip,
  class: extra,
  children,
}: {
  flip: FlipProps;
  class?: string | undefined;
  children: ComponentChildren;
}) {
  const slide = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallow = useRef(false);
  const flipRef = useRef(flip);
  flipRef.current = flip;

  // Where the shown thing came from: the owner says, or it follows from the index changing.
  const seen = useRef({ index: flip.index, enter: null as FlipStep | null });
  if (seen.current.index !== flip.index) {
    seen.current = { index: flip.index, enter: stepOfSwipe(seen.current.index - flip.index) };
  }
  const enter = flip.enter === undefined ? seen.current.enter : flip.enter;

  function settle(): void {
    const el = slide.current;
    if (el === null) return;
    el.classList.remove('flipping');
    el.style.setProperty('--flip-x', '0px');
  }

  function down(event: JSX.TargetedPointerEvent<HTMLDivElement>): void {
    swallow.current = false;
    const current = flipRef.current;
    if (current.count < 2 || !event.isPrimary) return;
    if (!swipeAllowed(event.pointerType, current.pointers ?? 'touch')) return;
    if (startsOnBlocked(event.target, event.currentTarget)) return;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: event.timeStamp,
      mode: 'undecided',
    };
  }

  function move(event: JSX.TargetedPointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (g === null || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.mode === 'undecided') {
      const axis = classifyMove(dx, dy);
      if (axis === 'undecided') return;
      if (axis === 'vertical') {
        // A scroll: the browser has it, and this gesture is not ours any more.
        gesture.current = null;
        return;
      }
      g.mode = 'swipe';
      // The finger keeps steering even when it leaves the area.
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      slide.current?.classList.add('flipping');
    }
    const current = flipRef.current;
    const offset = dragOffset(
      dx,
      canStep(stepOfSwipe(dx), current.index, current.count),
      event.currentTarget.getBoundingClientRect().width,
    );
    slide.current?.style.setProperty('--flip-x', `${String(offset)}px`);
  }

  function up(event: JSX.TargetedPointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (g === null || g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.mode !== 'swipe') return;
    // A swipe that began on a button must not also press it.
    swallow.current = true;
    settle();
    const step = swipeOutcome(
      event.clientX - g.x,
      event.clientY - g.y,
      event.timeStamp - g.at,
      event.currentTarget.getBoundingClientRect().width,
    );
    if (step !== 0) tryFlip(flipRef.current, step, 'swipe');
  }

  function cancel(event: JSX.TargetedPointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (g === null || g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.mode === 'swipe') settle();
  }

  return (
    <div
      class={`flip-area${extra === undefined ? '' : ` ${extra}`}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClickCapture={(event) => {
        if (!swallow.current) return;
        swallow.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <div
        class="flip-slide"
        ref={slide}
        key={`${String(flip.index)}|${flip.name}`}
        {...(enter === null ? {} : { 'data-enter': enter > 0 ? 'next' : 'prev' })}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * What a screen reader hears after a flip ("Cindle, 3 / 12"), politely. It must stay drawn while the
 * thing changes (a new live region is not announced), so it sits in the part that does not change: the
 * Drawer, the Creatures tab. It says nothing when it first appears.
 */
export function FlipLive({ flip }: { flip: FlipProps }) {
  const last = useRef(`${String(flip.index)}|${flip.name}`);
  const [text, setText] = useState('');
  const key = `${String(flip.index)}|${flip.name}`;
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    setText(flipAnnouncement(flip.name, flip.index, flip.count));
  }, [key]);
  return <LiveRegion>{text}</LiveRegion>;
}
