import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { escapeAction, type PopoverNav } from './popover-nav';
import { popoverCoords } from './popover-place';

/** The class of the fixed full-window layer a `layer="page"` popover sits in. */
const LAYER_CLASS = 'popover-layer';

/** How often a `closeWhenAnchorGone` popover checks that its anchor is still on the page. */
const ANCHOR_POLL_MS = 400;

interface PopoverProps {
  /** The element the popover points at (a creature, a tag, the basic ability chip, the "?" button). */
  anchor: () => HTMLElement | null;
  /** The dialog's name for assistive technology. */
  label: string;
  /** Closes the popover (Escape, a tap outside it, or its anchor leaving the page). */
  onClose: () => void;
  /** A popover with several faces: Escape goes back while it can, and only then closes. */
  nav?: Pick<PopoverNav<unknown>, 'canBack' | 'back'>;
  /**
   * `stage`: inside the fight stage (its parent must be the stage, which is `position: relative`).
   * `page`: in a fixed layer over the whole window, so it works on any page and over the How to
   * play overlay. Default `stage`.
   */
  layer?: 'stage' | 'page';
  /** `compact`: the stage's 12.5rem. `wide`: 17rem with larger text. Default: `compact` on the stage, `wide` on the page. */
  size?: 'compact' | 'wide';
  /**
   * Close it when the anchor has left the page (a list drew again, a screen changed). Default: on
   * for `page`; the stage closes its popovers itself.
   */
  closeWhenAnchorGone?: boolean;
  class?: string;
  children: ComponentChildren;
}

/**
 * The one popover of the game: a small dialog with a pointer arrow. It sits above its anchor, flips
 * below when there is no room above, and is kept inside its container (the stage, or the window for
 * `layer="page"`). The place is written as CSS custom properties (`--pop-x`, `--pop-y`,
 * `--pop-arrow`) with `style.setProperty`, so no inline style attribute is needed, and it is worked
 * out again after every render and whenever the window, the popover or any scrolled list changes.
 * Focus moves into it when it opens and goes back to the anchor when it closes. Escape closes it
 * (or goes back first, with `nav`); a tap outside closes it, except in another popover layer (a
 * glossary popover opened from a tag inside this one is not "outside" it).
 */
export function Popover(props: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const layer = props.layer ?? 'stage';
  const wide = (props.size ?? (layer === 'page' ? 'wide' : 'compact')) === 'wide';
  const pollAnchor = props.closeWhenAnchorGone ?? layer === 'page';

  function place(): void {
    const pop = popRef.current;
    const target = latest.current.anchor();
    const container = pop?.parentElement;
    if (pop == null || target === null || container == null) return;
    const a = target.getBoundingClientRect();
    const b = container.getBoundingClientRect();
    // The container's padding box is what an absolutely positioned child is measured from.
    const at = popoverCoords(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      {
        left: b.left + container.clientLeft,
        top: b.top + container.clientTop,
        width: container.clientWidth,
        height: container.clientHeight,
      },
      { width: pop.offsetWidth, height: pop.offsetHeight },
    );
    pop.style.setProperty('--pop-x', `${String(at.x)}px`);
    pop.style.setProperty('--pop-y', `${String(at.y)}px`);
    pop.style.setProperty('--pop-arrow', `${String(at.arrow)}px`);
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
      const { nav, onClose } = latest.current;
      if (escapeAction(nav) === 'back') nav?.back();
      else onClose();
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (target === null) return;
      if (pop.contains(target) || latest.current.anchor()?.contains(target) === true) return;
      // A popover opened from a tag inside this one is not "outside" it.
      if (target instanceof Element && target.closest(`.${LAYER_CLASS}`) !== null) return;
      tappedOutside = true;
      latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', place);
    // A popover on a page must follow its anchor when the page or a list scrolls.
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

  useEffect(() => {
    if (!pollAnchor) return undefined;
    const timer = setInterval(() => {
      if (latest.current.anchor()?.isConnected !== true) latest.current.onClose();
    }, ANCHOR_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [pollAnchor]);

  const classes = ['popover', wide ? 'popover-wide' : '', props.class ?? '']
    .filter((c) => c !== '')
    .join(' ');
  const dialog = (
    <div ref={popRef} class={classes} role="dialog" aria-label={props.label} tabIndex={-1}>
      {props.children}
    </div>
  );
  return layer === 'page' ? <div class={LAYER_CLASS}>{dialog}</div> : dialog;
}

/** The attributes of a button that opens a popover (`open`: its popover is showing now). */
export function popupProps(open: boolean) {
  return { 'aria-haspopup': 'dialog', 'aria-expanded': open } as const;
}

interface PopoverCardProps {
  /** The little picture at the top (sprites the game already has, never text). Hidden from assistive technology. */
  visual?: ComponentChildren;
  title: string;
  /** The one-line answer in bold; nothing when empty. */
  short?: string;
  lines?: readonly string[];
  /** A muted line under the rest (the general rule behind a boss's own trick). */
  note?: string | null;
  /** More under the text (a creature's tags). */
  children?: ComponentChildren;
  /** The link at the bottom (the glossary's "More in How to play"). */
  more?: { label: string; onMore: () => void };
}

/** The content of a popover that explains something: a picture, a title, a short text, lines and a link. */
export function PopoverCard(props: PopoverCardProps) {
  const { lines = [] } = props;
  return (
    <div class="pop-body">
      {props.visual != null && (
        <div class="pop-visual" aria-hidden="true">
          {props.visual}
        </div>
      )}
      <p class="pop-title pix">{props.title}</p>
      {props.short !== undefined && props.short !== '' && <p class="pop-short">{props.short}</p>}
      {lines.length > 0 && (
        <ul class="pop-lines">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {props.note != null && <p class="pop-general muted">{props.note}</p>}
      {props.children}
      {props.more !== undefined && (
        <button type="button" class="pop-more" onClick={props.more.onMore}>
          {props.more.label}
        </button>
      )}
    </div>
  );
}

/** The back control of a popover face: an arrow and where it goes (`label` is what assistive technology says). */
export function PopoverBack(props: {
  label: string;
  onBack: () => void;
  children: ComponentChildren;
}) {
  return (
    <button type="button" class="pop-back" aria-label={props.label} onClick={props.onBack}>
      <Sprite sprite={glyphOrUnknown('left_to_right')} scale={2} class="pop-back-arrow" />
      <span class="pix">{props.children}</span>
    </button>
  );
}
