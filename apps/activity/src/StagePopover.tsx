import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { placePopover } from './stage-abilities';

export interface StagePopoverProps {
  /** The element the popover points at (a creature, the basic ability chip or the "?" button). */
  anchor: () => HTMLElement | null;
  /** The dialog's name for assistive technology. */
  label: string;
  /** Closes the popover (Escape, or a tap outside it). */
  onClose: () => void;
  /** What Escape does instead of closing (a popover with two faces goes back first). */
  onEscape?: () => void;
  class?: string;
  children: ComponentChildren;
}

/**
 * A small popover inside the fight stage (its parent must be the stage, which is `position:
 * relative`; the glossary's page-level variant uses a fixed full-window layer as that parent). It sits above its anchor with a pointer arrow, flips below when there is no room above,
 * and is kept inside the stage's bounds. The place is written as CSS custom properties (`--pop-x`,
 * `--pop-y`, `--pop-arrow`) with `style.setProperty`, so no inline style attribute is needed, and it
 * is worked out again after every render and whenever the window or the popover changes size.
 * Focus moves into it when it opens and goes back to the anchor when it closes; Escape or a tap
 * outside closes it.
 */
export function StagePopover(props: StagePopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  function place(): void {
    const pop = popRef.current;
    const target = latest.current.anchor();
    const stage = pop?.parentElement;
    if (pop == null || target === null || stage == null) return;
    const a = target.getBoundingClientRect();
    const b = stage.getBoundingClientRect();
    // The stage's padding box is what an absolutely positioned child is measured from.
    const originLeft = b.left + stage.clientLeft;
    const originTop = b.top + stage.clientTop;
    const at = placePopover(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { left: originLeft, top: originTop, width: stage.clientWidth, height: stage.clientHeight },
      { width: pop.offsetWidth, height: pop.offsetHeight },
    );
    pop.style.setProperty('--pop-x', `${String(Math.round(a.left + at.x - originLeft))}px`);
    pop.style.setProperty('--pop-y', `${String(Math.round(a.top + at.y - originTop))}px`);
    pop.style.setProperty('--pop-arrow', `${String(Math.round(at.arrowX))}px`);
    pop.dataset['placement'] = at.placement;
  }

  // Before the browser paints, so the popover never shows in the wrong place.
  useLayoutEffect(place);

  useEffect(() => {
    const pop = popRef.current;
    if (pop === null) return undefined;
    (pop.querySelector<HTMLElement>('button:not(:disabled)') ?? pop).focus();

    let tappedOutside = false;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const { onEscape, onClose } = latest.current;
      (onEscape ?? onClose)();
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (target === null) return;
      if (pop.contains(target) || latest.current.anchor()?.contains(target) === true) return;
      // A glossary popover opened from a tag inside this one is not "outside" it.
      if (target instanceof Element && target.closest('.glossary-layer') !== null) return;
      tappedOutside = true;
      latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', place);
    // A popover on a page (the glossary's) must follow its anchor when the page or a list scrolls.
    window.addEventListener('scroll', place, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(pop);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer?.disconnect();
      // Closing with the keyboard or after an action: focus goes back to what opened it (also when
      // it was lost because the button that had it was switched off). A tap elsewhere has already
      // moved focus on, and is left alone.
      const active = document.activeElement;
      if (!tappedOutside && (active === null || active === document.body || pop.contains(active))) {
        latest.current.anchor()?.focus();
      }
    };
  }, []);

  return (
    <div
      ref={popRef}
      class={props.class === undefined ? 'stage-pop' : `stage-pop ${props.class}`}
      role="dialog"
      aria-label={props.label}
      tabIndex={-1}
    >
      {props.children}
    </div>
  );
}
