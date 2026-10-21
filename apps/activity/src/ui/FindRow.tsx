import type { ComponentChildren, Ref } from 'preact';

/**
 * The one row of anything found or gained that has a picture and a name: the picture on the left, the name
 * (in the pixel font, in `nameClass`'s colour) and a line of tags on the right. `FindItem` (gear) and
 * `FindBlueprint` are built on it, so a gear piece and a blueprint look alike and a player learns to
 * recognise "this is a find". It is a list item: put it in a `FindList`.
 */
export function FindRow({
  image,
  name,
  nameClass = '',
  tags,
  children,
  button,
}: {
  /** The picture (an `ItemFrame`). Decoration: the name says it all. */
  image: ComponentChildren;
  /** The name, with any words only a screen reader needs ("item level 12"). */
  name: ComponentChildren;
  /** An extra class of the name (its rarity's colour). */
  nameClass?: string;
  /** The tags after the name: badges that open their help. */
  tags?: ComponentChildren;
  /** An extra word or two after the tags (a slot's name, a note). */
  children?: ComponentChildren;
  /**
   * The whole row is one button (a gear list's slot that opens its picker): what it says and does, and
   * whether its drawer is open. Absent: plain content. Tags inside then explain nothing on their own.
   */
  button?:
    | {
        label: string;
        onClick: (event: MouseEvent) => void;
        expanded: boolean;
        /** For a popover that points at the button (`FindItem`'s item card). */
        ref?: Ref<HTMLButtonElement>;
        /** Mouse or pen moving onto or off the button (`FindItem`'s hover card). */
        onPointerEnter?: (event: PointerEvent) => void;
        onPointerLeave?: (event: PointerEvent) => void;
      }
    | undefined;
}) {
  const inside = (
    <>
      {image}
      <span class="find-row-text">
        <span class={`find-row-name pix ${nameClass}`.trim()}>{name}</span>
        <span class="find-row-tags">
          {tags}
          {children}
        </span>
      </span>
    </>
  );
  if (button === undefined) return <li class="find-row">{inside}</li>;
  return (
    <li class="find-row tappable">
      <button
        type="button"
        class="find-row-button"
        {...(button.ref === undefined ? {} : { ref: button.ref })}
        aria-label={button.label}
        aria-haspopup="dialog"
        aria-expanded={button.expanded}
        onClick={button.onClick}
        {...(button.onPointerEnter === undefined ? {} : { onPointerEnter: button.onPointerEnter })}
        {...(button.onPointerLeave === undefined ? {} : { onPointerLeave: button.onPointerLeave })}
      >
        {inside}
      </button>
    </li>
  );
}

/**
 * The list every find sits in (items, blueprints, creatures): a `ul` named for assistive technology, the
 * rows one under another. Resources are not rows: they are count badges (`CountBadgeList`), beside it.
 */
export function FindList({
  label,
  class: extra,
  children,
}: {
  label: string;
  /** Where it is used (a hook for a test or a small tweak); never the look. */
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <ul class={extra === undefined ? 'find-list' : `find-list ${extra}`} aria-label={label}>
      {children}
    </ul>
  );
}
