import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ItemCorners, ItemSprite } from './GearArt';
import type { GearItem } from './gear-types';
import { isFestivalBase } from './gear-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** The keys held down at a click (a Ctrl or Command click toggles, a Shift click takes a range). */
export interface ClickKeys {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * How a bag tile takes part in selecting several items (decisions.md, 2026-10-27, "Bulk selection replaces
 * marking"). Only the bag passes it; the item picker's tiles do not select.
 */
export interface TileChoice {
  /** The selection mode is on: every tile shows its circle and a click toggles. */
  selecting: boolean;
  /** This item is in the selection: a ring and a check in its circle. */
  chosen: boolean;
  /** A long press is being held on this tile: its cue plays. */
  holding: boolean;
  /** The circle in the top left corner was clicked (it starts the selection with this item, or toggles it). */
  onCheck: () => void;
}

/**
 * One item in an item grid: the one look for every grid of items (the creature page's item picker and the
 * Workshop bag). A square button, the item's art filling it, its rarity as the single edge, the slot icon at
 * the top left and the item level at the bottom right, and at the top right a small gold flag ("Worn") or the
 * small picture of another creature that wears it. `selected` lights it from inside with a light edge (the
 * item shown, or shown last); `blocked` dims an item that cannot be worn (or that another creature wears). A selected tile scrolls itself into view (when it is selected and again when its details
 * close), so a closed detail never leaves the player lost in a long grid.
 *
 * Selecting several (bag only, `choice`): the tile is an option of the grid's listbox (`aria-selected`). A circle
 * sits in its top left corner: it shows on hover for a mouse, and on every tile while the selection mode is on
 * (empty, or a check on a chosen tile, which also gets a ring). The circle is a pointer shortcut (a plain span);
 * keyboard users select with Space. While selecting, `onInfo` adds a small "i" at the bottom left that opens
 * the item's card instead (a separate button, never nested). `buttonProps` carries the pointer and key handlers
 * of the grid (long press, context menu, arrow keys) and `focusRef` hands the grid the button.
 */
export function ItemTile({
  item,
  label,
  selected,
  pressed = selected,
  blocked = false,
  flag = null,
  wearer = null,
  choice,
  buttonProps,
  focusRef,
  onInfo,
  infoLabel,
  onSelect,
}: {
  item: Pick<GearItem, 'baseId' | 'rarity' | 'itemLevel'>;
  /** The spoken name of the button (name, rarity, who wears it, why it is blocked). */
  label: string;
  /** Drawn as selected (and kept in view). */
  selected: boolean;
  /** `aria-pressed`: the item whose details are open (defaults to `selected`). */
  pressed?: boolean;
  blocked?: boolean;
  /** A short word at the top right ("Worn"); hidden from screen readers, so say it in `label` too. */
  flag?: string | null;
  /** The species of another creature that wears it: its small picture at the top right. Decoration: say who in `label`. */
  wearer?: string | null;
  /** The bag's multi-select; absent for a plain grid. */
  choice?: TileChoice | undefined;
  /** Extra attributes of the tile button (pointer, key and focus handlers, `tabIndex`). */
  buttonProps?: JSX.IntrinsicElements['button'] | undefined;
  /** Receives the tile button (and `null` when it goes). */
  focusRef?: ((el: HTMLButtonElement | null) => void) | undefined;
  /** Selection mode: opens the item's card (the tile itself toggles). Needs `infoLabel`. */
  onInfo?: (() => void) | undefined;
  /** The spoken name of the info button ("Details of Kelp Cap"). */
  infoLabel?: string | undefined;
  onSelect: (keys: ClickKeys) => void;
}) {
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected && typeof button.current?.scrollIntoView === 'function') {
      button.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, pressed]);
  const classes = ['item-tile', `rarity-${item.rarity}`];
  if (selected) classes.push('selected');
  if (blocked) classes.push('blocked');
  if (choice?.chosen === true) classes.push('chosen');
  if (choice?.holding === true) classes.push('holding');
  if (isFestivalBase(item.baseId)) classes.push('festival');
  const multi = choice !== undefined;
  return (
    <li class={multi ? 'item-cell' : undefined} {...(multi ? { role: 'presentation' } : {})}>
      <button
        type="button"
        {...buttonProps}
        ref={(el) => {
          button.current = el;
          focusRef?.(el);
        }}
        class={classes.join(' ')}
        {...(multi
          ? {
              role: 'option',
              'aria-selected': choice.chosen,
              ...(selected ? { 'aria-current': 'true' as const } : {}),
            }
          : { 'aria-pressed': pressed })}
        aria-label={label}
        draggable={false}
        onClick={(event) => {
          onSelect({
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          });
        }}
      >
        <ItemSprite baseId={item.baseId} scale={5} />
        {flag !== null && (
          <span class="item-tile-flag pix" aria-hidden="true">
            {flag}
          </span>
        )}
        {wearer !== null && (
          <Sprite sprite={creatureSpriteOrFallback(wearer)} scale={2} class="item-tile-wearer" />
        )}
        <ItemCorners level={item.itemLevel} baseId={item.baseId} />
      </button>
      {choice !== undefined && (
        <span
          class={choice.chosen ? 'item-tile-check on' : 'item-tile-check'}
          aria-hidden="true"
          onClick={choice.onCheck}
        >
          {choice.chosen && <CheckGlyph />}
        </span>
      )}
      {choice !== undefined && choice.selecting && onInfo !== undefined && (
        <button
          type="button"
          class="item-tile-info"
          aria-label={infoLabel ?? 'Details'}
          tabIndex={-1}
          onClick={onInfo}
        >
          <svg viewBox="0 0 5 7" aria-hidden="true" shape-rendering="crispEdges">
            <rect x="2" y="0" width="1" height="1" />
            <rect x="1" y="2" width="2" height="1" />
            <rect x="2" y="3" width="1" height="3" />
            <rect x="1" y="6" width="3" height="1" />
          </svg>
        </button>
      )}
    </li>
  );
}

/** The pixel check in a chosen tile's circle (a shape, so colour is not the only cue). */
function CheckGlyph() {
  return (
    <svg viewBox="0 0 7 6" aria-hidden="true" shape-rendering="crispEdges">
      <path d="M0 3h1v1H0zM1 4h1v1H1zM2 3h1v1H2zM3 2h1v1H3zM4 1h1v1H4zM5 0h1v1H5z" />
    </svg>
  );
}
