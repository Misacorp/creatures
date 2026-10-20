import type { ComponentChildren } from 'preact';

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
}) {
  return (
    <li class="find-row">
      {image}
      <span class="find-row-text">
        <span class={`find-row-name pix ${nameClass}`.trim()}>{name}</span>
        <span class="find-row-tags">
          {tags}
          {children}
        </span>
      </span>
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
