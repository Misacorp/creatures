import type { ComponentChildren } from 'preact';

/**
 * The one small label on art: words in the pixel font on a solid ink plate. A place's name on the map, a creature's
 * nameplate under its feet (its level first, in yellow) and any later label on a picture are this component with
 * different options, never a second look-alike (`ux-patterns.md`, "One label, many uses").
 *
 * Options: `bold` (heavier letters), `level` (a number shown first in yellow; `levelPrefix` writes a word before it,
 * "Lv 14", and with no children the plate is the level alone, as under a creature in the tray), `size` (`sm` or `md`)
 * and `tone` (`bone` words, or `gold`). It is decoration or a caption: it holds text only and no button; the thing it labels
 * is the button. Text is drawn as text.
 */
export type NameplateSize = 'sm' | 'md';
export type NameplateTone = 'bone' | 'gold';

export function Nameplate({
  children,
  level,
  levelPrefix,
  bold = false,
  size = 'md',
  tone = 'bone',
  class: extra,
}: {
  children?: ComponentChildren;
  /** A level shown first, in yellow. */
  level?: number | undefined;
  /** A word written before the level, inside its yellow ("Lv"). */
  levelPrefix?: string;
  bold?: boolean;
  size?: NameplateSize;
  tone?: NameplateTone;
  class?: string | undefined;
}) {
  const classes = ['nameplate', 'pix', `nameplate-${size}`, `nameplate-${tone}`];
  if (bold) classes.push('nameplate-bold');
  if (extra !== undefined) classes.push(extra);
  return (
    <span class={classes.join(' ')}>
      {level !== undefined && (
        <span class="nameplate-level">
          {levelPrefix === undefined ? level : `${levelPrefix} ${String(level)}`}
        </span>
      )}
      {children !== undefined && children !== null && (
        <span class="nameplate-name">{children}</span>
      )}
    </span>
  );
}
