/**
 * The state of popovers: which one is open, and how a popover with several faces moves between
 * them. No DOM access, so the rules are unit-tested; `Popover.tsx` and `PopoverHost.tsx` use them.
 */
import { useState } from 'preact/hooks';

/** Anything the host can have open: a key for "the same thing", and the element it points at. */
export interface Openable {
  kind: string;
  /** The same for the same thing at the same place, so a second tap on it closes it. */
  key: string;
  anchor: unknown;
}

/**
 * A tap on a trigger: opens its popover, or closes it when that very trigger's popover is already
 * open (on whichever face). Tapping another trigger switches to it. The kind is part of the identity,
 * so a tag and a creature can never be mistaken for each other.
 */
export function toggleActive<A extends Openable>(current: A | null, next: A): A | null {
  return current !== null &&
    current.kind === next.kind &&
    current.key === next.key &&
    current.anchor === next.anchor
    ? null
    : next;
}

/** A popover that can go back from the face it shows (Escape does that before it closes). */
export interface PopoverNav<V> {
  /** The face showing now. */
  view: V;
  /** True on any face but the first. */
  canBack: boolean;
  /** Switches to another face. */
  open: (view: V) => void;
  /** Goes back to the first face, whichever face (or chain of faces) was open. */
  back: () => void;
}

interface NavState<V> {
  scope: unknown;
  view: V;
}

/**
 * The face to show: the stored one while the popover is still the one it was stored for (`scope`),
 * the first face (`root`) once it is another popover. That is how a popover that stays mounted when
 * you tap another creature starts on its first face again, without any reset call.
 */
export function viewFor<V>(state: NavState<V> | null, root: V, scope: unknown): V {
  return state !== null && state.scope === scope ? state.view : root;
}

/** What Escape does: go back while there is somewhere to go back to, else close. */
export function escapeAction(
  nav: Pick<PopoverNav<unknown>, 'canBack'> | undefined,
): 'back' | 'close' {
  return nav?.canBack === true ? 'back' : 'close';
}

/**
 * Face navigation for a popover with more than one face: `view` starts as `root`, `open(view)`
 * shows another face and `back()` returns to `root`. Pass `scope` (the open popover's identity)
 * when the component can stay mounted while the popover is replaced by another one; the faces
 * start again from `root` then. Faces are compared by identity, so use one `root` constant.
 */
export function usePopoverNav<V>(root: V, scope?: unknown): PopoverNav<V> {
  const [state, setState] = useState<NavState<V> | null>(null);
  const view = viewFor(state, root, scope);
  return {
    view,
    canBack: view !== root,
    open: (next) => {
      setState({ scope, view: next });
    },
    back: () => {
      setState({ scope, view: root });
    },
  };
}
