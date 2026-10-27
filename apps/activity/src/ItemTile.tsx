import { useEffect, useRef } from 'preact/hooks';
import { ItemCorners, ItemSprite } from './GearArt';
import type { GearItem } from './gear-types';
import { isFestivalBase } from './gear-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/**
 * One item in an item grid: the one look for every grid of items (the creature page's item picker and the
 * Workshop bag). A square button, the item's art filling it, its rarity as the single edge, the slot icon at
 * the top left and the item level at the bottom right, and at the top right a small gold flag ("Worn") or the
 * small picture of another creature that wears it. `selected` lights it from inside with a light edge (the
 * item shown, or shown last); `blocked` dims an item that cannot be worn (or that another creature wears). A selected tile scrolls itself into view (when it is selected and again when its details
 * close), so a closed detail never leaves the player lost in a long grid.
 *
 * Dismantling (2026-10-27): `marked` draws a red corner (and dims the art) on an item the player marked for
 * dismantling, wherever the grid is. In the bag's selection mode a tap toggles the mark, so `onInfo` adds a
 * small "i" at the bottom left that opens the item's card instead; it is a separate button, never nested.
 */
export function ItemTile({
  item,
  label,
  selected,
  pressed = selected,
  blocked = false,
  flag = null,
  wearer = null,
  marked = false,
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
  /** Marked for dismantling: a red corner at the top right. Decoration: say it in `label` too. */
  marked?: boolean;
  /** Selection mode: opens the item's card (the tile itself toggles the mark). Needs `infoLabel`. */
  onInfo?: (() => void) | undefined;
  /** The spoken name of the info button ("Details of Kelp Cap"). */
  infoLabel?: string | undefined;
  onSelect: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected && typeof button.current?.scrollIntoView === 'function') {
      button.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, pressed]);
  const classes = ['item-tile', `rarity-${item.rarity}`];
  if (selected) classes.push('selected');
  if (blocked) classes.push('blocked');
  if (marked) classes.push('marked');
  if (isFestivalBase(item.baseId)) classes.push('festival');
  return (
    <li>
      <button
        ref={button}
        type="button"
        class={classes.join(' ')}
        aria-pressed={pressed}
        aria-label={label}
        onClick={onSelect}
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
        {marked && <MarkedCorner />}
      </button>
      {onInfo !== undefined && (
        <button
          type="button"
          class="item-tile-info"
          aria-label={infoLabel ?? 'Details'}
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

/** The red corner of an item marked for dismantling: a pixel cross on a red square (colour is not the only cue). */
export function MarkedCorner() {
  return (
    <svg class="item-tile-mark" viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="0" width="7" height="7" class="item-tile-mark-fill" />
      <path d="M1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5z" />
    </svg>
  );
}
