import type { ComponentChildren } from 'preact';

/**
 * The one small label on art: words in the pixel font on a solid ink plate. A place's name on the map, a creature's
 * nameplate under its feet (its level first, in yellow) and any later label on a picture are this component with
 * different options, never a second look-alike (`ux-patterns.md`, "One label, many uses").
 *
 * Options: `bold` (heavier letters), `level` (a number shown first in yellow; `levelPrefix` writes a word before it,
 * "Lv 14", and with no children the plate is the level alone, as under a creature in the tray), `size` (`sm` or `md`)
 * `tone` (`bone` words, or `gold`), `gain` (a "+N" in green after the name that a long name never hides: the experience a
 * resting creature gained this visit) and `owner` (a player's name in the muted colour after the name: another player's creature by
 * the fire, so it is never taken for yours). It is decoration or a caption: it holds text only and no button; the thing it labels
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
  gain,
  owner,
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
  /** A gain shown last, "+N", in green; nothing for 0 or none. */
  gain?: number | undefined;
  /** Whose creature it is, when it is not the player's own (plain text, muted, after the name). */
  owner?: string | undefined;
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
      {owner !== undefined && owner !== '' && <span class="nameplate-owner">{owner}</span>}
      {gain !== undefined && gain > 0 && <span class="nameplate-gain">+{gain}</span>}
    </span>
  );
}
