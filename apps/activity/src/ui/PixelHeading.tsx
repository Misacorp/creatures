import type { ComponentChildren } from 'preact';

/**
 * Big pixel lettering for a title that stands on its own (a boss's name, the room banner, the round
 * intro): the display face, gold or red, with an outline or drop shadow so it reads on any picture.
 */
export function PixelHeading({
  as: Element = 'p',
  tone = 'gold',
  outline,
  size,
  id,
  class: extra,
  children,
}: {
  as?: 'h3' | 'p' | 'span';
  tone?: 'gold' | 'bad';
  /** `ink`: an ink outline. `ink-drop`: the outline and a drop shadow. `element-drop`: a drop shadow in the element's colour (needs `--elem`). */
  outline: 'ink' | 'ink-drop' | 'element-drop';
  /** `l`: room-banner size. `m`: a boss name (it scales with the screen). Leave out when a parent sets the size. */
  size?: 'l' | 'm';
  id?: string;
  /** Where it is used (layout, animation); never the colour. */
  class?: string;
  children: ComponentChildren;
}) {
  const classes = [
    'pixel-heading pix',
    `ph-${tone}`,
    `ph-${outline}`,
    size === undefined ? '' : `ph-size-${size}`,
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Element class={classes} {...(id === undefined ? {} : { id })}>
      {children}
    </Element>
  );
}
