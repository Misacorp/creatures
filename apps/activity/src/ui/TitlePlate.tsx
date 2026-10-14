import type { ComponentChildren } from 'preact';

/**
 * A name on a plate with a gold frame, like the title of a playing card, and an optional small
 * count at its end ("2 / 7"). It is a heading; `live` announces a change of name politely (the
 * catalogue's arrows change it). The name wraps anywhere, so a long one never overflows.
 */
export function TitlePlate({
  title,
  count,
  as: Heading = 'h4',
  live = false,
}: {
  title: string;
  count?: ComponentChildren;
  as?: 'h3' | 'h4';
  live?: boolean;
}) {
  return (
    <Heading class="place-plate" {...(live ? { 'aria-live': 'polite' as const } : {})}>
      <span class="plate-name pix">{title}</span>
      {count !== undefined && <span class="plate-count">{count}</span>}
    </Heading>
  );
}
