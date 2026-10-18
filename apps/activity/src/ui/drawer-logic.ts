/**
 * The small pure parts of the Drawer: where a downward drag ends up, and the keyboard focus trap. They
 * read plain DOM properties only (`childNodes`, `localName`, attributes), so the tests' fake DOM runs
 * them too.
 */

/** What letting go of the drag handle means. */
export type DragOutcome = 'tap' | 'close' | 'snap-back';

/** Moved less than this many pixels is a tap, not a drag. */
export const TAP_SLOP_PX = 6;
/** A drag this far (or a third of the sheet, if that is less) closes it. */
export const CLOSE_DISTANCE_PX = 120;
/** A quick flick closes the sheet from this far, at this speed (pixels per millisecond). */
export const FLICK_DISTANCE_PX = 40;
export const FLICK_SPEED = 0.5;

/** Decides what a downward drag of `distance` px that took `ms` milliseconds does, for a sheet `height` px tall. */
export function dragOutcome(distance: number, ms: number, height: number): DragOutcome {
  if (Math.abs(distance) < TAP_SLOP_PX) return 'tap';
  if (distance <= 0) return 'snap-back';
  if (distance >= Math.min(CLOSE_DISTANCE_PX, height * 0.33)) return 'close';
  const speed = distance / Math.max(ms, 1);
  return distance >= FLICK_DISTANCE_PX && speed >= FLICK_SPEED ? 'close' : 'snap-back';
}

const FOCUSABLE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'a']);

/** The node's attributes and tag, as far as the trap needs them. */
interface NodeLike {
  nodeType: number;
  localName?: string;
  childNodes?: ArrayLike<NodeLike>;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
}

function isFocusable(node: NodeLike): boolean {
  const tag = node.localName ?? '';
  if (!FOCUSABLE_TAGS.has(tag)) return false;
  if (node.hasAttribute?.('disabled') === true) return false;
  if (node.hasAttribute?.('hidden') === true) return false;
  if (node.getAttribute?.('tabindex') === '-1') return false;
  if (tag === 'a' && node.hasAttribute?.('href') !== true) return false;
  return true;
}

/** The elements inside `root` that Tab can reach, in document order. */
export function focusablesIn<T extends NodeLike>(root: T): T[] {
  const found: T[] = [];
  const visit = (node: NodeLike): void => {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute?.('hidden') === true || node.getAttribute?.('aria-hidden') === 'true') {
      return;
    }
    if (isFocusable(node)) found.push(node as T);
    for (const child of Array.from(node.childNodes ?? [])) visit(child);
  };
  for (const child of Array.from(root.childNodes ?? [])) visit(child);
  return found;
}

/**
 * Where Tab (or Shift+Tab) should go so the focus stays inside the sheet: the other end when it leaves
 * the first or last control, the first control when it is outside the sheet altogether; null when the
 * browser's own move is fine.
 */
export function trapTarget<T>(
  controls: readonly T[],
  active: T | null,
  shift: boolean,
  contains: (el: T) => boolean,
): T | null {
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (first === undefined || last === undefined) return null;
  if (active === null || !contains(active)) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}
