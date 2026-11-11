/**
 * A place as a canvas (Misa, 2026-11-11; `docs/design/ux-patterns.md`, "A place is a canvas"): the scene fills the view and never
 * scrolls, every action starts from a click on something in it, and what that click opens sits beside the canvas.
 *
 * - `CanvasTarget`: the hit-target layer. A real button laid over the scene at scene-pixel coordinates (the art under it is drawn on the
 *   canvas, the scene's things are its sprites), named for assistive technology. `slot` draws the dashed outline of something that is not
 *   there yet (an anvil to buy): a click on it starts the step that adds it.
 * - `PlaceCanvas`: the shell. On a wide window (`useWide`, 60 rem) the scene sits between two drawers, `left` and `right`, each a
 *   `ui/SidePanel`; the scene keeps its place and scale in the room that is left. On a phone there are no drawers: an open panel is its
 *   own full page with the scene hidden behind it (no drawer on a drawer), and its Back goes to the scene. The panel's content is the
 *   same component either way, normally a `ui/Wizard` (a branch of steps with Back and one gold action).
 *
 * Which side holds what is the rule's: the right drawer acts on the one thing that was clicked in the scene (an anvil, a seat, its
 * wizard); the left drawer holds the place's collections and overviews that belong to no one spot (the bag, the floor, the plans, the
 * project board). When both are open on a phone the right one is shown.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { cssVars } from '../css-vars';
import { DrillHead } from '../ui/DrillHead';
import { keyboardHasFocus } from '../ui/focus-return';
import { SidePanel } from '../ui/SidePanel';
import { useWide } from '../ui/wide-layout';
import type { SceneGeometry } from './SceneFrame';
import { At } from './parts';

export type CanvasSide = 'left' | 'right';

/** The button a panel was opened from, and whether the keyboard had the focus on it (only then does the focus go back there). */
export interface Opener {
  el: HTMLElement;
  byKeyboard: boolean;
}

/** Records an opener at the moment of its click or key press, while it still has the focus. */
export function openerOf(el: HTMLElement): Opener {
  return { el, byKeyboard: keyboardHasFocus() };
}

/**
 * The body of a panel: the step above and, pinned under it, the footer (a wizard's reason and gold button) that stays in view while
 * the step scrolls. Every panel's content is one of these.
 */
export function PanelBody({
  children,
  footer,
}: {
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  return (
    <div class="pc-body">
      <div class="pc-scroll">{children}</div>
      {footer !== undefined && footer !== null && <div class="pc-foot">{footer}</div>}
    </div>
  );
}

/** What a drawer (or, on a phone, a page) shows. */
export interface CanvasPanel {
  /** The panel's name: the drawer's heading, and the page's on a phone. Plain text. */
  title: string;
  /** The body, drawn in a `PanelBody` (it scrolls inside the panel when it must; a step should rarely need it). */
  children: ComponentChildren;
  /** The X, the page's Back and Escape (when the body is not a wizard that takes Escape one step back first). */
  onClose: () => void;
  /**
   * The body is a wizard whose head already has the Back (its first step's Back is `onClose`): a phone's page then draws no head of
   * its own, so there is one Back, not two.
   */
  wizard?: boolean;
  /** The scene's button that opened it: a keyboard user gets the focus back there when the panel goes. */
  returnFocusTo?: Opener | null;
  /** What a phone's Back says it goes back to, said only to screen readers ("to the Forge"). */
  backLabel?: string;
}

/**
 * Moves the focus into a panel when it opens and gives it back to `returnFocusTo` when it goes, but only for a keyboard user (after
 * a tap nothing is focused again, so no ring is left on the control just left; the shared rule, `ui/focus-return`).
 */
function usePanelFocus(panel: CanvasPanel) {
  const root = useRef<HTMLElement | null>(null);
  const latest = useRef(panel);
  latest.current = panel;
  useEffect(() => {
    // A phone's page hides the scene the moment it opens, which takes the focus off the button before this runs: the opener
    // recorded at the click (`openerOf`) is the one to trust; the focus now is only the fallback.
    const before = document.activeElement as HTMLElement | null;
    const byKeyboard = keyboardHasFocus();
    root.current?.focus({ preventScroll: true });
    return () => {
      const opener = latest.current.returnFocusTo;
      const back = opener?.el ?? before;
      if ((opener?.byKeyboard ?? byKeyboard) && back !== null && back !== undefined && back.isConnected) {
        back.focus({ preventScroll: true });
      }
    };
  }, []);
  return root;
}

/** Escape closes the panel (a wizard inside it takes Escape one step back first and stops it). */
function closeOnEscape(panel: CanvasPanel) {
  return (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    panel.onClose();
  };
}

/** A wide window's drawer: a `SidePanel` beside the scene. */
function Drawer({ panel, side }: { panel: CanvasPanel; side: CanvasSide }) {
  const root = usePanelFocus(panel);
  const titleId = useId();
  return (
    <div
      class={`pc-side pc-${side}`}
      ref={(el) => {
        root.current = el;
      }}
      tabIndex={-1}
      data-side={side}
      onKeyDown={closeOnEscape(panel)}
    >
      <SidePanel
        title={panel.title}
        titleId={titleId}
        onClose={panel.onClose}
        class="pc-panel"
      >
        {panel.children}
      </SidePanel>
    </div>
  );
}

/** A phone's page: the panel's content on its own, with a back control to the scene. */
function Page({ panel, side }: { panel: CanvasPanel; side: CanvasSide }) {
  const root = usePanelFocus(panel);
  return (
    <section
      class="pc-page"
      aria-label={panel.title}
      data-side={side}
      ref={(el) => {
        root.current = el;
      }}
      tabIndex={-1}
      onKeyDown={closeOnEscape(panel)}
    >
      {panel.wizard === true ? (
        <h2 class="pc-page-title">{panel.title}</h2>
      ) : (
        <DrillHead
          title={panel.title}
          backLabel={panel.backLabel ?? 'to the scene'}
          onBack={panel.onClose}
        />
      )}
      <div class="pc-page-body">{panel.children}</div>
    </section>
  );
}

export function PlaceCanvas({
  scene,
  below,
  left,
  right,
  label,
}: {
  /** The scene (a `SceneFrame` with its `CanvasTarget`s). Always mounted: a phone's page only hides it. */
  scene: ComponentChildren;
  /** What sits under the scene, in the view and never scrolled away (the shelf, the creature tray). */
  below?: ComponentChildren;
  /** The left drawer (collections and overviews); null: closed. */
  left: CanvasPanel | null;
  /** The right drawer (the thing that was clicked); null: closed. */
  right: CanvasPanel | null;
  /** The canvas's spoken name ("Forge"). */
  label: string;
}) {
  const wide = useWide();
  const page = wide
    ? null
    : right !== null
      ? { panel: right, side: 'right' as const }
      : left !== null
        ? { panel: left, side: 'left' as const }
        : null;
  return (
    <div
      class="pc-root"
      role="group"
      aria-label={label}
      data-wide={wide ? 'yes' : 'no'}
      data-page={page === null ? undefined : 'yes'}
    >
      <div class="pc-view">
        <div class="pc-stage">
          {wide && left !== null && <Drawer panel={left} side="left" />}
          <div class="pc-main">{scene}</div>
          {wide && right !== null && <Drawer panel={right} side="right" />}
        </div>
        <div class="pc-below">{below}</div>
      </div>
      {page !== null && <Page panel={page.panel} side={page.side} />}
    </div>
  );
}

/**
 * One thing in the scene you can click: a real button over the scene at (`x`, `y`), `w` by `h` scene pixels, named for assistive
 * technology (`label` says what it is, who is there and what a click does). Its picture is the scene's own (drawn on the canvas or by
 * the caller's sprites); the button has no look but a focus ring, so it never covers the art. `slot` is the outline of something not
 * there yet: dashed, with its `children` (the price as icons) inside, and a click starts the step that adds it. `expanded` is true while
 * what it opened is open.
 */
export function CanvasTarget({
  g,
  x,
  y,
  w,
  h,
  label,
  onClick,
  expanded,
  disabled = false,
  slot = false,
  over = false,
  seat,
  z,
  children,
}: {
  g: SceneGeometry;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  onClick: (opener: Opener) => void;
  expanded?: boolean;
  disabled?: boolean;
  slot?: boolean;
  /** A hand carrying a creature is over it: it takes a solid outline. */
  over?: boolean;
  /** A hand dropping a creature on this target finds it by this id (`seatAt`). */
  seat?: string;
  /** Draw order among the scene's things (`depthOf`): a target is above the sprites it covers. */
  z?: number;
  children?: ComponentChildren;
}) {
  return (
    <At x={g.X(x)} y={g.Y(y)} hidden={false} class="cv-at" {...(z === undefined ? {} : { z })}>
      <button
        type="button"
        class={`cv-target${slot ? ' cv-slot' : ''}${over ? ' cv-over' : ''}`}
        aria-label={label}
        aria-expanded={expanded === undefined ? undefined : expanded}
        disabled={disabled}
        data-seat={seat}
        ref={cssVars({ '--pw': `${String(w * g.s)}px`, '--ph': `${String(h * g.s)}px` })}
        onClick={(event) => {
          onClick(openerOf(event.currentTarget));
        }}
      >
        {children}
      </button>
    </At>
  );
}
