import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { placePopover } from './popover-place';

/** The gap between the trigger and its panel, and the room kept to the window's edges, in px. */
const GAP = 4;
const EDGE = 8;
/** Less room than this on both sides and the trigger is scrolled to the middle of the window first, in px. */
const MIN_ROOM = 200;

interface DropListProps {
  /** The trigger the panel hangs from: it sets the panel's left edge and width, and gets the focus back. */
  anchor: () => HTMLElement | null;
  /** Closes the panel (Escape, Tab or a tap outside it). */
  onClose: () => void;
  /** Extra class on the panel (the look of one list). */
  class?: string;
  /** The listbox. It takes the focus itself when it opens (and scrolls its picked row into view). */
  children: ComponentChildren;
}

/**
 * The one dropdown panel of the game (a pick-one list opened from a page, `docs/design/ux-patterns.md`): a bare
 * scrolling panel directly under its trigger (above it when there is no room below), as wide as the trigger, kept
 * `EDGE` px inside the window, at most half the window high. No title, no Close button, no backdrop. Escape, a tap
 * outside it (and outside the trigger, whose own tap toggles) or Tab closes it, and focus goes back to the trigger.
 * It is placed with `placePopover` (the popover's side and edge maths) and the place is written as CSS custom
 * properties (`--drop-x`, `--drop-y`, `--drop-w`, `--drop-max`), worked out again whenever the window resizes or
 * anything scrolls. Inside a drawer a choice is a drill-in view instead, never a dropdown over a drawer.
 */
export function DropList(props: DropListProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  function place(opening = false): void {
    const panel = panelRef.current;
    const target = latest.current.anchor();
    if (panel == null || target === null || typeof window === 'undefined') return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    if (!Number.isFinite(winW) || !Number.isFinite(winH)) return;
    let a = target.getBoundingClientRect();
    const roomsOf = (box: { top: number; height: number }) => ({
      below: winH - (box.top + box.height) - GAP - EDGE,
      above: box.top - GAP - EDGE,
    });
    // A trigger at the very edge of the window has no room for a list on either side: bring it into view first.
    if (opening && Math.max(roomsOf(a).below, roomsOf(a).above) < MIN_ROOM) {
      target.scrollIntoView?.({ block: 'center' });
      a = target.getBoundingClientRect();
    }
    const width = Math.min(a.width, winW - 2 * EDGE);
    const rooms = roomsOf(a);
    const natural = panel.scrollHeight || panel.offsetHeight || 0;
    const wanted = Math.min(natural, Math.round(winH / 2));
    // Below when the list fits there (or there is more room below than above), else above; never over the trigger.
    const side = rooms.below >= wanted || rooms.below >= rooms.above ? 'below' : 'above';
    const room = Math.max(0, Math.floor(side === 'below' ? rooms.below : rooms.above));
    const maxHeight = Math.min(Math.round(winH / 2), room);
    panel.style.setProperty('--drop-max', `${String(maxHeight)}px`);
    const at = placePopover(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { left: 0, top: 0, width: winW, height: winH },
      { width, height: Math.min(wanted, maxHeight) },
      { gap: GAP, margin: EDGE, prefer: side },
    );
    panel.style.setProperty('--drop-x', `${String(Math.round(a.left + at.x))}px`);
    panel.style.setProperty('--drop-y', `${String(Math.round(a.top + at.y))}px`);
    panel.style.setProperty('--drop-w', `${String(Math.round(width))}px`);
    panel.setAttribute('data-placement', at.placement);
  }

  // Before the browser paints, so the panel never shows in the wrong place (and before the list scrolls to its row).
  useLayoutEffect(() => {
    place(true);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return undefined;
    const onMove = (): void => {
      place();
    };
    let tappedOutside = false;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') latest.current.onClose();
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (panel.contains(target) || latest.current.anchor()?.contains(target) === true) return;
      tappedOutside = true;
      latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      // Back to the trigger after a pick, Escape or Tab; a tap elsewhere has already moved focus on.
      const active = document.activeElement;
      if (
        !tappedOutside &&
        (active === null || active === document.body || panel.contains(active))
      ) {
        latest.current.anchor()?.focus();
      }
    };
  }, []);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    }
  }

  return (
    <div
      ref={panelRef}
      class={['drop-panel', 'pix-panel', props.class].filter((c) => c !== undefined).join(' ')}
      onKeyDown={onKeyDown}
    >
      {props.children}
    </div>
  );
}
