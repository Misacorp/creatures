import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ItemCorners, ItemSprite } from './GearArt';
import type { GearItem } from './gear-types';
import { glyphOrUnknown } from './glyphs';
import { isFestivalBase } from './gear-view';
import { Sprite } from './sprites/Sprite';
import { CHECK_PALETTE } from './ui/PlacedCount';
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
  /** The selection mode is on: every tile shows its checkbox. */
  selecting: boolean;
  /** This item is in the selection: a ring on the tile and a check in its checkbox. */
  chosen: boolean;
  /** A long press is being held on this tile: its cue plays. */
  holding: boolean;
  /** The checkbox in the top left corner was tapped or clicked (it starts the selection with this item, or toggles it). */
  onCheck: () => void;
  /** The checkbox's spoken name ("Select Kelp Cap"). */
  checkLabel: string;
}

/**
 * One item in an item grid: the one look for every grid of items (the creature page's item picker and the
 * Workshop bag). A square button, the item's art filling it, its rarity as the single edge, the slot icon at
 * the top left and the item level at the bottom right, and at the top right a small gold flag ("Worn") or the
 * small picture of another creature that wears it. `selected` lights it from inside with a light edge (the
 * item shown, or shown last); `blocked` dims an item that cannot be worn (or that another creature wears). A selected tile scrolls itself into view (when it is selected and again when its details
 * close), so a closed detail never leaves the player lost in a long grid.
 *
 * Selecting several (bag only, `choice`): the tile is an option of the grid's listbox (`aria-selected`). A square
 * checkbox sits in its top left corner: it shows on hover for a mouse, and on every tile while the selection mode is
 * on (empty, or a check on a chosen tile, which also gets a ring). The checkbox is its own button (never nested in
 * the tile, out of the tab order: keyboard users select with Space on the tile) with a hit area of about 44 px, a
 * tap on it toggles, and a tap anywhere else on the tile opens the item's card. The slot icon of a bag tile sits at
 * the bottom left, so the checkbox never covers it. `buttonProps` carries the pointer and key handlers of the grid
 * (long press, context menu, arrow keys) and `focusRef` hands the grid the button.
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
        <button
          type="button"
          role="checkbox"
          class={choice.chosen ? 'item-tile-check on' : 'item-tile-check'}
          aria-checked={choice.chosen}
          aria-label={choice.checkLabel}
          tabIndex={-1}
          onClick={choice.onCheck}
        >
          <span class="item-tile-box" aria-hidden="true">
            {choice.chosen && (
              <Sprite sprite={glyphOrUnknown('check')} palette={CHECK_PALETTE} scale={2} />
            )}
          </span>
        </button>
      )}
    </li>
  );
}
