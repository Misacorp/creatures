import type { ComponentChildren } from 'preact';
import { CloseGlyph } from './Drawer';

/**
 * The bulk actions bar (decisions.md, 2026-10-27, "Bulk selection replaces marking"): what a page shows while the
 * player has several things selected. An X at the left clears the selection and leaves the mode, then "N selected",
 * then the actions (`children`: buttons; today only the bag's Dismantle, later ones slot in beside it). Escape
 * inside the bar clears too. It is a part of the page's own section, not a bar of the frame: it sticks to the
 * bottom of the window while the list scrolls (above the dock on a phone) and ends where the section ends.
 * `hint` is a short line after the count (why an action is off).
 */
export function BulkBar({
  count,
  noun = 'selected',
  hint = null,
  onClear,
  children,
}: {
  count: number;
  /** What follows the number: "3 selected". */
  noun?: string;
  hint?: string | null;
  /** The X, and Escape: clear the selection and leave the mode. */
  onClear: () => void;
  /** The actions, as buttons (the first is the main one, gold). */
  children: ComponentChildren;
}) {
  return (
    <div
      class="bulk-bar pix-panel"
      role="group"
      aria-label="Actions for the selected items"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClear();
        }
      }}
    >
      <button
        type="button"
        class="ghost bulk-clear"
        aria-label="Clear the selection"
        onClick={onClear}
      >
        <CloseGlyph />
      </button>
      <p class="bulk-count">
        <strong>
          {count} {noun}
        </strong>
        {hint !== null && <span class="bulk-hint muted"> {hint}</span>}
      </p>
      <div class="bulk-actions">{children}</div>
    </div>
  );
}
