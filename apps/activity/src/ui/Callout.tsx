import type { ComponentChildren } from 'preact';

/**
 * A note in a gold frame, for something good that just happened (a new expedition slot, a rank-up
 * gift). It is a note for assistive technology. The place it is used adds its own spacing and type.
 */
export function Callout({
  as: Element = 'div',
  class: extra,
  children,
}: {
  as?: 'div' | 'p';
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <Element class={extra === undefined ? 'callout' : `callout ${extra}`} role="note">
      {children}
    </Element>
  );
}
