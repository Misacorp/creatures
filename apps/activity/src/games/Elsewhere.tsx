import { render, type ComponentChildren } from 'preact';
import { useLayoutEffect } from 'preact/hooks';

/**
 * Draws `children` inside another element of the page (`into`, an element Preact left empty), while this component stays where it is
 * in the tree: a live piece (the show's standings, ticking with the show's clock) can sit in a drawer that is not its parent's.
 * Nothing is drawn while `into` is null (the drawer is shut) and the element is emptied when it changes or this goes. Preact's own
 * context does not cross over; give the children what they need as props.
 */
export function Elsewhere({
  into,
  children,
}: {
  into: HTMLElement | null;
  children: ComponentChildren;
}) {
  // Every render: the children are new each time (the clock moved).
  useLayoutEffect(() => {
    if (into !== null) render(children, into);
  });
  useLayoutEffect(
    () => () => {
      if (into !== null) render(null, into);
    },
    [into],
  );
  return null;
}
