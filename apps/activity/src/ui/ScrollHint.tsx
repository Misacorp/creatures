import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { useScrollHint, type ScrollHintOptions } from './use-scroll-hint';

/**
 * A box that scrolls without a scrollbar and lets the player know it does. Content that does not fit is moved
 * down very slowly after a short rest until the bottom (and the first touch, wheel, key or focus stops it for good
 * for that content), and a soft fade at the bottom edge shows while there is more below (it is the whole hint
 * under reduced motion). Give it a height limit with `class` (for example `max-height: 40dvh`); a new
 * `contentKey` (the item shown, the page) starts the hint again from the top. The scrollbar is hidden on purpose.
 * The rules and options are in `use-scroll-hint.ts`; use that hook directly for a box that is not drawn here.
 * The fade is drawn in `--scroll-hint-bg` (the colour behind the box, the panel colour by default).
 */
export function ScrollHint({
  contentKey,
  children,
  class: extra,
  label,
  focusable = false,
  ...options
}: ScrollHintOptions & {
  /** Anything that changes when the content does: the hint starts again each time. */
  contentKey: unknown;
  children: ComponentChildren;
  /** Classes of the scrolling box (its height limit). */
  class?: string;
  /** A name for the box (it then is a labelled group). */
  label?: string;
  /** The box takes keyboard focus, so a key user can scroll it (the hint then stops, as for any interaction). */
  focusable?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const more = useScrollHint(body, contentKey, options);
  return (
    <div class={more ? 'scroll-hint more' : 'scroll-hint'}>
      <div
        ref={body}
        class={`scroll-hint-body${extra === undefined ? '' : ` ${extra}`}`}
        {...(label === undefined ? {} : { role: 'group', 'aria-label': label })}
        {...(focusable ? { tabIndex: 0 } : {})}
      >
        {children}
      </div>
      <span class="scroll-hint-fade" aria-hidden="true" />
    </div>
  );
}
