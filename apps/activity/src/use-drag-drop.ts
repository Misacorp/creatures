/**
 * Pointer-events drag and drop for the party row. It works the same with a mouse, a finger or a pen
 * (no HTML5 drag API, which does not work on phones). A press becomes a drag after a small
 * movement, so a plain tap still taps. The decisions live in `dnd-core.ts` and `raid-dnd.ts`; this
 * file only connects them to the browser: listeners, the ghost position, hit-testing and scrolling.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  SCROLL_EDGE,
  hitTest,
  move,
  pageScrollSpeed,
  press,
  type DragPhase,
  type Point,
} from './dnd-core';
import type { DropOutcome, DropTarget } from './raid-dnd';

/** Pixels around each slot that still count as "on" it, so the small gaps are not dead zones. */
const SLOT_SLOP = 6;
const SHAKE_MS = 450;

export interface DragState {
  creatureId: string;
  over: DropTarget | null;
}

export interface UseDragDropArgs {
  /** No drags can start while true (locked row, or a request in flight). */
  disabled: boolean;
  /** The strip holding the slots (`[data-slot]` buttons), one row for each zone. */
  stripRef: RefObject<HTMLElement>;
  /** The team tray: dropping a placed creature here unplaces it. */
  trayRef: RefObject<HTMLElement>;
  /** Called when a drag ends: `target` is null for a drop off the row or a cancel. */
  onDrop: (creatureId: string, target: DropTarget | null) => DropOutcome;
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
    const tray = latest.current.trayRef.current;
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

    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      const before = state.phase;
      const next = move(state, pointer.current, null);
      state = next;
      if (next.phase !== 'dragging') return;
      if (before === 'pending') {
        suppressClick.current = true;
        try {
          source.setPointerCapture(pointerId);
        } catch {
          // The pointer may already be gone; the window listeners still work.
        }
        window.getSelection()?.removeAllRanges();
        const over = locate(pointer.current);
        state = { ...next, over };
        setDrag({ creatureId, over });
        frame = requestAnimationFrame(tick);
        return;
      }
      placeGhost();
      refreshOver();
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

    // The zones are rows, so a tall party can be longer than the screen: near the top or bottom
    // edge of the window the page scrolls, and the slots are measured again.
    function tick(): void {
      frame = requestAnimationFrame(tick);
      if (state.phase !== 'dragging') return;
      const speed = pageScrollSpeed(pointer.current.y, window.innerHeight, SCROLL_EDGE);
      if (speed === 0) return;
      // Whole pixels, at least one, or slow edge speeds would round to nothing.
      window.scrollBy(0, Math.sign(speed) * Math.max(1, Math.round(Math.abs(speed))));
      refreshOver();
    }

    function stop(): void {
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
