/**
 * Pointer-events drag and drop for the party row. It works the same with a mouse, a finger or a pen
 * (no HTML5 drag API, which does not work on phones). A press becomes a drag after a small
 * movement, so a plain tap still taps. The decisions live in `dnd-core.ts`, `raid-dnd.ts` and `dungeon-team.ts`; this
 * file only connects them to the browser: listeners, the ghost position, hit-testing and scrolling.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  SCROLL_EDGE,
  autoScrollSpeed,
  hitTest,
  holdMove,
  move,
  pageScrollSpeed,
  press,
  type DragPhase,
  type Point,
} from './dnd-core';
import { startsOnTag } from './glossary-ui';
import type { DropOutcome, DropTarget } from './slot-outcome';

/** Pixels around each slot that still count as "on" it, so the small gaps are not dead zones. */
const SLOT_SLOP = 6;
const SHAKE_MS = 450;

interface DragState {
  creatureId: string;
  over: DropTarget | null;
}

interface UseDragDropArgs {
  /** No drags can start while true (locked row, or a request in flight). */
  disabled: boolean;
  /** The strip holding the slots (`[data-slot]` buttons): the raid board scrolls sideways. */
  stripRef: RefObject<HTMLElement>;
  /** The team tray (the dungeon's): dropping a placed creature here takes it out. Absent: no tray. */
  trayRef?: RefObject<HTMLElement>;
  /**
   * Touch only: pick a creature up after the finger has rested on it this long (ms), and treat a
   * move before that as a scroll. Absent: a touch drags at once, as a mouse does (the dungeon).
   */
  touchHoldMs?: number;
  /** Called when a drag ends: `target` is null for a drop off the row or a cancel. */
  onDrop: (creatureId: string, target: DropTarget | null) => DropOutcome<unknown>;
}

export interface DragDrop {
  drag: DragState | null;
  /** The slot to shake after a refused drop. */
  shakeSlot: number | null;
  /** Position this element under the pointer while dragging (via CSS custom properties). */
  ghostRef: RefObject<HTMLDivElement>;
  /** Attach to `onPointerDown` of anything that can be picked up. */
  startDrag: (creatureId: string, event: PointerEvent) => void;
  /** True right after a drag, when the browser's follow-up click must be ignored. */
  consumeClick: () => boolean;
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && (a.kind !== 'slot' || (b.kind === 'slot' && a.slot === b.slot));
}

export function useDragDrop(args: UseDragDropArgs): DragDrop {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [shakeSlot, setShakeSlot] = useState<number | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(args);
  latest.current = args;
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const teardown = useRef<(() => void) | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function placeGhost(): void {
    const ghost = ghostRef.current;
    if (ghost === null) return;
    ghost.style.setProperty('--drag-x', `${String(pointer.current.x)}px`);
    ghost.style.setProperty('--drag-y', `${String(pointer.current.y)}px`);
  }

  // The ghost appears on the render after the lift; put it under the pointer straight away.
  useLayoutEffect(() => {
    if (drag !== null) placeGhost();
  }, [drag === null]);

  useEffect(
    () => () => {
      teardown.current?.();
      if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
    },
    [],
  );

  function locate(p: Point): DropTarget | null {
    const strip = latest.current.stripRef.current;
    if (strip !== null) {
      const box = strip.getBoundingClientRect();
      const inside =
        p.x >= box.left - SLOT_SLOP &&
        p.x <= box.right + SLOT_SLOP &&
        p.y >= box.top - SLOT_SLOP &&
        p.y <= box.bottom + SLOT_SLOP;
      if (inside) {
        const targets = [...strip.querySelectorAll<HTMLElement>('[data-slot]')].map((el) => ({
          id: Number(el.dataset.slot),
          rect: el.getBoundingClientRect(),
        }));
        const slot = hitTest(targets, p, SLOT_SLOP);
        if (slot !== null) return { kind: 'slot', slot };
      }
    }
    const tray = latest.current.trayRef?.current ?? null;
    if (tray !== null) {
      const t = tray.getBoundingClientRect();
      if (p.x >= t.left && p.x <= t.right && p.y >= t.top && p.y <= t.bottom) {
        return { kind: 'tray' };
      }
    }
    return null;
  }

  function startDrag(creatureId: string, event: PointerEvent): void {
    if (latest.current.disabled || !event.isPrimary) return;
    // A glossary tag never starts a drag: it opens on a tap, like any button.
    if (startsOnTag(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    teardown.current?.();

    const pointerId = event.pointerId;
    const source = event.currentTarget as HTMLElement;
    let state: DragPhase<string, DropTarget> = press(creatureId, {
      x: event.clientX,
      y: event.clientY,
    });
    pointer.current = { x: event.clientX, y: event.clientY };
    let frame = 0;
    // A finger on the raid board picks a creature up only after a short hold, so a swipe still scrolls.
    const holdMs = latest.current.touchHoldMs;
    const holdToDrag = holdMs !== undefined && event.pointerType === 'touch';
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshOver = (): void => {
      const current = state;
      if (current.phase !== 'dragging') return;
      const over = locate(pointer.current);
      state = { ...current, over };
      setDrag((shown) =>
        shown !== null && sameTarget(shown.over, over) ? shown : { creatureId, over },
      );
    };

    const finish = (target: DropTarget | null | 'cancel'): void => {
      const wasDragging = state.phase === 'dragging';
      stop();
      if (!wasDragging) return;
      const outcome = latest.current.onDrop(creatureId, target === 'cancel' ? null : target);
      if (outcome.status === 'invalid' && target !== null && target !== 'cancel') {
        if (target.kind === 'slot') {
          setShakeSlot(target.slot);
          if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
          shakeTimer.current = setTimeout(() => {
            setShakeSlot(null);
          }, SHAKE_MS);
        }
      }
    };

    /** The press becomes a drag: the creature is lifted, the pointer is captured and the ghost follows. */
    const lift = (next: DragPhase<string, DropTarget>): void => {
      suppressClick.current = true;
      try {
        source.setPointerCapture(pointerId);
      } catch {
        // The pointer may already be gone; the window listeners still work.
      }
      window.getSelection()?.removeAllRanges();
      const over = locate(pointer.current);
      state = next.phase === 'dragging' ? { ...next, over } : next;
      setDrag({ creatureId, over });
      frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (holdToDrag && state.phase === 'pending') {
        // Moved before the hold was over: a swipe. Let go, and the browser scrolls.
        if (holdMove(state.start, pointer.current) === 'swipe') stop();
        return;
      }
      const before = state.phase;
      const next = move(state, pointer.current, null);
      state = next;
      if (next.phase !== 'dragging') return;
      if (before === 'pending') {
        lift(next);
        return;
      }
      placeGhost();
      refreshOver();
    };

    // While a creature is carried by a finger the page must not scroll under it.
    const onTouchMove = (e: TouchEvent): void => {
      if (state.phase === 'dragging' && e.cancelable) e.preventDefault();
    };

    const onUp = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      const target = state.phase === 'dragging' ? locate(pointer.current) : null;
      finish(target);
    };

    const onCancel = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) finish('cancel');
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish('cancel');
    };

    // Stop the long-press menu on phones while dragging.
    const onContext = (e: Event): void => {
      if (state.phase === 'dragging') e.preventDefault();
    };

    // Near the top or bottom edge of the window the page scrolls, and near the left or right edge of
    // a board that scrolls sideways (the raid's) the board does; the slots are measured again.
    function tick(): void {
      frame = requestAnimationFrame(tick);
      if (state.phase !== 'dragging') return;
      // Whole pixels, at least one, or slow edge speeds would round to nothing.
      const whole = (speed: number): number =>
        Math.sign(speed) * Math.max(1, Math.round(Math.abs(speed)));
      const speed = pageScrollSpeed(pointer.current.y, window.innerHeight, SCROLL_EDGE);
      if (speed !== 0) window.scrollBy(0, whole(speed));
      let sideways = 0;
      const strip = latest.current.stripRef.current;
      if (strip !== null && strip.scrollWidth > strip.clientWidth) {
        const box = strip.getBoundingClientRect();
        if (pointer.current.y >= box.top && pointer.current.y <= box.bottom) {
          sideways = autoScrollSpeed(pointer.current.x, box.left, box.right, SCROLL_EDGE);
          if (sideways !== 0) strip.scrollLeft += whole(sideways);
        }
      }
      if (speed !== 0 || sideways !== 0) refreshOver();
    }

    function stop(): void {
      if (holdTimer !== null) clearTimeout(holdTimer);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
      cancelAnimationFrame(frame);
      try {
        source.releasePointerCapture(pointerId);
      } catch {
        // Not captured, or already released.
      }
      state = { phase: 'idle' };
      setDrag(null);
      teardown.current = null;
      // The click that follows a drag arrives straight after pointerup; let it pass, then re-arm.
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    if (holdToDrag) {
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      holdTimer = setTimeout(() => {
        if (state.phase === 'pending')
          lift({ ...state, phase: 'dragging', at: pointer.current, over: null });
      }, holdMs);
    }
    teardown.current = stop;
  }

  return {
    drag,
    shakeSlot,
    ghostRef,
    startDrag,
    consumeClick: () => suppressClick.current,
  };
}
