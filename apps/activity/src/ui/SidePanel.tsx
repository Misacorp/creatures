import type { ComponentChildren } from 'preact';
import { CloseGlyph } from './Drawer';

export interface SidePanelProps {
  /** The heading (an h3) and its id; absent: a bare panel, its content brings its own heading. */
  title?: ComponentChildren;
  titleId?: string | undefined;
  /** For a bare panel: the id of the heading inside its content. */
  labelledBy?: string | undefined;
  /** The X in the heading row; absent: no X (a panel that stays while its screen does). */
  onClose?: (() => void) | undefined;
  /** Pinned at the bottom under a line (a gold button); the body scrolls above it. */
  footer?: ComponentChildren;
  class?: string | undefined;
  onKeyDown?: ((event: KeyboardEvent) => void) | undefined;
  children?: ComponentChildren;
}

/**
 * The side panel of a `WideLayout` (about 24 rem, beside the main area on a wide screen): the Expeditions
 * place panel and the Valley Games leaderboard. A gold heading with an optional pixel X, a body that
 * scrolls inside the panel, and an optional footer pinned at the bottom. A bare panel (no `title`) is just
 * the box for a card that has its own heading (the trip reveal). It never takes the focus by itself.
 */
export function SidePanel({
  title,
  titleId,
  labelledBy,
  onClose,
  footer,
  class: extra,
  onKeyDown,
  children,
}: SidePanelProps) {
  const bare = title === undefined;
  const classes = ['side-panel', bare ? 'is-bare' : '', extra ?? '']
    .filter((c) => c !== '')
    .join(' ');
  if (bare) {
    return (
      <aside class={classes} aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
        {children}
      </aside>
    );
  }
  return (
    <aside class={classes} aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div class="side-panel-head">
        <h3 id={titleId} class="side-panel-title">
          {title}
        </h3>
        {onClose !== undefined && (
          <button type="button" class="side-panel-close" aria-label="Close" onClick={onClose}>
            <CloseGlyph />
          </button>
        )}
      </div>
      <div class="side-panel-body">{children}</div>
      {footer !== undefined && footer !== null && <div class="side-panel-foot">{footer}</div>}
    </aside>
  );
}
