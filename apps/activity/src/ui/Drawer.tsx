import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { dragOutcome, focusablesIn, trapTarget } from './drawer-logic';
import { handleFlipKey } from './flip-keys';
import type { FlipProps } from './flip-logic';
import { FlipLive, FlipNav } from './Flipper';

export interface DrawerProps {
  /** Whether the sheet is up. Closed, nothing is drawn and the focus goes back to where it was. */
  open: boolean;
  /** Asked for by the backdrop, the drag handle (a tap or a pull down), Escape and the close button. */
  onClose: () => void;
  /** The heading of the sheet; it also names the dialog for screen readers. Plain text. */
  title: string;
  /** The heading is only spoken, not shown (the body starts with its own name, an item card). */
  titleHidden?: boolean | undefined;
  /** A short note on the right of the heading ("12 / 20"). Optional. */
  meta?: string | undefined;
  /** Pinned under the heading, does not scroll (a search field and its chips). */
  toolbar?: ComponentChildren | undefined;
  /** The body; it scrolls when it is taller than the sheet. */
  children: ComponentChildren;
  /** Pinned at the bottom, does not scroll (a detail panel and its button). */
  footer?: ComponentChildren | undefined;
  /**
   * The control to give the focus back to on close, usually the slot that was tapped. A tap on a phone
   * does not always focus a button, so the caller names it; without it the element focused at opening is used.
   */
  returnFocusTo?: HTMLElement | null | undefined;
  /**
   * Makes the sheet flip between things (the items of a bag): the previous and next arrows with the
   * position sit in the heading row, Left and Right flip while the sheet is up, and a screen reader hears
   * the new thing. The content swipes only where it is wrapped in a `FlipArea`.
   */
  flip?: FlipProps | undefined;
  /** Where it is used (extra look for one place). */
  class?: string | undefined;
}

/**
 * The pixel X (seven squares by seven) of a close button: the drawer's own close button (shown to the keyboard
 * only, no drawer shows an X) and the close button of a detail panel inside a drawer (the item picker's).
 */
export function CloseGlyph() {
  return (
    <svg class="drawer-x" viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="0" width="1" height="1" />
      <rect x="1" y="1" width="1" height="1" />
      <rect x="2" y="2" width="1" height="1" />
      <rect x="3" y="3" width="1" height="1" />
      <rect x="4" y="4" width="1" height="1" />
      <rect x="5" y="5" width="1" height="1" />
      <rect x="6" y="6" width="1" height="1" />
      <rect x="6" y="0" width="1" height="1" />
      <rect x="5" y="1" width="1" height="1" />
      <rect x="4" y="2" width="1" height="1" />
      <rect x="2" y="4" width="1" height="1" />
      <rect x="1" y="5" width="1" height="1" />
      <rect x="0" y="6" width="1" height="1" />
    </svg>
  );
}

/** True when `node` is `ancestor` or sits inside it (plain `parentNode` steps, so the fake DOM works too). */
function isInside(ancestor: unknown, node: unknown): boolean {
  for (let current = node; current !== null && current !== undefined;) {
    if (current === ancestor) return true;
    current = (current as { parentNode?: unknown }).parentNode;
  }
  return false;
}

/**
 * A bottom drawer: a sheet that slides up from the bottom edge over a backdrop that dims the app. It is a
 * modal dialog: the focus moves into it, Tab stays inside it, and closing gives the focus back to the
 * control that opened it. It closes by a tap on the backdrop, a tap or a pull down on the drag handle,
 * Escape (which does not reach the page behind) and the close button. It is drawn where it is placed and
 * is `position: fixed`, so put it anywhere inside the screen that owns it.
 */
export function Drawer({ open, ...rest }: DrawerProps) {
  return open ? <DrawerSheet {...rest} /> : null;
}

function DrawerSheet({
  onClose,
  title,
  titleHidden = false,
  meta,
  toolbar,
  children,
  footer,
  returnFocusTo,
  flip,
  class: extra,
}: Omit<DrawerProps, 'open'>) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; at: number; id: number } | null>(null);
  const swallowClick = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus into the sheet when it opens; back to the opener when it goes.
  useEffect(() => {
    const before = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    panel.current?.focus({ preventScroll: true });
    return () => {
      before?.focus({ preventScroll: true });
    };
  }, []);

  // A flip that drew the thing anew may have removed the control that had the focus: the sheet takes it,
  // so the arrow keys keep working.
  const flipIndex = flip?.index;
  useEffect(() => {
    const root = panel.current;
    if (flipIndex === undefined || root === null) return;
    if (!isInside(root, document.activeElement)) root.focus({ preventScroll: true });
  }, [flipIndex]);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // A modal sheet keeps the arrow keys from the page behind it (which may flip too).
      handleFlipKey(event, flip);
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      // Only this sheet closes: the page around it must not also go back.
      event.stopPropagation();
      event.preventDefault();
      closeRef.current();
      return;
    }
    if (event.key !== 'Tab' || panel.current === null) return;
    const root = panel.current;
    const target = trapTarget(
      focusablesIn(root),
      document.activeElement as HTMLElement | null,
      event.shiftKey,
      (el) => isInside(root, el),
    );
    if (target !== null) {
      event.preventDefault();
      target.focus();
    }
  }

  function press(event: JSX.TargetedPointerEvent<HTMLButtonElement>): void {
    drag.current = { y: event.clientY, at: event.timeStamp, id: event.pointerId };
    swallowClick.current = false;
    // The finger keeps steering the sheet even when it leaves the handle.
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    panel.current?.classList.add('dragging');
  }

  function move(event: JSX.TargetedPointerEvent<HTMLButtonElement>): void {
    const start = drag.current;
    if (start === null || start.id !== event.pointerId) return;
    // Only downwards: the sheet follows the finger and never lifts off the bottom edge.
    panel.current?.style.setProperty('--drag', `${String(Math.max(0, event.clientY - start.y))}px`);
  }

  function release(event: JSX.TargetedPointerEvent<HTMLButtonElement>): void {
    const start = drag.current;
    if (start === null || start.id !== event.pointerId) return;
    drag.current = null;
    const sheet = panel.current;
    sheet?.classList.remove('dragging');
    sheet?.style.setProperty('--drag', '0px');
    const outcome = dragOutcome(
      event.clientY - start.y,
      event.timeStamp - start.at,
      sheet?.offsetHeight ?? 0,
    );
    // A pull that ends the gesture also fires a click on the handle: that one must not close twice.
    swallowClick.current = outcome !== 'tap';
    if (outcome === 'close') closeRef.current();
  }

  return (
    <div class="drawer-layer" onKeyDown={onKeyDown}>
      <div
        class="drawer-backdrop"
        aria-hidden="true"
        onClick={() => {
          closeRef.current();
        }}
      />
      <div
        class={`drawer-panel${titleHidden ? ' title-hidden' : ''}${flip === undefined || flip.paused === true ? '' : ' has-flip'}${extra === undefined ? '' : ` ${extra}`}`}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div class="drawer-top">
          <button
            type="button"
            class="drawer-handle"
            tabIndex={-1}
            aria-hidden="true"
            onPointerDown={press}
            onPointerMove={move}
            onPointerUp={release}
            onPointerCancel={release}
            onClick={() => {
              if (swallowClick.current) {
                swallowClick.current = false;
                return;
              }
              closeRef.current();
            }}
          >
            <span class="drawer-grip" />
          </button>
          <div class="drawer-head">
            <h2 id={titleId} class={titleHidden ? 'visually-hidden' : 'drawer-title'}>
              {title}
            </h2>
            {meta !== undefined && <span class="drawer-meta muted">{meta}</span>}
            <button type="button" class="drawer-close" aria-label="Close" onClick={onClose}>
              <CloseGlyph />
            </button>
          </div>
        </div>
        {flip !== undefined && flip.paused !== true && (
          <div class="drawer-flip">
            <FlipNav flip={flip} />
          </div>
        )}
        {toolbar !== undefined && <div class="drawer-toolbar">{toolbar}</div>}
        <div class="drawer-body">{children}</div>
        {footer !== undefined && <div class="drawer-footer">{footer}</div>}
        {flip !== undefined && flip.paused !== true && <FlipLive flip={flip} />}
      </div>
    </div>
  );
}
