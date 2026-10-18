/**
 * The pure parts of "flipping between" things (the creatures of the Creatures tab, the items of a bag or
 * a slot): what a finger or a mouse drag means, which keys flip, and which gestures are left alone. No DOM
 * access beyond plain node properties (`localName`, `parentNode`, attributes), so the tests' fake DOM
 * runs them too. `ui/Flipper.tsx` draws the buttons and the swipe area from these.
 *
 * The rules: the first thing has no previous and the last has no next (no wrap-around: a gentle
 * rubber-band stop says "that is the end"); a swipe left shows the next thing and a swipe right the
 * previous one; Left and Right arrow keys do the same.
 */

/** One step: -1 shows the previous thing, 1 the next. */
export type FlipStep = -1 | 1;

/** How a flip was asked for. */
export type FlipVia = 'button' | 'key' | 'swipe';

/** Which pointers swipe: a finger or a pen only (the default), or the mouse as well (the workbench). */
export type SwipePointers = 'touch' | 'any';

/**
 * What the screen that owns the things tells a flip control: where we are among how many, what the
 * neighbours are called (for the buttons' spoken labels) and what to do on a flip. The same shape for the
 * creature page and for the item drawers.
 */
export interface FlipProps {
  /** Position of the thing shown (0 is the first) and how many things there are. */
  index: number;
  count: number;
  /** What the things are, singular and lower case ("creature", "item"), for the labels. */
  noun: string;
  /** The name of the thing shown (announced after a flip), and of its neighbours (button labels). */
  name: string;
  prevName?: string | undefined;
  nextName?: string | undefined;
  /** Shows the previous (-1) or next (1) thing. Never called at an end. */
  onFlip: (step: FlipStep, via: FlipVia) => void;
  /** Which pointers swipe (a finger or pen unless said otherwise). */
  pointers?: SwipePointers | undefined;
  /**
   * The direction the thing shown arrived from, for its short slide in, when the owner draws a new one
   * for each (the Creatures tab does). Without it the area works the direction out from `index`.
   */
  enter?: FlipStep | null | undefined;
  /** After a flip with a button, the owner draws the control anew: this one gets the focus back. */
  focusButton?: FlipStep | null | undefined;
}

/** A finger must travel this far (px) before the gesture counts as horizontal or vertical. */
export const FLIP_SLOP_PX = 10;
/** The sideways move must be this many times the vertical one (about 30 degrees from the horizontal). */
export const FLIP_AXIS_RATIO = 1.7;
/** A swipe this far (or a third of the area's width, if that is less) flips. */
export const FLIP_DISTANCE_PX = 56;
/** A quick flick flips from this far, at this speed (pixels per millisecond). */
export const FLIP_FLICK_DISTANCE_PX = 24;
export const FLIP_FLICK_SPEED = 0.5;
/** At either end the content follows the finger this much (a rubber band), at most `RUBBER_MAX_PX`. */
export const RUBBER_FACTOR = 0.3;
export const RUBBER_MAX_PX = 28;

/** What the first part of a gesture turned out to be. */
export type Axis = 'undecided' | 'horizontal' | 'vertical';

/**
 * Tells a sideways swipe from a vertical scroll once the finger has moved `dx` and `dy` px from where
 * it went down. A move shorter than the slop is undecided (a tap stays a tap). Sideways wins only when
 * it is clearly sideways; anything steeper is a scroll, and the gesture is then left alone for good.
 */
export function classifyMove(dx: number, dy: number): Axis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= FLIP_SLOP_PX && ax >= FLIP_AXIS_RATIO * ay) return 'horizontal';
  if (ay >= FLIP_SLOP_PX) return 'vertical';
  return 'undecided';
}

/** The step a swipe left or right means (left is the next thing). */
export function stepOfSwipe(dx: number): FlipStep {
  return dx < 0 ? 1 : -1;
}

/** Whether `index` has a neighbour in that direction among `count` things. */
export function canStep(step: FlipStep, index: number, count: number): boolean {
  const target = index + step;
  return count > 1 && target >= 0 && target < count;
}

/**
 * What letting go does: the step to take, or 0 for none. It must still be clearly horizontal, and
 * either long enough (56 px, or a third of the width when the area is narrow) or a quick flick
 * (24 px at 0.5 px/ms). It does not look at the ends: the caller checks `canStep`.
 */
export function swipeOutcome(dx: number, dy: number, ms: number, width: number): FlipStep | 0 {
  if (classifyMove(dx, dy) !== 'horizontal') return 0;
  const ax = Math.abs(dx);
  const far = width > 0 ? Math.min(FLIP_DISTANCE_PX, width / 3) : FLIP_DISTANCE_PX;
  const flick = ax >= FLIP_FLICK_DISTANCE_PX && ax / Math.max(ms, 1) >= FLIP_FLICK_SPEED;
  return ax >= far || flick ? stepOfSwipe(dx) : 0;
}

/**
 * How far the content moves with the finger: all of the way where there is a neighbour (up to 60% of the
 * width, so it never leaves the area), a damped, capped part of it at an end (the rubber band).
 */
export function dragOffset(dx: number, hasNeighbour: boolean, width: number): number {
  if (hasNeighbour) {
    const limit = width > 0 ? width * 0.6 : Number.POSITIVE_INFINITY;
    return Math.max(-limit, Math.min(limit, dx));
  }
  const damped = dx * RUBBER_FACTOR;
  return Math.max(-RUBBER_MAX_PX, Math.min(RUBBER_MAX_PX, damped));
}

/** Whether this kind of pointer may swipe (a mouse only when the area allows it). */
export function swipeAllowed(pointerType: string, pointers: SwipePointers): boolean {
  return pointers === 'any' || pointerType === 'touch' || pointerType === 'pen';
}

/** The parts of a keyboard event the keys need. */
export interface KeyLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  target: unknown;
}

/** The node properties the gesture and key checks read (the fake DOM has them too). */
interface NodeLike {
  localName?: string;
  parentNode?: unknown;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
}

/** Input types that take no typing and no sideways drag, so an arrow key or a swipe may pass over them. */
const BUTTON_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'image']);

/** True for a control where Left, Right and a sideways drag already mean something: a text field, a list, a slider. */
export function takesSideways(node: unknown): boolean {
  const el = node as NodeLike | null | undefined;
  if (el === null || el === undefined || typeof el !== 'object') return false;
  const tag = el.localName ?? '';
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return !BUTTON_INPUTS.has(el.getAttribute?.('type') ?? 'text');
  const editable = el.getAttribute?.('contenteditable');
  if (editable !== null && editable !== undefined && editable !== 'false') return true;
  return el.getAttribute?.('role') === 'slider';
}

/**
 * Whether a gesture that went down on `target` (somewhere inside `root`) is left alone: it started on
 * a text field, a list, a slider or a part marked `data-no-flip`. A plain button is not: swiping across
 * a big button still flips (a tap on it, with no sideways move, is still just a tap).
 */
export function startsOnBlocked(target: unknown, root: unknown): boolean {
  for (let node = target; node !== null && node !== undefined && node !== root;) {
    const el = node as NodeLike;
    if (takesSideways(el) || el.hasAttribute?.('data-no-flip') === true) return true;
    node = el.parentNode;
  }
  return false;
}

/**
 * The step a key press means: Left is previous, Right is next; null for any other key, one with a
 * modifier, one something else already handled, or one typed in a field that keeps the arrow keys.
 */
export function flipKeyStep(event: KeyLike): FlipStep | null {
  if (event.defaultPrevented === true) return null;
  if (event.altKey === true || event.ctrlKey === true || event.metaKey === true) return null;
  if (event.shiftKey === true) return null;
  if (takesSideways(event.target)) return null;
  if (event.key === 'ArrowLeft') return -1;
  if (event.key === 'ArrowRight') return 1;
  return null;
}

/**
 * The flip props for a list of things with one shown (`at` is its place in the list): the names of
 * its neighbours for the buttons, and `pick`, called with the thing a flip leads to. Undefined when there
 * is nothing to flip to (the shown thing is not in the list, or the list has one thing).
 */
export function flipOver<T>(options: {
  list: readonly T[];
  at: number;
  noun: string;
  nameOf: (thing: T) => string;
  pick: (target: T, step: FlipStep, via: FlipVia) => void;
  extra?: Pick<FlipProps, 'pointers' | 'enter' | 'focusButton'>;
}): FlipProps | undefined {
  const { list, at, noun, nameOf, pick, extra } = options;
  const here = list[at];
  if (here === undefined || list.length < 2) return undefined;
  const before = list[at - 1];
  const after = list[at + 1];
  return {
    index: at,
    count: list.length,
    noun,
    name: nameOf(here),
    ...(before === undefined ? {} : { prevName: nameOf(before) }),
    ...(after === undefined ? {} : { nextName: nameOf(after) }),
    ...extra,
    onFlip: (step, via) => {
      const target = list[at + step];
      if (target !== undefined) pick(target, step, via);
    },
  };
}

/** "Cindle, 3 / 12": what a screen reader hears after a flip. */
export function flipAnnouncement(name: string, index: number, count: number): string {
  return `${name}, ${String(index + 1)} / ${String(count)}`;
}

/** The spoken name of a flip button: "Previous creature: Cindle", or "Next item" when there is no name. */
export function flipLabel(step: FlipStep, noun: string, neighbourName: string | undefined): string {
  const word = step < 0 ? 'Previous' : 'Next';
  return neighbourName === undefined || neighbourName === ''
    ? `${word} ${noun}`
    : `${word} ${noun}: ${neighbourName}`;
}
