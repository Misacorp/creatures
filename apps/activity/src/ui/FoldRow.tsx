import type { ComponentChildren } from 'preact';

/**
 * A quiet fold for a group the player rarely needs (for example the creatures under a level): a centred
 * label between two dashed lines, so it reads as a divider, not a button. It is a real button; the open or
 * closed state is `aria-expanded` (there is no icon). The caller draws the folded content after it, with
 * the id that `controls` names.
 */
export function FoldRow({
  open,
  onToggle,
  controls,
  class: cls,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** The id of the folded content (for `aria-controls`). */
  controls: string;
  /** Extra class for the root (spacing, where it is used). */
  class?: string;
  /** The label ("3 more need Crafting level 3"). */
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={cls === undefined ? 'fold-row' : `fold-row ${cls}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span class="fold-row-text">{children}</span>
    </button>
  );
}
