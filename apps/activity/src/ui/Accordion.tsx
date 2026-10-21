import type { ComponentChildren } from 'preact';
import { useContext, useId, useMemo, useState } from 'preact/hooks';
import type { IconRef } from '../icon-ref';
import { GameIcon } from './GameIcon';
import {
  DepthContext,
  GroupContext,
  loadAccordionOpen,
  loadGroupOpen,
  saveAccordionOpen,
  saveGroupOpen,
  type GroupApi,
} from './accordion-state';
import { useAccordionPhase } from './use-accordion-phase';

export interface AccordionProps {
  /** The words on the header. Plain inline content; never a button or link (the header is one). */
  title: ComponentChildren;
  /** A short note on the right of the header: a count ("3"), "2 new", "Ready". Keep it to a few characters. */
  meta?: ComponentChildren;
  /** `gold` makes the meta stand out (something is ready or new); `quiet` is the default. */
  metaTone?: 'quiet' | 'gold';
  /** A small picture before the title. Decoration only. */
  icon?: IconRef;
  /** `default` is a section of a page; `compact` sits inside a card. Inside another accordion it is lighter still. */
  variant?: 'default' | 'compact';
  /** Controlled: the caller owns the state and answers `onToggle`. Without it the accordion keeps its own. */
  open?: boolean;
  /** Uncontrolled: open at the start. A remembered state (`persistKey`) wins over it. */
  defaultOpen?: boolean;
  /** Called with the new state after every toggle (to load something on first open, for example). */
  onToggle?: (open: boolean) => void;
  /**
   * Remembers open or closed in `localStorage`, for this browser only. Include the viewer's id so one
   * player's choice is not another's ("bait-activity:<viewerId>"). Uncontrolled accordions only.
   */
  persistKey?: string;
  /** What assistive technology says for the header when the visible title is not enough ("More about Cindle"). */
  label?: string;
  /** The name that tells it from its siblings in a one-at-a-time group. Short and fixed, never player text. */
  name?: string;
  /** Wraps the header in a heading of this level, for an accordion that is a section of a page. */
  headingLevel?: 2 | 3 | 4;
  /** Keep the body in the page while closed (hidden), for a body that holds a form being filled in. */
  keepMounted?: boolean;
  /** Extra class for the root (spacing, where it is used). */
  class?: string;
  children: ComponentChildren;
}

/** A pixel chevron, drawn with squares so it stays sharp; the stylesheet turns it when open. */
function Chevron() {
  return (
    <svg class="acc-chev" viewBox="0 0 7 4" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="0" width="2" height="1" />
      <rect x="5" y="0" width="2" height="1" />
      <rect x="1" y="1" width="2" height="1" />
      <rect x="4" y="1" width="2" height="1" />
      <rect x="2" y="2" width="3" height="1" />
      <rect x="3" y="3" width="1" height="1" />
    </svg>
  );
}

/**
 * The one expand and collapse of the game: a header row that is a real button (chevron, title, an
 * optional note on the right) and a body under it. Every "More", "Details" and "Recent activity" uses
 * this, so it always looks and works the same. Enter and Space toggle because the header is a native
 * button; focus shows a ring. Open and close animate briefly, and not at all with reduced motion.
 */
export function Accordion({
  title,
  meta,
  metaTone = 'quiet',
  icon,
  variant = 'default',
  open: controlledOpen,
  defaultOpen = false,
  onToggle,
  persistKey,
  label,
  name,
  headingLevel,
  keepMounted = false,
  class: extra,
  children,
}: AccordionProps) {
  const uid = useId();
  const depth = useContext(DepthContext);
  const group = useContext(GroupContext);
  const itemName = name ?? uid;
  const exclusive = group?.exclusive === true;
  const controlled = controlledOpen !== undefined;
  // A remembered state only means something for an accordion that keeps its own state.
  const remembers = persistKey !== undefined && !controlled && !exclusive;

  const [ownOpen, setOwnOpen] = useState<boolean>(
    () => (remembers ? loadAccordionOpen(persistKey) : null) ?? defaultOpen,
  );
  const open = controlled ? controlledOpen : exclusive ? group.openName === itemName : ownOpen;

  const phase = useAccordionPhase(open);
  const mounted = open || phase === 'closing' || keepMounted;
  const headId = `acc-${uid}-head`;
  const bodyId = `acc-${uid}-body`;

  const toggle = (): void => {
    const next = !open;
    if (!controlled) {
      if (exclusive) group.setOpenName(next ? itemName : null);
      else {
        setOwnOpen(next);
        if (remembers) saveAccordionOpen(persistKey, next);
      }
    }
    onToggle?.(next);
  };

  const look = depth > 0 ? 'nested' : variant === 'compact' ? 'compact' : null;
  const rootClass = ['acc', open ? 'open' : 'closed', look, extra]
    .filter((c) => c !== null && c !== undefined)
    .join(' ');
  const headClass = ['acc-head', open ? 'open' : null, look].filter((c) => c !== null).join(' ');

  const head = (
    <button
      type="button"
      id={headId}
      class={headClass}
      aria-expanded={open}
      aria-controls={bodyId}
      {...(label === undefined ? {} : { 'aria-label': label })}
      onClick={toggle}
    >
      <span class="acc-chev-box">
        <Chevron />
      </span>
      {icon !== undefined && (
        <span class="acc-icon" aria-hidden="true">
          <GameIcon icon={icon} scale={2} />
        </span>
      )}
      <span class="acc-title">{title}</span>
      {meta !== undefined && meta !== null && meta !== false && (
        <span class={metaTone === 'gold' ? 'acc-meta gold' : 'acc-meta'}>{meta}</span>
      )}
    </button>
  );

  return (
    <div class={rootClass}>
      {headingLevel === undefined ? (
        head
      ) : headingLevel === 2 ? (
        <h2 class="acc-heading">{head}</h2>
      ) : headingLevel === 3 ? (
        <h3 class="acc-heading">{head}</h3>
      ) : (
        <h4 class="acc-heading">{head}</h4>
      )}
      {mounted && (
        <div
          id={bodyId}
          class="acc-body"
          role="region"
          aria-labelledby={headId}
          hidden={!open && phase !== 'closing'}
          {...(phase === 'idle' ? {} : { 'data-phase': phase })}
        >
          <div class="acc-clip">
            <div class="acc-content">
              <DepthContext.Provider value={depth + 1}>
                <GroupContext.Provider value={null}>{children}</GroupContext.Provider>
              </DepthContext.Provider>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface AccordionGroupProps {
  /** Opening one closes the others. Each accordion inside needs a `name`. */
  exclusive?: boolean;
  /** The `name` of the accordion that starts open (one-at-a-time groups). A remembered one wins. */
  defaultOpen?: string;
  /** Remembers which one is open in `localStorage` (one-at-a-time groups); include the viewer's id. */
  persistKey?: string;
  /** What assistive technology calls the group ("Creature details"). */
  label?: string;
  class?: string;
  children: ComponentChildren;
}

/**
 * A stack of accordions with an even gap. With `exclusive`, only one is open at a time (the one the
 * player opened last), which keeps a long page short.
 */
export function AccordionGroup({
  exclusive = false,
  defaultOpen,
  persistKey,
  label,
  class: extra,
  children,
}: AccordionGroupProps) {
  const [openName, setOpenName] = useState<string | null>(() => {
    const remembered = exclusive && persistKey !== undefined ? loadGroupOpen(persistKey) : null;
    if (remembered !== null) return remembered === '' ? null : remembered;
    return defaultOpen ?? null;
  });
  const api = useMemo<GroupApi>(
    () => ({
      exclusive,
      openName,
      setOpenName: (next) => {
        setOpenName(next);
        if (exclusive && persistKey !== undefined) saveGroupOpen(persistKey, next);
      },
    }),
    [exclusive, openName, persistKey],
  );
  return (
    <GroupContext.Provider value={api}>
      <div
        class={extra === undefined ? 'acc-group' : `acc-group ${extra}`}
        {...(label === undefined ? {} : { role: 'group', 'aria-label': label })}
      >
        {children}
      </div>
    </GroupContext.Provider>
  );
}
