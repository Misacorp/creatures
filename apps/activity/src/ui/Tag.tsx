import type { ComponentChildren } from 'preact';
import { GlossaryTag } from '../Glossary';
import type { IconRef } from '../icon-ref';
import { GameIcon } from './GameIcon';

/** The colour or flavour of a tag, badge or chip (the classes of `components/cards.css` and friends). */
type TagTone =
  | 'rank'
  | 'shiny'
  | 'first'
  | 'away'
  | 'busy'
  | 'festival'
  | 'good'
  | 'lounge'
  | 'rested'
  | 'bad'
  | 'free'
  | 'role-chip'
  | `t-${string}`;

interface TagProps {
  /** `tag`: a small ink pill. `badge`: the same, for a status. `chip`: a pill with an optional icon. */
  kind?: 'tag' | 'badge' | 'chip';
  tone?: TagTone;
  /** The glossary entry it opens when tapped (it says "?" after its text). Without one it is plain text. */
  entry?: string;
  /** Chips only: a small picture before the text. */
  icon?: IconRef | undefined;
  /** What assistive technology says instead of the visible text. */
  label?: string;
  /** Where it is used (extra look for one place); never the colour. */
  class?: string;
  /**
   * A chip that does something (the house's wallpaper and floor chips open their picker): it is drawn as a button, the same
   * pill. Give it a `label` (its spoken name). Not with an `entry`: a glossary tag already opens something.
   */
  onClick?: () => void;
  children?: ComponentChildren;
}

/** The one small pill of the game: a tag, a badge or a chip, tappable when it has a glossary entry or an `onClick`. */
export function Tag({
  kind = 'tag',
  tone,
  entry,
  icon,
  label,
  class: extra,
  onClick,
  children,
}: TagProps) {
  const classes = [kind, tone, extra].filter((c) => c !== undefined && c !== '').join(' ');
  const content =
    kind === 'chip' ? (
      <>
        {icon !== undefined && <GameIcon icon={icon} scale={2} />}
        <span class="chip-text">{children}</span>
      </>
    ) : (
      children
    );
  if (entry === undefined && onClick !== undefined) {
    return (
      <button
        type="button"
        class={`${classes} chip-button`}
        {...(label === undefined ? {} : { 'aria-label': label })}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  if (entry === undefined) return <span class={classes}>{content}</span>;
  return (
    <GlossaryTag
      entry={entry}
      look="chip"
      class={classes}
      {...(label === undefined ? {} : { label })}
    >
      {content}
    </GlossaryTag>
  );
}

/** The flag chip of a landmark day; it opens the Landmark entry. */
export function LandmarkChip() {
  return (
    <Tag
      kind="chip"
      entry="landmark"
      icon={{ kind: 'glyph', id: 'flag' }}
      class="dungeon-landmark-chip"
    >
      Landmark
    </Tag>
  );
}
