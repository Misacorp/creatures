import { useEffect, useRef } from 'preact/hooks';
import { ItemCorners, ItemSprite } from './GearArt';
import type { GearItem } from './gear-types';
import { isFestivalBase } from './gear-view';

/**
 * One item in an item grid: the one look for every grid of items (the creature page's item picker and the
 * Workshop bag). A square button, the item's art filling it, its rarity as the single edge, the slot icon at
 * the top left and the item level at the bottom right, and a small gold flag at the top right ("Worn").
 * `selected` lights it from inside with a light edge (the item shown, or shown last); `blocked` dims an item
 * that cannot be worn. A selected tile scrolls itself into view (when it is selected and again when its details
 * close), so a closed detail never leaves the player lost in a long grid.
 */
export function ItemTile({
  item,
  label,
  selected,
  pressed = selected,
  blocked = false,
  flag = null,
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
        <ItemCorners level={item.itemLevel} baseId={item.baseId} />
      </button>
    </li>
  );
}
